// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  planLegacyMigration,
  type Diagnostic,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { MigrationWizard } from "../src/features/project/MigrationWizard.js";
import { ProjectPage } from "../src/features/project/ProjectPage.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const v1Yaml = "publishBaseUrl: http://127.0.0.1:8787\n";

function v1Fixture(): RouteKitProjectConfig {
  return {
    publishBaseUrl: "http://127.0.0.1:8787",
    template: { output: "Custom_Clash.ini" },
    vendorRepos: [],
    customProxyGroups: [
      { name: "Proxy", type: "select", options: ["HK", "DIRECT"] },
      { name: "HK", type: "url-test", options: [], nodeFilters: ["(港|HK)"] },
    ],
    ruleSets: [
      { id: "gfw", policy: "Proxy", source: { type: "geosite", value: "gfw" } },
      { id: "final", policy: "DIRECT", source: { type: "final" } },
    ],
    ruleProviders: [],
  };
}

function buildAnalysis() {
  return { currentSchemaVersion: 1 as const, plan: planLegacyMigration(v1Fixture()) };
}

function analysisWithIssues() {
  const base = buildAnalysis();
  const issues: Diagnostic[] = [
    {
      code: "migrate.route.disabled",
      severity: "warning",
      path: "ruleSets[0]",
      message: "已停用的路由不会带入 v2，需要手动确认",
    },
    {
      code: "migrate.target.unknown",
      severity: "error",
      path: "customProxyGroups[0].options[1]",
      message: "无法表达的目标策略",
    },
    {
      code: "migrate.local-settings",
      severity: "info",
      message: "本地 URL 已移入本地设置候选变更",
    },
  ];
  return {
    currentSchemaVersion: 1 as const,
    plan: { ...base.plan, issues, summary: { ...base.plan.summary, issues: issues.length } },
  };
}

const successApply = {
  ok: true,
  backupPath: "config/routes.yaml.bak-2026-09-13T00-00-00-000Z",
  yaml: "schemaVersion: 2\n",
  diagnostics: [],
};

interface FetchRoute {
  analyze?: unknown;
  apply?: { status: number; body: unknown };
  applyFailure?: Error;
}

function stubFetch(route: FetchRoute) {
  const appliedPlans: unknown[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/project/migrate/apply")) {
      appliedPlans.push((JSON.parse(String(init?.body)) as { plan: unknown }).plan);
      if (route.applyFailure) throw route.applyFailure;
      const apply = route.apply ?? { status: 200, body: successApply };
      return {
        ok: apply.status === 200,
        status: apply.status,
        json: async () => apply.body,
      } as unknown as Response;
    }
    if (url.includes("/api/project/migrate")) {
      return { ok: true, status: 200, json: async () => route.analyze } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, appliedPlans };
}

function renderWizard(overrides: Partial<Parameters<typeof MigrationWizard>[0]> = {}) {
  const props: Parameters<typeof MigrationWizard>[0] = {
    open: true,
    originalConfig: v1Fixture(),
    onClose: vi.fn(),
    onMigrated: vi.fn(),
    ...overrides,
  };
  render(<MigrationWizard {...props} />);
  return props;
}

async function walkToApplyStep(route: FetchRoute) {
  stubFetch(route);
  const props = renderWizard();
  await screen.findByTestId("migrate-summary");
  fireEvent.click(screen.getByTestId("migrate-next"));
  await screen.findByTestId("migrate-identical");
  fireEvent.click(screen.getByTestId("migrate-next"));
  await screen.findByText(/routes\.yaml\.bak-/);
  return props;
}

