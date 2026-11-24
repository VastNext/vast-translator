import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(overrides: Record<string, string | undefined> = {}) {
  for (const key of Object.keys(process.env)) {
    if (key in ORIGINAL_ENV) continue;
    delete process.env[key];
  }
  process.env.APP_ENV = undefined as never;
  delete process.env.APP_ENV;
  delete process.env.APP_RELEASE_ID;
  delete process.env.APP_GIT_SHA;
  delete process.env.TRANSLATE_ALLOWED_PROVIDERS;
  delete process.env.AGNES_API_KEY;
  delete process.env.AZURE_TRANSLATOR_KEY;
  delete process.env.AZURE_TRANSLATOR_REGION;
  Object.assign(process.env, overrides);
}

async function getHealth(deep = false) {
  const url = deep ? "http://localhost/api/health?deep=1" : "http://localhost/api/health";
  return GET(new Request(url));
}

describe("GET /api/health", () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("开发模式缺 release/sha 时允许 development 占位并返回 200", async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("vast-translator");
    expect(body.release).toBe("development");
    expect(body.sha).toBe("development");
    expect(body.environment).toBe("development");
  });

  it("迁移验收模式缺 release/sha 返回 503 且仅报告变量名", async () => {
    resetEnv({ APP_ENV: "production" });
    const res = await getHealth();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("RELEASE_IDENTITY_MISSING");
    expect(body.missing).toEqual(["APP_RELEASE_ID", "APP_GIT_SHA"]);
    expect(JSON.stringify(body)).not.toMatch(/AGNES|AZURE/);
  });

  it("迁移验收模式注入 release/sha 后返回 200 且值一致", async () => {
    resetEnv({
      APP_ENV: "staging",
      APP_RELEASE_ID: "abc1234-1",
      APP_GIT_SHA: "747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc",
    });
    const res = await getHealth();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.release).toBe("abc1234-1");
    expect(body.sha).toBe("747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc");
    expect(body.environment).toBe("staging");
  });

  it("deep：ALLOWED_PROVIDERS 未设置时 503", async () => {
    resetEnv({
      APP_ENV: "staging",
      APP_RELEASE_ID: "abc1234-1",
      APP_GIT_SHA: "747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc",
    });
    const res = await getHealth(true);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("CONFIG_MISSING");
  });

  it("deep：启用 agnes 缺 AGNES_API_KEY 时 503 且只报变量名", async () => {
    resetEnv({
      APP_ENV: "staging",
      APP_RELEASE_ID: "abc1234-1",
      APP_GIT_SHA: "747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc",
      TRANSLATE_ALLOWED_PROVIDERS: "google,bing,agnes-2-0,agnes-2-5",
    });
    const res = await getHealth(true);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.missing["agnes-2-0"]).toEqual(["AGNES_API_KEY"]);
    expect(body.missing["google"]).toBeUndefined();
  });

  it("deep：配置齐全时 200，且 upstream_calls 恒为 0", async () => {
    resetEnv({
      APP_ENV: "production",
      APP_RELEASE_ID: "abc1234-1",
      APP_GIT_SHA: "747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc",
      TRANSLATE_ALLOWED_PROVIDERS: "google,bing,agnes-2-0,agnes-2-5",
      AGNES_API_KEY: "VT_FAKE_SECRET_DO_NOT_SHIP",
      TRANSLATE_MAX_BODY_BYTES: "32768",
      TRANSLATE_MAX_ACTIVE: "10",
      TRANSLATE_MAX_STARTS_PER_MINUTE: "60",
      AGNES_TIMEOUT_MS: "120000",
      TRANSLATE_REQUEST_TIMEOUT_MS: "125000",
    });
    const res = await getHealth(true);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deep.upstream_calls).toBe(0);
    expect(body.deep.checked).toEqual(["google", "bing", "agnes-2-0", "agnes-2-5"]);
  });

  it("deep：未知 provider 名导致 503（防拼写漂移）", async () => {
    resetEnv({
      APP_ENV: "staging",
      APP_RELEASE_ID: "abc1234-1",
      APP_GIT_SHA: "747f8f7b2f0cda93ef7f7855dd1f1b7cb74b49cc",
      TRANSLATE_ALLOWED_PROVIDERS: "google,chatgpt",
    });
    const res = await getHealth(true);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.missing.TRANSLATE_ALLOWED_PROVIDERS).toEqual(["chatgpt"]);
  });
});
