import { useEffect, useState } from "react";
import { Badge } from "antd";
import { Copy } from "lucide-react";
import type { ProjectValidationState } from "../projectController.js";
import { createRawUrlTemplates, fetchGitRemote, parseGitHubRemote } from "../publishWorkflow.js";
import { notifySuccess } from "../notify.js";

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

export function PublishTemplateSection(props: {
  templateOutput: string;
  publishBaseUrl: string;
  validation: ProjectValidationState;
  onRunCheck: () => void;
  fetcher?: Fetcher;
}) {
  const fetcher = props.fetcher ?? globalThis.fetch;
  const [rawUrl, setRawUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchGitRemote(fetcher)
      .then((remote) => {
        const repo = parseGitHubRemote(remote);
        if (alive && repo) setRawUrl(createRawUrlTemplates(repo, props.templateOutput).template);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetcher, props.templateOutput]);

  const localUrl = `${props.publishBaseUrl.replace(/\/+$/, "")}/templates/${props.templateOutput}`;
  const ok = props.validation.status === "success";
  const badge =
    props.validation.status === "error" ? (
      <Badge status="error" text="校验未通过" />
    ) : ok ? (
      <Badge status="success" text="引用完整" />
    ) : (
      <Badge status="default" text="未校验" />
    );

  return (
    <div className="rk-publish-block">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>模板：{props.templateOutput}</strong>
        {badge}
      </div>
      <div className="rk-field-label">模板 URL（填进 subconverter / OpenClash 自定义模板）</div>
      <UrlRow label="本机 LAN" url={localUrl} />
      {rawUrl ? <UrlRow label="发布 raw" url={rawUrl} /> : null}
      <p className="rk-lib-meta">本机 URL 须用 LAN IP（127.0.0.1 路由器访问不到）；不同网用发布 raw。</p>
    </div>
  );
}
