import { useEffect, useState } from "react";
import { Button, Radio, Space, Tabs, Tag, Tooltip } from "antd";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { ProjectValidationState } from "../../projectController.js";
import { ConfigYamlSection } from "../../components/ConfigYamlSection.js";
import { detectSchemaVersion } from "../project/projectMeta.js";
import { createLocalTemplateUrl, LocalTemplatePanel } from "./LocalTemplatePanel.js";
import { GithubPublishPanel } from "./GithubPublishPanel.js";
import {
  useTemplateSourceStatus,
  type LocalTemplateProbeState,
  type TemplateSourceChoice,
} from "./templateSourceStatus.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function SchemaTag({ yaml }: { yaml: string }) {
  const version = detectSchemaVersion(yaml);
  return <Tag color={version === 2 ? "success" : "warning"}>{`Schema v${version}`}</Tag>;
}

function ValidationTag({ validation }: { validation: ProjectValidationState }) {
  if (validation.status === "success") return <Tag color="success">校验通过</Tag>;
  if (validation.status === "error") return <Tag color="error">校验未通过</Tag>;
  if (validation.status === "running") return <Tag color="processing">校验中</Tag>;
  return <Tag>未校验</Tag>;
}

const localProbeMeta: Record<LocalTemplateProbeState, { label: string; color: string }> = {
  checking: { label: "检测中", color: "processing" },
  ok: { label: "可达", color: "success" },
  unreachable: { label: "不可达", color: "error" },
};

/** 输出页：设备配置（默认标签）与 GitHub 发布（可选标签）共用顶部项目状态与 TemplateSourceStatus。 */
export function OutputPage(props: {
  config: RouteKitProjectConfig;
  originalConfig?: RouteKitProjectConfig;
  originalYaml?: string;
  validation: ProjectValidationState;
  onRunCheck: () => void;
  fetcher?: Fetcher;
}) {
  // 沿用旧发布页行为：进入输出页时自动运行一次 check 刷新校验状态。
  useEffect(() => {
    props.onRunCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TemplateSourceStatus 唯一实例：本地探测、远程可用性、Actions 轮询都归这里，两个标签只消费。
  const templateStatus = useTemplateSourceStatus({
    publishBaseUrl: props.config.publishBaseUrl,
    templateOutput: props.config.template.output,
    ...(props.fetcher ? { fetcher: props.fetcher } : {}),
  });
  const [templateSource, setTemplateSource] = useState<TemplateSourceChoice>("local");
  const [activeTab, setActiveTab] = useState("device");

  const localUrl = createLocalTemplateUrl(props.config.publishBaseUrl, props.config.template.output);
  const subconverterUrl = props.config.subconverterUrl ?? "http://10.0.0.3:25500/sub";
  const remote = templateStatus.sources.remote;
  const remoteSelectable = remote.available;
  const localProbe = localProbeMeta[templateStatus.localStatus];

  return (
    <div className="rk-publish-flow" data-testid="output-page">
      <div className="rk-publish-block" data-testid="output-shared-header">
        <Space size={16} wrap>
          <SchemaTag yaml={props.originalYaml ?? ""} />
          <ValidationTag validation={props.validation} />
          <Space size={6}>
            <span className="rk-lib-meta">本地实时模板 URL</span>
            <code>{localUrl}</code>
            <Tag color={localProbe.color} data-testid="local-template-status">{localProbe.label}</Tag>
          </Space>
          <Space size={6}>
            <span className="rk-lib-meta">远程模板</span>
            <Tag color={remoteSelectable ? "success" : "default"} data-testid="remote-template-status">
              {remoteSelectable ? "可用" : "未发布"}
            </Tag>
            {remoteSelectable && remote.checkedAt ? (
              <span className="rk-lib-meta">{new Date(remote.checkedAt).toLocaleString()}</span>
            ) : null}
          </Space>
        </Space>
      </div>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "device",
            label: "设备配置",
            children: (
              <>
                <div className="rk-publish-block" data-testid="template-source-block">
                  <div className="rk-field-label">模板来源</div>
                  <Radio.Group
                    value={templateSource}
                    onChange={(e) => setTemplateSource(e.target.value as TemplateSourceChoice)}
                    data-testid="template-source-group"
                  >
                    <Radio value="local">本地实时模板</Radio>
                    <Radio value="remote" disabled={!remoteSelectable}>GitHub 远程模板</Radio>
                  </Radio.Group>
                  {!remoteSelectable ? (
                    <p className="rk-lib-meta" style={{ marginBottom: 0 }} data-testid="template-source-remote-hint">
                      远程模板尚不可用，先在 GitHub 发布标签完成发布
                      <Button type="link" size="small" onClick={() => setActiveTab("github")}>去 GitHub 发布</Button>
                    </p>
                  ) : null}
                </div>
                <LocalTemplatePanel config={props.config} />
                <ConfigYamlSection
                  publishBaseUrl={props.config.publishBaseUrl}
                  templateOutput={props.config.template.output}
                  subconverterUrl={subconverterUrl}
                  fetcher={props.fetcher}
                  templateUrl={templateSource === "remote" ? remote.url : undefined}
                />
              </>
            ),
          },
          {
            key: "github",
            label: (
              <Tooltip title="仅需要公网/跨设备访问时使用">
                <span>
                  GitHub 发布 <Tag>可选</Tag>
                </span>
              </Tooltip>
            ),
            children: (
              <GithubPublishPanel
                config={props.config}
                originalConfig={props.originalConfig}
                fetcher={props.fetcher}
                templateStatus={templateStatus}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
