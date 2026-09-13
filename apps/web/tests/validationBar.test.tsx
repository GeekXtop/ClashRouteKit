// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Diagnostic } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { ValidationBar } from "../src/components/ValidationBar.js";

afterEach(cleanup);

const ruleDiagnostic: Diagnostic = {
  code: "route.policy.missing",
  severity: "error",
  path: "ruleSets[0].policy",
  message: "RuleSet geosite-gfw 引用了不存在的 custom_proxy_group：Missing",
  related: ["Missing"],
};

const globalDiagnostic: Diagnostic = {
  code: "route.final.missing",
  severity: "error",
  path: "ruleSets",
  message: "ruleSets 需要包含一条 FINAL 兜底规则",
};

const providerDiagnostic: Diagnostic = {
  code: "provider.sources.disabled-empty",
  severity: "warning",
  path: "ruleProviders[0].sources",
  message: "禁用的规则源 google 尚未指定数据源",
};

const infoDiagnostic: Diagnostic = {
  code: "template.output",
  severity: "info",
  path: "template.output",
  message: "输出文件为默认名",
};

function renderBar(diagnostics: readonly Diagnostic[], onLocate = vi.fn()) {
  const canLocate = vi.fn(
    (diagnostic: Diagnostic) => /^ruleSets\[\d+\]/.test(diagnostic.path ?? ""),
  );
  render(
    <AppProviders>
      <ValidationBar diagnostics={diagnostics} canLocate={canLocate} onLocate={onLocate} />
    </AppProviders>,
  );
  return { onLocate, canLocate };
}

describe("ValidationBar", () => {
  it("shows a text + icon pass status when there are no diagnostics", () => {
    renderBar([]);
    expect(screen.getByText("校验通过：无错误、无警告")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("summarizes severity counts and keeps non-locatable items as plain text", () => {
    renderBar([ruleDiagnostic, globalDiagnostic, providerDiagnostic, infoDiagnostic]);
    expect(screen.getByText("校验结果：2 错误 · 1 警告 · 1 提示")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /route\.final\.missing/ })).toBeNull();
    expect(screen.getByText(/\[route\.final\.missing\] ruleSets ruleSets 需要包含一条 FINAL 兜底规则/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /provider\.sources\.disabled-empty/ })).toBeNull();
  });

  it("reports the locating decision per diagnostic and delegates clicks", () => {
    const { onLocate, canLocate } = renderBar([ruleDiagnostic]);
    expect(canLocate).toHaveBeenCalledWith(ruleDiagnostic);
    fireEvent.click(screen.getByRole("button", { name: /route\.policy\.missing/ }));
    expect(onLocate).toHaveBeenCalledWith(ruleDiagnostic);
  });
});
