import { describe, expect, it, vi } from "vitest";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import {
  loadLocalProjectConfig,
  saveLocalProjectConfig,
} from "../src/localProject.js";

describe("local project client", () => {
  const config: RouteKitProjectConfig = {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    proxyGroups: [{ name: "Proxy", type: "select", options: ["DIRECT"] }],
    modules: [{ id: "ai", policy: "Proxy" }],
    final: { policy: "Proxy" },
    ruleProviders: [],
  };

  it("loads config from the local project endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
          config,
        }),
        { status: 200 },
      ),
    );

    await expect(loadLocalProjectConfig(fetcher)).resolves.toEqual({
      yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
      config,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/project/config");
  });

  it("saves config to the local project endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
          config,
        }),
        { status: 200 },
      ),
    );

    await expect(saveLocalProjectConfig(config, fetcher)).resolves.toEqual({
      yaml: "publishBaseUrl: http://127.0.0.1:8787\n",
      config,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/project/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
    });
  });

  it("throws when the local API returns an invalid payload", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 500 }));

    await expect(loadLocalProjectConfig(fetcher)).rejects.toThrow("Invalid local project response");
  });
});
