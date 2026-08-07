import { useEffect, useState } from "react";
import { Button, Input, Popconfirm, Space, Tag } from "antd";
import { deleteRuleFile, loadRuleFile, saveRuleFile } from "../ruleFiles.js";
import { notifyError, notifySuccess } from "../notify.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type SaveState = "loading" | "saved" | "dirty" | "saving" | "error";

const AUTO_SAVE_DELAY_MS = 600;

const SAVE_META: Record<SaveState, { label: string; color: string }> = {
  loading: { label: "读取中…", color: "default" },
  saved: { label: "已保存", color: "success" },
  dirty: { label: "待保存", color: "warning" },
  saving: { label: "保存中…", color: "processing" },
  error: { label: "保存失败", color: "error" },
};

export function ListFileEditor({
  file,
  fetcher,
  onDeleted,
}: {
  file: string;
  fetcher?: Fetcher;
  onDeleted?: (file: string) => void;
}) {
  const request = fetcher ?? globalThis.fetch;
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState<string | null>(null);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [busy, setBusy] = useState<"delete" | null>(null);

  useEffect(() => {
    let alive = true;
    setText("");
    setSavedText(null);
    setLoadedFile(null);
    setSaveState("loading");
    void loadRuleFile(file, request)
      .then((result) => {
        if (!alive) return;
        setText(result.text);
        setSavedText(result.text);
        setLoadedFile(result.file);
        setSaveState("saved");
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setSaveState("error");
        notifyError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, [file, request]);

  useEffect(() => {
    if (loadedFile !== file || savedText === null) return;
    if (text === savedText) {
      setSaveState((current) => (current === "saved" ? current : "saved"));
      return;
    }
    if (busy === "delete") return;

    let alive = true;
    setSaveState("dirty");
    const timer = setTimeout(() => {
      setSaveState("saving");
      void saveRuleFile(file, text, request)
        .then((result) => {
          if (!alive) return;
          setSavedText(result.text);
          setText((current) => (current === text ? result.text : current));
          setSaveState("saved");
        })
        .catch((error: unknown) => {
          if (!alive) return;
          setSaveState("error");
          notifyError(error instanceof Error ? error.message : String(error));
        });
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [busy, file, loadedFile, request, savedText, text]);

  async function remove() {
    setBusy("delete");
    try {
      const result = await deleteRuleFile(file, request);
      notifySuccess(`已删除 ${file}`);
      onDeleted?.(result.file);
    } catch (error: unknown) {
      notifyError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const saveMeta = SAVE_META[saveState];

  return (
    <div className="rk-page-col" style={{ height: "100%", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>{file}</strong>
        <Space>
          <Tag color={saveMeta.color} aria-label="保存状态">
            {saveMeta.label}
          </Tag>
          <Popconfirm title={`删除文件 ${file}？`} okText="删除文件" cancelText="取消" onConfirm={() => void remove()}>
            <Button danger size="small" loading={busy === "delete"}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      </div>
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ flex: 1, fontFamily: "ui-monospace, monospace", resize: "none" }}
        spellCheck={false}
      />
    </div>
  );
}
