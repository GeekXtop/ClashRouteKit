// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ProjectDefaultsDrawer } from "../src/components/ProjectDefaultsDrawer.js";

afterEach(cleanup);

it("keeps default edits local and materializes GEOIP true on Save", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <ProjectDefaultsDrawer
        open
        initialSection="proxy-groups"
        defaults={undefined}
        onSave={onSave}
        onCancel={() => {}}
      />
    </AppProviders>,
  );

  fireEvent.change(screen.getByLabelText("项目测速超时（秒）"), {
    target: { value: "5" },
  });
  expect(onSave).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(onSave).toHaveBeenCalledWith({
    proxyGroups: { healthCheck: { timeout: 5 } },
    ruleSets: { geoipNoResolve: true },
  });
});

it("shows only enabled and disabled GEOIP project defaults", async () => {
  render(
    <AppProviders>
      <ProjectDefaultsDrawer
        open
        initialSection="rule-sets"
        defaults={undefined}
        onSave={() => {}}
        onCancel={() => {}}
      />
    </AppProviders>,
  );

  fireEvent.mouseDown(screen.getByRole("combobox", { name: "GEOIP 默认 no-resolve" }));
  expect((await screen.findAllByText("开启")).length).toBeGreaterThan(0);
  expect(screen.getByText("关闭")).toBeTruthy();
  expect(screen.queryByText("使用程序默认值（开启）")).toBeNull();
});

it("discards default edits when Cancel is clicked", () => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <AppProviders>
      <ProjectDefaultsDrawer
        open
        initialSection="proxy-groups"
        defaults={{ proxyGroups: { healthCheck: { timeout: 5 } } }}
        onSave={onSave}
        onCancel={onCancel}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("项目测速超时（秒）"), { target: { value: "8" } });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("keeps an invalid project URL inside the Drawer", () => {
  const onSave = vi.fn();
  render(
    <AppProviders>
      <ProjectDefaultsDrawer
        open
        initialSection="proxy-groups"
        defaults={undefined}
        onSave={onSave}
        onCancel={() => {}}
      />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("项目测速 URL"), { target: { value: "ftp://probe" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText("defaults.proxyGroups.healthCheck.url 必须是 HTTP/HTTPS URL")).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});
