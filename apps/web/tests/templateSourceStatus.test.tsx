// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { OutputPage } from "../src/features/output/OutputPage.js";
import {
  probeTemplateUrl,
  resolveTemplateSources,
  TEMPLATE_PROBE_TIMEOUT_MS,
} from "../src/features/output/templateSourceStatus.js";

afterEach(cleanup);

const jsonOk = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

const config: RouteKitProjectConfig = {
  publishBaseUrl: "http://127.0.0.1:8787",
  template: { output: "Custom_Clash.ini" },
  vendorRepos: [],
  customProxyGroups: [],
  ruleSets: [{ id: "final", policy: "DIRECT", source: { type: "final" } }],
  ruleProviders: [],
};

function renderOutput(fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  render(
    <AppProviders>
      <OutputPage
        config={config}
        originalYaml="publishBaseUrl: http://127.0.0.1:8787\n"
        validation={{ status: "idle", output: "尚未运行检查" }}
        onRunCheck={vi.fn()}
        fetcher={fetcher}
      />
    </AppProviders>,
  );
}

describe("resolveTemplateSources", () => {
  it("builds the local url and keeps remote availability with the checked time", () => {
    const sources = resolveTemplateSources({
      publishBaseUrl: "http://192.168.1.9:8787/",
      templateOutput: "Custom_Clash.ini",
      remoteTemplateUrl: "https://raw.githubusercontent.com/acme/routes/publish/templates/Custom_Clash.ini",
      remoteAvailable: true,
      remoteCheckedAt: "2026-09-13T01:00:00Z",
    });
    expect(sources.local.url).toBe("http://192.168.1.9:8787/templates/Custom_Clash.ini");
    expect(sources.local.label).toBe("本地实时模板");
    expect(sources.remote.url).toBe("https://raw.githubusercontent.com/acme/routes/publish/templates/Custom_Clash.ini");
    expect(sources.remote.label).toBe("GitHub 远程模板");
    expect(sources.remote.available).toBe(true);
    expect(sources.remote.checkedAt).toBe("2026-09-13T01:00:00Z");
  });

  it("marks the remote source unavailable without a published url or without success", () => {
    const unpublished = resolveTemplateSources({
      publishBaseUrl: "http://127.0.0.1:8787",
      templateOutput: "a.ini",
      remoteTemplateUrl: null,
      remoteAvailable: true,
    });
    expect(unpublished.remote.url).toBe("");
    expect(unpublished.remote.available).toBe(false);
    const notSucceeded = resolveTemplateSources({
      publishBaseUrl: "http://127.0.0.1:8787",
      templateOutput: "a.ini",
      remoteTemplateUrl: "https://raw.githubusercontent.com/acme/routes/publish/templates/a.ini",
      remoteAvailable: false,
    });
    expect(notSucceeded.remote.available).toBe(false);
  });
});

describe("probeTemplateUrl", () => {
  it("returns ok when the fetch resolves and unreachable when it rejects", async () => {
    const ok = await probeTemplateUrl(
      "http://127.0.0.1:8787/templates/a.ini",
      vi.fn(async () => ({}) as unknown as Response),
    );
    expect(ok).toBe("ok");
    const unreachable = await probeTemplateUrl(
      "http://127.0.0.1:8787/templates/a.ini",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    expect(unreachable).toBe("unreachable");
  });

  it("aborts after the probe timeout and reports unreachable", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      let result: "ok" | "unreachable" | undefined;
      void probeTemplateUrl("http://127.0.0.1:8787/templates/a.ini", fetcher).then((value) => {
        result = value;
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(TEMPLATE_PROBE_TIMEOUT_MS - 1);
      });
      expect(result).toBeUndefined();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(result).toBe("unreachable");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("OutputPage template source", () => {
  it("keeps the remote template option disabled with a hint until publish succeeds", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/git/publish-status")) {
        return jsonOk({ branch: "main", workflow: { state: "unsupported" } });
      }
      if (url.includes("/api/git/remote")) return jsonOk({ url: "https://github.com/acme/routes.git" });
      return jsonOk({});
    });
    renderOutput(fetcher);
    const remoteRadio = (await screen.findByRole("radio", { name: "GitHub 远程模板" })) as HTMLInputElement;
    expect(remoteRadio.disabled).toBe(true);
    expect(screen.getByTestId("template-source-remote-hint").textContent).toContain(
      "远程模板尚不可用，先在 GitHub 发布标签完成发布",
    );
    expect((screen.getByRole("radio", { name: "本地实时模板" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByTestId("remote-template-status").textContent).toContain("未发布");
  });

  it("allows switching to the remote template once the publish workflow succeeded", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/git/publish-status")) {
        return jsonOk({ branch: "main", workflow: { state: "success", createdAt: "2026-09-13T01:00:00Z" } });
      }
      if (url.includes("/api/git/remote")) return jsonOk({ url: "https://github.com/acme/routes.git" });
      return jsonOk({});
    });
    renderOutput(fetcher);
    const remoteRadio = (await screen.findByRole("radio", { name: "GitHub 远程模板" })) as HTMLInputElement;
    expect(remoteRadio.disabled).toBe(false);
    expect(screen.getByTestId("remote-template-status").textContent).toContain("可用");
    fireEvent.click(screen.getByText("GitHub 远程模板"));
    expect((screen.getByRole("radio", { name: "GitHub 远程模板" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByText("添加订阅"));
    fireEvent.change(screen.getByPlaceholderText("订阅 URL"), { target: { value: "https://air/sub" } });
    fireEvent.click(screen.getByText("生成 config.yaml"));
    await waitFor(() => {
      const href = screen.getByText("下载").closest("a")?.getAttribute("href") ?? "";
      expect(decodeURIComponent(href)).toContain(
        "https://raw.githubusercontent.com/acme/routes/publish/templates/Custom_Clash.ini",
      );
    });
  });

  it("probes the local template once and shares one status across both tabs", async () => {
    let probeCalls = 0;
    let statusCalls = 0;
    let remoteCalls = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/templates/")) probeCalls += 1;
      if (url.includes("/api/git/publish-status")) {
        statusCalls += 1;
        return jsonOk({ branch: "main", workflow: { state: "unsupported" } });
      }
      if (url.includes("/api/git/remote")) {
        remoteCalls += 1;
        return jsonOk({ url: "https://github.com/acme/routes.git" });
      }
      return jsonOk({});
    });
    renderOutput(fetcher);
    await waitFor(() => expect(probeCalls).toBe(1));
    fireEvent.click(screen.getByText("GitHub 发布"));
    await waitFor(() => expect(screen.getByTestId("publish-main-button")).toBeTruthy());
    // GitHub 发布标签消费同一 TemplateSourceStatus，不产生第二次探测或状态查询
    expect(probeCalls).toBe(1);
    expect(statusCalls).toBe(1);
    expect(remoteCalls).toBe(1);
  });
});
