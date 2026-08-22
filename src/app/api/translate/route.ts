import { NextResponse } from "next/server";

import {
  translateRequest,
  TranslationRequestAbortedError,
} from "@/lib/translation/translate";
import {
  RequestValidationError,
  validateTranslateRequest,
} from "@/lib/translation/validation";

export const runtime = "nodejs";
export const maxDuration = 40;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = validateTranslateRequest(body);
    return NextResponse.json({
      results: await translateRequest(input, request.signal),
    });
  } catch (error) {
    if (request.signal.aborted || error instanceof TranslationRequestAbortedError) {
      return NextResponse.json(
        { error: { code: "REQUEST_ABORTED", message: "客户端已取消请求" } },
        { status: 499 },
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
