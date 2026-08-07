// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import {
  InheritedNumberSetting,
  modeForValue,
} from "../src/components/InheritedSettingField.js";

afterEach(cleanup);

describe("InheritedNumberSetting", () => {
  it("maps undefined to inherit and null or explicit values to custom", () => {
    expect(modeForValue(undefined)).toBe("inherit");
    expect(modeForValue(null)).toBe("custom");
    expect(modeForValue(8)).toBe("custom");
  });

  it("does not expose a separate explicit-empty mode", () => {
    render(
      <AppProviders>
        <InheritedNumberSetting
          label="测速超时（秒）"
          value={null}
          resolved={{ value: undefined, source: "empty" }}
          customFallback={5}
          onChange={() => {}}
        />
      </AppProviders>,
    );

    expect(screen.queryByText("明确留空")).toBeNull();
    expect(screen.getByTitle("自定义")).toBeTruthy();
    expect((screen.getByLabelText("测速超时（秒）") as HTMLInputElement).value).toBe("");
  });

  it("emits inherit and seeds custom from the effective value", async () => {
    const onChange = vi.fn();
    const view = render(
      <AppProviders>
        <InheritedNumberSetting
          label="测速超时（秒）"
          value={8}
          resolved={{ value: 8, source: "item" }}
          customFallback={5}
          onChange={onChange}
        />
      </AppProviders>,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "测速超时（秒）模式" }));
    fireEvent.click(await screen.findByText("继承项目默认值"));
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    view.rerender(
      <AppProviders>
        <InheritedNumberSetting
          label="测速超时（秒）"
          value={undefined}
          resolved={{ value: 5, source: "project" }}
          customFallback={5}
          onChange={onChange}
        />
      </AppProviders>,
    );
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "测速超时（秒）模式" }));
    fireEvent.click(await screen.findByText("自定义"));
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it("emits null when a custom number input is cleared", () => {
    const onChange = vi.fn();
    render(
      <AppProviders>
        <InheritedNumberSetting
          label="测速超时（秒）"
          value={8}
          resolved={{ value: 8, source: "item" }}
          customFallback={5}
          onChange={onChange}
        />
      </AppProviders>,
    );

    fireEvent.change(screen.getByLabelText("测速超时（秒）"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("seeds custom mode from the effective value", async () => {
    const onChange = vi.fn();
    render(
      <AppProviders>
        <InheritedNumberSetting
          label="测速间隔（秒）"
          value={undefined}
          resolved={{ value: 600, source: "project" }}
          customFallback={300}
          onChange={onChange}
        />
      </AppProviders>,
    );

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "测速间隔（秒）模式" }));
    fireEvent.click(await screen.findByText("自定义"));
    expect(onChange).toHaveBeenLastCalledWith(600);
  });
});
