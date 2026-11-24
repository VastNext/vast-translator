#!/usr/bin/env node
// 生成受签名的发布 request + approval。运行于 GitHub Actions 的受保护 Environment 之后。
// 私钥仅存在于 GitHub Secret 与服务器 root 文件中；本脚本只使用 HMAC。
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function args() {
  const parsed = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      parsed[argv[i].slice(2)] = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return parsed;
}

const cli = args();
function required(name, fallback) {
  const value =
    cli[name] ??
    process.env[`RELEASE_${name.toUpperCase().replace(/-/g, "_")}`] ??
    fallback;
  if (value === undefined || value === "") {
    console.error(`missing required --${name}`);
    process.exit(20);
  }
  return value;
}

const hmcKey = process.env.APPROVAL_HMAC;
if (!hmcKey) {
  console.error("APPROVAL_HMAC is required");
  process.exit(20);
}

const outDir = required("out-dir", ".release");
const site = required("site", "vast-translator");
const environment = required("environment", "production");
const operation = required("operation", "promote");
const releaseId = required("release-id");
const gitSha = required("git-sha");
const digest = required("image-digest");
const configHash = required("config-hash");
const generation = Number(required("generation"));
const evidenceRunId = required(
  "evidence-run-id",
  process.env.GITHUB_RUN_ID ?? "manual",
);
const approver = required("approver", process.env.GITHUB_ACTOR ?? "unknown");
const hostId = required("host-id", "vps-192-238-239-41");
const targetReleaseId = cli["target-release-id"] ?? "";
const safetyReviewed = (cli["safety-reviewed"] ?? "false") === "true";

if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
  console.error("invalid --image-digest");
  process.exit(20);
}
if (!Number.isInteger(generation) || generation < 0) {
  console.error("invalid --generation");
  process.exit(20);
}
if (!["prepare", "promote", "rollback"].includes(operation)) {
  console.error("invalid --operation");
  process.exit(20);
}

const now = Date.now();
const operationId = `${operation}-${releaseId}-${now}`;
const request = {
  schema_version: 1,
  operation_id: operationId,
  site,
  environment,
  release_id: releaseId,
  git_sha: gitSha,
  image_digest: digest,
  image_repo: `ghcr.io/vastnext/${site}`,
  config_hash: configHash,
  expected_generation: generation,
  evidence_run_id: evidenceRunId,
};
if (operation === "rollback") request.target_release_id = targetReleaseId;

const approval = {
  schema_version: 1,
  approval_id: `gh-${process.env.GITHUB_REPOSITORY ?? "local"}-${process.env.GITHUB_RUN_ID ?? now}`,
  approver,
  not_before: new Date(now - 60_000).toISOString(),
  not_after: new Date(now + 60 * 60_000).toISOString(),
  operations: [operation],
  host_id: hostId,
  site,
  environments: [environment],
  resource_ids: [`site:${site}`, `host:${hostId}`, `release:${releaseId}`],
  allowed_digests: [digest],
  allowed_config_hashes: [configHash],
  expected_generation: generation,
  recovery_actions: [
    `bin/release status --site ${site}`,
    `bin/release reconcile --site ${site} --approval FILE`,
    "bin/release rollback --request FILE --approval FILE",
  ],
  safety_reviewed: safetyReviewed,
};
if (operation === "rollback") {
  approval.allowed_target_release_ids = [targetReleaseId];
}

const signature = createHmac("sha256", hmcKey)
  .update(canonicalJson(approval))
  .digest("hex");
approval.signature = signature;

mkdirSync(outDir, { recursive: true });
const requestFile = join(outDir, `request-${operation}.json`);
const approvalFile = join(outDir, `approval-${operation}.json`);
writeFileSync(requestFile, `${JSON.stringify(request, null, 2)}\n`, {
  mode: 0o600,
});
writeFileSync(approvalFile, `${JSON.stringify(approval, null, 2)}\n`, {
  mode: 0o600,
});
process.stdout.write(
  `${JSON.stringify({
    status: "PASS",
    operation,
    request_file: requestFile,
    approval_file: approvalFile,
    operation_id: operationId,
    release_id: releaseId,
  })}\n`,
);
