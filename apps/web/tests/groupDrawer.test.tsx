// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { GroupDrawer } from "../src/components/GroupDrawer.js";

afterEach(cleanup);

it("shows the group name and routes inbound jumps", () => {
  const onJumpToRule = vi.fn();
  render(
    <AppProviders>
      <GroupDrawer
        open
        group={{ name: "Proxy", type: "select", options: ["Direct"] }}
        groups={[{ name: "Proxy", type: "select", options: [] }]}
        inbound={[{ id: "geosite-gfw", enabled: true, source: "[]GEOSITE,gfw" }]}
        onClose={() => {}}
        onUpdate={() => {}}
        onRename={() => {}}
        onSetListField={() => {}}
        onDelete={() => {}}
        onJumpToRule={onJumpToRule}
      />
    </AppProviders>,
  );
  expect(screen.getByDisplayValue("Proxy")).toBeTruthy();
  fireEvent.click(screen.getByText("geosite-gfw"));
  expect(onJumpToRule).toHaveBeenCalledWith("geosite-gfw");
});
