import { beforeEach, describe, expect, it, vi } from "vitest";

import { translateRequest } from "@/lib/translation/translate";

vi.mock("@/lib/translation/translate", () => ({
  TranslationRequestAbortedError: class TranslationRequestAbortedError extends Error {},
  translateRequest: vi.fn().mockResolvedValue([
    {
      provider: "google",
      status: "success",
      translatedText: "你好",
      durationMs: 10,
    },
  ]),
}));

import { maxDuration, POST } from "./route";

const mockedTranslateRequest = vi.mocked(translateRequest);

beforeEach(() => {
  mockedTranslateRequest.mockClear();
});

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
    const response = await POST(new Request("http://localhost/api/translate", {
      method: "POST",
      body: JSON.stringify({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["bing"],
      }),
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
    const response = await POST(
      new Request("http://localhost/api/translate", {
        method: "POST",
        body: JSON.stringify({
          text: "",
          sourceLanguage: "auto",
          targetLanguage: "zh-CN",
          providers: ["google"],
        }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("将两个 Agnes ID 原样传入翻译层", async () => {
    const response = await POST(
      new Request("http://localhost/api/translate", {
        method: "POST",
        body: JSON.stringify({
          text: "Hello",
          sourceLanguage: "auto",
          targetLanguage: "zh-CN",
          providers: ["agnes-2-0", "agnes-2-5"],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedTranslateRequest).toHaveBeenCalledWith(
      {
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["agnes-2-0", "agnes-2-5"],
      },
      expect.any(AbortSignal),
    );
  });

  it("拒绝未知 Provider", async () => {
    const response = await POST(
      new Request("http://localhost/api/translate", {
        method: "POST",
        body: JSON.stringify({
          text: "Hello",
          sourceLanguage: "auto",
          targetLanguage: "zh-CN",
          providers: ["agnes-3-0"],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockedTranslateRequest).not.toHaveBeenCalled();
  });

  it("对超过 5000 字符的 Agnes 请求保持 413", async () => {
    const response = await POST(
      new Request("http://localhost/api/translate", {
        method: "POST",
        body: JSON.stringify({
          text: "a".repeat(5001),
          sourceLanguage: "auto",
          targetLanguage: "zh-CN",
          providers: ["agnes-2-0"],
        }),
      }),
    );

    expect(response.status).toBe(413);
    expect(mockedTranslateRequest).not.toHaveBeenCalled();
  });

  it("声明大于 Agnes 应用超时的 40 秒函数时限", () => {
    expect(maxDuration).toBe(40);
    expect(maxDuration).toBeGreaterThan(30);
  });
});
