import { useEffect, useState } from "react";
import { Clipboard, Download } from "lucide-react";
import QRCode from "qrcode";
import { buildSubconverterUrl, parseProviderLines } from "../subscriptions.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function SubscribeAssembler({
  publishBaseUrl,
  templateOutput,
  subconverterUrl,
  fetcher = globalThis.fetch,
}: {
  publishBaseUrl: string;
  templateOutput: string;
  subconverterUrl: string;
  fetcher?: Fetcher;
}) {
  const [providerText, setProviderText] = useState("");
  const [endpoint, setEndpoint] = useState(subconverterUrl);
  const [configVersion, setConfigVersion] = useState<number | undefined>(undefined);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetcher("/api/project/config")
      .then((response) => response.json() as Promise<{ mtime?: number }>)
      .then((data) => {
        if (alive && typeof data.mtime === "number") setConfigVersion(data.mtime);
      })
      .catch(() => {
        /* mtime 仅用于防缓存，取不到则不附加 ?v */
      });
    return () => {
      alive = false;
    };
  }, [fetcher]);

  const providers = parseProviderLines(providerText);
  const url =
    providers.length > 0
      ? buildSubconverterUrl({
          providers,
          publishBaseUrl,
          templateOutput,
          subconverterUrl: endpoint,
          configVersion,
        })
      : "";

  useEffect(() => {
    if (!url) {
      setQrDataUrl("");
      return;
    }
    let alive = true;
    void QRCode.toDataURL(url)
      .then((dataUrl) => {
        if (alive) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (alive) setQrDataUrl("");
      });
    return () => {
      alive = false;
    };
  }, [url]);

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  }

  return (
    <section className="panel publish-panel">
      <div className="panel-heading">
        <div>
          <h2>订阅装配</h2>
          <span>机场链接 → 订阅 URL + 二维码（机场链接仅在本地内存，不入库）</span>
        </div>
      </div>

      <div className="publish-section">
        <label>
          <span>机场订阅链接（每行一条 provider:名,URL）</span>
          <textarea
            aria-label="机场订阅链接"
            placeholder="provider:Air,https://your-airport/sub"
            value={providerText}
            onChange={(event) => setProviderText(event.target.value)}
          />
        </label>
        <label>
          <span>subconverter 地址</span>
          <input
            aria-label="subconverter 地址"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
          />
        </label>
      </div>

      {url ? (
        <div className="publish-section">
          <div className="raw-url-row">
            <a className="command-button" href={url} target="_blank" rel="noreferrer">
              <Download size={15} /> 下载 yaml
            </a>
            <code>{url}</code>
            <button className="icon-button" type="button" aria-label="复制订阅 URL" onClick={copyUrl}>
              <Clipboard size={16} />
            </button>
            {copied ? <small>已复制</small> : null}
          </div>
          {qrDataUrl ? <img className="qr-image" alt="订阅二维码" src={qrDataUrl} /> : null}
        </div>
      ) : (
        <div className="empty-state">粘贴至少一条机场链接以生成订阅 URL 与二维码</div>
      )}
    </section>
  );
}
