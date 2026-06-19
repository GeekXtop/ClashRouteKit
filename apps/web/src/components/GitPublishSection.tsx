import { useState } from "react";
import { Button, Space } from "antd";
import { requestLocalAction, type LocalRouteKitAction } from "../actions.js";
import { notifyError, notifySuccess } from "../notify.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function GitPublishSection({ rawTemplateUrl, fetcher }: { rawTemplateUrl: string | null; fetcher?: Fetcher }) {
  const fetch = fetcher ?? globalThis.fetch;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function buildAndPush() {
    setBusy(true);
    try {
      for (const action of ["generate", "git-commit", "git-push"] as LocalRouteKitAction[]) {
        const result = await requestLocalAction(action, fetch);
        if (!result.ok) {
          notifyError(`${action} 失败：${result.output}`);
          return;
        }
      }
      notifySuccess("已构建并推送到 publish 分支");
      const st = await requestLocalAction("git-status", fetch);
      setStatus(st.output);
    } catch (error: unknown) {
      notifyError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rk-publish-block">
      <strong>① 发布模板（Git）</strong>
      <p className="rk-lib-meta">构建产物 → 提交 → 推送 publish 分支，让发布 raw URL 生效。</p>
      <Space>
        <Button type="primary" loading={busy} onClick={() => void buildAndPush()}>
          构建并推送 publish 分支
        </Button>
      </Space>
      {status ? <pre className="rk-ini">{status}</pre> : null}
      <div className="rk-publish-block" style={{ marginTop: 10, background: "#11161f" }}>
        <div className="rk-field-label">OpenClash「编辑订阅」对照填写</div>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#cdd3df" }}>
          <li>☑ 在线订阅转换</li>
          <li>订阅转换服务地址：你的 subconverter /sub</li>
          <li>模板 → 自定义模板 → 自定义模板 URL = {rawTemplateUrl ?? "（推送后获得发布 raw URL）"}</li>
          <li>User-Agent：clash.meta</li>
          <li>Use Rule Provider：规则用到 provider 且设备支持时勾选</li>
        </ul>
      </div>
    </div>
  );
}
