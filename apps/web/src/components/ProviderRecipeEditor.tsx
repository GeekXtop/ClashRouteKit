import { useEffect, useState } from "react";
import { Alert, Button, Input, Popconfirm, Select, Space, Switch, Tooltip } from "antd";
import { Plus, X } from "lucide-react";
import type { RuleProviderConfig, RuleProviderSource } from "@clash-route-kit/core";
import { fetchCatalogEntries } from "../catalog.js";
import {
  providerHasUsableSource,
  providerMustStayDisabled,
  providerOutputIsMrs,
  providerSourceValue,
} from "../libraryHealth.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const SOURCE_TYPES: RuleProviderSource["type"][] = ["clash-list", "clash-provider", "domain-list-community"];

const EMPTY_DRAFT_NOTICE = "已保存为禁用草稿，补全来源后可启用";
const MRS_DRAFT_NOTICE = "已保存为禁用草稿：.mrs 输出当前不支持生成（仅支持 .yaml）";

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
  onDelete: () => void;
  fetcher?: Fetcher;
}) {
  const [output, setOutput] = useState(props.provider.output);
  const [dlcEntries, setDlcEntries] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setOutput(props.provider.output), [props.provider.output]);
  useEffect(() => setNotice(null), [props.provider.name]);
  useEffect(() => {
    let alive = true;
    void fetchCatalogEntries("domain-list-community", props.fetcher ?? globalThis.fetch)
      .then((entries) => alive && setDlcEntries(entries.map((e) => e.name)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [props.fetcher]);

  const mrsOutput = providerOutputIsMrs(props.provider);
  const noUsableSource = !providerHasUsableSource(props.provider);
  const cannotEnable = providerMustStayDisabled(props.provider);

  // 空来源 / .mrs 输出的 provider 不允许以启用状态落盘：任何保存路径都强制降级为禁用草稿。
  function commit(patch: Partial<RuleProviderConfig>) {
    setNotice(null);
    const nextSources = Object.prototype.hasOwnProperty.call(patch, "sources")
      ? (patch.sources as RuleProviderSource[])
      : props.provider.sources;
    const nextOutput = Object.prototype.hasOwnProperty.call(patch, "output")
      ? (patch.output as string)
      : props.provider.output;
    const stillMrs = nextOutput.toLowerCase().endsWith(".mrs");
    const stillNoSource = !nextSources.some((source) => providerSourceValue(source).trim());
    if (props.provider.enabled !== false && (stillNoSource || stillMrs)) {
      props.onUpdate({ ...patch, enabled: false });
      setNotice(stillMrs ? MRS_DRAFT_NOTICE : EMPTY_DRAFT_NOTICE);
      return;
    }
    props.onUpdate(patch);
  }

  function commitOutput() {
    const trimmed = output.trim();
    if (trimmed && trimmed !== props.provider.output) commit({ output: trimmed });
  }

  function disableHint(): string {
    if (mrsOutput) return ".mrs 输出不支持生成：无法启用";
    return "来源为空：补全至少一个来源后才能启用";
  }

  return (
    <div className="rk-page-col" style={{ height: "100%", padding: 12, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>规则源 · {props.provider.name}</strong>
        <Space>
          {mrsOutput ? <span className="rk-tag error">不支持生成</span> : null}
          <Popconfirm title={`删除规则源 ${props.provider.name}？`} onConfirm={props.onDelete} okText="删除" cancelText="取消">
            <Button danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        {notice ? <Alert type="warning" showIcon message={notice} /> : null}
        {mrsOutput ? (
          <Alert type="error" showIcon message="导入问题：.mrs 输出不支持生成（当前仅支持生成 .yaml）" />
        ) : null}
        {props.provider.enabled !== false && noUsableSource ? (
          <Alert type="error" showIcon message="启用前至少添加一个数据源" />
        ) : null}
        <div>
          <div className="rk-field-label">执行状态</div>
          <Space>
            <Tooltip title={cannotEnable ? disableHint() : ""}>
              <Switch
                aria-label="启用规则源"
                checked={props.provider.enabled !== false}
                disabled={cannotEnable}
                onChange={(enabled) => commit({ enabled })}
              />
            </Tooltip>
            <span className="rk-lib-meta">
              {props.provider.enabled === false ? "禁用草稿，不参与生成" : "启用并参与生成"}
            </span>
          </Space>
          {cannotEnable ? <div className="rk-setting-hint">{disableHint()}</div> : null}
        </div>
        <div>
          <div className="rk-field-label">输出文件名</div>
          <Input
            aria-label="输出文件名"
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            onBlur={commitOutput}
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
                  commit({ sources: props.provider.sources.map((s, i) => (i === index ? makeSource(type) : s)) })
                }
              />
              {source.type === "domain-list-community" ? (
                <Select
                  showSearch
                  value={providerSourceValue(source) || undefined}
                  placeholder="搜索/选择 GEOSITE 条目"
                  style={{ width: 260 }}
                  options={dlcEntries.map((name) => ({ value: name, label: name }))}
                  onChange={(value) =>
                    commit({
                      sources: props.provider.sources.map((s, i) => (i === index ? withValue(s, value) : s)),
                    })
                  }
                />
              ) : (
                <Input
                  value={providerSourceValue(source)}
                  placeholder="仓库内相对路径"
                  style={{ width: 260 }}
                  onChange={(e) =>
                    commit({
                      sources: props.provider.sources.map((s, i) =>
                        i === index ? withValue(s, e.target.value) : s,
                      ),
                    })
                  }
                />
              )}
              <button
                type="button"
                aria-label={`删除来源 ${index}`}
                className="rk-iconbtn rk-del"
                onClick={() => commit({ sources: props.provider.sources.filter((_s, i) => i !== index) })}
              >
                <X size={13} />
              </button>
            </Space>
          ))}
          <Button
            size="small"
            icon={<Plus size={13} />}
            onClick={() => commit({ sources: [...props.provider.sources, makeSource("domain-list-community")] })}
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
            onChange={(values) => commit({ exclude: values })}
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
            onChange={(values) => commit({ remove: values })}
          />
        </div>
      </Space>
    </div>
  );
}
