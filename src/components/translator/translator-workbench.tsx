"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { languages } from "@/lib/translation/languages";
import type { ProviderId, ProviderResult } from "@/lib/translation/types";
import { ArrowIcon, CloseIcon, CollapseIcon, CopyIcon, FindryIcon, GitHubIcon, PasswordIcon, RetryIcon, SwapIcon, TranslateIcon, VastNextIcon } from "./icons";

const providers: Array<{ id: ProviderId; label: string; hint: string }> = [
  { id: "google", label: "Google", hint: "网页接口" },
  { id: "bing", label: "Bing", hint: "网页接口" },
  { id: "agnes-2-0", label: "Agnes 2.0", hint: "AI 模型" },
  { id: "agnes-2-5", label: "Agnes 2.5", hint: "AI 模型" },
];
const providerLabels: Record<ProviderId, string> = { google: "Google", bing: "Bing", azure: "Azure", "agnes-2-0": "Agnes 2.0", "agnes-2-5": "Agnes 2.5" };
const layoutStorageKey = "vast-translator:layout";
const providerStorageKey = "vast-translator:providers";
const defaultProviders: ProviderId[] = ["google", "bing"];
const defaultProvidersSnapshot = JSON.stringify(defaultProviders);
const narrowViewportQuery = "(max-width: 900px)";
type WorkbenchLayout = "stacked" | "side-by-side";
type RequestSnapshot = {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
};
type ResultSlot =
  | { provider: ProviderId; status: "idle" }
  | { provider: ProviderId; status: "pending"; snapshot: RequestSnapshot }
  | { provider: ProviderId; status: "settled"; snapshot: RequestSnapshot; result: ProviderResult };
type CopyFeedback = { provider: ProviderId; status: "success" | "error" };

function sortSlots(slots: ResultSlot[]) {
  return [...slots].sort((left, right) => providers.findIndex(({ id }) => id === left.provider) - providers.findIndex(({ id }) => id === right.provider));
}

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

function parseStoredProviders(value: string | null) {
  if (value === null) return defaultProviders;
  try {
    const storedProviders: unknown = JSON.parse(value);
    if (!Array.isArray(storedProviders)) return defaultProviders;
    return providers.flatMap(({ id }) => storedProviders.includes(id) ? [id] : []);
  } catch {
    return defaultProviders;
  }
}

