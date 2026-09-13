import { useEffect } from "react";
import { Space, Tabs, Tag, Tooltip } from "antd";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { ProjectValidationState } from "../../projectController.js";
import { ConfigYamlSection } from "../../components/ConfigYamlSection.js";
import { detectSchemaVersion } from "../project/projectMeta.js";
import { createLocalTemplateUrl, LocalTemplatePanel } from "./LocalTemplatePanel.js";
import { GithubPublishPanel } from "./GithubPublishPanel.js";

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

/** 输出页：设备配置（默认标签）与 GitHub 发布（可选标签）共用顶部项目状态。 */
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

  const localUrl = createLocalTemplateUrl(props.config.publishBaseUrl, props.config.template.output);
  const subconverterUrl = props.config.subconverterUrl ?? "http://10.0.0.3:25500/sub";

  return (
    <div className="rk-publish-flow" data-testid="output-page">
      <div className="rk-publish-block" data-testid="output-shared-header">
        <Space size={16} wrap>
          <SchemaTag yaml={props.originalYaml ?? ""} />
          <ValidationTag validation={props.validation} />
          <Space size={6}>
            <span className="rk-lib-meta">本地实时模板 URL</span>
            <code>{localUrl}</code>
          </Space>
        </Space>
      </div>
      <Tabs
        defaultActiveKey="device"
        items={[
          {
            key: "device",
            label: "设备配置",
            children: (
              <>
                <LocalTemplatePanel config={props.config} />
                <ConfigYamlSection
                  publishBaseUrl={props.config.publishBaseUrl}
                  templateOutput={props.config.template.output}
                  subconverterUrl={subconverterUrl}
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
              />
            ),
          },
        ]}
      />
    </div>
  );
}
