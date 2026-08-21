import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TranslatorWorkbench } from "./translator-workbench";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TranslatorWorkbench", () => {
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
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "清空原文" }));
    expect(input).toHaveValue("");
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
});
