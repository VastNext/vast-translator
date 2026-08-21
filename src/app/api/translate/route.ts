import { NextResponse } from "next/server";

import { translateRequest } from "@/lib/translation/translate";
import {
  RequestValidationError,
  validateTranslateRequest,
} from "@/lib/translation/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = validateTranslateRequest(body);
    return NextResponse.json({ results: await translateRequest(input) });
  } catch (error) {
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
