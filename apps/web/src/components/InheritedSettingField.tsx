import { Input, InputNumber, Select, Space } from "antd";
import type { ResolvedConfigValue } from "@clash-route-kit/core";

export type InheritedSettingMode = "inherit" | "custom";

export function modeForValue(
  value: string | number | null | undefined,
): InheritedSettingMode {
  return value === undefined ? "inherit" : "custom";
}

function sourceCaption<T>(resolved: ResolvedConfigValue<T>, unit?: string): string {
  const rendered =
    resolved.value === undefined
      ? "未设置"
      : `${String(resolved.value)}${unit ? ` ${unit}` : ""}`;
  if (resolved.source === "empty") return `当前使用单项覆盖：${rendered}`;
  if (resolved.source === "item") return `当前使用单项覆盖：${rendered}`;
  if (resolved.source === "project") return `继承项目默认值：${rendered}`;
  return `使用程序默认值：${rendered}`;
}

function ModeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: InheritedSettingMode;
  onChange: (mode: InheritedSettingMode) => void;
}) {
  return (
    <Select
      aria-label={`${label}模式`}
      value={value}
      style={{ width: 160 }}
      options={[
        { value: "inherit", label: "继承项目默认值" },
        { value: "custom", label: "自定义" },
      ]}
      onChange={onChange}
    />
  );
}

export function InheritedNumberSetting(props: {
  label: string;
  value: number | null | undefined;
  resolved: ResolvedConfigValue<number>;
  customFallback: number;
  min?: number;
  unit?: string;
  onChange: (value: number | null | undefined) => void;
}) {
  const mode = modeForValue(props.value);

  function changeMode(next: InheritedSettingMode) {
    if (next === "inherit") {
      props.onChange(undefined);
    } else {
      props.onChange(props.resolved.value ?? props.customFallback);
    }
  }

  return (
    <div>
      <div className="rk-field-label">{props.label}</div>
      <Space.Compact style={{ width: "100%" }}>
        <ModeSelect
          label={props.label}
          value={mode}
          onChange={changeMode}
        />
        {mode === "custom" ? (
          <InputNumber
            aria-label={props.label}
            value={props.value ?? undefined}
            min={props.min}
            precision={0}
            style={{ width: "100%" }}
            onChange={(value) => props.onChange(value)}
          />
        ) : null}
      </Space.Compact>
      <div className="rk-setting-hint">{sourceCaption(props.resolved, props.unit)}</div>
    </div>
  );
}

export function InheritedTextSetting(props: {
  label: string;
  value: string | undefined;
  resolved: ResolvedConfigValue<string>;
  customFallback: string;
  onChange: (value: string | undefined) => void;
}) {
  const mode = modeForValue(props.value);

  function changeMode(next: InheritedSettingMode) {
    if (next === "inherit") {
      props.onChange(undefined);
    } else {
      props.onChange(props.resolved.value ?? props.customFallback);
    }
  }

  return (
    <div>
      <div className="rk-field-label">{props.label}</div>
      <Space.Compact style={{ width: "100%" }}>
        <ModeSelect label={props.label} value={mode} onChange={changeMode} />
        {mode === "custom" ? (
          <Input
            aria-label={props.label}
            value={props.value ?? ""}
            onChange={(event) => props.onChange(event.target.value)}
          />
        ) : null}
      </Space.Compact>
      <div className="rk-setting-hint">{sourceCaption(props.resolved)}</div>
    </div>
  );
}
