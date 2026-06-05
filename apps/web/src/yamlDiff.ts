export type LineDiffType = "unchanged" | "added" | "removed";

export interface LineDiffEntry {
  type: LineDiffType;
  text: string;
  oldLine?: number;
  newLine?: number;
}

function toLines(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, "\n");
  const trimmedFinalNewline = normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
  return trimmedFinalNewline ? trimmedFinalNewline.split("\n") : [];
}

function createLcsTable(before: string[], after: string[]): number[][] {
  const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0) as number[]);

  for (let oldIndex = before.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = after.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex]![newIndex] =
        before[oldIndex] === after[newIndex]
          ? table[oldIndex + 1]![newIndex + 1]! + 1
          : Math.max(table[oldIndex + 1]![newIndex]!, table[oldIndex]![newIndex + 1]!);
    }
  }

  return table;
}

export function createLineDiff(beforeText: string, afterText: string): LineDiffEntry[] {
  const before = toLines(beforeText);
  const after = toLines(afterText);
  const table = createLcsTable(before, after);
  const diff: LineDiffEntry[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < before.length || newIndex < after.length) {
    if (oldIndex < before.length && newIndex < after.length && before[oldIndex] === after[newIndex]) {
      diff.push({
        type: "unchanged",
        text: before[oldIndex]!,
        oldLine: oldIndex + 1,
        newLine: newIndex + 1,
      });
      oldIndex += 1;
      newIndex += 1;
    } else if (
      oldIndex < before.length &&
      (newIndex >= after.length || table[oldIndex + 1]![newIndex]! >= table[oldIndex]![newIndex + 1]!)
    ) {
      diff.push({ type: "removed", text: before[oldIndex]!, oldLine: oldIndex + 1 });
      oldIndex += 1;
    } else {
      diff.push({ type: "added", text: after[newIndex]!, newLine: newIndex + 1 });
      newIndex += 1;
    }
  }

  return diff;
}
