import { useState } from "react";
import { Alert, Button, Card, Col, Row, Space, Tag } from "antd";
import { FilePlus2, FolderOpen, Upload } from "lucide-react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import type { ProjectStatus, ProjectValidationState, ProjectView } from "../../projectController.js";
import type { ProjectSchemaVersion } from "./projectMeta.js";
import { detectSchemaVersion, isEmptyProjectConfig } from "./projectMeta.js";
import { MigrationWizard } from "./MigrationWizard.js";

const workViewLabels: Record<"library" | "routing" | "output", string> = {
  library: "规则库",
  routing: "路由",
  output: "输出",
};

function SchemaVersionTag({ version }: { version: ProjectSchemaVersion }) {
  return (
    <Space size={6}>
      <Tag color={version === 2 ? "success" : "warning"}>{`Schema v${version}`}</Tag>
      {version === 1 ? <span className="rk-lib-meta">无 schemaVersion 声明</span> : null}
    </Space>
  );
}

function ValidationSummary({
  validation,
  onRunCheck,
}: {
  validation: ProjectValidationState;
  onRunCheck: () => void;
}) {
  const tag =
    validation.status === "success" ? (
      <Tag color="success">校验通过</Tag>
    ) : validation.status === "error" ? (
      <Tag color="error">校验未通过</Tag>
    ) : validation.status === "running" ? (
      <Tag color="processing">校验中</Tag>
    ) : (
      <Tag>未校验</Tag>
    );
  const summary = validation.output.split("\n").find((line) => line.trim()) ?? "";
  return (
    <Space size={8} wrap>
      {tag}
      {summary ? <span className="rk-lib-meta">{summary}</span> : null}
      <Button size="small" onClick={onRunCheck}>
        运行检查
      </Button>
    </Space>
  );
}

