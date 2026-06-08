// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CustomProxyGroup } from "@clash-route-kit/core";
import { CustomProxyGroupEditor } from "../src/components/CustomProxyGroupEditor.js";

afterEach(cleanup);

const defaultGroups: CustomProxyGroup[] = [
  { name: "Proxy", type: "select", options: ["Auto", "Direct"] },
  { name: "Auto", type: "url-test", options: [] },
  { name: "Direct", type: "select", options: ["DIRECT"] },
];

function renderEditor(overrides: Partial<Parameters<typeof CustomProxyGroupEditor>[0]> = {}) {
  const groups = overrides.groups ?? defaultGroups;
  const props = {
    group: groups[0],
    groups,
    onDeleteGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onSetGroupListField: vi.fn(),
    onUpdateGroup: vi.fn(),
    ...overrides,
  };
  render(<CustomProxyGroupEditor {...props} />);
  return props;
}

describe("CustomProxyGroupEditor", () => {
  it("adds a reference from the dropdown", () => {
    const { onSetGroupListField } = renderEditor();
    fireEvent.change(screen.getByLabelText("添加引用"), { target: { value: "REJECT" } });
    expect(onSetGroupListField).toHaveBeenCalledWith("Proxy", "options", ["Auto", "Direct", "REJECT"]);
  });

  it("removes a reference chip", () => {
    const { onSetGroupListField } = renderEditor();
    fireEvent.click(screen.getByLabelText("移除 Auto"));
    expect(onSetGroupListField).toHaveBeenCalledWith("Proxy", "options", ["Direct"]);
  });

  it("reorders references by dragging one chip onto another", () => {
    const { onSetGroupListField } = renderEditor();
    fireEvent.dragStart(screen.getByTestId("chip-Auto"));
    fireEvent.drop(screen.getByTestId("chip-Direct"));
    expect(onSetGroupListField).toHaveBeenCalledWith("Proxy", "options", ["Direct", "Auto"]);
  });

  it("composes a scoped node filter and appends it", () => {
    const { onSetGroupListField } = renderEditor();
    fireEvent.change(screen.getByLabelText("来源范围"), { target: { value: "groupId" } });
    fireEvent.change(screen.getByLabelText("范围值"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("名称正则"), { target: { value: "(港|HK)" } });
    fireEvent.click(screen.getByText("添加筛选"));
    expect(onSetGroupListField).toHaveBeenCalledWith("Proxy", "nodeFilters", ["!!GROUPID=0!!(港|HK)"]);
  });

  it("warns when the selected group participates in a reference cycle", () => {
    const cyclic: CustomProxyGroup[] = [
      { name: "Proxy", type: "select", options: ["Auto"] },
      { name: "Auto", type: "select", options: ["Proxy"] },
    ];
    renderEditor({ groups: cyclic, group: cyclic[0] });
    expect(screen.getByText(/引用环/)).toBeTruthy();
  });
});
