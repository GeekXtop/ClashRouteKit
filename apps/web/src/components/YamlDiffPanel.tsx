import { FileDiff } from "lucide-react";
import { serializeRouteKitConfig } from "@clash-route-kit/core";
import type { ProjectControllerState } from "../projectController.js";
import { createLineDiff, type LineDiffEntry } from "../yamlDiff.js";

function linePrefix(entry: LineDiffEntry): string {
  if (entry.type === "added") return "+";
  if (entry.type === "removed") return "-";
  return " ";
}

function lineNumber(entry: LineDiffEntry): string {
  return String(entry.newLine ?? entry.oldLine ?? "").padStart(3, " ");
}

function displayEntries(entries: LineDiffEntry[]): LineDiffEntry[] {
  const changed = new Set<number>();
  entries.forEach((entry, index) => {
    if (entry.type !== "unchanged") {
      changed.add(index - 2);
      changed.add(index - 1);
      changed.add(index);
      changed.add(index + 1);
      changed.add(index + 2);
    }
  });

  return entries.filter((_, index) => changed.has(index));
}

export function YamlDiffPanel({ project }: { project: ProjectControllerState }) {
  const baselineYaml = serializeRouteKitConfig(project.originalConfig);
  const entries = createLineDiff(baselineYaml, project.draftYaml);
  const changedEntries = entries.filter((entry) => entry.type !== "unchanged");
  const visibleEntries = displayEntries(entries);

  return (
    <section className="panel diff-panel">
      <div className="panel-heading">
        <div>
          <h2>YAML Diff</h2>
          <span>{changedEntries.length} changed lines</span>
        </div>
        <FileDiff size={18} />
      </div>
      {project.dirty ? (
        <pre className="diff-output">
          {visibleEntries.map((entry, index) => (
            <span className={`diff-line ${entry.type}`} key={`${entry.type}-${entry.oldLine ?? ""}-${entry.newLine ?? ""}-${index}`}>
              <span className="diff-prefix">{linePrefix(entry)}</span>
              <span className="diff-number">{lineNumber(entry)}</span>
              <span className="diff-text">{entry.text || " "}</span>
            </span>
          ))}
        </pre>
      ) : (
        <div className="empty-state">当前草稿与已保存配置一致</div>
      )}
    </section>
  );
}
