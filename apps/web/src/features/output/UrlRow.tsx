import { Badge } from "antd";
import { Copy } from "lucide-react";
import { notifySuccess } from "../../notify.js";

export function UrlRow({ label, url }: { label: string; url: string }) {
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
