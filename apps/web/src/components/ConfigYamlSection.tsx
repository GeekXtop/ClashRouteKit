import { useState } from "react";
import { Button, Input, Select, Switch } from "antd";
import { Plus, X } from "lucide-react";
import QRCode from "qrcode";
import { buildSubconverterUrl, type ProviderSubscription, type SubconverterConvertOptions } from "../subscriptions.js";

let idSeed = 0;

const UA_PRESETS = ["clash-verge/v2.4.5", "clash.meta/1.19.20", "Clash"];
const CONVERT_TOGGLES: { key: keyof SubconverterConvertOptions; label: string }[] = [
  { key: "emoji", label: "Emoji" },
  { key: "udp", label: "UDP" },
  { key: "skipCertVerify", label: "跳过证书校验" },
  { key: "sort", label: "排序" },
  { key: "appendType", label: "附加节点类型" },
  { key: "ruleProvider", label: "使用规则集" },
];

export function ConfigYamlSection(props: {
  publishBaseUrl: string;
  templateOutput: string;
  subconverterUrl: string;
}) {
  const [subs, setSubs] = useState<ProviderSubscription[]>([]);
  const [endpoint, setEndpoint] = useState(props.subconverterUrl);
  const [convert, setConvert] = useState<SubconverterConvertOptions>({ emoji: false, sort: false });
  const [configName, setConfigName] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [qr, setQr] = useState("");

  function patch(id: string, change: Partial<ProviderSubscription>) {
    setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, ...change } : s)));
  }
  function patchConvert(change: Partial<SubconverterConvertOptions>) {
    setConvert((c) => ({ ...c, ...change }));
  }

  function generate() {
    const enabled = subs.filter((s) => s.enabled && s.url.trim());
    const url = buildSubconverterUrl({
      providers: enabled,
      publishBaseUrl: props.publishBaseUrl,
      templateOutput: props.templateOutput,
      subconverterUrl: endpoint,
      convert: { ...convert, filename: configName.trim() || undefined },
    });
    setGeneratedUrl(url);
    void QRCode.toDataURL(`clash://install-config?url=${encodeURIComponent(url)}`)
      .then(setQr)
      .catch(() => setQr(""));
  }

  const downloadName = `${configName.trim() || "config"}.yaml`;

  return (
    <div className="rk-publish-block">
      <h3 style={{ marginTop: 0 }}>导出 config.yaml（导入设备）</h3>

      <div className="rk-field-label">配置名称（客户端里显示的订阅名）</div>
      <Input placeholder="如：家庭 / 旅行（留空则用 config）" value={configName} onChange={(e) => setConfigName(e.target.value)} />

      <div className="rk-field-label" style={{ marginTop: 12 }}>我的订阅（仅本次会话，不落盘）</div>
      {subs.map((sub) => (
        <div key={sub.id} className="rk-url-row" style={{ gap: 6 }}>
          <Input placeholder="名称" value={sub.name} style={{ width: 110 }} onChange={(e) => patch(sub.id, { name: e.target.value })} />
          <Input placeholder="订阅 URL" value={sub.url} onChange={(e) => patch(sub.id, { url: e.target.value })} />
          <Switch size="small" checked={sub.enabled} onChange={(checked) => patch(sub.id, { enabled: checked })} />
          <button
            type="button"
            aria-label={`删除订阅 ${sub.name || sub.id}`}
            className="rk-iconbtn rk-del"
            onClick={() => setSubs((prev) => prev.filter((s) => s.id !== sub.id))}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <Button
        size="small"
        icon={<Plus size={13} />}
        onClick={() => setSubs((prev) => [...prev, { id: `sub-${(idSeed += 1)}`, name: "", url: "", enabled: true }])}
      >
        添加订阅
      </Button>

      <div className="rk-field-label" style={{ marginTop: 12 }}>SubConverter 端点</div>
      <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />

      <div className="rk-field-label" style={{ marginTop: 12 }}>User-Agent</div>
      <Select
        style={{ width: "100%" }}
        allowClear
        showSearch
        placeholder="默认（不指定）"
        value={convert.ua || undefined}
        options={UA_PRESETS.map((u) => ({ value: u, label: u }))}
        onChange={(value) => patchConvert({ ua: value })}
      />

      <div className="rk-field-label" style={{ marginTop: 10 }}>开关</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {CONVERT_TOGGLES.map((t) => (
          <label key={t.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Switch size="small" checked={Boolean(convert[t.key])} onChange={(checked) => patchConvert({ [t.key]: checked })} />
            <span className="rk-lib-meta">{t.label}</span>
          </label>
        ))}
      </div>

      <div className="rk-field-label" style={{ marginTop: 10 }}>筛选节点（名称匹配，& = 同时包含）</div>
      <Select mode="tags" style={{ width: "100%" }} placeholder="例：香港 ／ 台湾&bgp ／ 新加坡&bgp&奈飞" value={convert.include ?? []} onChange={(v) => patchConvert({ include: v })} />

      <div className="rk-field-label" style={{ marginTop: 10 }}>排除节点</div>
      <Select mode="tags" style={{ width: "100%" }} placeholder="例：过期 ／ 官网&流量" value={convert.exclude ?? []} onChange={(v) => patchConvert({ exclude: v })} />

      <div className="rk-field-label" style={{ marginTop: 10 }}>自定义参数（key=value）</div>
      <Select mode="tags" style={{ width: "100%" }} placeholder="如 rename=match@replace" value={convert.customParams ?? []} onChange={(v) => patchConvert({ customParams: v })} />

      <div style={{ marginTop: 14 }}>
        <Button type="primary" onClick={generate}>生成 config.yaml</Button>
      </div>
      {generatedUrl ? (
        <div style={{ marginTop: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <a href={generatedUrl} download={downloadName}>
            <Button>下载</Button>
          </a>
          {qr ? <img src={qr} alt="config.yaml 二维码" width={104} height={104} /> : null}
          <span className="rk-lib-meta">扫码 clash://install-config 导入其它设备</span>
        </div>
      ) : null}
    </div>
  );
}
