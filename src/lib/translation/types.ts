export const providerIds = [
  "google",
  "bing",
  "azure",
  "agnes-2-0",
  "agnes-2-5",
] as const;

export type ProviderId = (typeof providerIds)[number];

export interface TranslateRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  providers: ProviderId[];
}

export interface ProviderSuccess {
  provider: ProviderId;
  status: "success";
  translatedText: string;
  detectedLanguage?: string;
  durationMs: number;
}

export interface ProviderFailure {
  provider: ProviderId;
  status: "error";
  error: string;
  code: string;
  durationMs: number;
}

export type ProviderResult = ProviderSuccess | ProviderFailure;

export interface TranslateResponse {
  results: ProviderResult[];
}
