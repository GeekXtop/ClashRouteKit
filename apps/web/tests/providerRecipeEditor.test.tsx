// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RuleProviderConfig } from "@clash-route-kit/core";
import { AppProviders } from "../src/components/AppProviders.js";
import { ProviderRecipeEditor } from "../src/components/ProviderRecipeEditor.js";

afterEach(cleanup);

type OnUpdate = (patch: Partial<RuleProviderConfig>) => void;

function renderEditor(props: {
  provider: Parameters<typeof ProviderRecipeEditor>[0]["provider"];
  onUpdate?: OnUpdate;
}) {
  const onUpdate = vi.fn((...args: Parameters<OnUpdate>) => props.onUpdate?.(...args));
  render(
    <AppProviders>
      <ProviderRecipeEditor
        provider={props.provider}
        onUpdate={onUpdate}
        onDelete={() => {}}
        fetcher={vi.fn()}
      />
    </AppProviders>,
  );
  return { onUpdate };
}

it("updates output on blur", () => {
  const { onUpdate } = renderEditor({
    provider: {
      name: "AI",
      output: "AI.yaml",
      behavior: "domain",
      sources: [{ name: "AI", type: "clash-list", path: "config/rules/AI.list" }],
    },
  });
  const output = screen.getByLabelText("输出文件名");
  fireEvent.change(output, { target: { value: "AI2.yaml" } });
  fireEvent.blur(output);
  expect(onUpdate).toHaveBeenCalledWith({ output: "AI2.yaml" });
});

it("enables a provider that has at least one usable source", () => {
  const { onUpdate } = renderEditor({
    provider: {
      name: "Draft",
      output: "Draft.yaml",
      behavior: "domain",
      enabled: false,
      sources: [{ name: "AI", type: "clash-list", path: "config/rules/AI.list" }],
    },
  });
  const enableSwitch = screen.getByRole("switch", { name: "启用规则源" }) as HTMLInputElement;
  expect(enableSwitch.disabled).toBe(false);
  fireEvent.click(enableSwitch);
  expect(onUpdate).toHaveBeenCalledWith({ enabled: true });
});

it("disables the enable switch while the provider has no usable source", () => {
  renderEditor({
    provider: { name: "Draft", output: "Draft.yaml", behavior: "domain", enabled: false, sources: [] },
  });
  const enableSwitch = screen.getByRole("switch", { name: "启用规则源" }) as HTMLInputElement;
  expect(enableSwitch.disabled).toBe(true);
  expect(screen.getByText("来源为空：补全至少一个来源后才能启用")).toBeTruthy();
});

it("forces an enabled empty provider into a disabled draft when saving any change", () => {
  const { onUpdate } = renderEditor({
    provider: { name: "Draft", output: "Draft.yaml", behavior: "domain", enabled: true, sources: [] },
  });
  const output = screen.getByLabelText("输出文件名");
  fireEvent.change(output, { target: { value: "Draft2.yaml" } });
  expect(screen.getByText("启用前至少添加一个数据源")).toBeTruthy();
  fireEvent.blur(output);
  expect(onUpdate).toHaveBeenCalledWith({ output: "Draft2.yaml", enabled: false });
  expect(screen.getByText("已保存为禁用草稿，补全来源后可启用")).toBeTruthy();
});

it("forces disable when the last source is removed", () => {
  const { onUpdate } = renderEditor({
    provider: {
      name: "AI",
      output: "AI.yaml",
      behavior: "domain",
      enabled: true,
      sources: [{ name: "AI", type: "clash-list", path: "config/rules/AI.list" }],
    },
  });
  fireEvent.click(screen.getByLabelText("删除来源 0"));
  expect(onUpdate).toHaveBeenCalledWith({ sources: [], enabled: false });
  expect(screen.getByText("已保存为禁用草稿，补全来源后可启用")).toBeTruthy();
});

it("shows .mrs output as an import problem that cannot be enabled", () => {
  renderEditor({
    provider: {
      name: "Mrs",
      output: "Something.mrs",
      behavior: "domain",
      enabled: false,
      sources: [{ name: "s", type: "clash-list", path: "config/rules/A.list" }],
    },
  });
  expect(screen.getByText("导入问题：.mrs 输出不支持生成（当前仅支持生成 .yaml）")).toBeTruthy();
  expect(screen.getByText("不支持生成")).toBeTruthy();
  const enableSwitch = screen.getByRole("switch", { name: "启用规则源" }) as HTMLInputElement;
  expect(enableSwitch.disabled).toBe(true);
  expect(screen.getByText(".mrs 输出不支持生成：无法启用")).toBeTruthy();
});

it("forces a .mrs provider into a disabled draft on save", () => {
  const { onUpdate } = renderEditor({
    provider: {
      name: "Mrs",
      output: "Old.mrs",
      behavior: "domain",
      enabled: true,
      sources: [{ name: "s", type: "clash-list", path: "config/rules/A.list" }],
    },
  });
  const output = screen.getByLabelText("输出文件名");
  fireEvent.change(output, { target: { value: "New.mrs" } });
  fireEvent.blur(output);
  expect(onUpdate).toHaveBeenCalledWith({ output: "New.mrs", enabled: false });
  expect(screen.getByText("已保存为禁用草稿：.mrs 输出当前不支持生成（仅支持 .yaml）")).toBeTruthy();
});
