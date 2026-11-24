#!/usr/bin/env node
// VT01 镜像与秘密边界检查。需要已构建的本地镜像与 Docker CLI。
// 输出单个 JSON；退出码 0=PASS / 10=FAIL / 20=BLOCKED。
import { execFileSync } from "node:child_process";

const image = process.env.IMAGE_REF || process.argv[2];
const marker = process.env.SECRET_MARKER || process.argv[3];
const expectedUid = process.env.EXPECTED_UID || "1001";
const expectedArch = process.env.EXPECTED_ARCH || "amd64";

function run(args, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(args[0], args.slice(1), {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
        ...options,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || ""),
      stderr: String(error.stderr || ""),
      code: error.status ?? 1,
    };
  }
}

const assertions = [];
function check(name, ok, actual) {
  assertions.push({ name, ok: Boolean(ok), actual });
}

if (!image) {
  process.stdout.write(
    `${JSON.stringify(
      {
        schema_version: 1,
        suite: "VT01-image",
        status: "BLOCKED",
        assertions: [{ name: "image", ok: false, actual: "IMAGE_REF missing" }],
      },
      null,
      2,
    )}\n`,
  );
  process.exit(20);
}

const inspect = run(["docker", "image", "inspect", image]);
if (!inspect.ok) {
  assertions.push({
    name: "image-exists",
    ok: false,
    actual: inspect.stderr.trim(),
  });
} else {
  const info = JSON.parse(inspect.stdout)[0];
  check("image-exists", true, image);
  check("architecture", info.Architecture === expectedArch, info.Architecture);
  const user = info.Config?.User || "";
  check(
    "non-root-user",
    user !== "" && user !== "root" && user !== "0",
    user || "root",
  );
  const envNames = (info.Config?.Env || []).map((line) => line.split("=")[0]);
  check(
    "no-secret-env-baked",
    !envNames.some((name) => /TOKEN|SECRET|KEY|PASSWORD/i.test(name)),
    envNames.filter((name) => /TOKEN|SECRET|KEY|PASSWORD/i.test(name)),
  );
  check(
    "entrypoint-tini",
    JSON.stringify(info.Config?.Entrypoint || []).includes("tini"),
    info.Config?.Entrypoint,
  );

  const uid = run(["docker", "run", "--rm", "--entrypoint", "id", image, "-u"]);
  check(
    "runtime-uid",
    uid.ok && uid.stdout.trim() === expectedUid,
    uid.stdout.trim(),
  );

  const envFile = run([
    "docker",
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    image,
    "-c",
    "ls -a /app | grep -E '^\\.env($|\\.)' || true",
  ]);
  check("no-env-file", envFile.stdout.trim() === "", envFile.stdout.trim());

  const writable = run([
    "docker",
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    image,
    "-c",
    "touch /app/.next/cache/.write-test && rm -f /app/.next/cache/.write-test && echo ok",
  ]);
  check(
    "cache-writable",
    writable.ok && writable.stdout.trim() === "ok",
    writable.stdout.trim(),
  );

  const dockerSock = run([
    "docker",
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    image,
    "-c",
    "test -S /var/run/docker.sock && echo present || echo absent",
  ]);
  check(
    "no-docker-socket",
    dockerSock.stdout.trim() === "absent",
    dockerSock.stdout.trim(),
  );

  if (marker) {
    const scan = run([
      "docker",
      "run",
      "--rm",
      "--entrypoint",
      "sh",
      image,
      "-c",
      `grep -ral --exclude-dir=node_modules ${JSON.stringify(marker)} /app 2>/dev/null | head -5 || true`,
    ]);
    check("no-secret-marker", scan.stdout.trim() === "", scan.stdout.trim());
    const history = run([
      "docker",
      "history",
      "--no-trunc",
      "--format",
      "{{.CreatedBy}}",
      image,
    ]);
    check(
      "no-marker-in-history",
      !history.stdout.includes(marker),
      history.stdout.includes(marker) ? "found" : "absent",
    );
  } else {
    assertions.push({
      name: "no-secret-marker",
      ok: false,
      actual: "marker not provided",
    });
  }
}

const failed = assertions.find((item) => !item.ok);
const status = failed ? "FAIL" : "PASS";
process.stdout.write(
  `${JSON.stringify(
    {
      schema_version: 1,
      suite: "VT01-image",
      status,
      image,
      generated_at: new Date().toISOString(),
      assertions,
    },
    null,
    2,
  )}\n`,
);
process.exitCode = status === "PASS" ? 0 : 10;
