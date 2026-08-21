import type { ProviderId } from "./types";

export interface ProviderInput {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface ProviderOutput {
  translatedText: string;
  detectedLanguage?: string;
}

export interface TranslationProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly available: boolean;
  translate(input: ProviderInput, signal?: AbortSignal): Promise<ProviderOutput>;
}

export type Fetcher = typeof fetch;
