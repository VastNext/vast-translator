"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { languages } from "@/lib/translation/languages";
import type { ProviderId, ProviderResult } from "@/lib/translation/types";
import { ArrowIcon, CloseIcon, CollapseIcon, CopyIcon, RetryIcon, SwapIcon, TranslateIcon } from "./icons";

const providers: Array<{ id: ProviderId; label: string; hint: string }> = [
  { id: "google", label: "Google", hint: "网页接口" },
  { id: "bing", label: "Bing", hint: "网页接口" },
  { id: "azure", label: "Azure", hint: "需配置" },
  { id: "agnes-2-0", label: "Agnes 2.0", hint: "AI 模型" },
  { id: "agnes-2-5", label: "Agnes 2.5", hint: "AI 模型" },
];
const providerLabels: Record<ProviderId, string> = { google: "Google", bing: "Bing", azure: "Azure", "agnes-2-0": "Agnes 2.0", "agnes-2-5": "Agnes 2.5" };
const layoutStorageKey = "vast-translator:layout";
const narrowViewportQuery = "(max-width: 900px)";
type WorkbenchLayout = "stacked" | "side-by-side";
type RequestSnapshot = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  providers: ProviderId[];
};
type ResultSlot = { provider: ProviderId; status: "pending" } | { provider: ProviderId; status: "settled"; result: ProviderResult };

function getStoredLayout(): WorkbenchLayout {
  try {
    const storedLayout = window.localStorage.getItem(layoutStorageKey);
    return storedLayout === "stacked" || storedLayout === "side-by-side" ? storedLayout : "stacked";
  } catch {
    return "stacked";
  }
}

function subscribeToStoredLayout(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === layoutStorageKey) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  return () => window.removeEventListener("storage", handleStorage);
}

function getNarrowViewport() {
  return typeof window.matchMedia === "function" && window.matchMedia(narrowViewportQuery).matches;
}

