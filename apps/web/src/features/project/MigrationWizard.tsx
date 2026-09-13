import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Space, Steps, Tag } from "antd";
import {
  normalizeAuthorProjectConfig,
  parseAuthorProjectConfigV2,
  renderIni,
  toRouteKitConfig,
  type Diagnostic,
  type MigrationPlan,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import { ValidationBar } from "../../components/ValidationBar.js";
import { createLineDiff } from "../../yamlDiff.js";
import {
  analyzeMigrationRequest,
  applyMigrationRequest,
  type ApplyMigrationOutcome,
  type MigrationAnalysisResult,
} from "./migrateApi.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ApplyState =
  | { kind: "idle" }
  | { kind: "applying" }
  | { kind: "success"; backupPath: string }
  | { kind: "rejected"; diagnostics: Diagnostic[] }
  | { kind: "failed"; message: string };

const STEP_TITLES = [{ title: "分析" }, { title: "语义对比" }, { title: "确认应用" }];

interface SummaryComparison {
  status: "pending" | "identical" | "changed" | "error";
  entries?: ReturnType<typeof createLineDiff>;
  added?: number;
  removed?: number;
  message?: string;
}

/**
 * 基于 plan.yaml 在浏览器端复算迁移后的 INI：
 * parseAuthorProjectConfigV2 → normalizeAuthorProjectConfig → toRouteKitConfig
 * （publishBaseUrl 从当前 v1 配置注入）→ renderIni，与当前 INI 做逐行 diff。
 * 与 core schemaV2Migrate 测试锁定的往返等价链路一致。
 */
function compareIni(plan: MigrationPlan, originalConfig: RouteKitProjectConfig): SummaryComparison {
  try {
    const draft = parseAuthorProjectConfigV2(plan.yaml);
    const { project } = normalizeAuthorProjectConfig(draft);
    const bridged = toRouteKitConfig(project, {
      publishBaseUrl: originalConfig.publishBaseUrl,
    });
    const currentIni = renderIni(originalConfig);
    const nextIni = renderIni(bridged);
    if (currentIni === nextIni) return { status: "identical" };
    const entries = createLineDiff(currentIni, nextIni);
    return {
      status: "changed",
      entries,
      added: entries.filter((entry) => entry.type === "added").length,
      removed: entries.filter((entry) => entry.type === "removed").length,
    };
  } catch (error: unknown) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function SummaryCounts({ plan }: { plan: MigrationPlan }) {
  const summary = plan.summary;
  const counts = [
    { label: "策略组", value: summary.groups },
    { label: "路由", value: summary.routes },
    { label: "规则源", value: summary.providers },
    { label: "成员集合", value: summary.memberSets },
    { label: "问题", value: summary.issues },
  ];
  return (
    <Space size={16} wrap data-testid="migrate-summary">
      {counts.map((count) => (
        <Space key={count.label} size={6}>
          <span className="rk-lib-meta">{count.label}</span>
          <Tag>{count.value}</Tag>
        </Space>
      ))}
    </Space>
  );
}

function DiffPreview({ comparison }: { comparison: SummaryComparison }) {
  const diffLines = (comparison.entries ?? []).map((entry) => {
    if (entry.type === "added") return `+${entry.text}`;
    if (entry.type === "removed") return `-${entry.text}`;
    return ` ${entry.text}`;
  });
  return (
    <div data-testid="migrate-ini-diff">
      <div className="rk-field-label">INI 语义对比（当前 → 迁移后）</div>
      <div className="rk-lib-meta" style={{ marginBottom: 6 }}>
        {`+${comparison.added} / -${comparison.removed}`}
      </div>
      <pre className="rk-ini rk-ini-scroll rk-ini-diff">{diffLines.join("\n")}</pre>
    </div>
  );
}

/**
 * v1 → v2 迁移复核向导（spec 7.1"导入与迁移复核"、plan Task 4 Web 半边）：
 * 只读分析 → 语义对比复核 → 用户确认后原子写入；向导自身不写盘，
 * apply 失败（422 校验拒绝 / 网络错误）停留当前步且不产生部分写入。
 */
export function MigrationWizard(props: {
  open: boolean;
  /** 当前已保存的 v1 配置：语义对比的"当前 INI"基线与 publishBaseUrl 来源。 */
  originalConfig: RouteKitProjectConfig;
  onClose: () => void;
  /** apply 成功后通知外层刷新项目快照。 */
  onMigrated: () => void;
  fetcher?: Fetcher;
}) {
  const fetcher = props.fetcher ?? globalThis.fetch;
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState<MigrationAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<ApplyState>({ kind: "idle" });

  function reset() {
    setStep(0);
    setAnalysis(null);
    setAnalyzing(false);
    setAnalyzeError(null);
    setApplyState({ kind: "idle" });
  }

  function runAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    void analyzeMigrationRequest(fetcher)
      .then((result) => {
        setAnalysis(result);
        setAnalyzing(false);
      })
      .catch((error: unknown) => {
        setAnalyzeError(error instanceof Error ? error.message : String(error));
        setAnalyzing(false);
      });
  }

  useEffect(() => {
    if (!props.open) return;
    reset();
    runAnalyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const plan = analysis?.plan ?? null;
  const comparison = useMemo<SummaryComparison | null>(() => {
    if (step < 1 || !plan) return null;
    return compareIni(plan, props.originalConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, plan, props.originalConfig]);

  const comparisonBlocked = comparison?.status === "error";
  const alreadyV2 = analysis !== null && analysis.currentSchemaVersion === 2;

  function handleApply() {
    if (!plan) return;
    setApplyState({ kind: "applying" });
    void applyMigrationRequest(plan, fetcher)
      .then((outcome: ApplyMigrationOutcome) => {
        if (outcome.ok) {
          setApplyState({ kind: "success", backupPath: outcome.backupPath });
          props.onMigrated();
        } else {
          setApplyState({ kind: "rejected", diagnostics: outcome.diagnostics });
        }
      })
      .catch((error: unknown) => {
        setApplyState({
          kind: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }

  function renderStepContent() {
    if (analyzing) {
      return <Alert type="info" showIcon message="正在分析当前配置…" data-testid="migrate-analyzing" />;
    }
    if (analyzeError) {
      return (
        <Alert
          type="error"
          showIcon
          message="迁移分析失败"
          description={analyzeError}
          action={
            <Button size="small" onClick={runAnalyze}>
              重试
            </Button>
          }
        />
      );
    }
    if (!analysis) return null;
    if (alreadyV2 || !plan) {
      return (
        <Alert
          type="info"
          showIcon
          message="当前项目已是 Schema v2，无需迁移"
          data-testid="migrate-already-v2"
        />
      );
    }
    if (step === 0) {
      return (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div className="rk-lib-meta">
            分析为只读操作，不会改写 config/routes.yaml；请复核迁移摘要与问题后再继续。
          </div>
          <SummaryCounts plan={plan} />
          <ValidationBar diagnostics={plan.issues} canLocate={() => false} onLocate={() => {}} />
        </Space>
      );
    }
    if (step === 1) {
      if (!comparison) return null;
      return (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {comparison.status === "identical" ? (
            <Alert
              type="success"
              showIcon
              message="语义完全一致"
              description="迁移后生成的 INI 与当前 INI 逐字一致。"
              data-testid="migrate-identical"
            />
          ) : null}
          {comparison.status === "changed" ? (
            <Alert
              type="warning"
              showIcon
              message="迁移后 INI 存在差异，请逐行复核"
              data-testid="migrate-changed"
            />
          ) : null}
          {comparison.status === "error" ? (
            <Alert
              type="error"
              showIcon
              message="无法在浏览器复算迁移后的 INI"
              description={comparison.message}
            />
          ) : null}
          {comparison.status === "changed" ? <DiffPreview comparison={comparison} /> : null}
        </Space>
      );
    }
    return (
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {applyState.kind === "success" ? (
          <Alert
            type="success"
            showIcon
            message="迁移已应用"
            description={`原配置已备份到 ${applyState.backupPath}，当前配置已原子写入 Schema v2 YAML。`}
            data-testid="migrate-apply-success"
          />
        ) : null}
        {applyState.kind !== "success" ? (
          <Alert
            type="warning"
            showIcon
            message="应用前会先备份"
            description="应用时会把当前配置备份为 config/routes.yaml.bak-<时间戳>，再原子写入 v2 YAML；校验未通过或失败时保留原文件，不产生部分写入。"
          />
        ) : null}
        {applyState.kind === "rejected" ? (
          <Alert
            type="error"
            showIcon
            message="校验未通过，未写入任何文件"
            description={<ValidationBar diagnostics={applyState.diagnostics} canLocate={() => false} onLocate={() => {}} />}
            data-testid="migrate-apply-rejected"
          />
        ) : null}
        {applyState.kind === "failed" ? (
          <Alert
            type="error"
            showIcon
            message="迁移应用失败，未写入任何文件"
            description={applyState.message}
            data-testid="migrate-apply-failed"
          />
        ) : null}
      </Space>
    );
  }

  const applyDone = applyState.kind === "success";
  const footerButtons = (
    <Space size={8}>
      {!applyDone && step > 0 ? (
        <Button onClick={() => setStep(step - 1)}>上一步</Button>
      ) : null}
      {applyDone ? null : (
        <Button data-testid="migrate-cancel" onClick={props.onClose}>
          取消
        </Button>
      )}
      {applyDone ? (
        <Button type="primary" data-testid="migrate-finish" onClick={props.onClose}>
          完成
        </Button>
      ) : step < 2 ? (
        <Button
          type="primary"
          disabled={!plan || (step === 1 && comparisonBlocked)}
          data-testid="migrate-next"
          onClick={() => setStep(step + 1)}
        >
          下一步
        </Button>
      ) : (
        <Button
          type="primary"
          loading={applyState.kind === "applying"}
          disabled={!plan}
          data-testid="migrate-apply"
          onClick={handleApply}
        >
          应用迁移
        </Button>
      )}
    </Space>
  );

  return (
    <Modal
      title="迁移到 Schema v2"
      open={props.open}
      width={720}
      onCancel={props.onClose}
      footer={footerButtons}
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Steps size="small" current={step} items={STEP_TITLES} />
        {renderStepContent()}
      </Space>
    </Modal>
  );
}
