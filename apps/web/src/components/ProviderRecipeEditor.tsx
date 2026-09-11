import { useEffect, useState } from "react";
import { Alert, Button, Input, Popconfirm, Select, Space, Switch, Tooltip } from "antd";
import { Plus, X } from "lucide-react";
import type { RuleProviderConfig, RuleProviderSource } from "@clash-route-kit/core";
import { fetchCatalogEntries } from "../catalog.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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
  fetcher?: Fetcher;
}) {
  const [output, setOutput] = useState(props.provider.output);
  const [dlcEntries, setDlcEntries] = useState<string[]>([]);
  useEffect(() => setOutput(props.provider.output), [props.provider.output]);
  useEffect(() => {
    let alive = true;
    void fetchCatalogEntries("domain-list-community", props.fetcher ?? globalThis.fetch)
      .then((entries) => alive && setDlcEntries(entries.map((e) => e.name)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [props.fetcher]);

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
          <div className="rk-field-label">执行状态</div>
          <Space>
            <Switch
              aria-label="启用规则源"
              checked={props.provider.enabled !== false}
              onChange={(enabled) => props.onUpdate({ enabled })}
            />
            <span className="rk-lib-meta">
              {props.provider.enabled === false ? "禁用草稿，不参与生成" : "启用并参与生成"}
            </span>
          </Space>
        </div>
        {props.provider.enabled !== false && props.provider.sources.length === 0 ? (
          <Alert type="error" showIcon message="启用前至少添加一个数据源" />
        ) : null}
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
              {source.type === "domain-list-community" ? (
                <Select
                  showSearch
                  value={sourceValue(source) || undefined}
                  placeholder="搜索/选择 GEOSITE 条目"
                  style={{ width: 260 }}
                  options={dlcEntries.map((name) => ({ value: name, label: name }))}
                  onChange={(value) =>
                    props.onSetSources(props.provider.sources.map((s, i) => (i === index ? withValue(s, value) : s)))
                  }
                />
              ) : (
                <Input
                  value={sourceValue(source)}
                  placeholder="仓库内相对路径"
                  style={{ width: 260 }}
                  onChange={(e) =>
                    props.onSetSources(props.provider.sources.map((s, i) => (i === index ? withValue(s, e.target.value) : s)))
                  }
                />
              )}
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
          <Tooltip title="生成时，结果里凡匹配这些正则的域名会被排除（不写入产物）">
            <div className="rk-field-label">排除（exclude）· 按正则剔除域名 ⓘ</div>
          </Tooltip>
          <Select
            mode="tags"
            style={{ width: "100%" }}
            value={props.provider.exclude ?? []}
            onChange={(values) => props.onSetListField("exclude", values)}
          />
        </div>
        <div>
          <Tooltip title="生成时，从上游列表中先删除匹配这些正则的原始行，再合并">
            <div className="rk-field-label">移除（remove）· 按正则删除上游原始行 ⓘ</div>
          </Tooltip>
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