function subscribeToNarrowViewport(onStoreChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const mediaQuery = window.matchMedia(narrowViewportQuery);
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

const getServerLayout = (): WorkbenchLayout => "stacked";
const getServerNarrowViewport = () => false;

function getProviderResult(data: unknown, provider: ProviderId): ProviderResult | null {
  if (!data || typeof data !== "object" || !("results" in data) || !Array.isArray(data.results)) return null;
  const result = data.results.find((item) => item && typeof item === "object" && "provider" in item && item.provider === provider);
  if (!result || !("status" in result) || !("durationMs" in result) || typeof result.durationMs !== "number") return null;
  if (result.status === "success" && "translatedText" in result && typeof result.translatedText === "string") {
    return { provider, status: "success", translatedText: result.translatedText, durationMs: result.durationMs };
  }
  if (result.status === "error" && "error" in result && typeof result.error === "string" && "code" in result && typeof result.code === "string") {
    return { provider, status: "error", error: result.error, code: result.code, durationMs: result.durationMs };
  }
  return null;
}

export function TranslatorWorkbench() {
  const [text, setText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("zh-CN");
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(["google", "bing"]);
  const [slots, setSlots] = useState<ResultSlot[]>([]);
  const [pendingProviders, setPendingProviders] = useState<ProviderId[]>([]);
  const [copiedProvider, setCopiedProvider] = useState<ProviderId | null>(null);
  const [collapsedProviders, setCollapsedProviders] = useState<ProviderId[]>([]);
  const storedLayout = useSyncExternalStore(subscribeToStoredLayout, getStoredLayout, getServerLayout);
  const [sessionLayout, setSessionLayout] = useState<WorkbenchLayout | null>(null);
  const preferredLayout = sessionLayout ?? storedLayout;
  const narrowViewport = useSyncExternalStore(subscribeToNarrowViewport, getNarrowViewport, getServerNarrowViewport);
  const batchRef = useRef<{ id: number; controller: AbortController; snapshot: RequestSnapshot } | null>(null);
  const retryingRef = useRef(new Map<ProviderId, symbol>());
  const loading = pendingProviders.length > 0;
  const results = slots.flatMap((slot) => slot.status === "settled" ? [slot.result] : []);
  const effectiveLayout = narrowViewport ? "stacked" : preferredLayout;

  useEffect(() => () => batchRef.current?.controller.abort(), []);

  async function translate() {
    if (!text.trim() || selectedProviders.length === 0) return;
    const snapshot = { text, sourceLanguage, targetLanguage, providers: [...selectedProviders] };
    if (batchRef.current && JSON.stringify(batchRef.current.snapshot) === JSON.stringify(snapshot) && loading) return;
    batchRef.current?.controller.abort();
    const batch = { id: (batchRef.current?.id ?? 0) + 1, controller: new AbortController(), snapshot };
    batchRef.current = batch;
    retryingRef.current.clear();
    setCollapsedProviders([]);
    setSlots(snapshot.providers.map((provider) => ({ provider, status: "pending" })));
    setPendingProviders(snapshot.providers);
    await Promise.allSettled(snapshot.providers.map((provider) => requestProvider(provider, snapshot, batch)));
  }

  async function requestProvider(provider: ProviderId, snapshot: RequestSnapshot, batch: { id: number; controller: AbortController }) {
    let result: ProviderResult;
    try {
      const response = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: batch.controller.signal,
        body: JSON.stringify({ ...snapshot, providers: [provider] }),
      });
      let data: unknown;
      try {
        data = await response.clone().json();
      } catch {
        throw new Error("翻译服务响应异常，请稍后重试");
      }
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data && data.error && typeof data.error === "object" && "message" in data.error && typeof data.error.message === "string"
          ? data.error.message
          : "翻译请求失败";
        throw new Error(message);
      }
      const providerResult = getProviderResult(data, provider);
      if (!providerResult) throw new Error("翻译服务响应异常，请稍后重试");
      result = providerResult;
    } catch (error) {
      if (batch.controller.signal.aborted || batchRef.current?.id !== batch.id) return;
      result = { provider, status: "error", code: "UPSTREAM_ERROR", error: error instanceof Error ? error.message : "翻译请求失败，请稍后重试", durationMs: 0 };
    }
    if (batchRef.current?.id !== batch.id) return;
    setSlots((current) => current.map((slot) => slot.provider === provider ? { provider, status: "settled", result } : slot));
    setPendingProviders((current) => current.filter((item) => item !== provider));
  }

  async function retryProvider(provider: ProviderId) {
    const currentBatch = batchRef.current;
    if (!currentBatch || retryingRef.current.has(provider)) return;
    const retryToken = Symbol(provider);
    retryingRef.current.set(provider, retryToken);
    setSlots((current) => current.map((slot) => slot.provider === provider ? { provider, status: "pending" } : slot));
    setPendingProviders((current) => current.includes(provider) ? current : [...current, provider]);
    try {
      await requestProvider(provider, currentBatch.snapshot, currentBatch);
    } finally {
      if (retryingRef.current.get(provider) === retryToken) retryingRef.current.delete(provider);
    }
  }

  function toggleProvider(provider: ProviderId) {
    setSelectedProviders((current) => current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]);
  }

  function toggleResult(provider: ProviderId) {
    setCollapsedProviders((current) => current.includes(provider)
      ? current.filter((item) => item !== provider)
      : [...current, provider]);
  }

  function changeLayout(layout: WorkbenchLayout) {
    setSessionLayout(layout);
    try {
      window.localStorage.setItem(layoutStorageKey, layout);
    } catch {
      // 持久化失败时仍保留当前会话中的布局选择。
    }
  }

  async function copyResult(provider: ProviderId, translatedText: string) {
    await navigator.clipboard.writeText(translatedText);
    setCopiedProvider(provider);
    window.setTimeout(() => setCopiedProvider(null), 1600);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Vast Translator 首页"><span className="brand-mark"><TranslateIcon /></span><span>Vast Translator</span></Link>
        <div className="topbar-note">多引擎文本翻译</div>
        <a className="github-link" href="https://github.com/vastfuture/vast-translator" target="_blank" rel="noreferrer">GitHub</a>
      </header>
      <main className="workspace">
        <section className="intro" aria-labelledby="workbench-title">
          <div><p className="eyebrow">COMPARE · DECIDE · COPY</p><h1 id="workbench-title">一句原文，多种答案。</h1></div>
          <p>同时查看不同翻译服务的结果，把选择权留给你。</p>
        </section>
        <div className="workspace-controls" role="group" aria-label="工作台布局" aria-hidden={narrowViewport} data-testid="layout-controls">
          <button type="button" aria-label="上下布局" aria-pressed={preferredLayout === "stacked"} onClick={() => changeLayout("stacked")}>上下</button>
          <button type="button" aria-label="左右布局" aria-pressed={preferredLayout === "side-by-side"} onClick={() => changeLayout("side-by-side")}>左右</button>
        </div>
        <div className="workbench-layout" data-layout={effectiveLayout} data-testid="workbench-layout">
          <section className="translator" aria-label="文本翻译工作台">
          <div className="language-bar">
            <label><span className="sr-only">源语言</span><select value={sourceLanguage} disabled={loading} onChange={(event) => setSourceLanguage(event.target.value)}>{languages.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
            <button className="icon-button swap-button" type="button" onClick={() => { if (sourceLanguage !== "auto") { setSourceLanguage(targetLanguage); setTargetLanguage(sourceLanguage); } }} disabled={sourceLanguage === "auto" || loading} aria-label="交换语言"><SwapIcon /></button>
            <label><span className="sr-only">目标语言</span><select value={targetLanguage} disabled={loading} onChange={(event) => setTargetLanguage(event.target.value)}>{languages.filter((language) => language.code !== "auto").map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
          </div>
          <div className="input-panel">
            <textarea aria-label="原文" value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void translate(); } }} placeholder="输入或粘贴需要翻译的文本……" />
            {text && <button className="clear-button" type="button" onClick={() => { setText(""); if (!loading) setSlots([]); }} aria-label="清空原文"><CloseIcon /></button>}
            <div className="input-footer"><span>{text.length} / 5000</span><span className="shortcut">Ctrl ↵ 翻译</span></div>
          </div>
          <div className="action-row">
            <fieldset className="provider-picker" disabled={loading}><legend className="sr-only">翻译服务</legend>{providers.map((provider) => <label key={provider.id} className={selectedProviders.includes(provider.id) ? "provider-chip selected" : "provider-chip"}><input type="checkbox" checked={selectedProviders.includes(provider.id)} onChange={() => toggleProvider(provider.id)} /><span className={`provider-dot ${provider.id}`} /><span>{provider.label}</span><small>{provider.hint}</small></label>)}</fieldset>
             <button className="translate-button" type="button" aria-label="开始翻译" onClick={() => void translate()} disabled={!text.trim() || selectedProviders.length === 0}><span>{loading ? "正在翻译" : "开始翻译"}</span>{loading ? <span className="spinner" /> : <ArrowIcon />}</button>
          </div>
          </section>
          <section className="results-section" data-testid="results-section">
          <div className="section-heading" data-testid="results-heading"><h2>翻译结果</h2><span>{results.length ? `${results.filter((result) => result.status === "success").length} 项可用` : "结果将在这里并排呈现"}</span></div>
          <div className="results-grid" data-testid="results-grid">
            {slots.map((slot) => slot.status === "pending"
              ? <ResultSkeleton key={slot.provider} provider={slot.provider} />
              : <ResultPanel key={slot.provider} result={slot.result} collapsed={collapsedProviders.includes(slot.provider)} copied={copiedProvider === slot.provider} onCopy={copyResult} onToggle={toggleResult} onRetry={retryProvider} />)}
            {slots.length === 0 && <div className="empty-state"><TranslateIcon /><p>准备就绪</p><span>输入文本并选择翻译服务，然后开始比较。</span></div>}
          </div>
          </section>
        </div>
      </main>
      <footer className="footer"><span>Vast Translator</span><span>Google / Bing 网页接口可能随时限流或变更</span></footer>
    </div>
  );
}

