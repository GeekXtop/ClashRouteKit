import { useEffect, useState } from "react";
import { Button, Input, Switch } from "antd";
import { Plus, X } from "lucide-react";
import QRCode from "qrcode";
import type { LocalSubscription } from "@clash-route-kit/core";
import { buildSubconverterUrl } from "../subscriptions.js";
import { fetchSubscriptions, saveSubscriptions } from "../subscriptionsStore.js";
import { notifyError } from "../notify.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let idSeed = 0;

export function ConfigYamlSection(props: {
  publishBaseUrl: string;
  templateOutput: string;
  subconverterUrl: string;
  fetcher?: Fetcher;
}) {
  const fetch = props.fetcher ?? globalThis.fetch;
  const [subs, setSubs] = useState<LocalSubscription[]>([]);
  const [endpoint, setEndpoint] = useState(props.subconverterUrl);
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [qr, setQr] = useState("");

  useEffect(() => {
    let alive = true;
    void fetchSubscriptions(fetch)
      .then((result) => alive && setSubs(result))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fetch]);

  function persist(next: LocalSubscription[]) {
    setSubs(next);
    void saveSubscriptions(next, fetch).catch((error: unknown) =>
      notifyError(error instanceof Error ? error.message : String(error)),
    );
  }

  function patch(id: string, change: Partial<LocalSubscription>) {
    setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, ...change } : s)));
  }

  function generate() {
    const enabled = subs.filter((s) => s.enabled && s.url.trim());
    const url = buildSubconverterUrl({
      providers: enabled,
      publishBaseUrl: props.publishBaseUrl,
      templateOutput: props.templateOutput,
      subconverterUrl: endpoint,
    });
    setGeneratedUrl(url);
    void QRCode.toDataURL(`clash://install-config?url=${encodeURIComponent(url)}`)
      .then(setQr)
      .catch(() => setQr(""));
  }

  return (
    <div className="rk-publish-block">
      <strong>② 装配 config.yaml（导入设备）</strong>
      <div className="rk-field-label" style={{ marginTop: 8 }}>
        我的订阅（仅存本地，不进 git）
      </div>
      {subs.map((sub) => (
        <div key={sub.id} className="rk-url-row" style={{ gap: 6 }}>
          <Input
            placeholder="名称"
            value={sub.name}
            style={{ width: 110 }}
            onChange={(e) => patch(sub.id, { name: e.target.value })}
            onBlur={() => persist(subs)}
          />
          <Input
            placeholder="订阅 URL"
            value={sub.url}
            onChange={(e) => patch(sub.id, { url: e.target.value })}
            onBlur={() => persist(subs)}
          />
          <Switch size="small" checked={sub.enabled} onChange={(checked) => persist(subs.map((s) => (s.id === sub.id ? { ...s, enabled: checked } : s)))} />
          <button
            type="button"
            aria-label={`删除订阅 ${sub.name || sub.id}`}
            className="rk-iconbtn rk-del"
            onClick={() => persist(subs.filter((s) => s.id !== sub.id))}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      <Button
        size="small"
        icon={<Plus size={13} />}
        onClick={() => persist([...subs, { id: `sub-${(idSeed += 1)}-${subs.length}`, name: "", url: "", enabled: true }])}
      >
        添加订阅
      </Button>

      <div className="rk-field-label" style={{ marginTop: 10 }}>
        SubConverter 端点
      </div>
      <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />

      <div style={{ marginTop: 10 }}>
        <Button type="primary" onClick={generate}>
          生成 config.yaml
        </Button>
      </div>
      {generatedUrl ? (
        <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
          <a href={generatedUrl} download="config.yaml">
            <Button>下载</Button>
          </a>
          {qr ? <img src={qr} alt="config.yaml 二维码" width={96} height={96} /> : null}
          <span className="rk-lib-meta">扫码 clash://install-config 导入其它设备</span>
        </div>
      ) : null}
    </div>
  );
}
