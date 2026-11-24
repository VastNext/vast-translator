import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 各 provider 的必需运行时变量；deep 探针只检查存在性/格式，绝不调用上游。
const REQUIRED_PROVIDER_ENV: Record<string, string[]> = {
  google: [],
  bing: [],
  azure: ["AZURE_TRANSLATOR_KEY", "AZURE_TRANSLATOR_REGION"],
  "agnes-2-0": ["AGNES_API_KEY"],
  "agnes-2-5": ["AGNES_API_KEY"],
};

const KNOWN_PROVIDERS = new Set(Object.keys(REQUIRED_PROVIDER_ENV));

function deploymentMode(): boolean {
  const appEnv = process.env.APP_ENV;
  return appEnv === "staging" || appEnv === "production";
}

function allowedProviders(): string[] {
  const raw = process.env.TRANSLATE_ALLOWED_PROVIDERS ?? "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function missingForProvider(provider: string): string[] {
  return (REQUIRED_PROVIDER_ENV[provider] ?? []).filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim() === "";
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";
  const isDeploy = deploymentMode();

  // 迁移验收模式（APP_ENV=staging/production）下 release/sha 必须由运行时注入，
  // 缺失即 503；开发模式允许明确的 development 占位，不得用于发布。
  const release = process.env.APP_RELEASE_ID;
  const sha = process.env.APP_GIT_SHA;
  const environment = process.env.APP_ENV ?? "development";
  const missingIdentity: string[] = [];
  if (isDeploy) {
    if (!release) missingIdentity.push("APP_RELEASE_ID");
    if (!sha) missingIdentity.push("APP_GIT_SHA");
  }

  if (missingIdentity.length > 0) {
    return NextResponse.json(
      {
        status: "error",
        service: "vast-translator",
        code: "RELEASE_IDENTITY_MISSING",
        missing: missingIdentity,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body: Record<string, unknown> = {
    status: "ok",
    service: "vast-translator",
    release: release ?? "development",
    sha: sha ?? "development",
    environment,
  };

  if (deep) {
    const providers = allowedProviders();
    const deepProblems: Record<string, string[]> = {};

    if (providers.length === 0) {
      deepProblems.TRANSLATE_ALLOWED_PROVIDERS = ["unset"];
    } else {
      const unknown = providers.filter((provider) => !KNOWN_PROVIDERS.has(provider));
      if (unknown.length > 0) {
        deepProblems.TRANSLATE_ALLOWED_PROVIDERS = unknown;
      }
      for (const provider of providers) {
        if (!KNOWN_PROVIDERS.has(provider)) continue;
        const missing = missingForProvider(provider);
        if (missing.length > 0) deepProblems[provider] = missing;
      }
    }

    // C3 生产政策变量：迁移验收模式下任一缺失即 503（仅报告变量名）。
    if (isDeploy) {
      for (const name of [
        "TRANSLATE_MAX_BODY_BYTES",
        "TRANSLATE_MAX_ACTIVE",
        "TRANSLATE_MAX_STARTS_PER_MINUTE",
        "AGNES_TIMEOUT_MS",
        "TRANSLATE_REQUEST_TIMEOUT_MS",
      ]) {
        const value = Number(process.env[name]);
        if (!Number.isFinite(value) || value <= 0) {
          deepProblems[name] = ["unset-or-invalid"];
        }
      }
    }

    if (Object.keys(deepProblems).length > 0) {
      return NextResponse.json(
        {
          status: "error",
          service: "vast-translator",
          code: "CONFIG_MISSING",
          missing: deepProblems,
          release: body.release,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    body.deep = { checked: providers, upstream_calls: 0 };
  }

  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