function getStoredProvidersSnapshot() {
  try {
    return JSON.stringify(parseStoredProviders(window.localStorage.getItem(providerStorageKey)));
  } catch {
    return defaultProvidersSnapshot;
  }
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
const getServerProvidersSnapshot = () => defaultProvidersSnapshot;
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
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(defaultProviders);
  const [slots, setSlots] = useState<ResultSlot[]>(defaultProviders.map((provider) => ({ provider, status: "idle" })));
  const [copyFeedbacks, setCopyFeedbacks] = useState<CopyFeedback[]>([]);
  const [collapsedProviders, setCollapsedProviders] = useState<ProviderId[]>([]);
  const [appliedProvidersSnapshot, setAppliedProvidersSnapshot] = useState(defaultProvidersSnapshot);
  const requestsRef = useRef(new Map<ProviderId, { controller: AbortController; token: symbol }>());
  const copyTimersRef = useRef(new Map<ProviderId, number>());
  const copyTokensRef = useRef(new Map<ProviderId, symbol>());
  const providersSnapshotRef = useRef<string | null>(null);
  const getProvidersSnapshot = useCallback(() => {
    providersSnapshotRef.current ??= getStoredProvidersSnapshot();
    return providersSnapshotRef.current;
  }, []);
  const subscribeToStoredProviders = useCallback((onStoreChange: () => void) => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== providerStorageKey && event.key !== null) return;
      let storedValue = event.key === null ? null : event.newValue;
      if (event.key !== null && storedValue === null) {
        try {
          storedValue = window.localStorage.getItem(providerStorageKey);
        } catch {
          storedValue = null;
        }
      }
      const nextSnapshot = JSON.stringify(parseStoredProviders(storedValue));
      const selected = new Set(JSON.parse(nextSnapshot) as ProviderId[]);
      requestsRef.current.forEach(({ controller }, provider) => {
        if (!selected.has(provider)) {
          controller.abort();
          requestsRef.current.delete(provider);
        }
      });
      copyTimersRef.current.forEach((timer, provider) => {
        if (!selected.has(provider)) {
          window.clearTimeout(timer);
          copyTimersRef.current.delete(provider);
          copyTokensRef.current.delete(provider);
        }
      });
      providersSnapshotRef.current = nextSnapshot;
      onStoreChange();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
  const storedProvidersSnapshot = useSyncExternalStore(subscribeToStoredProviders, getProvidersSnapshot, getServerProvidersSnapshot);
  const storedLayout = useSyncExternalStore(subscribeToStoredLayout, getStoredLayout, getServerLayout);
  const [sessionLayout, setSessionLayout] = useState<WorkbenchLayout | null>(null);
  const preferredLayout = sessionLayout ?? storedLayout;
  const narrowViewport = useSyncExternalStore(subscribeToNarrowViewport, getNarrowViewport, getServerNarrowViewport);
  const loading = slots.some((slot) => slot.status === "pending");
  const results = slots.flatMap((slot) => slot.status === "settled" ? [slot.result] : []);
  const hasSettled = slots.some((slot) => slot.status === "settled");
  const batchAction = loading ? "正在翻译" : hasSettled ? "全部重新翻译" : "开始翻译";
  const effectiveLayout = narrowViewport ? "stacked" : preferredLayout;

  if (appliedProvidersSnapshot !== storedProvidersSnapshot) {
    const storedProviders = JSON.parse(storedProvidersSnapshot) as ProviderId[];
    const selected = new Set(storedProviders);
    setAppliedProvidersSnapshot(storedProvidersSnapshot);
    setSelectedProviders(storedProviders);
    setSlots((current) => sortSlots(storedProviders.map((provider) => current.find((slot) => slot.provider === provider) ?? { provider, status: "idle" })));
    setCopyFeedbacks((current) => current.filter(({ provider }) => selected.has(provider)));
    setCollapsedProviders((current) => current.filter((provider) => selected.has(provider)));
  }

  useEffect(() => () => {
    requestsRef.current.forEach(({ controller }) => controller.abort());
    requestsRef.current.clear();
    copyTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    copyTimersRef.current.clear();
    copyTokensRef.current.clear();
  }, []);

  async function translate() {
    if (!text.trim() || selectedProviders.length === 0 || requestsRef.current.size > 0) return;
    const snapshot = { text, sourceLanguage, targetLanguage };
    await Promise.allSettled(selectedProviders.map((provider) => executeProvider(provider, snapshot)));
  }

  async function executeProvider(provider: ProviderId, snapshot: RequestSnapshot = { text, sourceLanguage, targetLanguage }) {
    if (!snapshot.text.trim() || requestsRef.current.has(provider)) return;
    clearCopyFeedback(provider);
    const controller = new AbortController();
    const token = Symbol(provider);
    requestsRef.current.set(provider, { controller, token });
    setSlots((current) => current.map((slot) => slot.provider === provider ? { provider, status: "pending", snapshot } : slot));
    let result: ProviderResult;
    try {
      const response = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
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
      if (controller.signal.aborted || requestsRef.current.get(provider)?.token !== token) return;
      result = { provider, status: "error", code: "UPSTREAM_ERROR", error: error instanceof Error ? error.message : "翻译请求失败，请稍后重试", durationMs: 0 };
    }
    if (requestsRef.current.get(provider)?.token !== token) return;
    requestsRef.current.delete(provider);
    setSlots((current) => current.map((slot) => slot.provider === provider ? { provider, status: "settled", snapshot, result } : slot));
  }

  function toggleProvider(provider: ProviderId) {
    const nextProviders = providers.flatMap(({ id }) => (id === provider
      ? selectedProviders.includes(id) ? [] : [id]
      : selectedProviders.includes(id) ? [id] : []));
    const nextSnapshot = JSON.stringify(nextProviders);
    providersSnapshotRef.current = nextSnapshot;
    setAppliedProvidersSnapshot(nextSnapshot);
    setSelectedProviders(nextProviders);
    try {
      window.localStorage.setItem(providerStorageKey, nextSnapshot);
    } catch {
      // 持久化失败时仍保留当前会话中的 Provider 选择。
    }
    if (!selectedProviders.includes(provider)) {
      setSlots((current) => sortSlots([...current.filter((slot) => slot.provider !== provider), { provider, status: "idle" }]));
      return;
    }
    requestsRef.current.get(provider)?.controller.abort();
    requestsRef.current.delete(provider);
    clearCopyFeedback(provider);
    setSlots((current) => current.filter((slot) => slot.provider !== provider));
    setCollapsedProviders((current) => current.filter((item) => item !== provider));
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

  function clearCopyFeedback(provider: ProviderId) {
    const timer = copyTimersRef.current.get(provider);
    if (timer !== undefined) window.clearTimeout(timer);
    copyTimersRef.current.delete(provider);
    copyTokensRef.current.delete(provider);
    setCopyFeedbacks((current) => current.filter((feedback) => feedback.provider !== provider));
  }

  function showCopyFeedback(provider: ProviderId, token: symbol, status: CopyFeedback["status"]) {
    setCopyFeedbacks((current) => [...current.filter((feedback) => feedback.provider !== provider), { provider, status }]);
    const timer = window.setTimeout(() => {
      if (copyTokensRef.current.get(provider) !== token) return;
      copyTokensRef.current.delete(provider);
      copyTimersRef.current.delete(provider);
      setCopyFeedbacks((current) => current.filter((feedback) => feedback.provider !== provider));
    }, 1600);
    copyTimersRef.current.set(provider, timer);
  }

  async function copyResult(provider: ProviderId, translatedText: string) {
    const token = Symbol(provider);
    const previousTimer = copyTimersRef.current.get(provider);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);
    copyTimersRef.current.delete(provider);
    copyTokensRef.current.set(provider, token);
    try {
      await navigator.clipboard.writeText(translatedText);
      if (copyTokensRef.current.get(provider) === token) showCopyFeedback(provider, token, "success");
    } catch {
      if (copyTokensRef.current.get(provider) === token) showCopyFeedback(provider, token, "error");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Vast Translator 首页"><span className="brand-mark"><TranslateIcon /></span><span>Vast Translator</span></Link>
        <div className="topbar-note">多引擎文本翻译</div>
        <a className="github-link" href="https://github.com/VastNext/vast-translator" target="_blank" rel="noreferrer"><GitHubIcon /><span>GitHub</span></a>
        <div className="brand-attribution">by <a href="https://vastnext.com" target="_blank" rel="noreferrer"><VastNextIcon /><span>VastNext</span></a></div>
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
            <label><span className="sr-only">源语言</span><select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>{languages.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
            <button className="icon-button swap-button" type="button" onClick={() => { if (sourceLanguage !== "auto") { setSourceLanguage(targetLanguage); setTargetLanguage(sourceLanguage); } }} disabled={sourceLanguage === "auto"} aria-label="交换语言"><SwapIcon /></button>
            <label><span className="sr-only">目标语言</span><select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>{languages.filter((language) => language.code !== "auto").map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
          </div>
          <div className="input-panel">
            <textarea aria-label="原文" value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void translate(); } }} placeholder="输入或粘贴需要翻译的文本……" />
            {text && <button className="clear-button" type="button" onClick={() => setText("")} aria-label="清空原文"><CloseIcon /></button>}
            <div className="input-footer"><span>{text.length} / 5000</span><span className="shortcut">Ctrl ↵ 翻译</span></div>
          </div>
          <div className="action-row">
            <fieldset className="provider-picker"><legend className="sr-only">翻译服务</legend>{providers.map((provider) => <label key={provider.id} className={selectedProviders.includes(provider.id) ? "provider-chip selected" : "provider-chip"}><input type="checkbox" checked={selectedProviders.includes(provider.id)} onChange={() => toggleProvider(provider.id)} /><span className={`provider-dot ${provider.id}`} /><span>{provider.label}</span><small>{provider.hint}</small></label>)}</fieldset>
             <button className="translate-button" type="button" aria-label={batchAction} onClick={() => void translate()} disabled={!text.trim() || selectedProviders.length === 0 || loading}><span>{batchAction}</span>{loading ? <span className="spinner" /> : <ArrowIcon />}</button>
          </div>
          </section>
          <section className="results-section" data-testid="results-section">
          <div className="section-heading" data-testid="results-heading"><h2>翻译结果</h2><span>{results.length ? `${results.filter((result) => result.status === "success").length} 项可用` : "结果将在这里并排呈现"}</span></div>
          <div className="results-grid" data-testid="results-grid">
            {slots.map((slot) => slot.status === "idle"
              ? <IdleResultPanel key={slot.provider} provider={slot.provider} disabled={!text.trim()} onExecute={executeProvider} />
              : slot.status === "pending" ? <ResultSkeleton key={slot.provider} provider={slot.provider} />
              : <ResultPanel key={slot.provider} result={slot.result} stale={slot.snapshot.text !== text || slot.snapshot.sourceLanguage !== sourceLanguage || slot.snapshot.targetLanguage !== targetLanguage} collapsed={collapsedProviders.includes(slot.provider)} copyStatus={copyFeedbacks.find((feedback) => feedback.provider === slot.provider)?.status} disabled={!text.trim()} onCopy={copyResult} onToggle={toggleResult} onExecute={executeProvider} />)}
            {slots.length === 0 && <div className="empty-state"><TranslateIcon /><p>准备就绪</p><span>输入文本并选择翻译服务，然后开始比较。</span></div>}
          </div>
          </section>
        </div>
      </main>
      <footer className="footer">
        <span>Vast Translator · 开源翻译工作台</span>
        <nav className="product-links" aria-label="VastNext 产品家族">
          <a href="https://vastnext.com" target="_blank" rel="noreferrer"><VastNextIcon /><span>VastNext</span></a>
          <a href="https://findryai.com" target="_blank" rel="noreferrer"><FindryIcon /><span>Findry AI</span></a>
          <a href="https://pg.vastnext.com" target="_blank" rel="noreferrer"><PasswordIcon /><span>Password Generator</span></a>
        </nav>
      </footer>
    </div>
  );
}

