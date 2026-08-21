"use client";

import { useState } from "react";
import Link from "next/link";
import { languages } from "@/lib/translation/languages";
import type { ProviderId, ProviderResult, TranslateResponse } from "@/lib/translation/types";
import { ArrowIcon, CloseIcon, CopyIcon, SwapIcon, TranslateIcon } from "./icons";

const providers: Array<{ id: ProviderId; label: string; hint: string }> = [
  { id: "google", label: "Google", hint: "网页接口" },
  { id: "bing", label: "Bing", hint: "网页接口" },
  { id: "azure", label: "Azure", hint: "需配置" },
];
const providerLabels: Record<ProviderId, string> = { google: "Google", bing: "Bing", azure: "Azure" };

export function TranslatorWorkbench() {
  const [text, setText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("zh-CN");
  const [selectedProviders, setSelectedProviders] = useState<ProviderId[]>(["google", "bing"]);
  const [results, setResults] = useState<ProviderResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [copiedProvider, setCopiedProvider] = useState<ProviderId | null>(null);

  async function translate() {
    if (!text.trim() || selectedProviders.length === 0 || loading) return;
    setLoading(true); setRequestError(""); setResults([]);
    try {
      const response = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sourceLanguage, targetLanguage, providers: selectedProviders }),
      });
      const data = (await response.json()) as TranslateResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "翻译请求失败");
      setResults(data.results);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "翻译请求失败，请稍后重试");
    } finally { setLoading(false); }
  }

  function toggleProvider(provider: ProviderId) {
    setSelectedProviders((current) => current.includes(provider) ? current.filter((item) => item !== provider) : [...current, provider]);
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
        <section className="translator" aria-label="文本翻译工作台">
          <div className="language-bar">
            <label><span className="sr-only">源语言</span><select value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)}>{languages.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
            <button className="icon-button swap-button" type="button" onClick={() => { if (sourceLanguage !== "auto") { setSourceLanguage(targetLanguage); setTargetLanguage(sourceLanguage); } }} disabled={sourceLanguage === "auto"} aria-label="交换语言"><SwapIcon /></button>
            <label><span className="sr-only">目标语言</span><select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>{languages.filter((language) => language.code !== "auto").map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
          </div>
          <div className="input-panel">
            <textarea aria-label="原文" value={text} maxLength={5000} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void translate(); } }} placeholder="输入或粘贴需要翻译的文本……" />
            {text && <button className="clear-button" type="button" onClick={() => { setText(""); setResults([]); }} aria-label="清空原文"><CloseIcon /></button>}
            <div className="input-footer"><span>{text.length} / 5000</span><span className="shortcut">Ctrl ↵ 翻译</span></div>
          </div>
          <div className="action-row">
            <fieldset className="provider-picker"><legend className="sr-only">翻译服务</legend>{providers.map((provider) => <label key={provider.id} className={selectedProviders.includes(provider.id) ? "provider-chip selected" : "provider-chip"}><input type="checkbox" checked={selectedProviders.includes(provider.id)} onChange={() => toggleProvider(provider.id)} /><span className={`provider-dot ${provider.id}`} /><span>{provider.label}</span><small>{provider.hint}</small></label>)}</fieldset>
            <button className="translate-button" type="button" onClick={() => void translate()} disabled={!text.trim() || selectedProviders.length === 0 || loading}><span>{loading ? "正在翻译" : "开始翻译"}</span>{loading ? <span className="spinner" /> : <ArrowIcon />}</button>
          </div>
        </section>
        <section className="results-section" aria-live="polite" aria-busy={loading}>
          <div className="section-heading"><h2>翻译结果</h2><span>{results.length ? `${results.filter((result) => result.status === "success").length} 项可用` : "结果将在这里并排呈现"}</span></div>
          {requestError && <div className="request-error" role="alert">{requestError}</div>}
          <div className="results-grid">
            {loading && selectedProviders.map((provider) => <ResultSkeleton key={provider} provider={provider} />)}
            {!loading && results.map((result) => <article className={`result-panel ${result.status}`} key={result.provider}><header><div className="result-provider"><span className={`provider-dot ${result.provider}`} /><strong>{providerLabels[result.provider]}</strong><span>{result.durationMs} ms</span></div>{result.status === "success" && <button type="button" onClick={() => void copyResult(result.provider, result.translatedText)} aria-label={`复制 ${providerLabels[result.provider]} 翻译结果`}><CopyIcon /><span>{copiedProvider === result.provider ? "已复制" : "复制"}</span></button>}</header>{result.status === "success" ? <p className="translated-text">{result.translatedText}</p> : <div className="result-error"><strong>本次未能获得结果</strong><span>{result.error}</span></div>}</article>)}
            {!loading && results.length === 0 && !requestError && <div className="empty-state"><TranslateIcon /><p>准备就绪</p><span>输入文本并选择翻译服务，然后开始比较。</span></div>}
          </div>
        </section>
      </main>
      <footer className="footer"><span>Vast Translator</span><span>Google / Bing 网页接口可能随时限流或变更</span></footer>
    </div>
  );
}

function ResultSkeleton({ provider }: { provider: ProviderId }) {
  return <article className="result-panel loading-panel"><header><div className="result-provider"><span className={`provider-dot ${provider}`} /><strong>{providerLabels[provider]}</strong></div></header><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-line short" /></article>;
}
