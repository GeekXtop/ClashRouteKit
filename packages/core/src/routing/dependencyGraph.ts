export type DependencyGraph = Readonly<Record<string, readonly string[]>>;

function compareCycles(
  left: readonly string[],
  right: readonly string[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftNode = left[index]!;
    const rightNode = right[index]!;
    if (leftNode < rightNode) return -1;
    if (leftNode > rightNode) return 1;
  }
  return left.length - right.length;
}

function canonicalCycle(cycle: readonly string[]): string[] {
  const rotations = cycle.map((_node, index) => [
    ...cycle.slice(index),
    ...cycle.slice(0, index),
  ]);
  rotations.sort(compareCycles);
  return rotations[0] ?? [];
}

export function findDependencyCycles(graph: DependencyGraph): string[][] {
  const found = new Map<string, string[]>();

  for (const start of Object.keys(graph)) {
    const path: string[] = [];
    const visited = new Set<string>();

    function visit(node: string): void {
      path.push(node);
      visited.add(node);
      for (const child of graph[node] ?? []) {
        if (!Object.hasOwn(graph, child)) continue;
        if (child === start) {
          const cycle = canonicalCycle(path);
          found.set(JSON.stringify(cycle), cycle);
        } else if (!visited.has(child)) {
          visit(child);
        }
      }
      visited.delete(node);
      path.pop();
    }

    visit(start);
  }
  return [...found.values()].sort(compareCycles);
}
