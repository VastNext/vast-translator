import { describe, expect, it, vi } from "vitest";

import { GoogleWebProvider, calculateGoogleToken } from "./google-web";

describe("GoogleWebProvider", () => {
  it("为相同文本生成稳定 token", () => {
    expect(calculateGoogleToken("Hello")).toBe(calculateGoogleToken("Hello"));
    expect(calculateGoogleToken("Hello")).toMatch(/^\d+\.\d+$/);
  });

  it("发送表单请求并解析翻译结果", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([["你好", "en"]]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = new GoogleWebProvider(fetcher);

    await expect(
      provider.translate({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
      }),
    ).resolves.toEqual({ translatedText: "你好", detectedLanguage: "en" });

    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toContain("translate.googleapis.com/translate_a/t");
    expect(String(url)).toContain("sl=auto");
    expect(String(url)).toContain("tl=zh-CN");
    expect(options.method).toBe("POST");
    expect(options.body).toBe("q=Hello");
  });

  it("拒绝上游错误", async () => {
    const provider = new GoogleWebProvider(
      vi.fn().mockResolvedValue(new Response("blocked", { status: 429 })),
    );
    await expect(
      provider.translate({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
      }),
    ).rejects.toThrow("Google 翻译暂时不可用");
  });
});
