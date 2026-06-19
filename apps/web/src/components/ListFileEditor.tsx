import { useEffect, useState } from "react";
import { Button, Input } from "antd";
import { loadRuleFile, saveRuleFile } from "../ruleFiles.js";
import { notifyError, notifySuccess } from "../notify.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function ListFileEditor({ file, fetcher }: { file: string; fetcher?: Fetcher }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadRuleFile(file, fetcher ?? globalThis.fetch)
      .then((result) => alive && setText(result.text))
      .catch((error: unknown) => notifyError(error instanceof Error ? error.message : String(error)));
    return () => {
      alive = false;
    };
  }, [file, fetcher]);

  async function save() {
    setBusy(true);
    try {
      const result = await saveRuleFile(file, text, fetcher ?? globalThis.fetch);
      setText(result.text);
      notifySuccess(`已保存 ${file}`);
    } catch (error: unknown) {
      notifyError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rk-page-col" style={{ height: "100%", padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>{file}</strong>
        <Button type="primary" size="small" loading={busy} onClick={() => void save()}>
          保存
        </Button>
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
