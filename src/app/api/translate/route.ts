import { NextResponse } from "next/server";

import {
  BodyLimitError,
  PolicyNotConfiguredError,
  getProcessGuards,
  readBoundedJson,
  resolveRequestPolicy,
} from "@/lib/translation/request-policy";
import {
  TranslationRateLimitError,
  translateRequest,
  TranslationRequestAbortedError,
} from "@/lib/translation/translate";
import {
  RequestValidationError,
  validateTranslateRequest,
} from "@/lib/translation/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let policy;
  try {
    policy = resolveRequestPolicy();
  } catch (error) {
    if (error instanceof PolicyNotConfiguredError) {
      return NextResponse.json(
        { error: { code: "POLICY_NOT_CONFIGURED", message: error.message } },
        { status: 503 },
      );
    }
    throw error;
  }
  const guards = getProcessGuards(policy);

  try {
    // 逐块读取并限制请求体字节；超限立即中止，不做无界加载（VT-1 C3）。
    const body = await readBoundedJson(request, policy.maxBodyBytes);
    const input = validateTranslateRequest(body);
    return NextResponse.json({
      results: await translateRequest(input, request.signal, { policy, guards }),
    });
  } catch (error) {
    if (request.signal.aborted || error instanceof TranslationRequestAbortedError) {
      return NextResponse.json(
        { error: { code: "REQUEST_ABORTED", message: "客户端已取消请求" } },
        { status: 499 },
      );
    }
    if (error instanceof TranslationRateLimitError) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: error.message } },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof BodyLimitError) {
      return NextResponse.json(
        { error: { code: "BODY_TOO_LARGE", message: error.message } },
        { status: 413 },
      );
    }
    if (error instanceof RequestValidationError) {
      return NextResponse.json(
        { error: { code: "INVALID_REQUEST", message: error.message } },
        { status: error.status },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: { code: "INVALID_JSON", message: "请求 JSON 格式无效" } },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求" } },
      { status: 500 },
    );
  }
}
