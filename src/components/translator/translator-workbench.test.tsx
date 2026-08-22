import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TranslatorWorkbench } from "./translator-workbench";

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function mockViewport(narrow = false) {
  let matches = narrow;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    get matches() { return matches; },
    media: "(max-width: 900px)",
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
  return {
    mediaQuery,
    setNarrow(value: boolean) {
      matches = value;
      listeners.forEach((listener) => listener({ matches: value, media: mediaQuery.media } as MediaQueryListEvent));
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  mockViewport();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TranslatorWorkbench", () => {
  it("为每个 Provider 并行发送单独请求并按提交顺序渐进更新卡片", async () => {
    const google = deferredResponse();
    const bing = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(google.promise)
      .mockReturnValueOnce(bing.promise);
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string).providers)).toEqual([
      ["google"],
      ["bing"],
    ]);
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toBeInTheDocument();
    expect(screen.getByLabelText("正在加载 Bing 翻译结果")).toBeInTheDocument();

    bing.resolve(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "必应先完成", durationMs: 8 }] }), { status: 200 }));
    expect(await screen.findByText("必应先完成")).toBeInTheDocument();
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toBeInTheDocument();
    const cards = screen.getByTestId("results-grid").querySelectorAll("article");
    expect(cards[0]).toHaveTextContent("Google");
    expect(cards[1]).toHaveTextContent("Bing");

    google.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "谷歌后完成", durationMs: 12 }] }), { status: 200 }));
    expect(await screen.findByText("谷歌后完成")).toBeInTheDocument();
  });

  it("单个请求失败不阻塞其他 Provider 完成", async () => {
    const google = deferredResponse();
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(google.promise)
      .mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(await screen.findByText("翻译服务响应异常，请稍后重试")).toBeInTheDocument();
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toBeInTheDocument();
    google.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "仍然成功", durationMs: 12 }] }), { status: 200 }));
    expect(await screen.findByText("仍然成功")).toBeInTheDocument();
  });

  it.each([
    ["空对象", {}],
    ["results 为 null", { results: null }],
    ["Provider 不匹配", { results: [{ provider: "bing", status: "success", translatedText: "错误结果", durationMs: 1 }] }],
    ["status 无效", { results: [{ provider: "google", status: "pending", durationMs: 1 }] }],
    ["成功结果缺少译文", { results: [{ provider: "google", status: "success", durationMs: 1 }] }],
    ["失败结果缺少错误信息", { results: [{ provider: "google", status: "error", code: "UPSTREAM_ERROR", durationMs: 1 }] }],
  ])("%s 响应按统一异常处理", async (_caseName, body) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });

    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(await screen.findByText("翻译服务响应异常，请稍后重试")).toBeInTheDocument();
    expect(screen.queryByText("错误结果")).not.toBeInTheDocument();
  });

  it("一个 Provider 成功时即使其他 Provider 仍在等待也会播报完成", async () => {
    const google = deferredResponse();
    const bing = deferredResponse();
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(google.promise)
      .mockReturnValueOnce(bing.promise);
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    google.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "渐进成功", durationMs: 4 }] }), { status: 200 }));

    expect(await screen.findByRole("status")).toHaveTextContent("Google 翻译完成：渐进成功");
    expect(screen.getByLabelText("正在加载 Bing 翻译结果")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("results-section")).not.toHaveAttribute("aria-busy");
  });

  it("一个 Provider 失败时即使其他 Provider 仍在等待也会播报失败", async () => {
    const google = deferredResponse();
    const bing = deferredResponse();
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(google.promise)
      .mockReturnValueOnce(bing.promise);
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    bing.resolve(new Response(JSON.stringify({ results: [{ provider: "bing", status: "error", error: "渐进失败", code: "UPSTREAM_ERROR", durationMs: 5 }] }), { status: 200 }));

    expect(await screen.findByRole("status")).toHaveTextContent("Bing 翻译失败：渐进失败");
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("results-section")).not.toHaveAttribute("aria-live");
  });

  it("新批次取消旧请求并忽略旧批次迟到响应", async () => {
    const oldGoogle = deferredResponse();
    const oldBing = deferredResponse();
    const newGoogle = deferredResponse();
    const newBing = deferredResponse();
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signals.push(init!.signal as AbortSignal);
      return [oldGoogle.promise, oldBing.promise, newGoogle.promise, newBing.promise][signals.length - 1];
    });
    render(<TranslatorWorkbench />);
    const input = screen.getByLabelText("原文");
    fireEvent.change(input, { target: { value: "旧原文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    fireEvent.change(input, { target: { value: "新原文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(signals.slice(0, 2).every((signal) => signal.aborted)).toBe(true);
    newGoogle.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "新结果", durationMs: 5 }] }), { status: 200 }));
    expect(await screen.findByText("新结果")).toBeInTheDocument();
    oldGoogle.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "旧结果", durationMs: 50 }] }), { status: 200 }));
    expect(screen.queryByText("旧结果")).not.toBeInTheDocument();
  });

  it("失败卡只重试自身并复用原文和语言快照，同时防止重复重试", async () => {
    const retry = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "error", error: "失败", code: "UPSTREAM_ERROR", durationMs: 3 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "保留结果", durationMs: 4 }] }), { status: 200 }))
      .mockReturnValueOnce(retry.promise);
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "原始文本" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    const retryButton = await screen.findByRole("button", { name: "重试 Google 翻译" });
    await screen.findByText("保留结果");
    fireEvent.click(screen.getByRole("button", { name: "折叠 Bing 翻译结果" }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "编辑后的文本" } });

    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string)).toEqual({
      text: "原始文本",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["google"],
    });
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toBeInTheDocument();
    expect(screen.queryByText("保留结果")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开 Bing 翻译结果" })).toBeInTheDocument();
    retry.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "重试成功", durationMs: 6 }] }), { status: 200 }));
    expect(await screen.findByText("重试成功")).toBeInTheDocument();
  });

  it("首次失败后重试再次失败会显示新错误并允许继续重试", async () => {
    const secondRetry = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "error", error: "首次失败", code: "UPSTREAM_ERROR", durationMs: 3 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "保留译文", durationMs: 4 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("服务不可用", { status: 503 }))
      .mockReturnValueOnce(secondRetry.promise);
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    await screen.findByText("首次失败");
    await screen.findByText("保留译文");
    fireEvent.click(screen.getByRole("button", { name: "折叠 Bing 翻译结果" }));

    fireEvent.click(screen.getByRole("button", { name: "重试 Google 翻译" }));

    expect(await screen.findByText("翻译服务响应异常，请稍后重试")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开 Bing 翻译结果" })).toBeInTheDocument();
    expect(screen.queryByText("保留译文")).not.toBeInTheDocument();
    const retryAgain = screen.getByRole("button", { name: "重试 Google 翻译" });
    fireEvent.click(retryAgain);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toBeInTheDocument();
  });

  it("重试复用批次中的非默认源语言和目标语言快照", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "error", error: "失败", code: "UPSTREAM_ERROR", durationMs: 3 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "成功", durationMs: 4 }] }), { status: 200 }));
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    fireEvent.change(screen.getByLabelText("源语言"), { target: { value: "en" } });
    fireEvent.change(screen.getByLabelText("目标语言"), { target: { value: "ja" } });
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    const retry = await screen.findByRole("button", { name: "重试 Google 翻译" });
    fireEvent.change(screen.getByLabelText("源语言"), { target: { value: "fr" } });
    fireEvent.change(screen.getByLabelText("目标语言"), { target: { value: "de" } });

    fireEvent.click(retry);

    await screen.findByText("成功");
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      text: "Hello",
      sourceLanguage: "en",
      targetLanguage: "ja",
      providers: ["google"],
    });
  });

  it("三个 Provider 的中间卡片重试前中后顺序保持稳定", async () => {
    const retry = deferredResponse();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "谷歌", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "bing", status: "error", error: "失败", code: "UPSTREAM_ERROR", durationMs: 2 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "azure", status: "success", translatedText: "Azure", durationMs: 3 }] }), { status: 200 }))
      .mockReturnValueOnce(retry.promise);
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Azure/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    const retryButton = await screen.findByRole("button", { name: "重试 Bing 翻译" });
    await screen.findByText("Azure", { selector: ".translated-text" });
    const providerOrder = () => Array.from(screen.getByTestId("results-grid").querySelectorAll("article header strong"), (node) => node.textContent);
    expect(providerOrder()).toEqual(["Google", "Bing", "Azure"]);

    fireEvent.click(retryButton);
    expect(providerOrder()).toEqual(["Google", "Bing", "Azure"]);
    retry.resolve(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "必应成功", durationMs: 4 }] }), { status: 200 }));
    await screen.findByText("必应成功");
    expect(providerOrder()).toEqual(["Google", "Bing", "Azure"]);
  });

  it("重试等待期间卸载组件会取消该请求", async () => {
    const retry = deferredResponse();
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce((_url, init) => {
        signals.push(init!.signal as AbortSignal);
        return Promise.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "error", error: "失败", code: "UPSTREAM_ERROR", durationMs: 1 }] }), { status: 200 }));
      })
      .mockImplementationOnce((_url, init) => {
        signals.push(init!.signal as AbortSignal);
        return retry.promise;
      });
    const { unmount } = render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    fireEvent.click(await screen.findByRole("button", { name: "重试 Google 翻译" }));

    unmount();

    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(true);
  });

  it("翻译进行中清空只清空输入并保留当前批次卡片直到完成", async () => {
    const google = deferredResponse();
    const bing = deferredResponse();
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(google.promise)
      .mockReturnValueOnce(bing.promise);
    render(<TranslatorWorkbench />);
    const input = screen.getByLabelText("原文");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    fireEvent.click(screen.getByRole("button", { name: "清空原文" }));

    expect(input).toHaveValue("");
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toBeInTheDocument();
    expect(screen.getByLabelText("正在加载 Bing 翻译结果")).toBeInTheDocument();
    expect(screen.getByLabelText("源语言")).toBeDisabled();
    google.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "谷歌完成", durationMs: 5 }] }), { status: 200 }));
    bing.resolve(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "必应完成", durationMs: 6 }] }), { status: 200 }));
    expect(await screen.findByText("谷歌完成")).toBeInTheDocument();
    expect(await screen.findByText("必应完成")).toBeInTheDocument();
    expect(screen.getByLabelText("源语言")).toBeEnabled();
  });

  it("旧批次重试结束不能解除新批次同 Provider 的重试锁", async () => {
    const oldRetry = deferredResponse();
    const newRetry = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "error", error: "旧批次失败", code: "UPSTREAM_ERROR", durationMs: 1 }] }), { status: 200 }))
      .mockReturnValueOnce(oldRetry.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "error", error: "新批次失败", code: "UPSTREAM_ERROR", durationMs: 2 }] }), { status: 200 }))
      .mockReturnValueOnce(newRetry.promise);
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    const input = screen.getByLabelText("原文");
    fireEvent.change(input, { target: { value: "旧原文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    fireEvent.click(await screen.findByRole("button", { name: "重试 Google 翻译" }));

    fireEvent.change(input, { target: { value: "新原文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    const newRetryButton = await screen.findByRole("button", { name: "重试 Google 翻译" });
    fireEvent.click(newRetryButton);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const oldRetryResponse = {
      ok: true,
      clone() { return this; },
      json: async () => ({ results: [{ provider: "google", status: "success", translatedText: "旧重试结果", durationMs: 9 }] }),
    } as unknown as Response;
    oldRetry.resolve(oldRetryResponse);
    await oldRetry.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText("旧重试结果")).not.toBeInTheDocument();
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toBeInTheDocument();
    expect(screen.getByLabelText("源语言")).toBeDisabled();
    fireEvent.click(newRetryButton);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    newRetry.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "新重试结果", durationMs: 3 }] }), { status: 200 }));
    expect(await screen.findByText("新重试结果")).toBeInTheDocument();
  });

  it("组件卸载时取消当前批次的所有请求", () => {
    const pending = deferredResponse();
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signals.push(init!.signal as AbortSignal);
      return pending.promise;
    });
    const { unmount } = render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    unmount();

    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("提交文本后呈现多个服务的独立结果", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { provider: "google", status: "success", translatedText: "你好", durationMs: 12 },
            { provider: "bing", status: "error", error: "服务限流", code: "UPSTREAM_ERROR", durationMs: 15 },
          ],
        }),
        { status: 200 },
      ),
    );
    render(<TranslatorWorkbench />);

    await user.type(screen.getByLabelText("原文"), "Hello");
    await user.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(await screen.findByText("你好")).toBeInTheDocument();
    expect(screen.getByText("服务限流")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/translate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("支持 Ctrl+Enter 快捷键并可清空内容", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    const input = screen.getByLabelText("原文");
    await user.type(input, "Hello");
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: "清空原文" }));
    expect(input).toHaveValue("");
    expect(screen.getByText("准备就绪")).toBeInTheDocument();
  });

  it("复制成功后显示反馈", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ provider: "google", status: "success", translatedText: "你好", durationMs: 12 }],
        }),
        { status: 200 },
      ),
    );
    render(<TranslatorWorkbench />);
    await user.type(screen.getByLabelText("原文"), "Hello");
    await user.click(screen.getByRole("button", { name: "开始翻译" }));
    await user.click(await screen.findByRole("button", { name: "复制 Google 翻译结果" }));
    expect(writeText).toHaveBeenCalledWith("你好");
    expect(screen.getByText("已复制")).toBeInTheDocument();
  });

  it("默认仅选择 Google 和 Bing，两个 Agnes 可独立或同时选择", async () => {
    const user = userEvent.setup();
    render(<TranslatorWorkbench />);

    const google = screen.getByRole("checkbox", { name: /Google/ });
    const bing = screen.getByRole("checkbox", { name: /Bing/ });
    const agnes20 = screen.getByRole("checkbox", { name: /Agnes 2\.0/ });
    const agnes25 = screen.getByRole("checkbox", { name: /Agnes 2\.5/ });

    expect(google).toBeChecked();
    expect(bing).toBeChecked();
    expect(agnes20).not.toBeChecked();
    expect(agnes25).not.toBeChecked();

    await user.click(agnes20);
    expect(agnes20).toBeChecked();
    expect(agnes25).not.toBeChecked();
    await user.click(agnes25);
    expect(agnes20).toBeChecked();
    expect(agnes25).toBeChecked();
  });

  it("提交时使用 Provider 快照并在加载期间锁定选择控件", async () => {
    const user = userEvent.setup();
    const pending = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pending.promise);
    render(<TranslatorWorkbench />);

    await user.type(screen.getByLabelText("原文"), "Hello");
    await user.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    await user.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string).providers)).toEqual([["google"], ["bing"], ["agnes-2-0"]]);
    expect(screen.getByRole("checkbox", { name: /Agnes 2\.0/ })).toBeDisabled();
    expect(screen.getByLabelText("源语言")).toBeDisabled();
    expect(screen.getByLabelText("目标语言")).toBeDisabled();
    expect(screen.getByLabelText("正在加载 Agnes 2.0 翻译结果")).toBeInTheDocument();

    pending.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "开始翻译" })).toBeEnabled());
  });

  it("快速双击与连续快捷键只发送一次请求，请求结束后可再次提交", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(pending.promise).mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    const input = screen.getByLabelText("原文");
    fireEvent.change(input, { target: { value: "Hello" } });
    const button = screen.getByRole("button", { name: "开始翻译" });

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    pending.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it.each([
    ["502 HTML", new Response("<html>Bad Gateway</html>", { status: 502 })],
    ["504 纯文本", new Response("Gateway Timeout", { status: 504 })],
    ["502 空响应体", new Response(null, { status: 502 })],
    ["200 非 JSON", new Response("请求成功但不是 JSON", { status: 200 })],
  ])("%s 返回受控错误并在失败后允许重试", async (_caseName, invalidResponse) => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(invalidResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    render(<TranslatorWorkbench />);
    const input = screen.getByLabelText("原文");
    fireEvent.change(input, { target: { value: "Hello" } });
    const button = screen.getByRole("button", { name: "开始翻译" });

    fireEvent.click(button);

    expect((await screen.findAllByText("翻译服务响应异常，请稍后重试")).length).toBeGreaterThan(0);
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  });

  it("双 Agnes 请求完成后同时呈现成功和错误结果", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { provider: "agnes-2-0", status: "success", translatedText: "Agnes 成功译文", durationMs: 21 },
            { provider: "agnes-2-5", status: "error", error: "Agnes 服务错误", code: "UPSTREAM_ERROR", durationMs: 34 },
          ],
        }),
        { status: 200 },
      ),
    );
    render(<TranslatorWorkbench />);
    await user.type(screen.getByLabelText("原文"), "Hello");
    await user.click(screen.getByRole("checkbox", { name: /Google/ }));
    await user.click(screen.getByRole("checkbox", { name: /Bing/ }));
    await user.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    await user.click(screen.getByRole("checkbox", { name: /Agnes 2\.5/ }));

    await user.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(await screen.findByText("Agnes 成功译文")).toBeInTheDocument();
    expect(screen.getByText("Agnes 服务错误")).toBeInTheDocument();
    expect(screen.getByText("1 项可用")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string).providers)).toEqual([["agnes-2-0"], ["agnes-2-5"]]);
  });

  it("默认使用上下布局，读取合法偏好并通过右上角控件持久化切换", async () => {
    const user = userEvent.setup();
    const firstRender = render(<TranslatorWorkbench />);
    const layout = screen.getByTestId("workbench-layout");

    expect(layout).toHaveAttribute("data-layout", "stacked");
    expect(screen.getByRole("button", { name: "上下布局" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "左右布局" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "左右布局" }));
    expect(layout).toHaveAttribute("data-layout", "side-by-side");
    expect(localStorage.getItem("vast-translator:layout")).toBe("side-by-side");

    firstRender.unmount();
    render(<TranslatorWorkbench />);
    await waitFor(() => expect(screen.getByTestId("workbench-layout")).toHaveAttribute("data-layout", "side-by-side"));
  });

  it("非法偏好及 localStorage 读取失败时回退上下布局", async () => {
    localStorage.setItem("vast-translator:layout", "diagonal");
    const firstRender = render(<TranslatorWorkbench />);
    await waitFor(() => expect(screen.getByTestId("workbench-layout")).toHaveAttribute("data-layout", "stacked"));
    firstRender.unmount();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("读取失败"); });
    render(<TranslatorWorkbench />);
    await waitFor(() => expect(screen.getByTestId("workbench-layout")).toHaveAttribute("data-layout", "stacked"));
  });

  it("localStorage 写入失败不阻止当前会话切换", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("写入失败"); });
    render(<TranslatorWorkbench />);

    await user.click(screen.getByRole("button", { name: "左右布局" }));
    expect(screen.getByTestId("workbench-layout")).toHaveAttribute("data-layout", "side-by-side");
  });

  it("窄屏强制上下且不覆盖左右偏好，恢复宽屏后恢复偏好并清理监听器", async () => {
    const user = userEvent.setup();
    const viewport = mockViewport();
    const { unmount } = render(<TranslatorWorkbench />);
    await user.click(screen.getByRole("button", { name: "左右布局" }));
    expect(localStorage.getItem("vast-translator:layout")).toBe("side-by-side");

    viewport.setNarrow(true);
    await waitFor(() => expect(screen.getByTestId("workbench-layout")).toHaveAttribute("data-layout", "stacked"));
    expect(screen.getByTestId("layout-controls")).toHaveAttribute("aria-hidden", "true");
    expect(localStorage.getItem("vast-translator:layout")).toBe("side-by-side");

    viewport.setNarrow(false);
    await waitFor(() => expect(screen.getByTestId("workbench-layout")).toHaveAttribute("data-layout", "side-by-side"));
    unmount();
    expect(viewport.mediaQuery.removeEventListener).toHaveBeenCalledOnce();
  });

  it("切换布局保留输入和结果且不触发新请求", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "你好", durationMs: 12 }] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    await user.type(screen.getByLabelText("原文"), "Hello");
    await user.click(screen.getByRole("button", { name: "开始翻译" }));
    expect(await screen.findByText("你好")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "左右布局" }));
    expect(screen.getByLabelText("原文")).toHaveValue("Hello");
    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("左右布局隐藏独立结果标题行，使首张结果卡可与输入工作台顶部对齐", async () => {
    const user = userEvent.setup();
    render(<TranslatorWorkbench />);

    await user.click(screen.getByRole("button", { name: "左右布局" }));

    expect(screen.getByTestId("workbench-layout")).toHaveAttribute("data-layout", "side-by-side");
    expect(screen.getByTestId("results-heading")).toHaveClass("section-heading");
  });

  it("可独立折叠和展开翻译结果，并保留卡片标题栏操作", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          { provider: "google", status: "success", translatedText: "谷歌译文", durationMs: 12 },
          { provider: "bing", status: "success", translatedText: "必应译文", durationMs: 15 },
        ],
      }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    await user.type(screen.getByLabelText("原文"), "Hello");
    await user.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(await screen.findByText("谷歌译文")).toBeInTheDocument();
    expect(screen.getByText("必应译文")).toBeInTheDocument();

    const collapseGoogle = screen.getByRole("button", { name: "折叠 Google 翻译结果" });
    expect(collapseGoogle).toHaveAttribute("aria-expanded", "true");
    await user.click(collapseGoogle);

    expect(screen.queryByText("谷歌译文")).not.toBeInTheDocument();
    expect(screen.getByText("必应译文")).toBeInTheDocument();
    expect(screen.getAllByText("Google")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "复制 Google 翻译结果" })).toBeInTheDocument();

    const expandGoogle = screen.getByRole("button", { name: "展开 Google 翻译结果" });
    expect(expandGoogle).toHaveAttribute("aria-expanded", "false");
    await user.click(expandGoogle);
    expect(screen.getByText("谷歌译文")).toBeInTheDocument();
  });
});
