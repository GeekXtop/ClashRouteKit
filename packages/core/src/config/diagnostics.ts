export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  path?: string;
  message: string;
  related?: string[];
}

export function hasDiagnosticErrors(
  diagnostics: readonly Diagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = diagnostic.path ? ` ${diagnostic.path}:` : ":";
  return `[${diagnostic.code}]${location} ${diagnostic.message}`;
}

export class ConfigDiagnosticError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[]) {
    const blocking = diagnostics.filter(
      (diagnostic) => diagnostic.severity === "error",
    );
    super(blocking.map(formatDiagnostic).join("\n") || "配置校验失败");
    this.name = "ConfigDiagnosticError";
    this.diagnostics = blocking;
  }
}
