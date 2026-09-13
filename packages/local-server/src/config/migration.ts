import { readFile, stat } from "node:fs/promises";
import {
  hasDiagnosticErrors,
  parseAuthorProjectConfig,
  planLegacyMigration,
  type Diagnostic,
  type MigrationPlan,
} from "@clash-route-kit/core";
import { writeFileAtomic } from "./atomic.js";
import {
  serializeAuthorProjectV2,
  toConfigDiagnosticError,
  validateAuthorProjectV2Yaml,
} from "./authorProjectV2.js";
import {
  projectConfigPath,
  type ProjectOptions,
  type ReadText,
  type WriteText,
} from "./configRepository.js";

/**
 * v1→v2 迁移用例（事实源：docs/superpowers/specs/2026-08-10-web-console-workflow-redesign-design.md
 * 第 5.4 / 7.1 节；plan Task 4 local-server 半边）。
 *
 * 只读分析（analyzeMigration）→ 复核（Web 向导，另一任务）→ 原子写入（applyMigration）：
 * - analyze 不写盘；apply 在全部校验通过前不触碰文件系统；
 * - apply 不信任客户端传整份 YAML：仅接受结构化 MigrationPlan，服务端对 plan.draft
 *   重新序列化（schemaVersion: 2 固定在文件顶部）并走完整校验链，error 拒绝写入；
 * - 写入前把原配置备份为同目录 `routes.yaml.bak-<ISO日期时间>`（已存在追加序号），
 *   再经 writeFileAtomic 原子替换；失败保留原文件。
 */

export interface AnalyzeMigrationOptions extends ProjectOptions {
  readText?: ReadText;
}

export interface ApplyMigrationOptions extends ProjectOptions {
  plan: MigrationPlan;
  readText?: ReadText;
  writeText?: WriteText;
  fileExists?: (filePath: string) => Promise<boolean>;
  now?: () => Date;
}

/** analyzeMigration 结果：v1 携带完整 MigrationPlan，v2 无需迁移。 */
export interface MigrationAnalysis {
  currentSchemaVersion: 1 | 2;
  plan: MigrationPlan | null;
}

export interface ApplyMigrationSuccess {
  ok: true;
  backupPath: string;
  /** 实际写入当前配置文件的 v2 YAML（schemaVersion: 2 在文件顶部）。 */
  yaml: string;
  /** 校验链中 warning 及以下的诊断。 */
  diagnostics: Diagnostic[];
}

export interface ApplyMigrationRejection {
  ok: false;
  /** 全部校验诊断（含 error），供复核界面展示；此时未写盘。 */
  diagnostics: Diagnostic[];
}

export type ApplyMigrationResult = ApplyMigrationSuccess | ApplyMigrationRejection;

/**
 * 只读迁移分析：读当前配置 → parseAuthorProjectConfig 分发。
 * v1 返回 planLegacyMigration 的完整计划；v2 返回 currentSchemaVersion: 2 且 plan 为 null。
 * 解析失败（YAML 语法错误、不支持的 schemaVersion、v2 结构错误）统一抛 ConfigDiagnosticError。
 */
export async function analyzeMigration(
  options: AnalyzeMigrationOptions,
): Promise<MigrationAnalysis> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const yaml = await readText(projectConfigPath(options));

  let parsed;
  try {
    parsed = parseAuthorProjectConfig(yaml);
  } catch (error: unknown) {
    throw toConfigDiagnosticError(error);
  }
  if (parsed.schemaVersion === 2 || parsed.v2 !== undefined) {
    return { currentSchemaVersion: 2, plan: null };
  }
  const v1 = parsed.v1;
  if (v1 === undefined) {
    throw new Error("parseAuthorProjectConfig returned schemaVersion 1 without a v1 config");
  }
  return { currentSchemaVersion: 1, plan: planLegacyMigration(v1) };
}

async function resolveBackupPath(
  configPath: string,
  fileExists: (filePath: string) => Promise<boolean>,
  now: () => Date,
): Promise<string> {
  // Windows 文件名不允许冒号，ISO 日期时间中的 ":" 替换为 "-"。
  const stamp = now().toISOString().replace(/:/g, "-");
  let candidate = `${configPath}.bak-${stamp}`;
  let suffix = 2;
  while (await fileExists(candidate)) {
    candidate = `${configPath}.bak-${stamp}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * 复核确认后的原子写入。安全链（任一失败都不写盘）：
 * 1. 仅接受结构化 plan，服务端以 `{ schemaVersion: 2, ...draft }` 重新序列化，
 *    保证 schemaVersion: 2 在文件顶部且 YAML 内容不可被客户端注入；
 * 2. 重新序列化结果走完整校验链，存在 error 级诊断返回 ok:false（不落盘）；
 * 3. 当前配置必须可解析且仍为 v1（已是 v2 返回 ok:false，解析失败抛 ConfigDiagnosticError）；
 * 4. 原文件先写入同目录 `routes.yaml.bak-<ISO日期时间>`（已存在追加 "-2"、"-3"…），
 *    再以 writeFileAtomic 原子替换当前配置文件。
 */
export async function applyMigration(options: ApplyMigrationOptions): Promise<ApplyMigrationResult> {
  const readText = options.readText ?? ((filePath: string) => readFile(filePath, "utf8"));
  const writeText = options.writeText ?? ((filePath: string, text: string) => writeFileAtomic(filePath, text));
  const fileExists = options.fileExists ??
    ((filePath: string) => stat(filePath).then(() => true).catch(() => false));
  const now = options.now ?? (() => new Date());
  const configPath = projectConfigPath(options);

  // 1. 服务端重新序列化（schemaVersion: 2 固定首位），不信任客户端传来的 YAML 文本。
  const yamlText = serializeAuthorProjectV2(options.plan.draft);

  // 2. 完整校验链；error 拒绝且不触碰文件系统。
  const validation = validateAuthorProjectV2Yaml(yamlText);
  if (hasDiagnosticErrors(validation.diagnostics)) {
    return { ok: false, diagnostics: validation.diagnostics };
  }

  // 3. 当前配置必须可解析且仍为 v1。
  let originalYaml: string;
  let parsedCurrent;
  try {
    originalYaml = await readText(configPath);
    parsedCurrent = parseAuthorProjectConfig(originalYaml);
  } catch (error: unknown) {
    throw toConfigDiagnosticError(error);
  }
  if (parsedCurrent.schemaVersion === 2) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "migrate.apply.already-v2",
          severity: "error",
          path: "config.schemaVersion",
          message: "当前配置已是 Schema v2，无需迁移；如需回滚请从备份恢复",
        },
      ],
    };
  }

  // 4. 先备份原文件，再原子写入当前配置文件。
  const backupPath = await resolveBackupPath(configPath, fileExists, now);
  await writeText(backupPath, originalYaml);
  await writeText(configPath, yamlText);

  return {
    ok: true,
    backupPath,
    yaml: yamlText,
    diagnostics: validation.diagnostics.filter((diagnostic) => diagnostic.severity !== "error"),
  };
}
