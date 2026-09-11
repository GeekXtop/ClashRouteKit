export type UnknownRecord = Record<string, unknown>;

export function readObject(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  return value as UnknownRecord;
}

export function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value;
}

export function readString(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path}: expected string`);
  return value;
}

export function readOptionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : readString(value, path);
}

export function readOptionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${path}: expected boolean`);
  return value;
}

export function readOptionalNumber(
  value: unknown,
  path: string,
): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}: expected number`);
  }
  return value;
}

export function readEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
): T[number] {
  const text = readString(value, path);
  if (!allowed.includes(text)) {
    throw new Error(`${path}: expected one of ${allowed.join(", ")}`);
  }
  return text as T[number];
}

export function assertKnownKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${path}.${key}: unknown field`);
  }
}