function DomainCards({
  config,
  onNavigate,
}: {
  config: RouteKitProjectConfig;
  onNavigate: (view: ProjectView) => void;
}) {
  const providers = config.ruleProviders ?? [];
  const domains: {
    key: ProjectView;
    title: string;
    description: string;
    meta: string;
  }[] = [
    { key: "project", title: "项目", description: "导入、迁移与项目状态", meta: "config/routes.yaml" },
    {
      key: "library",
      title: "规则库",
      description: "补全来源、维护规则集与仓库设置",
      meta: `${providers.length} 个规则源`,
    },
    {
      key: "routing",
      title: "路由",
      description: "编排规则顺序、编辑策略组",
      meta: `${config.ruleSets.length} 条路由 · ${config.customProxyGroups.length} 个策略组`,
    },
    {
      key: "output",
      title: "输出",
      description: "生成设备配置、可选 GitHub 发布",
      meta: config.template.output,
    },
  ];
  return (
    <Row gutter={[12, 12]}>
      {domains.map((domain) => (
        <Col key={domain.key} xs={24} sm={12} lg={6}>
          <Card
            size="small"
            hoverable={domain.key !== "project"}
            onClick={domain.key === "project" ? undefined : () => onNavigate(domain.key)}
            title={
              <Space size={8}>
                {domain.title}
                {domain.key === "project" ? <Tag>当前所在</Tag> : null}
              </Space>
            }
          >
            <div className="rk-lib-meta">{domain.description}</div>
            <div style={{ marginTop: 6, fontSize: 12 }}>{domain.meta}</div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}

function EmptyProjectState({
  onOpenImport,
  onCreateBlankProject,
}: {
  onOpenImport: () => void;
  onCreateBlankProject: () => void;
}) {
  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>尚未创建项目</h2>
      <p className="rk-lib-meta">导入一份现有 SubConverter 模板，或从空白项目开始维护路由规则。</p>
      <Space size={12} wrap>
        <Button type="primary" icon={<Upload size={14} />} onClick={onOpenImport}>
          导入现有模板
        </Button>
        <Button icon={<FilePlus2 size={14} />} onClick={onCreateBlankProject}>
          创建空白项目
        </Button>
      </Space>
    </Card>
  );
}

function ExistingProjectState(props: {
  config: RouteKitProjectConfig;
  originalYaml: string;
  originalConfig: RouteKitProjectConfig;
  schemaVersion: ProjectSchemaVersion;
  status: ProjectStatus;
  message: string;
  dirty: boolean;
  validation: ProjectValidationState;
  lastWorkView: ProjectView;
  onNavigate: (view: ProjectView) => void;
  onOpenImport: () => void;
  onRunCheck: () => void;
  onMigrated: () => void;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const lastWorkLabel = props.lastWorkView === "project" ? "路由" : workViewLabels[props.lastWorkView];
  return (
    <>
      <Card title="项目状态">
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          {props.status === "error" ? <Alert type="error" showIcon message={props.message} /> : null}
          <Space size={24} wrap>
            <Space size={8}>
              <FolderOpen size={14} className="rk-lib-meta" />
              <span>config/routes.yaml</span>
              {props.dirty ? <Tag color="processing">有未保存修改</Tag> : <Tag>无未保存修改</Tag>}
            </Space>
            <SchemaVersionTag version={props.schemaVersion} />
          </Space>
          <ValidationSummary validation={props.validation} onRunCheck={props.onRunCheck} />
          <Space size={12} wrap>
            <Button type="primary" onClick={() => props.onNavigate(props.lastWorkView === "project" ? "routing" : props.lastWorkView)}>
              {`继续编辑（${lastWorkLabel}）`}
            </Button>
            <Button onClick={props.onOpenImport}>重新导入</Button>
          </Space>
        </Space>
      </Card>
      {props.schemaVersion === 1 ? (
        <Alert
          type="info"
          showIcon
          message="此项目使用 Schema v1，可迁移到 v2（稳定 ID 与成员集合）"
          description="迁移需要逐项复核变更摘要与语义对比，确认后才会原子写入；不会在后台自动改写配置。"
          action={
            <Button size="small" data-testid="open-migration-wizard" onClick={() => setWizardOpen(true)}>
              了解迁移
            </Button>
          }
        />
      ) : (
        <Alert
          type="success"
          showIcon
          message="此项目已使用 Schema v2（稳定 ID 与成员集合）"
          description="v2 实体编辑即将支持；其他工作域页面暂按 v1 投影只读浏览。"
          data-testid="schema-v2-overview"
        />
      )}
      <DomainCards config={props.config} onNavigate={props.onNavigate} />
      <MigrationWizard
        open={wizardOpen}
        originalConfig={props.originalConfig}
        onClose={() => setWizardOpen(false)}
        onMigrated={props.onMigrated}
      />
    </>
  );
}

export function ProjectPage(props: {
  config: RouteKitProjectConfig;
  originalYaml: string;
  originalConfig?: RouteKitProjectConfig;
  schemaVersion?: ProjectSchemaVersion;
  status: ProjectStatus;
  message: string;
  dirty: boolean;
  validation: ProjectValidationState;
  lastWorkView: ProjectView;
  onNavigate: (view: ProjectView) => void;
  onOpenImport: () => void;
  onRunCheck: () => void;
  onCreateBlankProject: () => void;
  onMigrated?: () => void;
}) {
  // 快照未提供 schemaVersion 时（旧调用方/测试）退回轻量探测。
  const schemaVersion = props.schemaVersion ?? detectSchemaVersion(props.originalYaml);
  return (
    <div className="rk-publish-flow" data-testid="project-page">
      {isEmptyProjectConfig(props.config) ? (
        <EmptyProjectState
          onOpenImport={props.onOpenImport}
          onCreateBlankProject={props.onCreateBlankProject}
        />
      ) : (
        <ExistingProjectState
          config={props.config}
          originalYaml={props.originalYaml}
          originalConfig={props.originalConfig ?? props.config}
          schemaVersion={schemaVersion}
          status={props.status}
          message={props.message}
          dirty={props.dirty}
          validation={props.validation}
          lastWorkView={props.lastWorkView}
          onNavigate={props.onNavigate}
          onOpenImport={props.onOpenImport}
          onRunCheck={props.onRunCheck}
          onMigrated={props.onMigrated ?? (() => {})}
        />
      )}
    </div>
  );
}
