import { afterEach, describe, expect, it, vi } from "vitest";

import { createProviderRegistry } from "./registry";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createProviderRegistry", () => {
  it("注册全部五个 Provider，并为两个 Agnes 关闭应用层超时", () => {
    vi.stubEnv("AGNES_API_KEY", "shared-secret");

    const registry = createProviderRegistry();

    expect([...registry.keys()]).toEqual([
      "google",
      "bing",
      "azure",
      "agnes-2-0",
      "agnes-2-5",
    ]);
    expect(registry.get("agnes-2-0")).toMatchObject({
      label: "Agnes 2.0",
      available: true,
      timeoutMs: null,
    });
    expect(registry.get("agnes-2-5")).toMatchObject({
      label: "Agnes 2.5",
      available: true,
      timeoutMs: null,
    });
  });

  it("两个 Agnes 共用服务端凭据但发送不同模型", async () => {
    vi.stubEnv("AGNES_API_KEY", "shared-secret");
    const fetcher = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "译文" }, finish_reason: "stop" }],
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const registry = createProviderRegistry();
    const input = {
      text: "Hello",
      sourceLanguage: "auto",
      targetLanguage: "zh-CN",
    };

    await Promise.all([
      registry.get("agnes-2-0")!.translate(input),
      registry.get("agnes-2-5")!.translate(input),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([, options]) => options.headers.Authorization)).toEqual([
      "Bearer shared-secret",
      "Bearer shared-secret",
    ]);
    expect(
      fetcher.mock.calls.map(([, options]) => JSON.parse(options.body).model),
    ).toEqual(["agnes-2.0-flash", "agnes-2.5-flash"]);
  });

  it("无 Agnes 密钥时两个模型均不可用", () => {
    vi.stubEnv("AGNES_API_KEY", "");

    const registry = createProviderRegistry();

    expect(registry.get("agnes-2-0")?.available).toBe(false);
    expect(registry.get("agnes-2-5")?.available).toBe(false);
  });
});
