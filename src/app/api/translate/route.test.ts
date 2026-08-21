import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/translation/translate", () => ({
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

describe("POST /api/translate", () => {
  it("返回统一翻译响应", async () => {
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
    await expect(response.json()).resolves.toMatchObject({
      results: [{ translatedText: "你好" }],
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
});
