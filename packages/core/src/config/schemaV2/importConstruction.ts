/**
 * Schema v2 导入构造原语（自 v1→v2 迁移器迁入，供 parseIniToConfig 直出 v2 使用）。
 * 与迁移器版本的行为差异：原语以 warnings: string[] 记录不可表达事实（导入尽力
 * 转换、阻断交给 v2 保存校验链），不再产出 migrate.* 诊断。
 */
import type { Diagnostic } from "../diagnostics.js";
import type { BuiltinPolicy, MemberSet, TypedMember } from "./types.js";

export const V2_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
export const BUILTIN_POLICIES = new Set(["DIRECT", "REJECT"]);

/**
 * 确定性 slug：空白转 "-"、小写、去非法字符、折叠 "-"、去首尾 "-"。
 * 结果不满足 v2 ID 模式（含为空）时返回空串，由调用方回退到序号命名。
 */
export function slugifyName(name: string): string {
  const slug = name
    .replace(/\s+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return V2_ID_PATTERN.test(slug) ? slug : "";
}

/**
 * 全局唯一 id 分配器：proxyGroups → memberSets → ruleProviders → routes 四个集合
 * 共用一个已用 id 集合，撞名（含跨集合）时按序追加 "-2"、"-3" 直至可用，
 * 两次运行结果一致。
 */
export function createGlobalIdAllocator(): (candidate: string) => string {
  const used = new Set<string>();
  return (candidate: string): string => {
    if (used.has(candidate)) {
      let suffix = 2;
      while (used.has(`${candidate}-${suffix}`)) suffix += 1;
      candidate = `${candidate}-${suffix}`;
    }
    used.add(candidate);
    return candidate;
  };
}

export function cloneTypedMembers(members: readonly TypedMember[]): TypedMember[] {
  return members.map((member) => ({ ...member }));
}

/**
 * v1 选项列表 → 类型化成员：DIRECT/REJECT → builtin，已分配组显示名 → group 引用，
 * 其余剔除并记 warning（既不是策略组显示名也不是内置策略）。
 */
export function toTypedMembers(
  options: readonly string[],
  groupIndex: number,
  nameToId: ReadonlyMap<string, string>,
  warnings: string[],
): TypedMember[] {
  const members: TypedMember[] = [];
  options.forEach((option, optionIndex) => {
    if (BUILTIN_POLICIES.has(option)) {
      members.push({ builtin: option as BuiltinPolicy });
      return;
    }
    const groupId = nameToId.get(option);
    if (groupId !== undefined) {
      members.push({ group: groupId });
      return;
    }
    warnings.push(
      `customProxyGroups[${groupIndex}].options[${optionIndex}]：成员 "${option}" ` +
        "既不是策略组显示名也不是 DIRECT/REJECT，已从导入结果中剔除",
    );
  });
  return members;
}

/**
 * 重复成员提取：按 typed members 的 JSON 键分组，出现 ≥2 次的非空列表
 * 依首次出现顺序提取为 "set-N"（经全局分配器去重），组内 members 改为
 * [{ preset: setId }]。返回 memberSets 与组下标 → setId 映射。
 */
export function extractMemberSets(
  typedMembersByGroup: readonly TypedMember[][],
  allocateId: (candidate: string) => string,
): { memberSets: Record<string, MemberSet>; setIdByGroupIndex: Map<number, string> } {
  const indexesByKey = new Map<string, number[]>();
  typedMembersByGroup.forEach((members, index) => {
    if (members.length === 0) return;
    const key = JSON.stringify(members);
    const bucket = indexesByKey.get(key);
    if (bucket === undefined) indexesByKey.set(key, [index]);
    else bucket.push(index);
  });

  const memberSets: Record<string, MemberSet> = {};
  const setIdByGroupIndex = new Map<number, string>();
  let setCounter = 0;
  for (const indexes of indexesByKey.values()) {
    if (indexes.length < 2) continue;
    setCounter += 1;
    const setId = allocateId(`set-${setCounter}`);
    memberSets[setId] = { members: cloneTypedMembers(typedMembersByGroup[indexes[0]]) };
    for (const index of indexes) setIdByGroupIndex.set(index, setId);
  }
  return { memberSets, setIdByGroupIndex };
}

/** output 文件名 → 占位 provider 显示名（与既有导入占位命名一致）。 */
export function providerNameFromOutput(output: string): string {
  return (
    output
      .replace(/\.(ya?ml)$/i, "")
      .replace(/[^A-Za-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Provider"
  );
}

export type { BuiltinPolicy, MemberSet, TypedMember };
