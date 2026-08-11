export type DependencyGraph = Readonly<Record<string, readonly string[]>>;

function canonicalCycle(cycle: readonly string[]): string[] {
  const rotations = cycle.map((_node, index) => [
    ...cycle.slice(index),
    ...cycle.slice(0, index),
  ]);
  rotations.sort((left, right) => left.join("\u0000").localeCompare(right.join("\u0000")));
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
          found.set(cycle.join("\u0000"), cycle);
        } else if (!visited.has(child)) {
          visit(child);
        }
      }
      visited.delete(node);
      path.pop();
    }

    visit(start);
  }
  return [...found.values()].sort((left, right) =>
    left.join("\u0000").localeCompare(right.join("\u0000")),
  );
}
