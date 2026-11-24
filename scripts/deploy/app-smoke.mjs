#!/usr/bin/env node
// vast-translator 只读应用冒烟。输出单个 JSON；退出码 0=PASS / 10=FAIL / 20=BLOCKED。
// 默认绝不调用 /api/translate（上游可能产生费用）。显式 --translate-once 需
// SMOKE_TRANSLATE_APPROVED=1 且 SMOKE_TRANSLATE_BUDGET_REF 非空，且只发一次单 provider 请求。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT_MS = 30_000;
const cases = [];
const evidence = [];

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function args() {
  const parsed = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      parsed[argv[i].slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

const cli = args();
const baseUrl = (cli["base-url"] || env("SMOKE_BASE_URL", "")).replace(/\/$/, "");
const expectedRelease = env("SMOKE_EXPECTED_RELEASE", "");
const homePath = env("SMOKE_HOME_PATH", "/text");
const homeMarker = env("SMOKE_HOME_MARKER", "Vast Translator");
const expectNoindex = env("SMOKE_EXPECT_NOINDEX", "0") === "1";
const evidenceDir = cli["evidence-dir"] || env("SMOKE_EVIDENCE_DIR", "");

function record(id, status, assertions, extra = {}) {
  cases.push({ case_id: id, status, assertions, ...extra });
}

function assert(condition, name, actual) {
  return { name, ok: Boolean(condition), actual };
}

async function request(path, init = {}) {
  const url = `${baseUrl}${path}`;
  const startedAt = Date.now();
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...init,
  });
  const body = await response.text();
  return {
    url,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    elapsedMs: Date.now() - startedAt,
  };
}

async function assertPage(id, path, expectedStatus, extraAssert) {
  try {
    const res = await request(path);
    const assertions = [{ name: "status", ok: res.status === expectedStatus, actual: res.status }];
    if (expectedStatus === 200) {
      assertions.push({
        name: "content-type-html",
        ok: /text\/html/i.test(res.headers["content-type"] || ""),
        actual: res.headers["content-type"] || "",
      });
      assertions.push({ name: "non-empty-body", ok: res.body.length > 512, actual: res.body.length });
      assertions.push({
        name: "no-runtime-error-leak",
        ok:
          !/Missing environment variable/i.test(res.body) &&
          !/Application error|Internal Server Error/i.test(res.body),
      });
    }
    if (extraAssert) extraAssert(res, assertions);
    record(id, assertions.every((a) => a.ok) ? "PASS" : "FAIL", assertions, { elapsed_ms: res.elapsedMs });
    return res;
  } catch (error) {
    record(id, "FAIL", [{ name: "request", ok: false, actual: String(error?.message || error) }]);
    return null;
  }
}

