import type { TranslationProvider } from "./provider";
import { createProviderRegistry } from "./registry";
import type { ProviderId, ProviderResult, TranslateRequest } from "./types";

const DEFAULT_TIMEOUT_MS = 12_000;

class ProviderTimeoutError extends Error {}

export class TranslationRequestAbortedError extends Error {
  readonly code = "REQUEST_ABORTED";

  constructor() {
    super("客户端已取消请求");
    this.name = "TranslationRequestAbortedError";
  }
}

export async function translateWithProviders(
  request: TranslateRequest,
  registry: Map<ProviderId, TranslationProvider>,
  signal?: AbortSignal,
): Promise<ProviderResult[]> {
  if (signal?.aborted) {
    throw new TranslationRequestAbortedError();
  }

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
      const timeoutMs = provider.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : provider.timeoutMs;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      let rejectOnAbort: ((reason: TranslationRequestAbortedError) => void) | undefined;
      const abortProvider = () => {
        controller.abort();
        rejectOnAbort?.(new TranslationRequestAbortedError());
      };
      const aborted = new Promise<never>((_, reject) => {
        rejectOnAbort = reject;
        signal?.addEventListener("abort", abortProvider, { once: true });
      });
      const timeout = timeoutMs === null
        ? new Promise<never>(() => undefined)
        : new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(new ProviderTimeoutError());
            }, timeoutMs);
          });
      try {
        const output = await Promise.race([
          provider.translate(request, controller.signal),
          timeout,
          aborted,
        ]);
        return {
          provider: providerId,
          status: "success" as const,
          ...output,
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        if (signal?.aborted) {
          throw new TranslationRequestAbortedError();
        }
        return {
          provider: providerId,
          status: "error" as const,
          code: timedOut ? "TIMEOUT" : "UPSTREAM_ERROR",
          error:
            timedOut
              ? "翻译请求超时，请稍后重试"
              : error instanceof Error
                ? error.message
                : "翻译服务暂时不可用",
          durationMs: Date.now() - startedAt,
        };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener("abort", abortProvider);
      }
    }),
  );
}

export function translateRequest(request: TranslateRequest, signal?: AbortSignal) {
  return translateWithProviders(request, createProviderRegistry(), signal);
}
