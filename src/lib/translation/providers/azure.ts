import type { Fetcher, ProviderInput, TranslationProvider } from "../provider";

export class AzureProvider implements TranslationProvider {
  readonly id = "azure" as const;
  readonly label = "Azure 翻译";
  readonly available: boolean;

  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly config = {
      key: process.env.AZURE_TRANSLATOR_KEY,
      region: process.env.AZURE_TRANSLATOR_REGION,
      endpoint:
        process.env.AZURE_TRANSLATOR_ENDPOINT ??
        "https://api.cognitive.microsofttranslator.com",
    },
  ) {
    this.available = Boolean(config.key && config.region);
  }

  async translate(input: ProviderInput, signal?: AbortSignal) {
    if (!this.available) throw new Error("Azure 翻译尚未配置");
    const query = new URLSearchParams({
      "api-version": "3.0",
      to: input.targetLanguage,
    });
    if (input.sourceLanguage !== "auto") query.set("from", input.sourceLanguage);
    const response = await this.fetcher(`${this.config.endpoint}/translate?${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": this.config.key!,
        "Ocp-Apim-Subscription-Region": this.config.region!,
      },
      body: JSON.stringify([{ Text: input.text }]),
      signal,
    });
    if (!response.ok) throw new Error("Azure 翻译暂时不可用");
    const data = (await response.json()) as Array<{
      detectedLanguage?: { language?: string };
      translations?: Array<{ text?: string }>;
    }>;
    const translatedText = data[0]?.translations?.[0]?.text;
    if (!translatedText) throw new Error("Azure 返回了无法识别的结果");
    return {
      translatedText,
      detectedLanguage: data[0]?.detectedLanguage?.language,
    };
  }
}
