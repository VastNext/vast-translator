import { beforeEach, describe, expect, it, vi } from "vitest";

import { translateRequest } from "@/lib/translation/translate";

vi.mock("@/lib/translation/translate", () => ({
  TranslationRequestAbortedError: class TranslationRequestAbortedError extends Error {},
  TranslationRateLimitError: class TranslationRateLimitError extends Error {
    code = "RATE_LIMITED";
    retryAfterSeconds = 1;
  },
  translateRequest: vi.fn().mockResolvedValue([
    {
      provider: "google",
      status: "success",
      translatedText: "你好",
      durationMs: 10,
    },
  ]),
}));

import { POST } from "./route";

const mockedTranslateRequest = vi.mocked(translateRequest);

beforeEach(() => {
  mockedTranslateRequest.mockClear();
  delete process.env.APP_ENV;
  delete process.env.TRANSLATE_MAX_BODY_BYTES;
  delete process.env.TRANSLATE_MAX_ACTIVE;
  delete process.env.TRANSLATE_MAX_STARTS_PER_MINUTE;
  delete process.env.AGNES_TIMEOUT_MS;
  delete process.env.TRANSLATE_REQUEST_TIMEOUT_MS;
  delete process.env.TRANSLATE_ALLOWED_PROVIDERS;
});

function post(body: string, init: RequestInit = {}) {
  return POST(
    new Request("http://localhost/api/translate", {
      method: "POST",
      body,
      ...init,
    }),
  );
}

describe("POST /api/translate", () => {
  it("返回前端依赖的完整成功响应 schema", async () => {
    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      body: JSON.stringify({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["google"],
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [{
        provider: "google",
        status: "success",
        translatedText: "你好",
        durationMs: 10,
      }],
    });
    expect(mockedTranslateRequest).toHaveBeenCalledWith(
      expect.any(Object),
      request.signal,
      expect.objectContaining({
        policy: expect.objectContaining({ maxBodyBytes: expect.any(Number) }),
        guards: expect.objectContaining({ slots: expect.anything(), window: expect.anything() }),
      }),
    );
  });

  it("返回前端依赖的完整 Provider error 响应 schema", async () => {
    mockedTranslateRequest.mockResolvedValueOnce([{
      provider: "bing",
      status: "error",
      error: "服务限流",
      code: "UPSTREAM_ERROR",
      durationMs: 15,
    }]);
    const response = await post(JSON.stringify({
      text: "Hello",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["bing"],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [{
        provider: "bing",
        status: "error",
        error: "服务限流",
        code: "UPSTREAM_ERROR",
        durationMs: 15,
      }],
    });
  });

  it("客户端取消时返回受控响应", async () => {
    const controller = new AbortController();
    const request = new Request("http://localhost/api/translate", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["agnes-2-0", "agnes-2-5"],
      }),
    });
    mockedTranslateRequest.mockImplementationOnce((_input, signal) =>
      new Promise((_resolve, reject) => {
        if (!signal) {
          reject(new Error("请求信号未传递"));
          return;
        }
        if (signal.aborted) {
          reject(new DOMException("请求已取消", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () =>
          reject(new DOMException("请求已取消", "AbortError")),
        );
      }),
    );

    const pendingResponse = POST(request);
    controller.abort();
    const response = await pendingResponse;

    expect(response.status).toBe(499);
    await expect(response.json()).resolves.toEqual({
      error: { code: "REQUEST_ABORTED", message: "客户端已取消请求" },
    });
  });

  it("拒绝空文本", async () => {
    const response = await post(JSON.stringify({
      text: "",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["google"],
    }));
    expect(response.status).toBe(400);
    expect(mockedTranslateRequest).not.toHaveBeenCalled();
  });

  it("将两个 Agnes ID 原样传入翻译层", async () => {
    const response = await post(JSON.stringify({
      text: "Hello",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["agnes-2-0", "agnes-2-5"],
    }));

    expect(response.status).toBe(200);
    expect(mockedTranslateRequest).toHaveBeenCalledWith(
      {
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["agnes-2-0", "agnes-2-5"],
      },
      expect.any(AbortSignal),
      expect.anything(),
    );
  });

  it("拒绝未知 Provider", async () => {
    const response = await post(JSON.stringify({
      text: "Hello",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["agnes-3-0"],
    }));

    expect(response.status).toBe(400);
    expect(mockedTranslateRequest).not.toHaveBeenCalled();
  });

  it("对超过 5000 字符的 Agnes 请求保持 413", async () => {
    const response = await post(JSON.stringify({
      text: "a".repeat(5001),
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["agnes-2-0"],
    }));

    expect(response.status).toBe(413);
    expect(mockedTranslateRequest).not.toHaveBeenCalled();
  });

  it("请求体字节超限立即 413，不进入翻译层", async () => {
    process.env.APP_ENV = "production";
    process.env.TRANSLATE_MAX_BODY_BYTES = "128";
    process.env.TRANSLATE_MAX_ACTIVE = "10";
    process.env.TRANSLATE_MAX_STARTS_PER_MINUTE = "60";
    process.env.AGNES_TIMEOUT_MS = "120000";
    process.env.TRANSLATE_REQUEST_TIMEOUT_MS = "125000";
    process.env.TRANSLATE_ALLOWED_PROVIDERS = "google";

    const response = await post(JSON.stringify({
      text: "a".repeat(200),
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["google"],
    }));
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.error.code).toBe("BODY_TOO_LARGE");
    expect(mockedTranslateRequest).not.toHaveBeenCalled();
  });

  it("无效 JSON 返回 400", async () => {
    const response = await post("{not-json");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_JSON");
    expect(mockedTranslateRequest).not.toHaveBeenCalled();
  });

  it("部署模式政策变量缺失返回 503 且不读翻译层", async () => {
    process.env.APP_ENV = "production";
    const response = await post(JSON.stringify({
      text: "Hello",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["google"],
    }));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("POLICY_NOT_CONFIGURED");
    expect(mockedTranslateRequest).not.toHaveBeenCalled();
  });

  it("限流错误映射为 429 并带 Retry-After", async () => {
    process.env.APP_ENV = "production";
    process.env.TRANSLATE_MAX_BODY_BYTES = "32768";
    process.env.TRANSLATE_MAX_ACTIVE = "10";
    process.env.TRANSLATE_MAX_STARTS_PER_MINUTE = "60";
    process.env.AGNES_TIMEOUT_MS = "120000";
    process.env.TRANSLATE_REQUEST_TIMEOUT_MS = "125000";
    process.env.TRANSLATE_ALLOWED_PROVIDERS = "google";

    const { TranslationRateLimitError: RealRateLimitError } = await import(
      "@/lib/translation/translate"
    );
    mockedTranslateRequest.mockImplementationOnce(() => {
      throw new RealRateLimitError(1);
    });

    const response = await post(JSON.stringify({
      text: "Hello",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["google"],
    }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    const body = await response.json();
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});
