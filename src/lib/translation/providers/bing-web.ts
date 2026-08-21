import type { Fetcher, ProviderInput, TranslationProvider } from "../provider";

interface BingCredentials {
  ig: string;
  iid: string;
  key: string;
  token: string;
}

const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
  "Accept-Language": "en-US,en;q=0.9",
};

export function parseBingCredentials(html: string): BingCredentials {
  const iid = html.match(/data-iid=["']([\w.]+)["']/)?.[1];
  const ig = html.match(/IG\s*:\s*["']([\w.]+)["']/)?.[1];
  const params = html.match(/params_(?:AbusePreventionHelper|RichTranslateHelper)\s*=\s*\[\s*(\d+)\s*,\s*["']([^"']+)/);
  if (!iid || !ig || !params) throw new Error("无法获取 Bing 翻译凭据");
  return { iid, ig, key: params[1], token: params[2] };
}

function bingLanguage(language: string) {
  const map: Record<string, string> = {
    auto: "auto-detect",
    "zh-CN": "zh-Hans",
    "zh-TW": "zh-Hant",
  };
  return map[language] ?? language;
}

export class BingWebProvider implements TranslationProvider {
  readonly id = "bing" as const;
  readonly label = "Bing 翻译";
  readonly available = true;
  private credentials?: { value: BingCredentials; expiresAt: number };

  constructor(private readonly fetcher: Fetcher = fetch) {}

  private async getCredentials(signal?: AbortSignal) {
    if (this.credentials && this.credentials.expiresAt > Date.now()) {
      return this.credentials.value;
    }
    const response = await this.fetcher("https://www.bing.com/translator", {
      headers: browserHeaders,
      signal,
    });
    if (!response.ok) {
      throw new Error(`Bing 凭据请求被上游拒绝（HTTP ${response.status}）`);
    }
    const value = parseBingCredentials(await response.text());
    this.credentials = { value, expiresAt: Date.now() + 60 * 60 * 1000 };
    return value;
  }

  async translate(input: ProviderInput, signal?: AbortSignal) {
    const credentials = await this.getCredentials(signal);
    const query = new URLSearchParams({
      isVertical: "1",
      IG: credentials.ig,
      IID: `${credentials.iid}.1`,
    });
    const body = new URLSearchParams({
      fromLang: bingLanguage(input.sourceLanguage),
      to: bingLanguage(input.targetLanguage),
      text: input.text,
      key: credentials.key,
      token: credentials.token,
      tryFetchingGenderDebiasedTranslations: "true",
    });
    const response = await this.fetcher(
      `https://www.bing.com/ttranslatev3?${query}`,
      {
        method: "POST",
        headers: {
          ...browserHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://www.bing.com",
          Referer: "https://www.bing.com/translator",
        },
        body: body.toString(),
        signal,
      },
    );
    if (!response.ok) {
      this.credentials = undefined;
      throw new Error(`Bing 翻译请求被上游拒绝（HTTP ${response.status}）`);
    }
    const responseText = await response.text();
    if (!responseText) {
      this.credentials = undefined;
      throw new Error("Bing 未返回翻译结果，可能已触发区域限制或限流");
    }
    const data = JSON.parse(responseText) as Array<{
      detectedLanguage?: { language?: string };
      translations?: Array<{ text?: string }>;
    }>;
    const translatedText = data[0]?.translations?.[0]?.text;
    if (!translatedText) throw new Error("Bing 返回了无法识别的结果");
    return {
      translatedText,
      detectedLanguage: data[0]?.detectedLanguage?.language,
    };
  }
}
