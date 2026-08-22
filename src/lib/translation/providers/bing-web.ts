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

const MAX_TEXT_LENGTH = 1000;

interface TextToken {
  text: string;
  translatable: boolean;
}

interface MarkedToken {
  text: string;
  newline?: string;
}

interface MarkedChunk {
  text: string;
  markers: MarkedToken[];
}

function safeEnd(text: string, start: number, length: number) {
  let end = Math.min(start + length, text.length);
  const lastCodeUnit = text.charCodeAt(end - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end -= 1;
  return end;
}

function tokenizeText(text: string): TextToken[] {
  return text
    .split(/((?:\r\n|\n)+)/)
    .filter(Boolean)
    .map((token) => ({ text: token, translatable: !/^(?:\r\n|\n)+$/.test(token) }));
}

function markNewlines(text: string): MarkedToken[] {
  let markerIndex = 0;
  return tokenizeText(text).map((token) => {
    if (token.translatable) return { text: token.text };
    let marker: string;
    do marker = `__VAST_NL_${markerIndex++}__`;
    while (text.includes(marker));
    return { text: marker, newline: token.text };
  });
}

function chunkMarkedTokens(tokens: MarkedToken[]): MarkedChunk[] {
  const chunks: MarkedChunk[] = [];
  let current: MarkedChunk = { text: "", markers: [] };
  const flush = () => {
    if (current.text) chunks.push(current);
    current = { text: "", markers: [] };
  };

  for (const token of tokens) {
    if (token.newline !== undefined) {
      if (current.text.length + token.text.length > MAX_TEXT_LENGTH) flush();
      current.text += token.text;
      current.markers.push(token);
      continue;
    }

    let start = 0;
    while (start < token.text.length) {
      if (
        current.text &&
        token.text.length - start <= MAX_TEXT_LENGTH &&
        current.text.length + token.text.length - start > MAX_TEXT_LENGTH
      ) {
        flush();
      }
      const available = MAX_TEXT_LENGTH - current.text.length;
      const end = safeEnd(token.text, start, available);
      current.text += token.text.slice(start, end);
      start = end;
      if (current.text.length === MAX_TEXT_LENGTH || start < token.text.length) flush();
    }
  }
  flush();
  return chunks;
}

function restoreNewlines(text: string, markers: MarkedToken[]) {
  const markerPattern = markers.map((marker) => marker.text).join("|");
  let normalized = text.replace(/^(?:\r\n|\r|\n)+|(?:\r\n|\r|\n)+$/g, "");
  if (markerPattern) {
    normalized = normalized
      .replace(new RegExp(`(?:\\r\\n|\\r|\\n)+(?=${markerPattern})`, "g"), "")
      .replace(new RegExp(`(${markerPattern})(?:\\r\\n|\\r|\\n)+`, "g"), "$1");
  }
  normalized = normalized.replace(/(?:\r\n|\r|\n)+/g, " ");

  let position = 0;
  for (const marker of markers) {
    const index = normalized.indexOf(marker.text, position);
    if (
      index < position ||
      normalized.indexOf(marker.text, index + marker.text.length) !== -1
    ) {
      return undefined;
    }
    position = index + marker.text.length;
  }
  return markers.reduce(
    (restored, marker) => restored.replace(marker.text, marker.newline ?? ""),
    normalized,
  );
}

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
    let detectedLanguage: string | undefined;
    let requestIndex = 0;

    const translateChunk = async (text: string) => {
      requestIndex += 1;
      const query = new URLSearchParams({
        isVertical: "1",
        IG: credentials.ig,
        IID: `${credentials.iid}.${requestIndex}`,
      });
      const body = new URLSearchParams({
        fromLang: bingLanguage(input.sourceLanguage),
        to: bingLanguage(input.targetLanguage),
        text,
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
      detectedLanguage ??= data[0]?.detectedLanguage?.language;
      return translatedText;
    };

    if (!tokenizeText(input.text).some((token) => token.translatable)) {
      return { translatedText: input.text, detectedLanguage };
    }

    const markedChunks = chunkMarkedTokens(markNewlines(input.text));
    if (!markedChunks.length) {
      return { translatedText: input.text, detectedLanguage };
    }

    const translatedChunks: string[] = [];
    let placeholdersValid = true;
    for (const chunk of markedChunks) {
      const translatedText = await translateChunk(chunk.text);
      const restoredText = restoreNewlines(translatedText, chunk.markers);
      if (restoredText === undefined) {
        placeholdersValid = false;
        break;
      }
      translatedChunks.push(restoredText);
    }

    if (placeholdersValid) {
      return {
        translatedText: translatedChunks.join(""),
        detectedLanguage,
      };
    }

    translatedChunks.length = 0;
    for (const token of tokenizeText(input.text)) {
      if (!token.translatable) translatedChunks.push(token.text);
      else {
        let start = 0;
        while (start < token.text.length) {
          const end = safeEnd(token.text, start, MAX_TEXT_LENGTH);
          translatedChunks.push(await translateChunk(token.text.slice(start, end)));
          start = end;
        }
      }
    }
    return {
      translatedText: translatedChunks.join(""),
      detectedLanguage,
    };
  }
}
