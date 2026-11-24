import type { ProviderId } from "./types";
import { providerIds } from "./types";

// VT-1 C3：运行时请求保护。所有上限来自环境变量；部署模式（staging/production）
// 任一缺失即拒绝服务，绝不静默使用默认值。开发模式回退 lab_policy 便于本地调试。
export interface RequestPolicy {
  maxBodyBytes: number;
  maxActive: number;
  maxStartsPerMinute: number;
  agnesTimeoutMs: number;
  requestTimeoutMs: number;
  allowedProviders: ProviderId[];
}

export class PolicyNotConfiguredError extends Error {
  readonly code = "POLICY_NOT_CONFIGURED";
  constructor(readonly missing: string[]) {
    super(`翻译请求保护配置缺失: ${missing.join(", ")}`);
    this.name = "PolicyNotConfiguredError";
  }
}

// 单元测试固定 lab_policy（contracts C3）。不是生产默认批准值。
export const LAB_POLICY: RequestPolicy = {
  maxBodyBytes: 32768,
  maxActive: 10,
  maxStartsPerMinute: 60,
  agnesTimeoutMs: 120_000,
  requestTimeoutMs: 125_000,
  allowedProviders: [...providerIds],
};

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) return null;
  return parsed;
}

export function resolveRequestPolicy(env: NodeJS.ProcessEnv = process.env): RequestPolicy {
  const isDeploy = env.APP_ENV === "staging" || env.APP_ENV === "production";
  const missing: string[] = [];

  const maxBodyBytes = positiveInt(env.TRANSLATE_MAX_BODY_BYTES);
  const maxActive = positiveInt(env.TRANSLATE_MAX_ACTIVE);
  const maxStarts = positiveInt(env.TRANSLATE_MAX_STARTS_PER_MINUTE);
  const agnesTimeout = positiveInt(env.AGNES_TIMEOUT_MS);
  const requestTimeout = positiveInt(env.TRANSLATE_REQUEST_TIMEOUT_MS);
  const allowedRaw = env.TRANSLATE_ALLOWED_PROVIDERS;

  if (isDeploy) {
    if (maxBodyBytes === null) missing.push("TRANSLATE_MAX_BODY_BYTES");
    if (maxActive === null) missing.push("TRANSLATE_MAX_ACTIVE");
    if (maxStarts === null) missing.push("TRANSLATE_MAX_STARTS_PER_MINUTE");
    if (agnesTimeout === null) missing.push("AGNES_TIMEOUT_MS");
    if (requestTimeout === null) missing.push("TRANSLATE_REQUEST_TIMEOUT_MS");
    if (!allowedRaw || allowedRaw.trim() === "") missing.push("TRANSLATE_ALLOWED_PROVIDERS");
    if (missing.length > 0) throw new PolicyNotConfiguredError(missing);
  }

  const allowedProviders = (allowedRaw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ProviderId => (providerIds as readonly string[]).includes(item));

  // 开发模式回退 lab_policy；部署模式上方已确保全部有值。
  return {
    maxBodyBytes: maxBodyBytes ?? LAB_POLICY.maxBodyBytes,
    maxActive: maxActive ?? LAB_POLICY.maxActive,
    maxStartsPerMinute: maxStarts ?? LAB_POLICY.maxStartsPerMinute,
    agnesTimeoutMs: agnesTimeout ?? LAB_POLICY.agnesTimeoutMs,
    requestTimeoutMs: requestTimeout ?? LAB_POLICY.requestTimeoutMs,
    allowedProviders: allowedRaw === undefined || allowedRaw.trim() === "" ? [...providerIds] : allowedProviders,
  };
}

// ── 请求体逐块读取：超过字节上限立即中止，绝不无界加载 ──

export class BodyLimitError extends Error {
  readonly code = "BODY_TOO_LARGE";
  constructor(readonly maxBytes: number) {
    super(`请求体超过 ${maxBytes} 字节上限`);
    this.name = "BodyLimitError";
  }
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new BodyLimitError(maxBytes);
    }
  }
  if (!request.body) {
    throw new SyntaxError("请求体为空");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // 立即取消读取，不继续消费字节。
      await reader.cancel().catch(() => undefined);
      throw new BodyLimitError(maxBytes);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(merged));
}

// ── 60 秒滑动窗口：每进程 provider 启动数 ──

export interface SlidingWindow {
  tryStart(now?: number): boolean;
  activeCount(now?: number): number;
  reset(): void;
}

const WINDOW_MS = 60_000;

export function createSlidingWindow(
  maxStarts: number,
  clock: () => number = Date.now,
): SlidingWindow {
  const starts: number[] = [];
  return {
    tryStart(now = clock()) {
      while (starts.length > 0 && now - starts[0] >= WINDOW_MS) starts.shift();
      if (starts.length >= maxStarts) return false;
      starts.push(now);
      return true;
    },
    activeCount(now = clock()) {
      while (starts.length > 0 && now - starts[0] >= WINDOW_MS) starts.shift();
      return starts.length;
    },
    reset() {
      starts.length = 0;
    },
  };
}

// ── 并发槽：每进程最大在途 provider 调用数；原子预占 n 个 ──

export interface ConcurrencySlots {
  tryReserve(n: number): boolean;
  release(n: number): void;
  active(): number;
}

export function createConcurrencySlots(maxActive: number): ConcurrencySlots {
  let active = 0;
  return {
    tryReserve(n: number) {
      if (n <= 0) return true;
      if (active + n > maxActive) return false;
      active += n;
      return true;
    },
    release(n: number) {
      active = Math.max(0, active - n);
    },
    active() {
      return active;
    },
  };
}

export interface ProcessGuards {
  window: SlidingWindow;
  slots: ConcurrencySlots;
}

// 每进程共享的窗口与槽位；按 policy 数值惰性创建，数值变化时重建（仅测试会触发）。
let sharedKey = "";
let shared: ProcessGuards | null = null;

export function getProcessGuards(policy: RequestPolicy): ProcessGuards {
  const key = `${policy.maxActive}:${policy.maxStartsPerMinute}`;
  if (!shared || sharedKey !== key) {
    shared = {
      window: createSlidingWindow(policy.maxStartsPerMinute),
      slots: createConcurrencySlots(policy.maxActive),
    };
    sharedKey = key;
  }
  return shared;
}

/** 仅测试使用：重置进程级共享守卫。 */
export function resetProcessGuardsForTest(): void {
  shared = null;
  sharedKey = "";
}