function IdleResultPanel({ provider, disabled, onExecute }: { provider: ProviderId; disabled: boolean; onExecute: (provider: ProviderId) => Promise<void> }) {
  const label = providerLabels[provider];
  return <article className="result-panel idle" aria-label={`${label} 翻译卡片`}><header><div className="result-provider"><span className={`provider-dot ${provider}`} /><strong>{label}</strong></div><div className="result-actions"><button type="button" disabled={disabled} onClick={() => void onExecute(provider)} aria-label={`使用 ${label} 翻译`}><TranslateIcon /><span>翻译</span></button></div></header><div className="result-idle"><strong>尚未翻译</strong><span>输入文本后可单独翻译此服务。</span></div></article>;
}

function ResultSkeleton({ provider }: { provider: ProviderId }) {
  return <article className="result-panel loading-panel" aria-label={`正在加载 ${providerLabels[provider]} 翻译结果`} aria-busy="true"><header><div className="result-provider"><span className={`provider-dot ${provider}`} /><strong>{providerLabels[provider]}</strong></div><div className="result-actions"><button type="button" disabled aria-label={`${providerLabels[provider]} 正在翻译`}><span>正在翻译</span></button></div></header><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-line short" /></article>;
}

function ResultPanel({ result, stale, collapsed, copyStatus, disabled, onCopy, onToggle, onExecute }: {
  result: ProviderResult;
  stale: boolean;
  collapsed: boolean;
  copyStatus?: CopyFeedback["status"];
  disabled: boolean;
  onCopy: (provider: ProviderId, translatedText: string) => Promise<void>;
  onToggle: (provider: ProviderId) => void;
  onExecute: (provider: ProviderId) => Promise<void>;
}) {
  const label = providerLabels[result.provider];
  const contentId = `result-content-${result.provider}`;
  return (
    <article className={`result-panel ${result.status}${collapsed ? " collapsed" : ""}`}>
      <span className="sr-only" role="status">{result.status === "success" ? `${label} 翻译完成：${result.translatedText}` : `${label} 翻译失败：${result.error}`}</span>
      <header>
        <div className="result-provider"><span className={`provider-dot ${result.provider}`} /><strong>{label}</strong><span>{result.durationMs} ms</span>{stale && <span className="stale-result">基于较早内容</span>}</div>
        <div className="result-actions">
          {result.status === "success" && <button type="button" onClick={() => void onCopy(result.provider, result.translatedText)} aria-label={`复制 ${label} 翻译结果`}><CopyIcon /><span>{copyStatus === "success" ? "已复制" : copyStatus === "error" ? "复制失败" : "复制"}</span></button>}
          {result.status === "success" && <button type="button" disabled={disabled} onClick={() => void onExecute(result.provider)} aria-label={`重新执行 ${label} 翻译`}><TranslateIcon /><span>重新翻译</span></button>}
          {result.status === "error" && <button className="retry-button" type="button" disabled={disabled} onClick={() => void onExecute(result.provider)} aria-label={`重试 ${label} 翻译`}><RetryIcon /><span>重试</span></button>}
          <button type="button" onClick={() => onToggle(result.provider)} aria-label={`${collapsed ? "展开" : "折叠"} ${label} 翻译结果`} aria-expanded={!collapsed} aria-controls={contentId}><CollapseIcon expanded={!collapsed} /></button>
        </div>
      </header>
      <div id={contentId} hidden={collapsed}>{result.status === "success" ? <p className="translated-text">{result.translatedText}</p> : <div className="result-error"><strong>本次未能获得结果</strong><span>{result.error}</span></div>}</div>
    </article>
  );
}
