import {
  validateDefaultAwareConfig,
  type CustomProxyGroup,
  type FinalRuleSetSource,
  type GeoipRuleSetSource,
  type GeositeRuleSetSource,
  type RouteKitDefaults,
  type RuleProviderRuleSetSource,
  type RuleSet,
} from "@clash-route-kit/core";

export type DraftResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type EditableCustomProxyGroup = Omit<CustomProxyGroup, "interval"> & {
  interval?: number | null;
};

export type EditableRuleProviderSource = Omit<RuleProviderRuleSetSource, "interval"> & {
  interval?: number | null;
};

export type EditableRuleSetSource =
  | EditableRuleProviderSource
  | GeositeRuleSetSource
  | GeoipRuleSetSource
  | FinalRuleSetSource;

export type EditableRuleSet = Omit<RuleSet, "source"> & {
  source: EditableRuleSetSource;
};

export interface CustomProxyGroupDraft {
  group: EditableCustomProxyGroup;
  nodeFiltersText: string;
}

function isHttpUrl(value: string): boolean {
  if (!value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function nodeFiltersToText(filters: string[] | undefined): string {
  return (filters ?? []).join("\n");
}

export function nodeFiltersFromText(text: string): string[] {
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

export function createCustomProxyGroupDraft(group: CustomProxyGroup): CustomProxyGroupDraft {
  return {
    group: {
      ...group,
      options: [...group.options],
      nodeFilters: group.nodeFilters ? [...group.nodeFilters] : undefined,
    },
    nodeFiltersText: nodeFiltersToText(group.nodeFilters),
  };
}

export function finalizeCustomProxyGroupDraft(
  draft: CustomProxyGroupDraft,
  groups: ReadonlyArray<Pick<CustomProxyGroup, "name">>,
  originalName: string,
): DraftResult<CustomProxyGroup> {
  const name = draft.group.name.trim();
  if (!name) {
    return { ok: false, error: "custom_proxy_group 名称不能为空" };
  }
  if (name !== originalName && groups.some((group) => group.name === name)) {
    return { ok: false, error: `custom_proxy_group "${name}" already exists` };
  }

  const nodeFilters = nodeFiltersFromText(draft.nodeFiltersText);
  if (draft.group.options.length === 0 && nodeFilters.length === 0) {
    return {
      ok: false,
      error: `custom_proxy_group ${name} 至少需要一个 option 或 node filter`,
    };
  }

  if (draft.group.url !== undefined && !isHttpUrl(draft.group.url)) {
    return { ok: false, error: "测速 URL 必须是 HTTP/HTTPS URL" };
  }
  if (draft.group.interval === null) {
    return { ok: false, error: "测速间隔（秒）不能为空" };
  }
  if (draft.group.interval !== undefined && !isPositiveInteger(draft.group.interval)) {
    return { ok: false, error: "测速间隔（秒）必须为正整数" };
  }
  if (
    draft.group.timeout !== undefined &&
    draft.group.timeout !== null &&
    !isPositiveInteger(draft.group.timeout)
  ) {
    return { ok: false, error: "测速超时（秒）必须为正整数" };
  }
  if (
    draft.group.tolerance !== undefined &&
    draft.group.tolerance !== null &&
    !isNonNegativeInteger(draft.group.tolerance)
  ) {
    return { ok: false, error: "URLTest 容差（毫秒）必须为非负整数" };
  }

  const { interval, ...group } = draft.group;
  return {
    ok: true,
    value: {
      ...group,
      name,
      options: [...draft.group.options],
      nodeFilters: nodeFilters.length > 0 ? nodeFilters : undefined,
      ...(interval !== undefined ? { interval } : {}),
    },
  };
}

export function createRuleSetDraft(ruleSet: RuleSet): EditableRuleSet {
  return {
    ...ruleSet,
    source: { ...ruleSet.source },
  };
}

export function finalizeRuleSetDraft(
  draft: EditableRuleSet,
  ruleSetIds: string[],
  originalId: string,
): DraftResult<RuleSet> {
  const id = draft.id.trim();
  if (!id) return { ok: false, error: "RuleSet ID 不能为空" };
  if (id !== originalId && ruleSetIds.includes(id)) {
    return { ok: false, error: `RuleSet "${id}" already exists` };
  }

  const policy = draft.policy.trim();
  if (!policy) return { ok: false, error: `RuleSet ${id} 的目标 custom_proxy_group 不能为空` };

  let source: RuleSet["source"];
  if (draft.source.type === "geosite") {
    const value = draft.source.value.trim();
    if (!value) return { ok: false, error: `RuleSet ${id} 的 GEOSITE 不能为空` };
    source = { type: "geosite", value };
  } else if (draft.source.type === "geoip") {
    const value = draft.source.value.trim();
    if (!value) return { ok: false, error: `RuleSet ${id} 的 GEOIP 不能为空` };
    source = {
      type: "geoip",
      value,
      ...(draft.source.noResolve !== undefined
        ? { noResolve: draft.source.noResolve }
        : {}),
    };
  } else if (draft.source.type === "rule-provider") {
    const file = draft.source.file.trim();
    if (!file) return { ok: false, error: `RuleSet ${id} 的 provider 文件不能为空` };
    if (draft.source.interval === null) {
      return { ok: false, error: "更新间隔（秒）不能为空" };
    }
    if (
      draft.source.interval !== undefined &&
      !isPositiveInteger(draft.source.interval)
    ) {
      return { ok: false, error: "更新间隔（秒）必须为正整数" };
    }
    source = {
      type: "rule-provider",
      behavior: draft.source.behavior,
      file,
      ...(draft.source.interval !== undefined
        ? { interval: draft.source.interval }
        : {}),
    };
  } else {
    source = { type: "final" };
  }

  const section = draft.section?.trim();
  return {
    ok: true,
    value: {
      id,
      policy,
      source,
      ...(section ? { section } : {}),
      ...(draft.enabled !== undefined ? { enabled: draft.enabled } : {}),
    },
  };
}

export function createProjectDefaultsDraft(defaults?: RouteKitDefaults): RouteKitDefaults {
  return {
    ...(defaults?.proxyGroups
      ? {
          proxyGroups: {
            ...(defaults.proxyGroups.healthCheck
              ? { healthCheck: { ...defaults.proxyGroups.healthCheck } }
              : {}),
            ...(defaults.proxyGroups.urlTest
              ? { urlTest: { ...defaults.proxyGroups.urlTest } }
              : {}),
          },
        }
      : {}),
    ruleSets: {
      ...defaults?.ruleSets,
      geoipNoResolve: defaults?.ruleSets?.geoipNoResolve ?? true,
    },
  };
}

export function finalizeProjectDefaultsDraft(
  defaults: RouteKitDefaults,
): DraftResult<RouteKitDefaults> {
  const healthCheck = defaults.proxyGroups?.healthCheck;
  const compactHealthCheck = healthCheck
    ? {
        ...(healthCheck.url !== undefined ? { url: healthCheck.url } : {}),
        ...(healthCheck.interval !== undefined ? { interval: healthCheck.interval } : {}),
        ...(healthCheck.timeout !== undefined ? { timeout: healthCheck.timeout } : {}),
      }
    : undefined;
  const compactUrlTest =
    defaults.proxyGroups?.urlTest?.tolerance !== undefined
      ? { tolerance: defaults.proxyGroups.urlTest.tolerance }
      : undefined;
  const proxyGroups =
    compactHealthCheck && Object.keys(compactHealthCheck).length > 0
      ? {
          healthCheck: compactHealthCheck,
          ...(compactUrlTest ? { urlTest: compactUrlTest } : {}),
        }
      : compactUrlTest
        ? { urlTest: compactUrlTest }
        : undefined;

  const value: RouteKitDefaults = {
    ...(proxyGroups ? { proxyGroups } : {}),
    ruleSets: {
      ...(defaults.ruleSets?.ruleProviderInterval !== undefined
        ? { ruleProviderInterval: defaults.ruleSets.ruleProviderInterval }
        : {}),
      geoipNoResolve: defaults.ruleSets?.geoipNoResolve ?? true,
    },
  };
  const diagnostics = validateDefaultAwareConfig({
    publishBaseUrl: "http://127.0.0.1",
    defaults: value,
    customProxyGroups: [],
    ruleSets: [],
  });

  return diagnostics.length > 0
    ? { ok: false, error: diagnostics[0]! }
    : { ok: true, value };
}
