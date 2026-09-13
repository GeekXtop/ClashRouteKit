import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import { UrlRow } from "./UrlRow.js";

export function createLocalTemplateUrl(publishBaseUrl: string, templateOutput: string): string {
  return `${publishBaseUrl.replace(/\/+$/, "")}/templates/${templateOutput}`;
}

/** 设备配置标签页的本地实时模板说明块（自旧 PublishLeftPanel 拆出）。 */
export function LocalTemplatePanel({ config }: { config: RouteKitProjectConfig }) {
  const localUrl = createLocalTemplateUrl(config.publishBaseUrl, config.template.output);
  return (
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
      <p className="rk-lib-meta" style={{ marginTop: 8 }}>
        注意：SubConverter 需能访问本机 LAN 地址。
      </p>
    </div>
  );
}
