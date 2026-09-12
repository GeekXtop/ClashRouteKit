import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

/** `.clashroutekit/local.yaml` 的声明形态；全部字段可选。 */
export interface LocalSettings {
  serve?: {
    host?: string;
    port?: number;
    publicBaseUrl?: string;
  };
  subconverterUrl?: string;
}

/** 合并默认值后的完整本地设置；serve 与 subconverterUrl 一定存在。 */
export interface ResolvedLocalSettings {
  serve: {
    host: string;
    port: number;
    publicBaseUrl: string;
  };
  subconverterUrl: string;
}

export interface LoadLocalSettingsOptions {
  root: string;
  /** 相对 root 的设置文件路径；默认 `.clashroutekit/local.yaml`。 */
  file?: string;
  /** 环境变量来源；默认 process.env。 */
  env?: Record<string, string | undefined>;
  /** CLI 显式参数覆盖；优先级最高。 */
  overrides?: Partial<LocalSettings>;
}

export const LOCAL_SETTINGS_RELATIVE_PATH = path.join(".clashroutekit", "local.yaml");

const DEFAULT_LOCAL_SETTINGS: ResolvedLocalSettings = {
  serve: {
    host: "127.0.0.1",
    port: 8787,
    publicBaseUrl: "http://127.0.0.1:8787",
  },
  subconverterUrl: "http://127.0.0.1:25500/sub",
};

const ENV_PUBLIC_BASE_URL = "CLASH_ROUTE_KIT_PUBLISH_BASE_URL";
const ENV_SUBCONVERTER_BASE_URL = "CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL";
const ENV_SERVE_HOST = "CLASH_ROUTE_KIT_HOST";
const ENV_SERVE_PORT = "CLASH_ROUTE_KIT_PORT";

export function resolveLocalSettingsPath(root: string, file?: string): string {
  return path.resolve(root, file ?? LOCAL_SETTINGS_RELATIVE_PATH);
}

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function requirePort(value: unknown, field: string, filePath: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 65535
  ) {
    throw new Error(`Invalid local settings in ${filePath}: ${field} must be a port number between 1 and 65535`);
  }
  return value;
}

function requireString(value: unknown, field: string, filePath: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid local settings in ${filePath}: ${field} must be a string`);
  }
  return value;
}

function parseServeSettings(value: unknown, filePath: string): LocalSettings["serve"] {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid local settings in ${filePath}: serve must be an object`);
  }
  const record = value as Record<string, unknown>;
  const serve: LocalSettings["serve"] = {};
  if (record.host !== undefined && record.host !== null) {
    serve.host = requireString(record.host, "serve.host", filePath);
  }
  if (record.port !== undefined && record.port !== null) {
    serve.port = requirePort(record.port, "serve.port", filePath);
  }
  if (record.publicBaseUrl !== undefined && record.publicBaseUrl !== null) {
    serve.publicBaseUrl = requireString(record.publicBaseUrl, "serve.publicBaseUrl", filePath);
  }
  return serve;
}

/** 读取并校验本地设置文件；文件不存在视为空设置，解析或校验失败抛带路径的错误。 */
async function readLocalSettingsFile(filePath: string): Promise<LocalSettings> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(text);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse local settings file ${filePath}: ${message}`);
  }

  if (parsed === undefined || parsed === null) {
    return {};
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid local settings file ${filePath}: expected a YAML object`);
  }
  const record = parsed as Record<string, unknown>;
  const settings: LocalSettings = {
    serve: parseServeSettings(record.serve, filePath),
  };
  if (record.subconverterUrl !== undefined && record.subconverterUrl !== null) {
    settings.subconverterUrl = requireString(record.subconverterUrl, "subconverterUrl", filePath);
  }
  return settings;
}

function mergeSettings(target: ResolvedLocalSettings, patch: Partial<LocalSettings>): void {
  if (patch.serve) {
    if (patch.serve.host !== undefined) {
      target.serve.host = patch.serve.host;
    }
    if (patch.serve.port !== undefined) {
      target.serve.port = patch.serve.port;
    }
    if (patch.serve.publicBaseUrl !== undefined) {
      target.serve.publicBaseUrl = patch.serve.publicBaseUrl;
    }
  }
  if (patch.subconverterUrl !== undefined) {
    target.subconverterUrl = patch.subconverterUrl;
  }
}

function mergeEnv(target: ResolvedLocalSettings, env: Record<string, string | undefined>): void {
  if (hasValue(env[ENV_SERVE_HOST])) {
    target.serve.host = env[ENV_SERVE_HOST]!.trim();
  }
  if (hasValue(env[ENV_SERVE_PORT])) {
    const rawPort = env[ENV_SERVE_PORT]!.trim();
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid ${ENV_SERVE_PORT}: ${rawPort} is not a port number between 1 and 65535`);
    }
    target.serve.port = port;
  }
  if (hasValue(env[ENV_PUBLIC_BASE_URL])) {
    target.serve.publicBaseUrl = env[ENV_PUBLIC_BASE_URL]!.trim();
  }
  if (hasValue(env[ENV_SUBCONVERTER_BASE_URL])) {
    target.subconverterUrl = env[ENV_SUBCONVERTER_BASE_URL]!.trim();
  }
}

/**
 * 解析本地运行设置；优先级：overrides（CLI 显式参数）> env > 设置文件 > 默认值。
 * 文件不存在返回默认值 + env + overrides 的合并结果；文件解析失败抛带路径的错误。
 */
export async function loadLocalSettings(
  options: LoadLocalSettingsOptions,
): Promise<ResolvedLocalSettings> {
  const env = options.env ?? process.env;
  const settings: ResolvedLocalSettings = {
    serve: { ...DEFAULT_LOCAL_SETTINGS.serve },
    subconverterUrl: DEFAULT_LOCAL_SETTINGS.subconverterUrl,
  };

  const filePath = resolveLocalSettingsPath(options.root, options.file);
  mergeSettings(settings, await readLocalSettingsFile(filePath));
  mergeEnv(settings, env);
  if (options.overrides) {
    mergeSettings(settings, options.overrides);
  }
  return settings;
}
