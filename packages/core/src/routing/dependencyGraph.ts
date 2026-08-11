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
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const found = new Map<string, string[]>();

  function visit(node: string): void {
    state.set(node, 1);
    stack.push(node);
    for (const child of graph[node] ?? []) {
      if (!(child in graph)) continue;
      const childState = state.get(child) ?? 0;
      if (childState === 0) {
        visit(child);
      } else if (childState === 1) {
        const start = stack.lastIndexOf(child);
        const cycle = canonicalCycle(stack.slice(start));
        found.set(cycle.join("\u0000"), cycle);
      }
    }
    stack.pop();
    state.set(node, 2);
  }

  for (const node of Object.keys(graph)) {
    if ((state.get(node) ?? 0) === 0) visit(node);
  }
  return [...found.values()].sort((left, right) =>
    left.join("\u0000").localeCompare(right.join("\u0000")),
  );
}
