// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ProviderRecipeEditor } from "../src/components/ProviderRecipeEditor.js";

afterEach(cleanup);

it("updates output on blur", () => {
  const onUpdate = vi.fn();
  render(
    <AppProviders>
      <ProviderRecipeEditor
        provider={{ name: "AI", output: "AI.yaml", behavior: "domain", sources: [] }}
        onUpdate={onUpdate}
        onSetSources={() => {}}
        onSetListField={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>,
  );
  const output = screen.getByLabelText("输出文件名");
  fireEvent.change(output, { target: { value: "AI2.yaml" } });
  fireEvent.blur(output);
  expect(onUpdate).toHaveBeenCalledWith({ output: "AI2.yaml" });
});

it("exposes the provider enabled state", () => {
  const onUpdate = vi.fn();
  render(
    <AppProviders>
      <ProviderRecipeEditor
        provider={{
          name: "Draft",
          output: "Draft.yaml",
          behavior: "domain",
          enabled: false,
          sources: [],
        }}
        onUpdate={onUpdate}
        onSetSources={() => {}}
        onSetListField={() => {}}
        onDelete={() => {}}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByRole("switch", { name: "启用规则源" }));
  expect(onUpdate).toHaveBeenCalledWith({ enabled: true });
});

it("blocks enabled providers that have no sources", () => {
  render(
    <AppProviders>
      <ProviderRecipeEditor
        provider={{
          name: "Draft",
          output: "Draft.yaml",
          behavior: "domain",
          enabled: true,
          sources: [],
        }}
        onUpdate={() => {}}
        onSetSources={() => {}}
        onSetListField={() => {}}
        onDelete={() => {}}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );

  expect(screen.getByText("启用前至少添加一个数据源")).toBeTruthy();
});
