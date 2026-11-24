import type { RequestPolicy, ProcessGuards } from "./request-policy";
import type { TranslationProvider } from "./provider";
import { createProviderRegistry } from "./registry";
import type { ProviderId, ProviderResult, TranslateRequest } from "./types";

const DEFAULT_TIMEOUT_MS = 12_000;

class ProviderTimeoutError extends Error {}

export class TranslationRateLimitError extends Error {
  readonly code = "RATE_LIMITED";
  constructor(readonly retryAfterSeconds: number = 1) {
    super("翻译请求过于频繁，请稍后重试");
    this.name = "TranslationRateLimitError";
  }
}

export class TranslationRequestAbortedError extends Error {
  readonly code = "REQUEST_ABORTED";

  constructor() {
    super("客户端已取消请求");
    this.name = "TranslationRequestAbortedError";
  }
}

export interface TranslateDeps {
  policy?: RequestPolicy;
  guards?: ProcessGuards;
}

interface ProviderOutcome {
  index: number;
  result: ProviderResult;
}

export async function translateWithProviders(
  request: TranslateRequest,
  registry: Map<ProviderId, TranslationProvider>,
  signal?: AbortSignal,
  deps: TranslateDeps = {},
): Promise<ProviderResult[]> {
  if (signal?.aborted) {
    throw new TranslationRequestAbortedError();
  }

  const allowed = deps.policy?.allowedProviders;
  const isAllowed = (providerId: ProviderId) => allowed?.includes(providerId) ?? true;

  // 不可调用项（禁用/未配置）直接产出错误结果，不消耗窗口与并发槽。
  const outcomes: ProviderOutcome[] = [];
  const callable: Array<{ index: number; providerId: ProviderId; provider: TranslationProvider }> = [];
  request.providers.forEach((providerId, index) => {
    const provider = registry.get(providerId);
    if (!isAllowed(providerId)) {
      outcomes.push({
        index,
        result: {
          provider: providerId,
          status: "error" as const,
          code: "PROVIDER_DISABLED",
          error: "该翻译服务已被管理员禁用",
          durationMs: 0,
        },
      });
      return;
    }
    if (!provider || !provider.available) {
      outcomes.push({
        index,
        result: {
          provider: providerId,
          status: "error" as const,
          code: "PROVIDER_UNAVAILABLE",
          error: `${provider?.label ?? providerId}尚未配置或不可用`,
          durationMs: 0,
        },
      });
      return;
    }
    callable.push({ index, providerId, provider });
  });

  // C3：预占发生在上游调用前；n 个槽 + n 个窗口名额必须一次满足，否则整体 429。
  if (callable.length > 0 && deps.guards) {
    const { window, slots } = deps.guards;
    if (!slots.tryReserve(callable.length)) {
      throw new TranslationRateLimitError(1);
    }
    const windowAdmitted: number[] = [];
    let windowFull = false;
    for (let i = 0; i < callable.length; i += 1) {
      if (window.tryStart()) {
        windowAdmitted.push(i);
      } else {
        windowFull = true;
        break;
      }
    }
    if (windowFull) {
      slots.release(callable.length);
      throw new TranslationRateLimitError(1);
    }
    void windowAdmitted;
  }

  try {
    if (callable.length === 0) {
      return assemble(request.providers, outcomes);
    }

    // 整个请求的有限上限：合并客户端取消与请求级超时（VT-1 C3）。
    const outerController = new AbortController();
    let requestTimedOut = false;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    if (deps.policy?.requestTimeoutMs) {
      requestTimer = setTimeout(() => {
        requestTimedOut = true;
        outerController.abort();
      }, deps.policy.requestTimeoutMs);
    }
    let rejectOnClientAbort: ((reason: TranslationRequestAbortedError) => void) | undefined;
    const onClientAbort = () => {
      outerController.abort();
      rejectOnClientAbort?.(new TranslationRequestAbortedError());
    };
    const clientAborted = new Promise<never>((_, reject) => {
      rejectOnClientAbort = reject;
      signal?.addEventListener("abort", onClientAbort, { once: true });
    });

    try {
      const settled = await Promise.all([
        Promise.all(
          callable.map(async ({ index, providerId, provider }) => {
            const startedAt = Date.now();
            const controller = new AbortController();
            // 客户端取消或请求级超时都传播到每个上游调用。
            const forwardOuter = () => controller.abort();
            outerController.signal.addEventListener("abort", forwardOuter, { once: true });

            const timeoutMs =
              provider.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : provider.timeoutMs;
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
                // 请求级超时：该 provider 归类 TIMEOUT，不影响其他卡。
                new Promise<never>((_, reject) => {
                  outerController.signal.addEventListener("abort", () => {
                    if (requestTimedOut) reject(new ProviderTimeoutError());
                  }, { once: true });
                }),
              ]);
              return {
                index,
                result: {
                  provider: providerId,
                  status: "success" as const,
                  ...output,
                  durationMs: Date.now() - startedAt,
                } satisfies ProviderResult,
              };
            } catch (error) {
              if (signal?.aborted) {
                throw new TranslationRequestAbortedError();
              }
              return {
                index,
                result: {
                  provider: providerId,
                  status: "error" as const,
                  code: timedOut || requestTimedOut ? "TIMEOUT" : "UPSTREAM_ERROR",
                  error:
                    timedOut || requestTimedOut
                      ? "翻译请求超时，请稍后重试"
                      : error instanceof Error
                        ? error.message
                        : "翻译服务暂时不可用",
                  durationMs: Date.now() - startedAt,
                } satisfies ProviderResult,
              };
            } finally {
              if (timer !== undefined) clearTimeout(timer);
              outerController.signal.removeEventListener("abort", forwardOuter);
              signal?.removeEventListener("abort", abortProvider);
            }
          }),
        ),
        // 客户端主动取消时整体失败（499 语义保留）。
        Promise.race([clientAborted, Promise.resolve(null)]),
      ]);
      outcomes.push(...settled[0]);
      return assemble(request.providers, outcomes);
    } catch (error) {
      if (signal?.aborted) {
        throw new TranslationRequestAbortedError();
      }
      throw error;
    } finally {
      if (requestTimer !== undefined) clearTimeout(requestTimer);
      signal?.removeEventListener("abort", onClientAbort);
    }
  } finally {
    // 无论成功、单卡失败还是取消，在途槽位最终全部释放（VT06/VT07）。
    if (callable.length > 0 && deps.guards) {
      deps.guards.slots.release(callable.length);
    }
  }
}

function assemble(order: ProviderId[], outcomes: ProviderOutcome[]): ProviderResult[] {
  const byIndex = new Map<number, ProviderResult>();
  for (const outcome of outcomes) byIndex.set(outcome.index, outcome.result);
  return order.map((providerId, index) => {
    const result = byIndex.get(index);
    if (result) return result;
    // 防御：任何 provider 都必须有结果；缺失按上游错误处理而非静默丢卡。
    return {
      provider: providerId,
      status: "error" as const,
      code: "UPSTREAM_ERROR",
      error: "翻译服务暂时不可用",
      durationMs: 0,
    };
  });
}

export function translateRequest(
  request: TranslateRequest,
  signal?: AbortSignal,
  deps: TranslateDeps = {},
) {
  return translateWithProviders(request, createProviderRegistry(), signal, deps);
}
