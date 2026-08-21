import type { TranslationProvider } from "./provider";
import { createProviderRegistry } from "./registry";
import type { ProviderId, ProviderResult, TranslateRequest } from "./types";

const TIMEOUT_MS = 12_000;

export async function translateWithProviders(
  request: TranslateRequest,
  registry: Map<ProviderId, TranslationProvider>,
): Promise<ProviderResult[]> {
  return Promise.all(
    request.providers.map(async (providerId) => {
      const startedAt = Date.now();
      const provider = registry.get(providerId);
      if (!provider || !provider.available) {
        return {
          provider: providerId,
          status: "error" as const,
          code: "PROVIDER_UNAVAILABLE",
          error: `${provider?.label ?? providerId}尚未配置或不可用`,
          durationMs: Date.now() - startedAt,
        };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const output = await provider.translate(request, controller.signal);
        return {
          provider: providerId,
          status: "success" as const,
          ...output,
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        return {
          provider: providerId,
          status: "error" as const,
          code: error instanceof DOMException && error.name === "AbortError" ? "TIMEOUT" : "UPSTREAM_ERROR",
          error:
            error instanceof DOMException && error.name === "AbortError"
              ? "翻译请求超时，请稍后重试"
              : error instanceof Error
                ? error.message
                : "翻译服务暂时不可用",
          durationMs: Date.now() - startedAt,
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
}

export function translateRequest(request: TranslateRequest) {
  return translateWithProviders(request, createProviderRegistry());
}
