// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { RuleDrawer } from "../src/components/RuleDrawer.js";

afterEach(cleanup);

it("keeps RuleSet edits local until Save is clicked", async () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{
          id: "ai-geosite-openai",
          policy: "AI",
          source: { type: "geosite", value: "openai" },
        }}
        ruleSetIds={["ai-geosite-openai", "final"]}
        policies={["AI", "Direct"]}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>,
  );

  fireEvent.mouseDown(screen.getByRole("combobox", { name: "归属策略组" }));
  fireEvent.click((await screen.findAllByText("Direct")).at(-1)!);
  fireEvent.change(screen.getByDisplayValue("openai"), { target: { value: "anthropic" } });
  expect(onSave).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({
    id: "ai-geosite-openai",
    policy: "Direct",
    source: { type: "geosite", value: "anthropic" },
  });
});

it("discards RuleSet edits when Cancel is clicked", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{ id: "geo", policy: "AI", source: { type: "geosite", value: "openai" } }}
        ruleSetIds={["geo", "final"]}
        policies={["AI"]}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByDisplayValue("openai"), { target: { value: "anthropic" } });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("rejects a duplicate RuleSet ID without saving", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{ id: "geo", policy: "AI", source: { type: "geosite", value: "openai" } }}
        ruleSetIds={["geo", "final"]}
        policies={["AI"]}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("规则 ID"), { target: { value: "final" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText('RuleSet "final" already exists')).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

it("rejects a blank custom Rule Provider interval", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{
          id: "provider",
          policy: "AI",
          source: {
            type: "rule-provider",
            behavior: "domain",
            file: "AI.yaml",
            interval: 600,
          },
        }}
        ruleSetIds={["provider", "final"]}
        policies={["AI"]}
        onSave={onSave}
        onCancel={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>
  );
  fireEvent.change(screen.getByLabelText("更新间隔（秒）"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText("更新间隔（秒）不能为空")).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

it("keeps inherit, enabled and disabled for per-rule GEOIP no-resolve", async () => {
  render(
    <AppProviders>
      <RuleDrawer
        open
        ruleSet={{ id: "geoip-cn", policy: "AI", source: { type: "geoip", value: "cn" } }}
        ruleSetIds={["geoip-cn", "final"]}
        policies={["AI"]}
        onSave={() => {}}
        onCancel={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "GEOIP no-resolve" }));
  expect((await screen.findAllByText("继承项目默认值")).length).toBeGreaterThan(0);
  expect(screen.getByText("开启")).toBeTruthy();
  expect(screen.getByText("关闭")).toBeTruthy();
});
