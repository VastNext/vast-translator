import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BodyLimitError,
  PolicyNotConfiguredError,
  createConcurrencySlots,
  createSlidingWindow,
  readBoundedJson,
  resolveRequestPolicy,
  resetProcessGuardsForTest,
} from "./request-policy";

const DEPLOY_ENV = {
  APP_ENV: "production",
  TRANSLATE_MAX_BODY_BYTES: "32768",
  TRANSLATE_MAX_ACTIVE: "10",
  TRANSLATE_MAX_STARTS_PER_MINUTE: "60",
  AGNES_TIMEOUT_MS: "120000",
  TRANSLATE_REQUEST_TIMEOUT_MS: "125000",
  TRANSLATE_ALLOWED_PROVIDERS: "google,bing,agnes-2-0,agnes-2-5",
};

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  resetProcessGuardsForTest();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveRequestPolicy", () => {
  it("部署模式缺任一变量抛 PolicyNotConfiguredError 且列出缺失名", () => {
    expect(() =>
      resolveRequestPolicy({ APP_ENV: "production" } as unknown as NodeJS.ProcessEnv),
    ).toThrow(PolicyNotConfiguredError);
    try {
      resolveRequestPolicy({ APP_ENV: "production" } as unknown as NodeJS.ProcessEnv);
    } catch (error) {
      expect((error as PolicyNotConfiguredError).missing).toEqual([
        "TRANSLATE_MAX_BODY_BYTES",
        "TRANSLATE_MAX_ACTIVE",
        "TRANSLATE_MAX_STARTS_PER_MINUTE",
        "AGNES_TIMEOUT_MS",
        "TRANSLATE_REQUEST_TIMEOUT_MS",
        "TRANSLATE_ALLOWED_PROVIDERS",
      ]);
    }
  });

  it("部署模式全量变量解析成功且 allowedProviders 正确", () => {
    const policy = resolveRequestPolicy(DEPLOY_ENV as unknown as NodeJS.ProcessEnv);
    expect(policy.maxBodyBytes).toBe(32768);
    expect(policy.maxActive).toBe(10);
    expect(policy.maxStartsPerMinute).toBe(60);
    expect(policy.agnesTimeoutMs).toBe(120000);
    expect(policy.requestTimeoutMs).toBe(125000);
    expect(policy.allowedProviders).toEqual(["google", "bing", "agnes-2-0", "agnes-2-5"]);
  });

  it("开发模式回退 lab_policy", () => {
    const policy = resolveRequestPolicy({} as NodeJS.ProcessEnv);
    expect(policy.maxBodyBytes).toBe(32768);
    expect(policy.maxActive).toBe(10);
    expect(policy.maxStartsPerMinute).toBe(60);
    expect(policy.allowedProviders).toHaveLength(5);
  });

  it("非法数值（0/负数/小数）视为缺失", () => {
    expect(() =>
      resolveRequestPolicy({
        ...DEPLOY_ENV,
        TRANSLATE_MAX_ACTIVE: "0",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(PolicyNotConfiguredError);
  });
});

describe("readBoundedJson", () => {
  function streamRequest(body: string, headers: Record<string, string> = {}) {
    return new Request("http://localhost/api/translate", {
      method: "POST",
      body,
      headers,
      duplex: "half",
    } as RequestInit);
  }

  it("正常 JSON 解析成功", async () => {
    const result = await readBoundedJson(streamRequest('{"a":1}'), 1024);
    expect(result).toEqual({ a: 1 });
  });

  it("超限立即抛 BodyLimitError（含无 Content-Length 场景）", async () => {
    const payload = "x".repeat(2049);
    await expect(readBoundedJson(streamRequest(payload), 2048)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
    });
  });

  it("Content-Length 声明超限时不读取任何字节", async () => {
    const request = streamRequest("whatever", { "content-length": "999999" });
    await expect(readBoundedJson(request, 32768)).rejects.toBeInstanceOf(BodyLimitError);
  });

  it("非法 JSON 抛 SyntaxError（由路由映射 400）", async () => {
    await expect(readBoundedJson(streamRequest("{broken"), 1024)).rejects.toBeInstanceOf(SyntaxError);
  });
});

describe("createSlidingWindow（VT07）", () => {
  it("窗口内达到上限后拒绝，过期后恢复", () => {
    let now = 1_000_000;
    const window = createSlidingWindow(3, () => now);
    expect(window.tryStart()).toBe(true);
    expect(window.tryStart()).toBe(true);
    expect(window.tryStart()).toBe(true);
    expect(window.tryStart()).toBe(false);
    // 61 秒后最早的启动移出窗口
    now += 61_000;
    expect(window.tryStart()).toBe(true);
    expect(window.activeCount()).toBe(1);
  });

  it("失败/取消不退已启动计数（VT07：已启动计数不回退）", () => {
    let now = 2_000_000;
    const window = createSlidingWindow(2, () => now);
    window.tryStart();
    window.tryStart();
    // 没有释放 API：即使上游失败，计数也保留到窗口过期
    expect(window.tryStart()).toBe(false);
    now += 60_100;
    expect(window.tryStart()).toBe(true);
  });
});

describe("createConcurrencySlots（VT06/VT07）", () => {
  it("原子预占 n 个槽；不足时整体拒绝", () => {
    const slots = createConcurrencySlots(5);
    expect(slots.tryReserve(5)).toBe(true);
    expect(slots.active()).toBe(5);
    expect(slots.tryReserve(1)).toBe(false);
    expect(slots.active()).toBe(5);
    slots.release(5);
    expect(slots.active()).toBe(0);
    expect(slots.tryReserve(1)).toBe(true);
  });

  it("槽不足以满足 5 provider 请求时不部分启动", () => {
    const slots = createConcurrencySlots(4);
    expect(slots.tryReserve(5)).toBe(false);
    expect(slots.active()).toBe(0);
  });

  it("释放不低于 0（防重复释放）", () => {
    const slots = createConcurrencySlots(2);
    slots.release(3);
    expect(slots.active()).toBe(0);
  });
});