function ResultSkeleton({ provider }: { provider: ProviderId }) {
  return <article className="result-panel loading-panel" aria-label={`正在加载 ${providerLabels[provider]} 翻译结果`} aria-busy="true"><header><div className="result-provider"><span className={`provider-dot ${provider}`} /><strong>{providerLabels[provider]}</strong></div></header><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-line short" /></article>;
}

function ResultPanel({ result, collapsed, copied, onCopy, onToggle, onRetry }: {
  result: ProviderResult;
  collapsed: boolean;
  copied: boolean;
  onCopy: (provider: ProviderId, translatedText: string) => Promise<void>;
  onToggle: (provider: ProviderId) => void;
  onRetry: (provider: ProviderId) => Promise<void>;
}) {
  const label = providerLabels[result.provider];
  const contentId = `result-content-${result.provider}`;
  return (
    <article className={`result-panel ${result.status}${collapsed ? " collapsed" : ""}`}>
      <span className="sr-only" role="status">{result.status === "success" ? `${label} 翻译完成：${result.translatedText}` : `${label} 翻译失败：${result.error}`}</span>
      <header>
        <div className="result-provider"><span className={`provider-dot ${result.provider}`} /><strong>{label}</strong><span>{result.durationMs} ms</span></div>
        <div className="result-actions">
          {result.status === "success" && <button type="button" onClick={() => void onCopy(result.provider, result.translatedText)} aria-label={`复制 ${label} 翻译结果`}><CopyIcon /><span>{copied ? "已复制" : "复制"}</span></button>}
          {result.status === "error" && <button className="retry-button" type="button" onClick={() => void onRetry(result.provider)} aria-label={`重试 ${label} 翻译`}><RetryIcon /><span>重试</span></button>}
          <button type="button" onClick={() => onToggle(result.provider)} aria-label={`${collapsed ? "展开" : "折叠"} ${label} 翻译结果`} aria-expanded={!collapsed} aria-controls={contentId}><CollapseIcon expanded={!collapsed} /></button>
        </div>
      </header>
      {!collapsed && <div id={contentId}>{result.status === "success" ? <p className="translated-text">{result.translatedText}</p> : <div className="result-error"><strong>本次未能获得结果</strong><span>{result.error}</span></div>}</div>}
    </article>
  );
}
