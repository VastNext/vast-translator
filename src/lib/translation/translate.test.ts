import { afterEach, describe, expect, it, vi } from "vitest";

import type { TranslationProvider } from "./provider";
import { translateWithProviders } from "./translate";

function provider(
  id: "google" | "bing" | "agnes-2-0" | "agnes-2-5",
  action: TranslationProvider["translate"],
  timeoutMs?: number | null,
): TranslationProvider {
  return { id, label: id, available: true, timeoutMs, translate: action };
}

const request = {
  text: "Hello",
  sourceLanguage: "auto",
  targetLanguage: "zh-CN",
} as const;

afterEach(() => {
  vi.useRealTimers();
});

describe("translateWithProviders", () => {
  it("保留成功结果并隔离单项失败", async () => {
    const results = await translateWithProviders(
      {
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["google", "bing"],
      },
      new Map([
        ["google", provider("google", async () => ({ translatedText: "你好" }))],
        ["bing", provider("bing", async () => { throw new Error("限流"); })],
      ]),
    );

    expect(results[0]).toMatchObject({
      provider: "google",
      status: "success",
      translatedText: "你好",
    });
    expect(results[1]).toMatchObject({
      provider: "bing",
      status: "error",
      error: "限流",
    });
  });

  it("并发启动 Provider，并按请求顺序返回隔离后的结果", async () => {
    let finishGoogle!: (value: { translatedText: string }) => void;
    const googleTranslate = vi.fn(
      () =>
        new Promise<{ translatedText: string }>((resolve) => {
          finishGoogle = resolve;
        }),
    );
    const bingTranslate = vi.fn().mockRejectedValue(new Error("Bing 失败"));
    const translation = translateWithProviders(
      { ...request, providers: ["google", "bing"] },
      new Map([
        ["google", provider("google", googleTranslate)],
        ["bing", provider("bing", bingTranslate)],
      ]),
    );

    expect(googleTranslate).toHaveBeenCalledOnce();
    expect(bingTranslate).toHaveBeenCalledOnce();
    finishGoogle({ translatedText: "Google 成功" });

    await expect(translation).resolves.toMatchObject([
      { provider: "google", status: "success", translatedText: "Google 成功" },
      { provider: "bing", status: "error", error: "Bing 失败" },
    ]);
  });

  it.each([
    {
      id: "google" as const,
      timeoutMs: undefined,
      expectedTimeoutMs: 12_000,
      description: "默认 12 秒",
    },
  ])(
    "$id 使用$description硬超时",
    async ({ id, timeoutMs, expectedTimeoutMs }) => {
      vi.useFakeTimers();
      const translate = vi.fn(
        () => new Promise<{ translatedText: string }>(() => undefined),
      );
      const translation = translateWithProviders(
        { ...request, providers: [id] },
        new Map([[id, provider(id, translate, timeoutMs)]]),
      );

      await vi.advanceTimersByTimeAsync(expectedTimeoutMs - 1);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);

      await expect(translation).resolves.toMatchObject([
        {
          provider: id,
          status: "error",
          code: "TIMEOUT",
          error: "翻译请求超时，请稍后重试",
        },
      ]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("Agnes 不创建应用层超时，仍可正常完成", async () => {
    vi.useFakeTimers();
    let finish!: (value: { translatedText: string }) => void;
    const translation = translateWithProviders(
      { ...request, providers: ["agnes-2-5"] },
      new Map([
        [
          "agnes-2-5",
          provider(
            "agnes-2-5",
            () => new Promise((resolve) => { finish = resolve; }),
            null,
          ),
        ],
      ]),
    );

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    finish({ translatedText: "Agnes 完成" });

    await expect(translation).resolves.toMatchObject([
      { provider: "agnes-2-5", status: "success", translatedText: "Agnes 完成" },
    ]);
  });

  it("外部取消立即中止所有尚未完成的 Provider，包括两个 Agnes 实例", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const receivedSignals = new Map<string, AbortSignal>();
    const pendingProvider = (
      id: "google" | "agnes-2-0" | "agnes-2-5",
      timeoutMs: number | null,
    ) =>
      provider(
        id,
        (_input, signal) => {
          receivedSignals.set(id, signal!);
          return new Promise(() => undefined);
        },
        timeoutMs,
      );
    const translation = translateWithProviders(
      {
        ...request,
        providers: ["google", "agnes-2-0", "agnes-2-5"],
      },
      new Map([
        ["google", pendingProvider("google", 12_000)],
        ["agnes-2-0", pendingProvider("agnes-2-0", null)],
        ["agnes-2-5", pendingProvider("agnes-2-5", null)],
      ]),
      controller.signal,
    );

    controller.abort();

    await expect(translation).rejects.toMatchObject({
      name: "TranslationRequestAbortedError",
      code: "REQUEST_ABORTED",
    });
    expect([...receivedSignals.values()]).toHaveLength(3);
    expect([...receivedSignals.values()].every((signal) => signal.aborted)).toBe(
      true,
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("外部取消保留已完成 Provider，并仅中止尚未完成的 Provider", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let completedSignal: AbortSignal | undefined;
    let pendingSignal: AbortSignal | undefined;
    const translation = translateWithProviders(
      { ...request, providers: ["google", "agnes-2-0"] },
      new Map([
        [
          "google",
          provider("google", async (_input, signal) => {
            completedSignal = signal;
            return { translatedText: "已完成" };
          }),
        ],
        [
          "agnes-2-0",
          provider(
            "agnes-2-0",
            async (_input, signal) => {
              pendingSignal = signal;
              return new Promise(() => undefined);
            },
            null,
          ),
        ],
      ]),
      controller.signal,
    );

    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(translation).rejects.toMatchObject({
      code: "REQUEST_ABORTED",
    });
    expect(completedSignal?.aborted).toBe(false);
    expect(pendingSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("超时触发 abort 导致 Provider 立即拒绝时仍归类为 TIMEOUT", async () => {
    vi.useFakeTimers();
    const translation = translateWithProviders(
      { ...request, providers: ["google"] },
      new Map([
        [
          "google",
          provider(
            "google",
            (_input, signal) =>
              new Promise((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(new Error("请求已中止")));
              }),
            1_000,
          ),
        ],
      ]),
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(translation).resolves.toMatchObject([
      {
        provider: "google",
        status: "error",
        code: "TIMEOUT",
        error: "翻译请求超时，请稍后重试",
      },
    ]);
  });

  it("同批混合成功、普通失败和超时时相互隔离并保持请求顺序", async () => {
    vi.useFakeTimers();
    const translation = translateWithProviders(
      { ...request, providers: ["google", "bing", "agnes-2-0"] },
      new Map([
        ["google", provider("google", async () => ({ translatedText: "成功译文" }))],
        ["bing", provider("bing", async () => { throw new Error("普通失败"); })],
        [
          "agnes-2-0",
          provider(
            "agnes-2-0",
            async () => ({ translatedText: "Agnes 成功" }),
            null,
          ),
        ],
      ]),
    );

    await expect(translation).resolves.toMatchObject([
      { provider: "google", status: "success", translatedText: "成功译文" },
      { provider: "bing", status: "error", code: "UPSTREAM_ERROR", error: "普通失败" },
      { provider: "agnes-2-0", status: "success", translatedText: "Agnes 成功" },
    ]);
  });

  it("未配置的 Provider 快速失败且不创建超时计时器", async () => {
    vi.useFakeTimers();
    const unavailable: TranslationProvider = {
      ...provider("agnes-2-0", vi.fn(), null),
      available: false,
    };

    await expect(
      translateWithProviders(
        { ...request, providers: ["agnes-2-0"] },
        new Map([["agnes-2-0", unavailable]]),
      ),
    ).resolves.toMatchObject([
      {
        provider: "agnes-2-0",
        status: "error",
        code: "PROVIDER_UNAVAILABLE",
      },
    ]);
    expect(unavailable.translate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