describe("MigrationWizard", () => {
  it("walks analyze, identical semantic diff, apply success and reports the backup path", async () => {
    const props = await walkToApplyStep({ analyze: buildAnalysis() });
    expect(props.onMigrated).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("migrate-apply"));
    await screen.findByTestId("migrate-apply-success");
    expect(screen.getByText(new RegExp(successApply.backupPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeTruthy();
    expect(props.onMigrated).toHaveBeenCalledTimes(1);
  });

  it("shows the analysis summary counts and groups issues by severity", async () => {
    stubFetch({ analyze: analysisWithIssues() });
    renderWizard();

    const summary = await screen.findByTestId("migrate-summary");
    expect(summary.textContent).toContain("策略组");
    expect(summary.textContent).toContain("路由");
    expect(summary.textContent).toContain("规则源");
    expect(summary.textContent).toContain("成员集合");

    // ValidationBar 汇总行：错误/警告/提示计数（沿用现有诊断展示风格）。
    expect(await screen.findByText(/校验结果：1 错误 · 1 警告 · 1 提示/)).toBeTruthy();
  });

  it("reports an identical INI comparison as a green conclusion", async () => {
    stubFetch({ analyze: buildAnalysis() });
    renderWizard();
    await screen.findByTestId("migrate-summary");

    fireEvent.click(screen.getByTestId("migrate-next"));
    const identical = await screen.findByTestId("migrate-identical");
    expect(identical.textContent).toContain("语义完全一致");
    expect(screen.queryByTestId("migrate-ini-diff")).toBeNull();
  });

  it("keeps the wizard open with diagnostics when apply is rejected with 422", async () => {
    const props = await walkToApplyStep({
      analyze: buildAnalysis(),
      apply: {
        status: 422,
        body: {
          ok: false,
          diagnostics: [
            {
              code: "migrate.apply.empty-group",
              severity: "error",
              path: "proxyGroups[0]",
              message: "策略组没有任何可用成员",
            },
          ],
        },
      },
    });

    fireEvent.click(screen.getByTestId("migrate-apply"));
    const rejected = await screen.findByTestId("migrate-apply-rejected");
    expect(rejected.textContent).toContain("未写入任何文件");
    expect(screen.getByText(/策略组没有任何可用成员/)).toBeTruthy();
    expect(props.onMigrated).not.toHaveBeenCalled();
  });

  it("stays open without partial writes when the apply request fails", async () => {
    const props = await walkToApplyStep({
      analyze: buildAnalysis(),
      applyFailure: new Error("网络中断"),
    });

    fireEvent.click(screen.getByTestId("migrate-apply"));
    const failed = await screen.findByTestId("migrate-apply-failed");
    expect(failed.textContent).toContain("未写入任何文件");
    expect(failed.textContent).toContain("网络中断");
    expect(props.onMigrated).not.toHaveBeenCalled();
  });

  it("skips migration for an already v2 project", async () => {
    stubFetch({ analyze: { currentSchemaVersion: 2, plan: null } });
    renderWizard();

    expect(await screen.findByTestId("migrate-already-v2")).toBeTruthy();
    expect((screen.getByTestId("migrate-next") as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes via cancel without any apply request", async () => {
    const { fetchMock } = stubFetch({ analyze: buildAnalysis() });
    const props = renderWizard();

    await screen.findByTestId("migrate-summary");
    fireEvent.click(screen.getByTestId("migrate-cancel"));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    const analyzeCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/api/project/migrate/apply"),
    );
    expect(analyzeCalls).toEqual([]);
  });

  it("passes the analyzed plan back to the apply endpoint unchanged", async () => {
    const analysis = buildAnalysis();
    const { appliedPlans } = stubFetch({ analyze: analysis });
    renderWizard();
    await screen.findByTestId("migrate-summary");
    fireEvent.click(screen.getByTestId("migrate-next"));
    await screen.findByTestId("migrate-identical");
    fireEvent.click(screen.getByTestId("migrate-next"));
    fireEvent.click(screen.getByTestId("migrate-apply"));
    await screen.findByTestId("migrate-apply-success");

    expect(appliedPlans).toEqual([analysis.plan]);
  });
});

describe("ProjectPage migration entry", () => {
  it("opens the review wizard from the learn-more action on a v1 project", async () => {
    stubFetch({ analyze: buildAnalysis() });
    render(
      <AppProviders>
        <ProjectPage
          config={v1Fixture()}
          originalYaml={v1Yaml}
          status="ready"
          message=""
          dirty={false}
          validation={{ status: "idle", output: "" }}
          lastWorkView="routing"
          onNavigate={() => {}}
          onOpenImport={() => {}}
          onRunCheck={() => {}}
          onCreateBlankProject={() => {}}
          onMigrated={() => {}}
        />
      </AppProviders>,
    );

    const learnMore = screen.getByRole("button", { name: "了解迁移" });
    expect(learnMore.hasAttribute("disabled")).toBe(false);
    fireEvent.click(learnMore);
    expect(screen.getByText("迁移到 Schema v2")).toBeTruthy();
    await screen.findByTestId("migrate-summary");
  });
});
