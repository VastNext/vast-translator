import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
const dockerignore = readFileSync(join(root, ".dockerignore"), "utf8");

describe("VT01 镜像定义静态检查", () => {
  it("Dockerfile 以非 root 用户运行", () => {
    expect(dockerfile).toMatch(/^USER nextjs$/m);
    expect(dockerfile).toMatch(/useradd --system --uid 1001/);
  });

  it("Dockerfile 使用 standalone 产物与 server.js 入口", () => {
    expect(dockerfile).toMatch(/NEXT_OUTPUT_MODE=standalone/);
    expect(dockerfile).toMatch(/\.next\/standalone/);
    expect(dockerfile).toMatch(/CMD \["node", "server.js"\]/);
  });

  it("Dockerfile 不复制 .env / .git / 凭据文件", () => {
    const copyLines = dockerfile.split("\n").filter((line) => /^\s*COPY /.test(line));
    for (const line of copyLines) {
      expect(line).not.toMatch(/\.env/);
      expect(line).not.toMatch(/(^|\s)\.git(\s|$)/);
      expect(line).not.toMatch(/secrets?/i);
    }
  });

  it("Dockerfile 不声明任何构建期 ARG 秘密", () => {
    const argLines = dockerfile.split("\n").filter((line) => /^\s*ARG /.test(line));
    for (const line of argLines) {
      expect(line).not.toMatch(/KEY|SECRET|TOKEN|PASSWORD/i);
    }
  });

  it("Dockerfile 固定 Node 22.18.0 并含健康检查", () => {
    expect(dockerfile).toMatch(/NODE_VERSION=22\.18\.0/);
    expect(dockerfile).toMatch(/\/api\/health/);
  });

  it(".dockerignore 排除本地环境与版本控制内容", () => {
    expect(dockerignore).toMatch(/^\.git$/m);
    expect(dockerignore).toMatch(/^\.env$/m);
    expect(dockerignore).toMatch(/^\.env\.\*$/m);
    expect(dockerignore).toMatch(/^node_modules$/m);
  });

  it("无 NEXT_PUBLIC 构建期固化变量（env-manifest 核对）", () => {
    const manifest = JSON.parse(readFileSync(join(root, "config", "env-manifest.json"), "utf8"));
    expect(manifest.next_public_frozen).toEqual([]);
    const names = manifest.variables.map((v: { name: string }) => v.name);
    expect(names).toContain("AGNES_API_KEY");
    expect(names).toContain("TRANSLATE_ALLOWED_PROVIDERS");
    expect(names).toContain("APP_RELEASE_ID");
  });
});