async function main() {
  if (!baseUrl) {
    record("config", "BLOCKED", [assert(false, "SMOKE_BASE_URL", "missing")]);
    return finish();
  }

  // 1. 浅健康
  const health = await request("/api/health");
  const healthOk =
    health.status === 200 &&
    (!expectedRelease || (() => {
      try {
        return JSON.parse(health.body).release === expectedRelease;
      } catch {
        return false;
      }
    })());
  record("health", healthOk ? "PASS" : "FAIL", [
    assert(health.status === 200, "health-status", health.status),
    assert(!expectedRelease || health.body.includes(expectedRelease), "health-release", expectedRelease || "not-required"),
    assert((health.headers["cache-control"] || "").includes("no-store"), "health-no-store", health.headers["cache-control"] || "missing"),
  ], { elapsed_ms: health.elapsedMs });
  try {
    const parsed = JSON.parse(health.body);
    evidence.push({ type: "health", release: parsed.release, sha: parsed.sha, environment: parsed.environment });
  } catch {
    // 断言已失败，保留原始体用于排障。
  }

  // 2. 深健康（只查配置，不触上游）
  const deep = await request("/api/health?deep=1");
  record("health-deep", deep.status === 200 ? "PASS" : "FAIL", [
    assert(deep.status === 200, "deep-status", deep.status),
  ], { elapsed_ms: deep.elapsedMs, body: deep.status === 200 ? null : deep.body.slice(0, 300) });

  // 3. /text 工作台页面（home_path/marker 来自站点配置）
  const text = await assertPage("text-page", homePath, 200, (res, assertions) => {
    assertions.push({ name: "home-marker", ok: res.body.includes(homeMarker), actual: homeMarker });
  });

  // 4. 首页同样渲染工作台
  await assertPage("home-page", "/", 200, (res, assertions) => {
    assertions.push({ name: "home-marker", ok: res.body.includes(homeMarker), actual: homeMarker });
  });

  // 5. 一个真实 JS 静态资源
  const source = text ?? (await request(homePath));
  const assets = [
    ...new Set(
      [...source.body.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]),
    ),
  ];
  if (assets.length === 0) {
    record("static-assets", "FAIL", [assert(false, "static-asset-found", 0)]);
  } else {
    const res = await request(assets[0]);
    record("static-assets", res.status === 200 && res.body.length > 0 ? "PASS" : "FAIL", [
      assert(res.status === 200, assets[0], res.status),
      assert(res.body.length > 0, "asset-non-empty", res.body.length),
    ]);
  }

  // 6. 随机不存在路径必须 404
  const missing = `/__smoke_missing_${Math.random().toString(36).slice(2)}__`;
  await assertPage("not-found", missing, 404);

  // 7. 候选 noindex 头
  if (expectNoindex) {
    const robotsHeader = source.headers["x-robots-tag"] || "";
    const robotsMeta = /<meta[^>]+name="robots"[^>]*noindex/i.test(source.body);
    record("noindex", /noindex/i.test(robotsHeader) || robotsMeta ? "PASS" : "FAIL", [
      assert(/noindex/i.test(robotsHeader) || robotsMeta, "candidate-noindex", robotsHeader || "missing"),
    ]);
  }

  // 8. 可选单次翻译验证（默认关闭；需显式批准标记）
  if (cli["translate-once"] !== undefined) {
    const approved = env("SMOKE_TRANSLATE_APPROVED", "0") === "1";
    const budgetRef = env("SMOKE_TRANSLATE_BUDGET_REF", "");
    if (!approved || !budgetRef) {
      record("translate-once", "BLOCKED", [
        assert(false, "translate-approval", { approved, budgetRef: budgetRef || "missing" }),
      ]);
    } else {
      const provider = env("SMOKE_TRANSLATE_PROVIDER", "google");
      const startedAt = Date.now();
      try {
        const res = await request("/api/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: "Hello world.",
            sourceLanguage: "auto",
            targetLanguage: "zh-CN",
            providers: [provider],
          }),
        });
        const body = JSON.parse(res.body);
        const result = Array.isArray(body.results) ? body.results.find((r) => r.provider === provider) : null;
        const ok = res.status === 200 && result?.status === "success" && typeof result.translatedText === "string" && result.translatedText.length > 0;
        record("translate-once", ok ? "PASS" : "FAIL", [
          assert(res.status === 200, "translate-status", res.status),
          assert(result?.status === "success", `provider:${provider}`, result?.status ?? "missing"),
          assert(ok, "non-empty-translation", result?.translatedText?.length ?? 0),
        ], { elapsed_ms: Date.now() - startedAt, budget_ref: budgetRef });
        evidence.push({ type: "translate", provider, status: result?.status ?? "missing" });
      } catch (error) {
        record("translate-once", "FAIL", [
          assert(false, "translate-request", String(error?.message || error)),
        ]);
      }
    }
  }

  return finish();
}

function finish() {
  const statuses = cases.map((c) => c.status);
  let status = "PASS";
  if (statuses.includes("FAIL")) status = "FAIL";
  else if (statuses.includes("BLOCKED")) status = "BLOCKED";
  const result = {
    schema_version: 1,
    suite: "VT02-app-smoke",
    status,
    base_url: baseUrl || null,
    generated_at: new Date().toISOString(),
    cases,
    evidence,
  };
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true });
    const file = join(evidenceDir, `app-smoke-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(result, null, 2));
    result.evidence_path = file;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = status === "PASS" ? 0 : status === "FAIL" ? 10 : 20;
}

main().catch((error) => {
  record("unexpected", "FAIL", [assert(false, "unexpected-error", String(error?.message || error))]);
  finish();
});
