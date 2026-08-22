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

  it("按换行拆分超过 1000 个 JS 字符的 Markdown 并按序拼接", async () => {
    const sourceLines = ["a".repeat(600), "b".repeat(600), "c".repeat(600)];
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockImplementation((_url, options) => {
        const text = new URLSearchParams(options.body as string).get("text");
        return Promise.resolve(
          new Response(JSON.stringify([{ translations: [{ text }] }]), { status: 200 }),
        );
      });
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({
        text: sourceLines.join("\n"),
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
      }),
    ).resolves.toEqual({
      translatedText: sourceLines.join("\n"),
      detectedLanguage: undefined,
    });

    const translationCalls = fetcher.mock.calls.slice(1);
    expect(translationCalls).toHaveLength(3);
    expect(
      translationCalls.every(([, options]) => {
        const text = new URLSearchParams(options.body as string).get("text");
        return text !== null && text.length <= 1000;
      }),
    ).toBe(true);
    expect(translationCalls.map(([url]) => new URL(String(url)).searchParams.get("IID"))).toEqual([
      "translator.5028.1.1",
      "translator.5028.1.2",
      "translator.5028.1.3",
    ]);
  });

  it("拆分时保留原始 CRLF 分隔符", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockImplementation((_url, options) => {
        const text = new URLSearchParams(options.body as string).get("text");
        return Promise.resolve(
          new Response(JSON.stringify([{ translations: [{ text }] }]), { status: 200 }),
        );
      });
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({
        text: `${"a".repeat(600)}\r\n${"b".repeat(600)}`,
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
      }),
    ).resolves.toEqual({
      translatedText: `${"a".repeat(600)}\r\n${"b".repeat(600)}`,
      detectedLanguage: undefined,
    });
  });

  it("将约 1149 字符的 17 行真实形态文本批量翻译为不超过 3 个请求", async () => {
    const text = Array.from(
      { length: 17 },
      (_, index) => `- ${String(index + 1).padStart(2, "0")} ${"markdown ".repeat(7)}`,
    ).join("\n");
    expect(text.length).toBeGreaterThanOrEqual(1100);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockImplementation((_url, options) => {
        const chunk = new URLSearchParams(options.body as string).get("text");
        return Promise.resolve(
          new Response(JSON.stringify([{ translations: [{ text: chunk }] }]), { status: 200 }),
        );
      });
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({ text, sourceLanguage: "auto", targetLanguage: "zh-CN" }),
    ).resolves.toEqual({ translatedText: text, detectedLanguage: undefined });

    const translationCalls = fetcher.mock.calls.slice(1);
    expect(translationCalls.length).toBeGreaterThanOrEqual(2);
    expect(translationCalls.length).toBeLessThanOrEqual(3);
    expect(
      translationCalls.every(([, options]) => {
        const chunk = new URLSearchParams(options.body as string).get("text");
        return chunk !== null && chunk.length <= 1000 && !chunk.includes("\n");
      }),
    ).toBe(true);
  });

  it("占位符与用户文本冲突时生成不同占位符", async () => {
    const text = "保留 __VAST_NL_0__\n下一行";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockImplementation((_url, options) => {
        const chunk = new URLSearchParams(options.body as string).get("text");
        return Promise.resolve(
          new Response(JSON.stringify([{ translations: [{ text: chunk }] }]), { status: 200 }),
        );
      });
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({ text, sourceLanguage: "auto", targetLanguage: "zh-CN" }),
    ).resolves.toEqual({ translatedText: text, detectedLanguage: undefined });

    const body = new URLSearchParams(fetcher.mock.calls[1][1].body as string).get("text");
    expect(body).toContain("__VAST_NL_0__");
    expect(body).toContain("__VAST_NL_1__");
  });

  it.each([
    ["丢失", "甲乙"],
    ["改写", "甲__VAST_NL_X__乙"],
    ["重复", "甲__VAST_NL_0____VAST_NL_0__乙"],
  ])("占位符%s时回退到逐文本段翻译", async (_case, batchResponse) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ translations: [{ text: batchResponse }] }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ translations: [{ text: "甲" }] }]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ translations: [{ text: "乙" }] }]), { status: 200 }),
      );
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({ text: "alpha\nbeta", sourceLanguage: "auto", targetLanguage: "zh-CN" }),
    ).resolves.toEqual({ translatedText: "甲\n乙", detectedLanguage: undefined });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("将无换行的超长文本完整拆分而不是截断", async () => {
    const text = "a".repeat(1149);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ translations: [{ text: "甲".repeat(1000) }] }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ translations: [{ text: "甲".repeat(149) }] }]), {
          status: 200,
        }),
      );
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({ text, sourceLanguage: "auto", targetLanguage: "zh-CN" }),
    ).resolves.toEqual({ translatedText: "甲".repeat(1149), detectedLanguage: undefined });

    const requestedText = fetcher.mock.calls
      .slice(1)
      .map(([, options]) => new URLSearchParams(options.body as string).get("text"));
    expect(requestedText).toEqual(["a".repeat(1000), "a".repeat(149)]);
  });

  it("硬切分时不切断 UTF-16 代理对", async () => {
    const text = `${"a".repeat(999)}😀z`;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ translations: [{ text: "甲".repeat(999) }] }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ translations: [{ text: "😀终" }] }]), { status: 200 }),
      );
    const provider = new BingWebProvider(fetcher);

    await provider.translate({ text, sourceLanguage: "auto", targetLanguage: "zh-CN" });

    const requestedText = fetcher.mock.calls
      .slice(1)
      .map(([, options]) => new URLSearchParams(options.body as string).get("text"));
    expect(requestedText).toEqual(["a".repeat(999), "😀z"]);
    expect(requestedText.join("")).toBe(text);
  });

  it("将所有换行序列留在客户端并按原始顺序组装", async () => {
    const text = "\n\nalpha\r\n\r\nbeta\n";
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              translations: [
                { text: "__VAST_NL_0__甲__VAST_NL_1__乙__VAST_NL_2__" },
              ],
            },
          ]),
          { status: 200 },
        ),
      );
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({ text, sourceLanguage: "auto", targetLanguage: "zh-CN" }),
    ).resolves.toEqual({ translatedText: "\n\n甲\r\n\r\n乙\n", detectedLanguage: undefined });

    const requestedText = fetcher.mock.calls
      .slice(1)
      .map(([, options]) => new URLSearchParams(options.body as string).get("text"));
    expect(requestedText).toEqual([
      "__VAST_NL_0__alpha__VAST_NL_1__beta__VAST_NL_2__",
    ]);
  });

  it.each([
    ["marker 前后 LF", "前文\n__VAST_NL_0__\n后文", "前文\n后文"],
    ["marker 前后 CRLF", "前文\r\n__VAST_NL_0__\r\n后文", "前文\n后文"],
  ])("移除 Bing 在%s额外插入的换行", async (_case, responseText, expected) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ translations: [{ text: responseText }] }]), {
          status: 200,
        }),
      );
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({ text: "before\nafter", sourceLanguage: "auto", targetLanguage: "zh-CN" }),
    ).resolves.toEqual({ translatedText: expected, detectedLanguage: undefined });
  });

  it("移除分块响应边界的额外换行且保留用户首尾空白", async () => {
    const text = `  ${"a".repeat(1100)}  `;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockImplementation((_url, options) => {
        const chunk = new URLSearchParams(options.body as string).get("text") ?? "";
        return Promise.resolve(
          new Response(JSON.stringify([{ translations: [{ text: `\r\n${chunk}\n` }] }]), {
            status: 200,
          }),
        );
      });
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({ text, sourceLanguage: "auto", targetLanguage: "zh-CN" }),
    ).resolves.toEqual({ translatedText: text, detectedLanguage: undefined });
  });

  it("纯换行输入不发送空翻译请求", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }));
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({ text: "\n\r\n\n", sourceLanguage: "auto", targetLanguage: "zh-CN" }),
    ).resolves.toEqual({ translatedText: "\n\r\n\n", detectedLanguage: undefined });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("短文本仍只发送一个翻译请求", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ translations: [{ text: "你好" }] }]), { status: 200 }),
      );
    const provider = new BingWebProvider(fetcher);

    await provider.translate({ text: "Hello", sourceLanguage: "auto", targetLanguage: "zh-CN" });

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("将翻译接口的空响应转为受控错误", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(translatorHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }));
    const provider = new BingWebProvider(fetcher);

    await expect(
      provider.translate({ text: "Hello", sourceLanguage: "auto", targetLanguage: "zh-CN" }),
    ).rejects.toThrow("Bing 未返回翻译结果，可能已触发区域限制或限流");
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
