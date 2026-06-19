import { useEffect, useState } from "react";
import { Button, Input, Popconfirm, Select, Space } from "antd";
import { Plus, X } from "lucide-react";
import type { RuleProviderConfig, RuleProviderSource } from "@clash-route-kit/core";

const SOURCE_TYPES: RuleProviderSource["type"][] = ["clash-list", "clash-provider", "domain-list-community"];

function sourceValue(source: RuleProviderSource): string {
  return source.type === "domain-list-community" ? source.entry : source.path;
}

function withValue(source: RuleProviderSource, value: string): RuleProviderSource {
  if (source.type === "domain-list-community") return { ...source, entry: value };
  return { ...source, path: value };
}

function makeSource(type: RuleProviderSource["type"]): RuleProviderSource {
  if (type === "domain-list-community") return { type, name: "", entry: "" };
  return { type, name: "", path: "" };
}

export function ProviderRecipeEditor(props: {
  provider: RuleProviderConfig;
  onUpdate: (patch: Partial<RuleProviderConfig>) => void;
  onSetSources: (sources: RuleProviderSource[]) => void;
  onSetListField: (field: "exclude" | "remove", values: string[]) => void;
  onDelete: () => void;
}) {
  const [output, setOutput] = useState(props.provider.output);
  useEffect(() => setOutput(props.provider.output), [props.provider.output]);

  return (
    <div className="rk-page-col" style={{ height: "100%", padding: 12, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>规则源 · {props.provider.name}</strong>
        <Popconfirm title={`删除规则源 ${props.provider.name}？`} onConfirm={props.onDelete} okText="删除" cancelText="取消">
          <Button danger size="small">
            删除
          </Button>
        </Popconfirm>
      </div>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <div>
          <div className="rk-field-label">输出文件名</div>
          <Input
            aria-label="输出文件名"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            onBlur={() => output.trim() && output !== props.provider.output && props.onUpdate({ output: output.trim() })}
          />
        </div>
        <div>
          <div className="rk-field-label">来源</div>
          {props.provider.sources.map((source, index) => (
            <Space key={index} style={{ display: "flex", marginBottom: 4 }}>
              <Select
                value={source.type}
                style={{ width: 180 }}
                options={SOURCE_TYPES.map((t) => ({ value: t, label: t }))}
                onChange={(type) =>
                  props.onSetSources(props.provider.sources.map((s, i) => (i === index ? makeSource(type) : s)))
                }
              />
              <Input
                value={sourceValue(source)}
                placeholder={source.type === "domain-list-community" ? "entry 名" : "相对路径"}
                style={{ width: 260 }}
                onChange={(e) =>
                  props.onSetSources(props.provider.sources.map((s, i) => (i === index ? withValue(s, e.target.value) : s)))
                }
              />
              <button
                type="button"
                aria-label={`删除来源 ${index}`}
                className="rk-iconbtn rk-del"
                onClick={() => props.onSetSources(props.provider.sources.filter((_s, i) => i !== index))}
              >
                <X size={13} />
              </button>
            </Space>
          ))}
          <Button
            size="small"
            icon={<Plus size={13} />}
            onClick={() => props.onSetSources([...props.provider.sources, makeSource("domain-list-community")])}
          >
            添加来源
          </Button>
        </div>
        <div>
          <div className="rk-field-label">排除（exclude）</div>
          <Select
            mode="tags"
            style={{ width: "100%" }}
            value={props.provider.exclude ?? []}
            onChange={(values) => props.onSetListField("exclude", values)}
          />
        </div>
        <div>
          <div className="rk-field-label">移除（remove）</div>
          <Select
            mode="tags"
            style={{ width: "100%" }}
            value={props.provider.remove ?? []}
            onChange={(values) => props.onSetListField("remove", values)}
          />
        </div>
      </Space>
    </div>
  );
}
