import { useEffect, useState } from "react";
import { Button, Input, Modal, Popconfirm, Select, Space } from "antd";
import type { VendorRepoInput } from "../catalog.js";
import { notifyError } from "../notify.js";

type Kind = NonNullable<VendorRepoInput["catalog"]>["kind"];
const KINDS: Kind[] = ["domain-list", "list-dir", "provider-yaml", "ini-template"];

/** Default local folder = the git repo's basename (e.g. .../Custom_OpenClash_Rules.git → Custom_OpenClash_Rules). */
function repoFolderFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.split(/[/:]/).pop() ?? "";
}

export function RepoModal(props: {
  open: boolean;
  mode: "add" | "edit";
  initial?: { name: string; url: string; branch?: string; folder?: string; reldir?: string; kind?: Kind; templateReldir?: string };
  onSubmit: (input: VendorRepoInput) => Promise<void>;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(props.initial?.name ?? "");
  const [url, setUrl] = useState(props.initial?.url ?? "");
  const [branch, setBranch] = useState(props.initial?.branch ?? "");
  const [folder, setFolder] = useState(props.initial?.folder ?? "");
  const [kind, setKind] = useState<Kind>(props.initial?.kind ?? "list-dir");
  const [reldir, setReldir] = useState(props.initial?.reldir ?? "");
  const [templateReldir, setTemplateReldir] = useState(props.initial?.templateReldir ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(props.initial?.name ?? "");
    setUrl(props.initial?.url ?? "");
    setBranch(props.initial?.branch ?? "");
    setFolder(props.initial?.folder ?? "");
    setKind(props.initial?.kind ?? "list-dir");
    setReldir(props.initial?.reldir ?? "");
    setTemplateReldir(props.initial?.templateReldir ?? "");
  }, [props.initial, props.open]);

  // The folder shown/used for relative dirs: explicit field, else derived from the URL, else the name.
  const resolvedFolder = folder.trim() || repoFolderFromUrl(url) || name.trim();

  async function submit() {
    const input: VendorRepoInput = {
      name: name.trim(),
      url: url.trim(),
      ...(branch.trim() ? { branch: branch.trim() } : {}),
      ...(resolvedFolder ? { folder: resolvedFolder } : {}),
      ...(reldir.trim() ? { catalog: { reldir: reldir.trim(), kind } } : {}),
      ...(templateReldir.trim() ? { templateReldir: templateReldir.trim() } : {}),
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
          <Input aria-label="名称" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="rk-field-label">Git URL</div>
          <Input aria-label="Git URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div>
          <div className="rk-field-label">本地文件夹（克隆到 vendor/ 下的目录名；改名后清空旧目录并重新同步）</div>
          <Input
            aria-label="本地文件夹"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder={repoFolderFromUrl(url) || "默认取 Git URL 仓库名"}
          />
        </div>
        <div>
          <div className="rk-field-label">分支（留空＝默认分支）</div>
          <Input aria-label="分支" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="默认分支" />
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
          <div className="rk-field-label">数据目录（相对本地文件夹，如 data / Clash / rule；留空＝不浏览）</div>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              aria-label="数据目录前缀"
              readOnly
              value={`${resolvedFolder || "文件夹"}/`}
              style={{ width: "42%", color: "var(--rk-muted)" }}
            />
            <Input
              aria-label="数据目录"
              value={reldir}
              onChange={(e) => setReldir(e.target.value)}
              style={{ flex: 1 }}
            />
          </Space.Compact>
        </div>
        <div>
          <div className="rk-field-label">模板目录（可选，相对本地文件夹的 .ini 模板路径，如 Clash/config / cfg）</div>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              aria-label="模板目录前缀"
              readOnly
              value={`${resolvedFolder || "文件夹"}/`}
              style={{ width: "42%", color: "var(--rk-muted)" }}
            />
            <Input
              aria-label="模板目录"
              value={templateReldir}
              onChange={(e) => setTemplateReldir(e.target.value)}
              style={{ flex: 1 }}
            />
          </Space.Compact>
        </div>
        {props.mode === "edit" && props.onRemove ? (
          <Popconfirm
            title={`移除上游仓库 ${name}？`}
            okText="移除"
            cancelText="取消"
            onConfirm={() => {
              props.onRemove?.();
              props.onClose();
            }}
          >
            <Button danger>移除仓库</Button>
          </Popconfirm>
        ) : null}
      </Space>
    </Modal>
  );
}
