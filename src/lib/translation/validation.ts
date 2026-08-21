import { languageCodes } from "./languages";
import { providerIds, type ProviderId, type TranslateRequest } from "./types";

export class RequestValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export function validateTranslateRequest(input: unknown): TranslateRequest {
  if (!input || typeof input !== "object") {
    throw new RequestValidationError("请求格式无效");
  }

  const value = input as Record<string, unknown>;
  const text = typeof value.text === "string" ? value.text : "";
  if (!text.trim()) throw new RequestValidationError("请输入需要翻译的文本");
  if (text.length > 5000) {
    throw new RequestValidationError("文本不能超过 5000 个字符", 413);
  }

  const sourceLanguage = value.sourceLanguage;
  const targetLanguage = value.targetLanguage;
  if (
    typeof sourceLanguage !== "string" ||
    !languageCodes.has(sourceLanguage as never) ||
    typeof targetLanguage !== "string" ||
    targetLanguage === "auto" ||
    !languageCodes.has(targetLanguage as never)
  ) {
    throw new RequestValidationError("包含不支持的语言");
  }

  if (!Array.isArray(value.providers) || value.providers.length === 0) {
    throw new RequestValidationError("请至少选择一个翻译服务");
  }
  const providers = [...new Set(value.providers)];
  if (
    providers.some(
      (provider) =>
        typeof provider !== "string" ||
        !providerIds.includes(provider as ProviderId),
    )
  ) {
    throw new RequestValidationError("包含不支持的翻译服务");
  }

  return {
    text,
    sourceLanguage,
    targetLanguage,
    providers: providers as ProviderId[],
  };
}
