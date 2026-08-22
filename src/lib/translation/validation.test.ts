import { describe, expect, it } from "vitest";

import { validateTranslateRequest } from "./validation";

describe("validateTranslateRequest", () => {
  it("接受合法的翻译请求", () => {
    expect(
      validateTranslateRequest({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["google", "bing"],
      }),
    ).toEqual({
      text: "Hello",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
      providers: ["google", "bing"],
    });
  });

  it("接受两个 Agnes Provider", () => {
    expect(
      validateTranslateRequest({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["agnes-2-0", "agnes-2-5"],
      }),
    ).toMatchObject({ providers: ["agnes-2-0", "agnes-2-5"] });
  });

  it("拒绝空文本", () => {
    expect(() =>
      validateTranslateRequest({
        text: "   ",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["google"],
      }),
    ).toThrow("请输入需要翻译的文本");
  });

  it("拒绝超过限制的文本", () => {
    expect(() =>
      validateTranslateRequest({
        text: "a".repeat(5001),
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["google"],
      }),
    ).toThrow("文本不能超过 5000 个字符");
  });

  it("拒绝未知 Provider", () => {
    expect(() =>
      validateTranslateRequest({
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["unknown"],
      }),
    ).toThrow("包含不支持的翻译服务");
  });
});
