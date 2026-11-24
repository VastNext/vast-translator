import { afterEach, describe, expect, it, vi } from "vitest";

import type { RequestPolicy, ProcessGuards } from "./request-policy";
import { createConcurrencySlots, createSlidingWindow } from "./request-policy";
import type { TranslationProvider } from "./provider";
import {
  TranslationRateLimitError,
  translateWithProviders,
} from "./translate";
import type { ProviderId } from "./types";

function provider(
  id: ProviderId,
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

function makeGuards(maxActive: number, maxStarts: number): ProcessGuards {
  return {
    slots: createConcurrencySlots(maxActive),
    window: createSlidingWindow(maxStarts),
  };
}

const fullPolicy: RequestPolicy = {
  maxBodyBytes: 32768,
  maxActive: 10,
  maxStartsPerMinute: 60,
  agnesTimeoutMs: 120_000,
  requestTimeoutMs: 125_000,
  allowedProviders: ["google", "bing", "agnes-2-0", "agnes-2-5"],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("请求保护编排（VT-1 C3 / VT04/VT06/VT07）", () => {
  it("禁用 provider 产出 PROVIDER_DISABLED 结果且不调用上游、不占槽", async () => {
    const upstream = vi.fn().mockResolvedValue({ translatedText: "x" });
    const guards = makeGuards(10, 60);
    const results = await translateWithProviders(
      { ...request, providers: ["google", "azure"] },
      new Map([["google", provider("google", upstream, 12_000)]]),
      undefined,
      { policy: fullPolicy, guards },
    );
    expect(results).toEqual([
      { provider: "google", status: "success", translatedText: "x", durationMs: expect.any(Number) },
      { provider: "azure", status: "error", code: "PROVIDER_DISABLED", error: expect.any(String), durationMs: 0 },
    ]);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(guards.slots.active()).toBe(0);
  });

  it("Q2 五卡请求：4 个可调用 + 1 个禁用，结果含全部去重 ID（VT04）", async () => {
    const guards = makeGuards(10, 60);
    const results = await translateWithProviders(
      {
        ...request,
        providers: ["google", "bing", "azure", "agnes-2-0", "agnes-2-5"],
      },
      new Map([
        ["google", provider("google", async () => ({ translatedText: "你好，世界。" }), 12_000)],
        ["bing", provider("bing", async () => ({ translatedText: "你好，世界。" }), 12_000)],
        ["agnes-2-0", provider("agnes-2-0", async () => ({ translatedText: "你好，世界。" }), 120_000)],
        ["agnes-2-5", provider("agnes-2-5", async () => ({ translatedText: "你好，世界。" }), 120_000)],
      ]),
      undefined,
      { policy: fullPolicy, guards },
    );
    expect(results.map((r) => r.provider)).toEqual(["google", "bing", "azure", "agnes-2-0", "agnes-2-5"]);
    expect(results.find((r) => r.provider === "azure")).toMatchObject({ code: "PROVIDER_DISABLED" });
    for (const id of ["google", "bing", "agnes-2-0", "agnes-2-5"]) {
      expect(results.find((r) => r.provider === id)).toMatchObject({
        status: "success",
        translatedText: "你好，世界。",
      });
    }
    expect(guards.slots.active()).toBe(0);
  });

  it("单卡失败不传播到其他卡（VT04）", async () => {
    const guards = makeGuards(10, 60);
    const results = await translateWithProviders(
      { ...request, providers: ["google", "bing"] },
      new Map([
        ["google", provider("google", async () => ({ translatedText: "ok" }), 12_000)],
        ["bing", provider("bing", async () => { throw new Error("upstream 500"); }, 12_000)],
      ]),
      undefined,
      { policy: fullPolicy, guards },
    );
    expect(results).toEqual([
      { provider: "google", status: "success", translatedText: "ok", durationMs: expect.any(Number) },
      { provider: "bing", status: "error", code: "UPSTREAM_ERROR", error: "upstream 500", durationMs: expect.any(Number) },
    ]);
  });

  it("槽位不足时整体 429 且上游零调用（VT07）", async () => {
    const upstream = vi.fn().mockResolvedValue({ translatedText: "x" });
    const guards = makeGuards(2, 60);
    await expect(
      translateWithProviders(
        { ...request, providers: ["google", "bing", "agnes-2-0", "agnes-2-5"] },
        new Map([
          ["google", provider("google", upstream, 12_000)],
          ["bing", provider("bing", upstream, 12_000)],
          ["agnes-2-0", provider("agnes-2-0", upstream, 120_000)],
          ["agnes-2-5", provider("agnes-2-5", upstream, 120_000)],
        ]),
        undefined,
        { policy: fullPolicy, guards },
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", name: "TranslationRateLimitError" });
    expect(upstream).not.toHaveBeenCalled();
    expect(guards.slots.active()).toBe(0);
  });

  it("窗口满时整体 429 且槽位完整回滚（VT07）", async () => {
    const upstream = vi.fn();
    const guards = makeGuards(10, 1); // 窗口只允许 1 次启动
    guards.window.tryStart(); // 预先占满窗口
    await expect(
      translateWithProviders(
        { ...request, providers: ["google", "bing"] },
        new Map([
          ["google", provider("google", upstream, 12_000)],
          ["bing", provider("bing", upstream, 12_000)],
        ]),
        undefined,
        { policy: fullPolicy, guards },
      ),
    ).rejects.toBeInstanceOf(TranslationRateLimitError);
    expect(upstream).not.toHaveBeenCalled();
    expect(guards.slots.active()).toBe(0);
  });

  it("请求级超时将未完成卡归类 TIMEOUT，成功卡保留，槽位最终为 0（VT06）", async () => {
    vi.useFakeTimers();
    const guards = makeGuards(10, 60);
    const policy = { ...fullPolicy, requestTimeoutMs: 125_000 };
    const translation = translateWithProviders(
      { ...request, providers: ["google", "agnes-2-0"] },
      new Map([
        ["google", provider("google", async () => ({ translatedText: "快" }), 12_000)],
        [
          "agnes-2-0",
          provider("agnes-2-0", () => new Promise(() => undefined), null),
        ],
      ]),
      undefined,
      { policy, guards },
    );
    await vi.advanceTimersByTimeAsync(200); // google 完成
    await vi.advanceTimersByTimeAsync(125_000); // 请求级超时
    const results = await translation;
    expect(results.find((r) => r.provider === "google")).toMatchObject({ status: "success", translatedText: "快" });
    expect(results.find((r) => r.provider === "agnes-2-0")).toMatchObject({ code: "TIMEOUT" });
    expect(guards.slots.active()).toBe(0);
  });

  it("客户端取消传播 aborted 到所有上游信号并抛 REQUEST_ABORTED（VT06）", async () => {
    const controller = new AbortController();
    const received: AbortSignal[] = [];
    const translation = translateWithProviders(
      { ...request, providers: ["google", "agnes-2-0"] },
      new Map([
        ["google", provider("google", (_i, signal) => { received.push(signal!); return new Promise(() => undefined); }, 12_000)],
        ["agnes-2-0", provider("agnes-2-0", (_i, signal) => { received.push(signal!); return new Promise(() => undefined); }, null)],
      ]),
      controller.signal,
      { policy: fullPolicy, guards: makeGuards(10, 60) },
    );
    controller.abort();
    await expect(translation).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
    expect(received.length).toBe(2);
    expect(received.every((signal) => signal.aborted)).toBe(true);
  });

  it("上游忽略 abort 挂起时，请求仍按超时完成并释放槽位（VT06）", async () => {
    vi.useFakeTimers();
    const guards = makeGuards(1, 60);
    const policy = { ...fullPolicy, requestTimeoutMs: 125_000 };
    const translation = translateWithProviders(
      { ...request, providers: ["google"] },
      new Map([
        // 永不 resolve、也忽略 signal 的上游
        ["google", provider("google", () => new Promise(() => undefined), null)],
      ]),
      undefined,
      { policy, guards },
    );
    await vi.advanceTimersByTimeAsync(125_000);
    const results = await translation;
    expect(results).toEqual([
      { provider: "google", status: "error", code: "TIMEOUT", error: "翻译请求超时，请稍后重试", durationMs: expect.any(Number) },
    ]);
    expect(guards.slots.active()).toBe(0);
    // 槽已释放，下一个请求可正常启动
    const second = await translateWithProviders(
      { ...request, providers: ["google"] },
      new Map([["google", provider("google", async () => ({ translatedText: "ok" }), 12_000)]]),
      undefined,
      { policy, guards },
    );
    expect(second[0]).toMatchObject({ status: "success" });
  });

  it("Reservation finally 释放：单卡抛错路径也释放（VT07）", async () => {
    const guards = makeGuards(1, 60);
    await translateWithProviders(
      { ...request, providers: ["google"] },
      new Map([["google", provider("google", async () => { throw new Error("boom"); }, 12_000)]]),
      undefined,
      { policy: fullPolicy, guards },
    );
    expect(guards.slots.active()).toBe(0);
    expect(guards.window.activeCount()).toBe(1); // 已启动计数保留
  });
});
