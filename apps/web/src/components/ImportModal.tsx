import { useEffect, useState } from "react";
import { Input, Modal, Segmented, Select, Space } from "antd";
import {
  fetchCatalogEntries,
  fetchCatalogTemplate,
  type CatalogSourceInfo,
} from "../catalog.js";
import { notifyError } from "../notify.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Mode = "template" | "paste";

export function ImportModal(props: {
  open: boolean;
  sources: CatalogSourceInfo[];
  onClose: () => void;
  onImport: (text: string) => void;
  fetcher?: Fetcher;
}) {
  const fetcher = props.fetcher ?? globalThis.fetch;
  const [mode, setMode] = useState<Mode>("template");
  const [paste, setPaste] = useState("");
  const [origin, setOrigin] = useState("");
  const [templates, setTemplates] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateText, setTemplateText] = useState("");

  const templateRepos = props.sources.filter((s) => s.originKind === "ini-template");

  useEffect(() => {
    if (!origin) return;
    let alive = true;
    void fetchCatalogEntries(origin, fetcher)
      .then((entries) => alive && setTemplates(entries.map((e) => e.name)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [origin, fetcher]);

  useEffect(() => {
    if (!origin || !templateName) return;
    let alive = true;
    void fetchCatalogTemplate(origin, templateName, fetcher)
      .then((ini) => alive && setTemplateText(ini))
      .catch((error: unknown) => notifyError(error instanceof Error ? error.message : String(error)));
    return () => {
      alive = false;
    };
  }, [origin, templateName, fetcher]);

  const text = mode === "paste" ? paste : templateText;

  function emit() {
    if (!text.trim()) return;
    props.onImport(text);
    props.onClose();
  }

  return (
    <Modal
      open={props.open}
      onCancel={props.onClose}
      title="导入模板（覆盖现有配置）"
      width={680}
      okText="覆盖导入"
      cancelText="取消"
      onOk={emit}
    >
      <Segmented
        options={[
          { value: "template", label: "模板库" },
          { value: "paste", label: "粘贴 INI" },
        ]}
        value={mode}
        onChange={(value) => setMode(value as Mode)}
        style={{ marginBottom: 12 }}
      />
      {mode === "template" ? (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Select
            placeholder="选择模板仓库（ini-template）"
            style={{ width: "100%" }}
            value={origin || undefined}
            options={templateRepos.map((s) => ({ value: s.id, label: s.label }))}
            onChange={setOrigin}
          />
          <Select
            placeholder="选择模板"
            style={{ width: "100%" }}
            value={templateName || undefined}
            options={templates.map((t) => ({ value: t, label: t }))}
            onChange={setTemplateName}
          />
          {templateRepos.length === 0 ? (
            <p className="rk-lib-meta">暂无 ini-template 类型的上游仓库；可在规则库添加，或用「粘贴 INI」。</p>
          ) : null}
        </Space>
      ) : (
        <Input.TextArea
          placeholder="粘贴 SubConverter [custom] INI 文本…"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={12}
          spellCheck={false}
        />
      )}
    </Modal>
  );
}
