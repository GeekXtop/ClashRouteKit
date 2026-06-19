import { useEffect, useState } from "react";
import { Input, Modal, Select, Space, Switch } from "antd";
import type { VendorRepoInput } from "../catalog.js";
import { notifyError } from "../notify.js";

type Kind = NonNullable<VendorRepoInput["catalog"]>["kind"];
const KINDS: Kind[] = ["domain-list", "list-dir", "provider-yaml", "ini-template"];

export function RepoModal(props: {
  open: boolean;
  mode: "add" | "edit";
  initial?: { name: string; url: string; branch?: string; reldir?: string; kind?: Kind };
  onSubmit: (input: VendorRepoInput) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(props.initial?.name ?? "");
  const [url, setUrl] = useState(props.initial?.url ?? "");
  const [branch, setBranch] = useState(props.initial?.branch ?? "");
  const [pinned, setPinned] = useState(Boolean(props.initial?.branch));
  const [kind, setKind] = useState<Kind>(props.initial?.kind ?? "list-dir");
  const [reldir, setReldir] = useState(props.initial?.reldir ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(props.initial?.name ?? "");
    setUrl(props.initial?.url ?? "");
    setBranch(props.initial?.branch ?? "");
    setPinned(Boolean(props.initial?.branch));
    setKind(props.initial?.kind ?? "list-dir");
    setReldir(props.initial?.reldir ?? "");
  }, [props.initial, props.open]);

  async function submit() {
    const input: VendorRepoInput = {
      name: name.trim(),
      url: url.trim(),
      ...(pinned && branch.trim() ? { branch: branch.trim() } : {}),
      ...(reldir.trim() ? { catalog: { reldir: reldir.trim(), kind } } : {}),
    };
    setBusy(true);
    try {
      await props.onSubmit(input);
      props.onClose();
    } catch (error: unknown) {
      notifyError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={props.open}
      onCancel={props.onClose}
      onOk={() => void submit()}
      okText="保存"
      cancelText="取消"
      confirmLoading={busy}
      title={props.mode === "add" ? "添加上游仓库" : "编辑上游仓库"}
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <div>
          <div className="rk-field-label">名称</div>
          <Input aria-label="名称" value={name} onChange={(e) => setName(e.target.value)} disabled={props.mode === "edit"} />
        </div>
        <div>
          <div className="rk-field-label">Git URL</div>
          <Input aria-label="Git URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div>
          <div className="rk-field-label">分支</div>
          <Space>
            <Input aria-label="分支" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="默认分支" style={{ width: 200 }} />
            <Switch checked={pinned} onChange={setPinned} /> <span className="rk-field-label">钉住</span>
          </Space>
        </div>
        <div>
          <div className="rk-field-label">数据类型</div>
          <Select
            aria-label="数据类型"
            style={{ width: "100%" }}
            value={kind}
            options={KINDS.map((k) => ({ value: k, label: k }))}
            onChange={setKind}
          />
        </div>
        <div>
          <div className="rk-field-label">数据目录（仓库内相对路径，如 data / Clash / rule）</div>
          <Input aria-label="数据目录" value={reldir} onChange={(e) => setReldir(e.target.value)} placeholder="留空＝不浏览此仓库" />
        </div>
      </Space>
    </Modal>
  );
}
