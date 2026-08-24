import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TranslatorWorkbench", () => {
  it("前端隐藏 Azure 并忽略旧缓存中的 Azure 选择", async () => {
    localStorage.setItem("vast-translator:providers", JSON.stringify(["google", "azure"]));

    render(<TranslatorWorkbench />);

    expect(screen.queryByRole("checkbox", { name: /Azure/ })).not.toBeInTheDocument();
    await waitFor(() => expect(
      Array.from(screen.getByTestId("results-grid").querySelectorAll("article header strong"), (node) => node.textContent),
    ).toEqual(["Google"]));
  });

  it.each([
    ["缺少存储", null, ["Google", "Bing"]],
    ["合法空数组", "[]", []],
    ["仅未知和重复未知 ID", JSON.stringify(["unknown", "retired", "unknown"]), []],
    ["未知和重复 ID", JSON.stringify(["agnes-2-5", "unknown", "google", "agnes-2-5", "google"]), ["Google", "Agnes 2.5"]],
    ["非法 JSON", "not-json", ["Google", "Bing"]],
    ["非数组值", JSON.stringify({ provider: "azure" }), ["Google", "Bing"]],
  ])("恢复 Provider 选择：%s", async (_caseName, storedValue, expectedProviders) => {
    if (storedValue !== null) localStorage.setItem("vast-translator:providers", storedValue);
    const fetchMock = vi.spyOn(globalThis, "fetch");

    render(<TranslatorWorkbench />);

    await waitFor(() => expect(
      Array.from(screen.getByTestId("results-grid").querySelectorAll("article header strong"), (node) => node.textContent),
    ).toEqual(expectedProviders));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("恢复 Provider 时按固定顺序排列合法 ID", async () => {
    localStorage.setItem("vast-translator:providers", JSON.stringify(["agnes-2-5", "bing", "agnes-2-0"]));

    render(<TranslatorWorkbench />);

    await waitFor(() => expect(
      Array.from(screen.getByTestId("results-grid").querySelectorAll("article header strong"), (node) => node.textContent),
    ).toEqual(["Bing", "Agnes 2.0", "Agnes 2.5"]));
  });

  it("Provider 偏好读取异常时恢复 Google 和 Bing", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      if (key === "vast-translator:providers") throw new Error("读取失败");
      return null;
    });

    render(<TranslatorWorkbench />);

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Google/ })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /Bing/ })).toBeChecked();
    });
  });

  it("选择变化立即保存完整 Provider 数组且不覆盖布局偏好", () => {
    localStorage.setItem("vast-translator:layout", "side-by-side");
    render(<TranslatorWorkbench />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    expect(localStorage.getItem("vast-translator:providers")).toBe(JSON.stringify(["google", "bing", "agnes-2-0"]));
    expect(localStorage.getItem("vast-translator:layout")).toBe("side-by-side");

    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    expect(localStorage.getItem("vast-translator:providers")).toBe("[]");
  });

  it("Provider 偏好写入失败时当前会话选择仍然生效", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key) => {
      if (key === "vast-translator:providers") throw new Error("写入失败");
    });
    render(<TranslatorWorkbench />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));

    expect(screen.getByRole("checkbox", { name: /Agnes 2\.0/ })).toBeChecked();
    expect(screen.getByRole("article", { name: "Agnes 2.0 翻译卡片" })).toHaveTextContent("尚未翻译");
  });

  it("本地新增 Provider 后外部恢复默认快照会移除新增卡片", async () => {
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    expect(screen.getByRole("article", { name: "Agnes 2.0 翻译卡片" })).toBeInTheDocument();

    window.dispatchEvent(new StorageEvent("storage", {
      key: "vast-translator:providers",
      newValue: JSON.stringify(["google", "bing"]),
    }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Agnes 2\.0/ })).not.toBeChecked());
    expect(screen.queryByRole("article", { name: "Agnes 2.0 翻译卡片" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Google/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Bing/ })).toBeChecked();
  });

  it("本地取消 Provider 后外部恢复同一旧快照会重新加入卡片", async () => {
    localStorage.setItem("vast-translator:providers", JSON.stringify(["google", "bing", "agnes-2-0"]));
    render(<TranslatorWorkbench />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Agnes 2\.0/ })).toBeChecked());
    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    expect(screen.queryByRole("article", { name: "Agnes 2.0 翻译卡片" })).not.toBeInTheDocument();

    window.dispatchEvent(new StorageEvent("storage", {
      key: "vast-translator:providers",
      newValue: JSON.stringify(["google", "bing", "agnes-2-0"]),
    }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Agnes 2\.0/ })).toBeChecked());
    expect(screen.getByRole("article", { name: "Agnes 2.0 翻译卡片" })).toHaveTextContent("尚未翻译");
  });

  it("Provider storage 同步增量保留结果、新增 idle 卡并移除旧卡", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "保留结果", durationMs: 1 }] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    await screen.findByText("保留结果");

    localStorage.setItem("vast-translator:providers", JSON.stringify(["google", "agnes-2-0"]));
    window.dispatchEvent(new StorageEvent("storage", { key: "vast-translator:providers" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Agnes 2\.0/ })).toBeChecked());
    expect(screen.getByText("保留结果")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Agnes 2.0 翻译卡片" })).toHaveTextContent("尚未翻译");
    expect(screen.queryByRole("article", { name: "Bing 翻译卡片" })).not.toBeInTheDocument();
  });

  it("Provider storage 同步移除 pending 卡时中止请求且迟到响应无污染", async () => {
    const pending = deferredResponse();
    let signal!: AbortSignal;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signal = init!.signal as AbortSignal;
      return pending.promise;
    });
    localStorage.setItem("vast-translator:providers", JSON.stringify(["google"]));
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(await screen.findByRole("button", { name: "使用 Google 翻译" }));

    localStorage.setItem("vast-translator:providers", "[]");
    window.dispatchEvent(new StorageEvent("storage", { key: "vast-translator:providers" }));

    await waitFor(() => expect(signal.aborted).toBe(true));
    expect(screen.queryByText("Google", { selector: "article strong" })).not.toBeInTheDocument();
    pending.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "迟到结果", durationMs: 1 }] }), { status: 200 }));
    await act(async () => Promise.resolve());
    expect(screen.queryByText("迟到结果")).not.toBeInTheDocument();
  });

  it("localStorage clear 恢复默认 Provider、移除并中止非默认 pending 卡且迟到响应无污染", async () => {
    const pending = deferredResponse();
    let signal!: AbortSignal;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signal = init!.signal as AbortSignal;
      return pending.promise;
    });
    localStorage.setItem("vast-translator:providers", JSON.stringify(["agnes-2-0"]));
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(await screen.findByRole("button", { name: "使用 Agnes 2.0 翻译" }));

    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null }));

    await waitFor(() => expect(signal.aborted).toBe(true));
    expect(screen.queryByRole("article", { name: "Agnes 2.0 翻译卡片" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Google 翻译卡片" })).toHaveTextContent("尚未翻译");
    expect(screen.getByRole("article", { name: "Bing 翻译卡片" })).toHaveTextContent("尚未翻译");
    pending.resolve(new Response(JSON.stringify({ results: [{ provider: "agnes-2-0", status: "success", translatedText: "迟到 Agnes", durationMs: 1 }] }), { status: 200 }));
    await act(async () => Promise.resolve());
    expect(screen.queryByText("迟到 Agnes")).not.toBeInTheDocument();
  });

  it("removeItem 后恢复默认 Provider 并保留仍选默认 Provider 的既有结果", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "保留 Google", durationMs: 1 }] }), { status: 200 }),
    );
    localStorage.setItem("vast-translator:providers", JSON.stringify(["google"]));
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(await screen.findByRole("button", { name: "使用 Google 翻译" }));
    await screen.findByText("保留 Google");

    localStorage.removeItem("vast-translator:providers");
    window.dispatchEvent(new StorageEvent("storage", { key: "vast-translator:providers", newValue: null }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Bing/ })).toBeChecked());
    expect(screen.getByText("保留 Google")).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Bing 翻译卡片" })).toHaveTextContent("尚未翻译");
  });

  it("Provider remove storage 事件读取失败时安全恢复默认选择", async () => {
    localStorage.setItem("vast-translator:providers", JSON.stringify(["agnes-2-0"]));
    render(<TranslatorWorkbench />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /Agnes 2\.0/ })).toBeChecked());
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      if (key === "vast-translator:providers") throw new Error("读取失败");
      return null;
    });

    expect(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "vast-translator:providers",
      newValue: null,
    }))).not.toThrow();

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Google/ })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: /Bing/ })).toBeChecked();
    });
    expect(screen.queryByRole("article", { name: "Agnes 2.0 翻译卡片" })).not.toBeInTheDocument();
  });

  it("StrictMode 下切换 Provider 不会重复创建卡片", () => {
    render(<StrictMode><TranslatorWorkbench /></StrictMode>);

    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    expect(screen.getAllByRole("article", { name: "Agnes 2.0 翻译卡片" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    expect(screen.queryByRole("article", { name: "Agnes 2.0 翻译卡片" })).not.toBeInTheDocument();
  });

  it("乱序新增 Provider 仍按固定顺序排列", () => {
    render(<TranslatorWorkbench />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.5/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));

    expect(Array.from(screen.getByTestId("results-grid").querySelectorAll("article header strong"), (node) => node.textContent)).toEqual([
      "Google", "Bing", "Agnes 2.0", "Agnes 2.5",
    ]);
  });
  it("初始 Provider 立即显示尚未翻译卡，新增 Provider 按固定顺序插入且不请求", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<TranslatorWorkbench />);

    expect(screen.getByRole("article", { name: "Google 翻译卡片" })).toHaveTextContent("尚未翻译");
    expect(screen.getByRole("article", { name: "Bing 翻译卡片" })).toHaveTextContent("尚未翻译");

    await user.click(screen.getByRole("checkbox", { name: /Agnes 2\.5/ }));
    const cards = screen.getByTestId("results-grid").querySelectorAll("article");
    expect(Array.from(cards, (card) => card.textContent)).toEqual([
      expect.stringContaining("Google"),
      expect.stringContaining("Bing"),
      expect.stringContaining("Agnes 2.5"),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("取消选择立即移除卡片，重新勾选创建不含旧结果的新卡", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "旧结果", durationMs: 1 }] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    await user.type(screen.getByLabelText("原文"), "Hello");
    await user.click(screen.getByRole("checkbox", { name: /Bing/ }));
    await user.click(screen.getByRole("button", { name: "开始翻译" }));
    expect(await screen.findByText("旧结果")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /Google/ }));
    expect(screen.queryByRole("article", { name: "Google 翻译卡片" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Google/ }));

    expect(screen.getByRole("article", { name: "Google 翻译卡片" })).toHaveTextContent("尚未翻译");
    expect(screen.queryByText("旧结果")).not.toBeInTheDocument();
  });

  it("折叠后删除并重加 Provider 会创建默认展开的新卡", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "旧结果", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "新结果", durationMs: 1 }] }), { status: 200 }));
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 翻译" }));
    await screen.findByText("旧结果");
    fireEvent.click(screen.getByRole("button", { name: "折叠 Google 翻译结果" }));

    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 翻译" }));

    const collapse = await screen.findByRole("button", { name: "折叠 Google 翻译结果" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("新结果")).toBeInTheDocument();
  });

  it("单卡按钮按 idle、成功、失败和 pending 状态显示对应动作", async () => {
    const pending = deferredResponse();
    vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "error", error: "失败", code: "UPSTREAM_ERROR", durationMs: 2 }] }), { status: 200 }));
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });

    const translate = screen.getByRole("button", { name: "使用 Google 翻译" });
    fireEvent.click(translate);
    expect(screen.getByRole("button", { name: "Google 正在翻译" })).toBeDisabled();
    pending.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "你好", durationMs: 1 }] }), { status: 200 }));
    fireEvent.click(await screen.findByRole("button", { name: "重新执行 Google 翻译" }));
    expect(await screen.findByRole("button", { name: "重试 Google 翻译" })).toBeInTheDocument();
  });

  it("单卡操作只请求目标 Provider，并使用每次点击时的当前文本和语言", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "结果", durationMs: 1 }] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "第一次" } });
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 翻译" }));
    await screen.findByText("结果");
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "第二次" } });
    fireEvent.change(screen.getByLabelText("源语言"), { target: { value: "zh-CN" } });
    fireEvent.change(screen.getByLabelText("目标语言"), { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "重新执行 Google 翻译" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      text: "第二次", sourceLanguage: "zh-CN", targetLanguage: "en", providers: ["google"],
    });
  });

  it("空输入禁用单卡操作但保留已有结果", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "保留结果", durationMs: 1 }] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 翻译" }));
    await screen.findByText("保留结果");
    fireEvent.click(screen.getByRole("button", { name: "清空原文" }));

    expect(screen.getByText("保留结果")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新执行 Google 翻译" })).toBeDisabled();
  });

  it("取消 pending Provider 独立 abort 并移除，迟到响应不会恢复卡片", async () => {
    const pending = deferredResponse();
    let signal!: AbortSignal;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signal = init!.signal as AbortSignal;
      return pending.promise;
    });
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 翻译" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));

    expect(signal.aborted).toBe(true);
    expect(screen.queryByText("Google", { selector: "article strong" })).not.toBeInTheDocument();
    pending.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "迟到结果", durationMs: 1 }] }), { status: 200 }));
    await Promise.resolve();
    expect(screen.queryByText("迟到结果")).not.toBeInTheDocument();
  });

  it("移除再勾选后的旧请求不能覆盖新卡请求", async () => {
    const oldRequest = deferredResponse();
    const newRequest = deferredResponse();
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 翻译" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 翻译" }));
    oldRequest.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "旧结果", durationMs: 1 }] }), { status: 200 }));
    await Promise.resolve();
    expect(screen.getByRole("button", { name: "Google 正在翻译" })).toBeDisabled();
    expect(screen.queryByText("旧结果")).not.toBeInTheDocument();
    newRequest.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "新结果", durationMs: 1 }] }), { status: 200 }));
    expect(await screen.findByText("新结果")).toBeInTheDocument();
  });

  it("单卡 pending 时文本、语言和 Provider 可编辑，只有该卡和批量操作禁用", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(deferredResponse().promise);
    render(<TranslatorWorkbench />);
    const input = screen.getByLabelText("原文");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 翻译" }));

    expect(input).toBeEnabled();
    expect(screen.getByLabelText("源语言")).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /Agnes 2\.0/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "使用 Bing 翻译" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Google 正在翻译" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "正在翻译" })).toBeDisabled();
  });

  it("主按钮状态、批量快照和较早内容提示随卡片状态变化", async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<TranslatorWorkbench />);
    const input = screen.getByLabelText("原文");
    expect(screen.getByRole("button", { name: "开始翻译" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    expect(screen.getByRole("button", { name: "正在翻译" })).toBeDisabled();
    expect(fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string))).toEqual([
      { text: "Hello", sourceLanguage: "auto", targetLanguage: "zh-CN", providers: ["google"] },
      { text: "Hello", sourceLanguage: "auto", targetLanguage: "zh-CN", providers: ["bing"] },
    ]);
    first.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "你好", durationMs: 1 }] }), { status: 200 }));
    second.resolve(new Response(JSON.stringify({ results: [{ provider: "bing", status: "error", error: "失败", code: "UPSTREAM_ERROR", durationMs: 1 }] }), { status: 200 }));
    expect(await screen.findByRole("button", { name: "全部重新翻译" })).toBeEnabled();
    fireEvent.change(input, { target: { value: "Changed" } });
    expect(screen.getAllByText("基于较早内容")).toHaveLength(2);
    fireEvent.change(input, { target: { value: "Hello" } });
    expect(screen.queryByText("基于较早内容")).not.toBeInTheDocument();
  });

  it("全部重新翻译覆盖 success、error 和 idle 卡并使用当前共同快照", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "旧成功", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "bing", status: "error", error: "旧失败", code: "UPSTREAM_ERROR", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "旧文本" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    await screen.findByText("旧成功");
    await screen.findByText("旧失败");
    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "新文本" } });
    fireEvent.change(screen.getByLabelText("源语言"), { target: { value: "en" } });
    fireEvent.change(screen.getByLabelText("目标语言"), { target: { value: "ja" } });

    fireEvent.click(screen.getByRole("button", { name: "全部重新翻译" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock.mock.calls.slice(2).map((call) => JSON.parse((call[1] as RequestInit).body as string))).toEqual([
      { text: "新文本", sourceLanguage: "en", targetLanguage: "ja", providers: ["google"] },
      { text: "新文本", sourceLanguage: "en", targetLanguage: "ja", providers: ["bing"] },
      { text: "新文本", sourceLanguage: "en", targetLanguage: "ja", providers: ["agnes-2-0"] },
    ]);
  });

  it("同时 pending 时取消 Google 只中止 Google，Bing 仍可成功", async () => {
    const google = deferredResponse();
    const bing = deferredResponse();
    const signals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      signals.push(init!.signal as AbortSignal);
      return signals.length === 1 ? google.promise : bing.promise;
    });
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    google.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "迟到 Google", durationMs: 1 }] }), { status: 200 }));
    bing.resolve(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "Bing 成功", durationMs: 1 }] }), { status: 200 }));

    expect(await screen.findByText("Bing 成功")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("迟到 Google")).not.toBeInTheDocument());
  });

  it("源语言和目标语言变化分别标记结果基于较早内容", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "结果", durationMs: 1 }] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    await screen.findByText("结果");

    fireEvent.change(screen.getByLabelText("源语言"), { target: { value: "en" } });
    expect(screen.getByText("基于较早内容")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("源语言"), { target: { value: "auto" } });
    expect(screen.queryByText("基于较早内容")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("目标语言"), { target: { value: "ja" } });
    expect(screen.getByText("基于较早内容")).toBeInTheDocument();
  });

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

  it("任一卡片 pending 时批量按钮不启动重叠请求", () => {
    const pending = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pending.promise);
    render(<TranslatorWorkbench />);
    const input = screen.getByLabelText("原文");
    fireEvent.change(input, { target: { value: "原文" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    fireEvent.change(input, { target: { value: "新原文" } });

    const batchButton = screen.getByRole("button", { name: "正在翻译" });
    expect(batchButton).toBeDisabled();
    fireEvent.click(batchButton);
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("失败卡只重试自身并使用当前原文和语言，同时防止重复重试", async () => {
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
      text: "编辑后的文本",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["google"],
    });
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toBeInTheDocument();
    expect(screen.getByText("保留结果")).not.toBeVisible();
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
    expect(screen.getByText("保留译文")).not.toBeVisible();
    const retryAgain = screen.getByRole("button", { name: "重试 Google 翻译" });
    fireEvent.click(retryAgain);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(screen.getByLabelText("正在加载 Google 翻译结果")).toBeInTheDocument();
  });

  it("重试使用点击时的当前源语言和目标语言", async () => {
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
      sourceLanguage: "fr",
      targetLanguage: "de",
      providers: ["google"],
    });
  });

  it("三个 Provider 的中间卡片重试前中后顺序保持稳定", async () => {
    const retry = deferredResponse();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "谷歌", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "bing", status: "error", error: "失败", code: "UPSTREAM_ERROR", durationMs: 2 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "agnes-2-0", status: "success", translatedText: "Agnes", durationMs: 3 }] }), { status: 200 }))
      .mockReturnValueOnce(retry.promise);
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    const retryButton = await screen.findByRole("button", { name: "重试 Bing 翻译" });
    await screen.findByText("Agnes", { selector: ".translated-text" });
    const providerOrder = () => Array.from(screen.getByTestId("results-grid").querySelectorAll("article header strong"), (node) => node.textContent);
    expect(providerOrder()).toEqual(["Google", "Bing", "Agnes 2.0"]);

    fireEvent.click(retryButton);
    expect(providerOrder()).toEqual(["Google", "Bing", "Agnes 2.0"]);
    retry.resolve(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "必应成功", durationMs: 4 }] }), { status: 200 }));
    await screen.findByText("必应成功");
    expect(providerOrder()).toEqual(["Google", "Bing", "Agnes 2.0"]);
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

  it("翻译进行中清空只清空输入并保留卡片且允许继续编辑语言", async () => {
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
    expect(screen.getByLabelText("源语言")).toBeEnabled();
    google.resolve(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "谷歌完成", durationMs: 5 }] }), { status: 200 }));
    bing.resolve(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "必应完成", durationMs: 6 }] }), { status: 200 }));
    expect(await screen.findByText("谷歌完成")).toBeInTheDocument();
    expect(await screen.findByText("必应完成")).toBeInTheDocument();
    expect(screen.getByLabelText("源语言")).toBeEnabled();
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
    expect(screen.getAllByText("本次未能获得结果")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "重试 Google 翻译" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "重试 Bing 翻译" })).toBeDisabled();
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

  it("复制失败被捕获且只显示目标 Provider 的短暂失败反馈", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("拒绝访问剪贴板"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "你好", durationMs: 1 }] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));

    fireEvent.click(await screen.findByRole("button", { name: "复制 Google 翻译结果" }));

    expect(await screen.findByText("复制失败")).toBeInTheDocument();
    expect(screen.queryByText("已复制")).not.toBeInTheDocument();
  });

  it("旧译文延迟复制期间重新翻译后不会把新译文标为已复制", async () => {
    let resolveCopy!: () => void;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockReturnValue(new Promise<void>((resolve) => { resolveCopy = resolve; })) },
    });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "译文 A", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "译文 B", durationMs: 1 }] }), { status: 200 }));
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    fireEvent.click(await screen.findByRole("button", { name: "复制 Google 翻译结果" }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "B" } });
    fireEvent.click(screen.getByRole("button", { name: "重新执行 Google 翻译" }));
    await screen.findByText("译文 B");

    resolveCopy();
    await act(async () => Promise.resolve());
    expect(screen.getByRole("button", { name: "复制 Google 翻译结果" })).toHaveTextContent("复制");
    expect(screen.queryByText("已复制")).not.toBeInTheDocument();
  });

  it("执行目标卡不会清除另一卡的复制反馈", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "谷歌", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "必应", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "新谷歌", durationMs: 1 }] }), { status: 200 }));
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    await screen.findByText("谷歌");
    await screen.findByText("必应");
    fireEvent.click(screen.getByRole("button", { name: "复制 Bing 翻译结果" }));
    await screen.findByText("已复制");

    fireEvent.click(screen.getByRole("button", { name: "重新执行 Google 翻译" }));
    await screen.findByText("新谷歌");
    expect(screen.getByRole("button", { name: "复制 Bing 翻译结果" })).toHaveTextContent("已复制");
  });

  it("折叠时 aria-controls 指向的内容节点仍存在并隐藏", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "结果", durationMs: 1 }] }), { status: 200 }),
    );
    render(<TranslatorWorkbench />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Bing/ }));
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    const collapse = await screen.findByRole("button", { name: "折叠 Google 翻译结果" });
    const contentId = collapse.getAttribute("aria-controls")!;

    fireEvent.click(collapse);

    const content = document.getElementById(contentId);
    expect(content).toBeInTheDocument();
    expect(content).toHaveAttribute("hidden");
  });

  it("连续复制不同 Provider 时分别保持并独立清除反馈", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "谷歌译文", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "必应译文", durationMs: 1 }] }), { status: 200 }));
    render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    await screen.findByText("谷歌译文");
    await screen.findByText("必应译文");
    vi.useFakeTimers();

    fireEvent.click(screen.getByRole("button", { name: "复制 Google 翻译结果" }));
    await act(async () => Promise.resolve());
    act(() => vi.advanceTimersByTime(800));
    fireEvent.click(screen.getByRole("button", { name: "复制 Bing 翻译结果" }));
    await act(async () => Promise.resolve());

    expect(screen.getAllByText("已复制")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(800));
    expect(screen.getByRole("button", { name: "复制 Google 翻译结果" })).toHaveTextContent("复制");
    expect(screen.getByRole("button", { name: "复制 Bing 翻译结果" })).toHaveTextContent("已复制");
    act(() => vi.advanceTimersByTime(800));
    expect(screen.queryByText("已复制")).not.toBeInTheDocument();
  });

  it("删除 Provider 和卸载组件会清理各自的复制反馈 timer", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "谷歌译文", durationMs: 1 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ provider: "bing", status: "success", translatedText: "必应译文", durationMs: 1 }] }), { status: 200 }));
    const { unmount } = render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "开始翻译" }));
    await screen.findByText("谷歌译文");
    await screen.findByText("必应译文");
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    fireEvent.click(screen.getByRole("button", { name: "复制 Google 翻译结果" }));
    fireEvent.click(screen.getByRole("button", { name: "复制 Bing 翻译结果" }));
    await act(async () => Promise.resolve());

    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
  });

  it("复制尚未完成时删除卡片或卸载不会为旧卡创建反馈 timer", async () => {
    let resolveCopy!: () => void;
    const writeText = vi.fn().mockReturnValue(new Promise<void>((resolve) => { resolveCopy = resolve; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{ provider: "google", status: "success", translatedText: "谷歌译文", durationMs: 1 }] }), { status: 200 }),
    );
    const { unmount } = render(<TranslatorWorkbench />);
    fireEvent.change(screen.getByLabelText("原文"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "使用 Google 翻译" }));
    await screen.findByText("谷歌译文");
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    fireEvent.click(screen.getByRole("button", { name: "复制 Google 翻译结果" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Google/ }));
    unmount();

    resolveCopy();
    await act(async () => Promise.resolve());
    expect(setTimeoutSpy.mock.calls.some(([, delay]) => delay === 1600)).toBe(false);
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

  it("提交时使用 Provider 快照并在加载期间保持选择控件可编辑", async () => {
    const user = userEvent.setup();
    const pending = deferredResponse();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pending.promise);
    render(<TranslatorWorkbench />);

    await user.type(screen.getByLabelText("原文"), "Hello");
    await user.click(screen.getByRole("checkbox", { name: /Agnes 2\.0/ }));
    await user.click(screen.getByRole("button", { name: "开始翻译" }));

    expect(fetchMock.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string).providers)).toEqual([["google"], ["bing"], ["agnes-2-0"]]);
    expect(screen.getByRole("checkbox", { name: /Agnes 2\.0/ })).toBeEnabled();
    expect(screen.getByLabelText("源语言")).toBeEnabled();
    expect(screen.getByLabelText("目标语言")).toBeEnabled();
    expect(screen.getByLabelText("正在加载 Agnes 2.0 翻译结果")).toBeInTheDocument();

    pending.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    await waitFor(() => expect(screen.getByRole("button", { name: "全部重新翻译" })).toBeEnabled());
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

    expect(screen.getByText("谷歌译文")).not.toBeVisible();
    expect(screen.getByText("必应译文")).toBeInTheDocument();
    expect(screen.getAllByText("Google")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "复制 Google 翻译结果" })).toBeInTheDocument();

    const expandGoogle = screen.getByRole("button", { name: "展开 Google 翻译结果" });
    expect(expandGoogle).toHaveAttribute("aria-expanded", "false");
    await user.click(expandGoogle);
    expect(screen.getByText("谷歌译文")).toBeInTheDocument();
  });
});
