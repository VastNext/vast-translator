import { describe, expect, it, vi } from "vitest";

import { BingWebProvider, parseBingCredentials } from "./bing-web";

const translatorHtml = `
  <div data-iid="translator.5028.1"></div>
  <script>IG:"ABC123"; params_RichTranslateHelper = [123456,"token-value"];</script>
`;

describe("BingWebProvider", () => {
  it("从 Translator 页面提取凭据", () => {
    expect(parseBingCredentials(translatorHtml)).toEqual({
      ig: "ABC123",
      iid: "translator.5028.1",
      key: "123456",
      token: "token-value",
    });
  });

  it("兼容当前页面的 AbusePreventionHelper 变量", () => {
    const html = `<div data-iid="translator.5023"></div><script>IG:"ABC123"; params_AbusePreventionHelper = [123456,"token-value",3600000];</script>`;
    expect(parseBingCredentials(html)).toEqual({
      ig: "ABC123",
      iid: "translator.5023",
      key: "123456",
      token: "token-value",
    });
  });

  it("获取凭据后发送翻译请求", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              detectedLanguage: { language: "en" },
              translations: [{ text: "你好" }],
            },
          ]),
          { status: 200 },
        ),
      );
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
      }),
    ).resolves.toEqual({ translatedText: "你好", detectedLanguage: "en" });

    const [url, options] = fetcher.mock.calls[1];
    expect(String(url)).toContain("ttranslatev3");
    expect(String(url)).toContain("IG=ABC123");
    expect(String(url)).toContain("IID=translator.5028.1.1");
    expect(options.headers["User-Agent"]).toContain("Mozilla/5.0");
    expect(options.headers.Referer).toBe("https://www.bing.com/translator");
    expect(options.body).toContain("fromLang=auto-detect");
    expect(options.body).toContain("to=zh-Hans");
    expect(options.body).toContain("text=Hello");
    expect(options.body).toContain("tryFetchingGenderDebiasedTranslations=true");
  });

  it("在凭据页面被上游拒绝时保留阶段和状态码", async () => {
    const provider = new BingWebProvider(
      vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })),
    );

    await expect(
      provider.translate({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
      }),
    ).rejects.toThrow("Bing 凭据请求被上游拒绝（HTTP 403）");
  });

  it("在翻译接口被上游拒绝时保留阶段和状态码", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response('{"ShowCaptcha":false}', { status: 401 }));
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
      }),
    ).rejects.toThrow("Bing 翻译请求被上游拒绝（HTTP 401）");
  });
});
