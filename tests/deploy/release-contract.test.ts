import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(__dirname, "..", "..", "scripts", "deploy", "make-release.mjs");

function runMake(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, APPROVAL_HMAC: "vt-test-hmac-key", ...env },
  });
}

function tempOut() {
  return mkdtempSync(join(tmpdir(), "vt-release-contract-"));
}

const BASE = [
  "--site", "vast-translator",
  "--environment", "production",
  "--release-id", "abc1234-42",
  "--git-sha", "0123456789abcdef0123456789abcdef01234567",
  "--image-digest", `sha256:${"a".repeat(64)}`,
  "--config-hash", "c".repeat(64),
  "--generation", "7",
  "--host-id", "vps-192-238-239-41",
  "--approver", "tester",
  "--evidence-run-id", "run-42",
];

describe("VT10 make-release 契约", () => {
  it("prepare 生成结构完整的 request + 签名 approval", () => {
    const out = tempOut();
    const result = runMake([...BASE, "--operation", "prepare", "--out-dir", out]);
    expect(result.status).toBe(0);
    const request = JSON.parse(readFileSync(join(out, "request-prepare.json"), "utf8"));
    const approval = JSON.parse(readFileSync(join(out, "approval-prepare.json"), "utf8"));

    // 请求字段对齐 C5（git_sha，不是 source_commit）
    for (const field of ["operation_id", "site", "environment", "release_id", "git_sha", "image_digest", "image_repo", "config_hash", "expected_generation", "evidence_run_id"]) {
      expect(request).toHaveProperty(field);
    }
    expect(request.image_repo).toBe("ghcr.io/vastnext/vast-translator");
    expect(request.site).toBe("vast-translator");
    expect(request.expected_generation).toBe(7);

    // 审批绑定 digest/config/generation/site/host
    expect(approval.allowed_digests).toEqual([request.image_digest]);
    expect(approval.allowed_config_hashes).toEqual([request.config_hash]);
    expect(approval.expected_generation).toBe(7);
    expect(approval.site).toBe("vast-translator");
    expect(approval.host_id).toBe("vps-192-238-239-41");
    expect(approval.operations).toEqual(["prepare"]);
    expect(approval.signature).toMatch(/^[0-9a-f]{64}$/);
    // M4 明确禁止：不得写死 safety_reviewed=true
    expect(approval.safety_reviewed).toBe(false);
  });

  it("rollback 携带 target_release_id 且审批限定回滚目标", () => {
    const out = tempOut();
    const result = runMake([
      ...BASE,
      "--operation", "rollback",
      "--target-release-id", "abc1234-41",
      "--out-dir", out,
    ]);
    expect(result.status).toBe(0);
    const request = JSON.parse(readFileSync(join(out, "request-rollback.json"), "utf8"));
    const approval = JSON.parse(readFileSync(join(out, "approval-rollback.json"), "utf8"));
    expect(request.target_release_id).toBe("abc1234-41");
    expect(approval.allowed_target_release_ids).toEqual(["abc1234-41"]);
    expect(approval.operations).toEqual(["rollback"]);
    expect(approval.recovery_actions.length).toBeGreaterThan(0);
  });

  it("非法 digest / 缺 HMAC / 未知操作以非零退出", () => {
    const out = tempOut();
    const badDigest = runMake([...BASE, "--operation", "prepare", "--image-digest", "sha256:short", "--out-dir", out]);
    expect(badDigest.status).toBe(20);

    const noHmac = spawnSync(process.execPath, [script, ...BASE, "--operation", "prepare", "--out-dir", out], {
      encoding: "utf8",
      env: { ...process.env, APPROVAL_HMAC: "" },
    });
    expect(noHmac.status).toBe(20);

    const badOp = runMake([...BASE, "--operation", "redeploy", "--out-dir", out]);
    expect(badOp.status).toBe(20);
  });
});
