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
    expect(options.body).toContain("fromLang=auto-detect");
    expect(options.body).toContain("to=zh-Hans");
    expect(options.body).toContain("text=Hello");
  });
});
