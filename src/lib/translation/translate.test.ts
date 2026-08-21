import { describe, expect, it } from "vitest";

import type { TranslationProvider } from "./provider";
import { translateWithProviders } from "./translate";

function provider(
  id: "google" | "bing",
  action: TranslationProvider["translate"],
): TranslationProvider {
  return { id, label: id, available: true, translate: action };
}

describe("translateWithProviders", () => {
  it("保留成功结果并隔离单项失败", async () => {
    const results = await translateWithProviders(
      {
        text: "Hello",
        sourceLanguage: "auto",
        targetLanguage: "zh-CN",
        providers: ["google", "bing"],
      },
      new Map([
        ["google", provider("google", async () => ({ translatedText: "你好" }))],
        ["bing", provider("bing", async () => { throw new Error("限流"); })],
      ]),
    );

    expect(results[0]).toMatchObject({
      provider: "google",
      status: "success",
      translatedText: "你好",
    });
    expect(results[1]).toMatchObject({
      provider: "bing",
      status: "error",
      error: "限流",
    });
  });
});
