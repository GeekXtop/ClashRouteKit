import { useEffect, useMemo, useState } from "react";
import { Badge, Button } from "antd";
import { Copy } from "lucide-react";
import { renderIni, type RouteKitProjectConfig } from "@clash-route-kit/core";
import type { ProjectValidationState } from "../projectController.js";
import { requestLocalAction, type LocalRouteKitAction } from "../actions.js";
import { createRawUrlTemplates, fetchGitRemote, parseGitHubRemote } from "../publishWorkflow.js";
import { notifyError, notifySuccess } from "../notify.js";
import { createLineDiff } from "../yamlDiff.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function UrlRow({ label, url }: { label: string; url: string }) {
  return (
    <div className="rk-url-row">
      <Badge color="blue" text={label} />
      <code>{url}</code>
      <button
        type="button"
        aria-label={`复制 ${label}`}
        className="rk-iconbtn"
        onClick={() => void navigator.clipboard?.writeText(url).then(() => notifySuccess("已复制"))}
      >
        <Copy size={13} />
      </button>
    </div>
  );
}

export function PublishLeftPanel(props: {
  config: RouteKitProjectConfig;
  originalConfig?: RouteKitProjectConfig;
  validation: ProjectValidationState;
  onRunCheck: () => void;
  fetcher?: Fetcher;
}) {
  const fetcher = props.fetcher ?? globalThis.fetch;
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    props.onRunCheck();
    let alive = true;
    void fetchGitRemote(fetcher)
      .then((remote) => {
        const repo = parseGitHubRemote(remote);
        if (alive && repo) setRawUrl(createRawUrlTemplates(repo, props.config.template.output).template);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const localUrl = `${props.config.publishBaseUrl.replace(/\/+$/, "")}/templates/${props.config.template.output}`;
  const iniDiff = useMemo(() => {
    const before = renderIni(props.originalConfig ?? props.config);
    const after = renderIni(props.config);
    return createLineDiff(before, after);
  }, [props.config, props.originalConfig]);
  const diffCounts = {
    added: iniDiff.filter((entry) => entry.type === "added").length,
    removed: iniDiff.filter((entry) => entry.type === "removed").length,
  };
  const diffLines = iniDiff.map((entry) => {
    if (entry.type === "added") return `+${entry.text}`;
    if (entry.type === "removed") return `-${entry.text}`;
    return ` ${entry.text}`;
  });
  const v = props.validation.status;
  const badge =
    v === "error" ? <Badge status="error" text="校验未通过" /> : v === "success" ? <Badge status="success" text="引用完整" /> : <Badge status="default" text="未校验" />;

  async function buildAndPush() {
    setBusy(true);
    try {
      for (const action of ["generate", "git-commit", "git-push"] as LocalRouteKitAction[]) {
        const result = await requestLocalAction(action, fetcher);
        if (!result.ok) {
          notifyError(`${action} 失败：${result.output}`);
          return;
        }
      }
      notifySuccess("已构建并推送到 publish 分支");
    } catch (error: unknown) {
      notifyError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rk-publish-block">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <strong>本机 · 实时</strong>
          <span className="rk-lib-meta">编辑即生效，无需构建推送</span>
        </div>
        <div className="rk-field-label">模板 URL（填进 subconverter / OpenClash 的「自定义模板 URL」）</div>
        <UrlRow label="本机 LAN" url={localUrl} />
        <ul className="rk-oc-hint">
          <li>OpenClash：勾选「在线订阅转换」</li>
          <li>模板 → 自定义模板 → 自定义模板 URL = 本机 LAN 模板 URL</li>
          <li>「使用规则集」（rule-provider）由 subconverter 端决定，OpenClash 自身无此勾选项</li>
        </ul>
      </div>

      <div className="rk-publish-block">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <strong>发布到 GitHub · {props.config.template.output}</strong>
          {badge}
        </div>
        {rawUrl ? (
          <>
            <div className="rk-field-label">发布 raw 模板 URL（推送后生效）</div>
            <UrlRow label="发布 raw" url={rawUrl} />
          </>
        ) : (
          <p className="rk-lib-meta">未检测到 GitHub origin，当前仅本机 LAN 可用</p>
        )}
        <div style={{ marginTop: 12 }}>
          <Button type="primary" loading={busy} onClick={() => void buildAndPush()}>
            构建并推送 publish 分支
          </Button>
          <span className="rk-lib-meta" style={{ marginLeft: 10 }}>
            构建产物 → 提交 → 推送，让发布 raw URL 生效
          </span>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="rk-field-label">INI 变更预览</div>
          <div className="rk-lib-meta" style={{ marginBottom: 6 }}>
            +{diffCounts.added} / -{diffCounts.removed}
          </div>
          <pre data-testid="publish-ini-preview" className="rk-ini rk-ini-scroll rk-ini-diff">
            {diffCounts.added + diffCounts.removed > 0 ? diffLines.join("\n") : renderIni(props.config)}
          </pre>
        </div>
      </div>
    </>
  );
}
