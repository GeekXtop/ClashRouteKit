import type {
  CustomProxyGroup,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
  RuleSet,
  RuleSetSource,
  VendorRepoConfig,
} from "../types.js";
import {
  assertKnownKeys,
  readArray,
  readEnum,
  readObject,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readString,
} from "./valueReaders.js";

const GROUP_TYPES = ["select", "url-test", "fallback", "load-balance"] as const;
const BEHAVIORS = ["domain", "classical", "ipcidr"] as const;

function readStringArray(value: unknown, path: string): string[] {
  return readArray(value, path).map((item, index) =>
    readString(item, `${path}[${index}]`),
  );
}

function readOptionalStringArray(value: unknown, path: string): string[] | undefined {
  return value === undefined ? undefined : readStringArray(value, path);
}

function requiredNumber(value: unknown, path: string): number | undefined {
  const parsed = readOptionalNumber(value, path);
  if (parsed === null) throw new Error(`${path}: expected number`);
  return parsed;
}

function parseRuleSetSource(value: unknown, path: string): RuleSetSource {
  const source = readObject(value, path);
  const type = readEnum(
    source.type,
    ["rule-provider", "geosite", "geoip", "final"] as const,
    `${path}.type`,
  );
  if (type === "rule-provider") {
    assertKnownKeys(source, ["type", "behavior", "file", "interval"], path);
    return {
      type,
      behavior: readEnum(source.behavior, BEHAVIORS, `${path}.behavior`),
      file: readString(source.file, `${path}.file`),
      ...(source.interval === undefined
        ? {}
        : { interval: requiredNumber(source.interval, `${path}.interval`) }),
    };
  }
  if (type === "geosite") {
    assertKnownKeys(source, ["type", "value"], path);
    return { type, value: readString(source.value, `${path}.value`) };
  }
  if (type === "geoip") {
    assertKnownKeys(source, ["type", "value", "noResolve"], path);
    return {
      type,
      value: readString(source.value, `${path}.value`),
      ...(source.noResolve === undefined
        ? {}
        : { noResolve: readOptionalBoolean(source.noResolve, `${path}.noResolve`) }),
    };
  }
  assertKnownKeys(source, ["type"], path);
  return { type };
}

function parseProviderSource(value: unknown, path: string): RuleProviderSource {
  const source = readObject(value, path);
  const type = readEnum(
    source.type,
    ["clash-list", "clash-provider", "domain-list-community"] as const,
    `${path}.type`,
  );
  const common = {
    name: readString(source.name, `${path}.name`),
    ...(source.basePath === undefined
      ? {}
      : { basePath: readOptionalString(source.basePath, `${path}.basePath`) }),
  };
  if (type === "domain-list-community") {
    assertKnownKeys(source, ["name", "type", "entry", "basePath"], path);
    return { ...common, type, entry: readString(source.entry, `${path}.entry`) };
  }
  assertKnownKeys(source, ["name", "type", "path", "basePath"], path);
  return { ...common, type, path: readString(source.path, `${path}.path`) };
}

function parseTemplate(value: unknown, path: string): RouteKitProjectConfig["template"] {
  const template = readObject(value, path);
  assertKnownKeys(
    template,
    ["output", "enableRuleGenerator", "overwriteOriginalRules", "clashRuleBase"],
    path,
  );
  return {
    output: readString(template.output, `${path}.output`),
    ...(template.enableRuleGenerator === undefined
      ? {}
      : {
          enableRuleGenerator: readOptionalBoolean(
            template.enableRuleGenerator,
            `${path}.enableRuleGenerator`,
          ),
        }),
    ...(template.overwriteOriginalRules === undefined
      ? {}
      : {
          overwriteOriginalRules: readOptionalBoolean(
            template.overwriteOriginalRules,
            `${path}.overwriteOriginalRules`,
          ),
        }),
    ...(template.clashRuleBase === undefined
      ? {}
      : {
          clashRuleBase: readOptionalString(
            template.clashRuleBase,
            `${path}.clashRuleBase`,
          ),
        }),
  };
}

function parseDefaults(value: unknown, path: string): RouteKitProjectConfig["defaults"] {
  if (value === undefined) return undefined;
  const defaults = readObject(value, path);
  assertKnownKeys(defaults, ["proxyGroups", "ruleSets"], path);
  const proxyGroups = defaults.proxyGroups === undefined
    ? undefined
    : readObject(defaults.proxyGroups, `${path}.proxyGroups`);
  const ruleSets = defaults.ruleSets === undefined
    ? undefined
    : readObject(defaults.ruleSets, `${path}.ruleSets`);
  if (proxyGroups) {
    assertKnownKeys(proxyGroups, ["healthCheck", "urlTest"], `${path}.proxyGroups`);
  }
  if (ruleSets) {
    assertKnownKeys(
      ruleSets,
      ["ruleProviderInterval", "geoipNoResolve"],
      `${path}.ruleSets`,
    );
  }

  const healthCheck = proxyGroups?.healthCheck === undefined
    ? undefined
    : readObject(proxyGroups.healthCheck, `${path}.proxyGroups.healthCheck`);
  const urlTest = proxyGroups?.urlTest === undefined
    ? undefined
    : readObject(proxyGroups.urlTest, `${path}.proxyGroups.urlTest`);
  if (healthCheck) {
    assertKnownKeys(
      healthCheck,
      ["url", "interval", "timeout"],
      `${path}.proxyGroups.healthCheck`,
    );
  }
  if (urlTest) {
    assertKnownKeys(urlTest, ["tolerance"], `${path}.proxyGroups.urlTest`);
  }

  return {
    ...(proxyGroups
      ? {
          proxyGroups: {
            ...(healthCheck
              ? {
                  healthCheck: {
                    ...(healthCheck.url === undefined
                      ? {}
                      : {
                          url: readString(
                            healthCheck.url,
                            `${path}.proxyGroups.healthCheck.url`,
                          ),
                        }),
                    ...(healthCheck.interval === undefined
                      ? {}
                      : {
                          interval: requiredNumber(
                            healthCheck.interval,
                            `${path}.proxyGroups.healthCheck.interval`,
                          ),
                        }),
                    ...(healthCheck.timeout === undefined
                      ? {}
                      : {
                          timeout: requiredNumber(
                            healthCheck.timeout,
                            `${path}.proxyGroups.healthCheck.timeout`,
                          ),
                        }),
                  },
                }
              : {}),
            ...(urlTest
              ? {
                  urlTest: {
                    ...(urlTest.tolerance === undefined
                      ? {}
                      : {
                          tolerance: requiredNumber(
                            urlTest.tolerance,
                            `${path}.proxyGroups.urlTest.tolerance`,
                          ),
                        }),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(ruleSets
      ? {
          ruleSets: {
            ...(ruleSets.ruleProviderInterval === undefined
              ? {}
              : {
                  ruleProviderInterval: requiredNumber(
                    ruleSets.ruleProviderInterval,
                    `${path}.ruleSets.ruleProviderInterval`,
                  ),
                }),
            ...(ruleSets.geoipNoResolve === undefined
              ? {}
              : {
                  geoipNoResolve: readOptionalBoolean(
                    ruleSets.geoipNoResolve,
                    `${path}.ruleSets.geoipNoResolve`,
                  ),
                }),
          },
        }
      : {}),
  };
}

function parseCustomProxyGroup(value: unknown, path: string): CustomProxyGroup {
  const group = readObject(value, path);
  assertKnownKeys(
    group,
    [
      "name",
      "type",
      "options",
      "nodeFilters",
      "url",
      "interval",
      "timeout",
      "tolerance",
    ],
    path,
  );
  return {
    name: readString(group.name, `${path}.name`),
    type: readEnum(group.type, GROUP_TYPES, `${path}.type`),
    options: readStringArray(group.options, `${path}.options`),
    ...(group.nodeFilters === undefined
      ? {}
      : { nodeFilters: readStringArray(group.nodeFilters, `${path}.nodeFilters`) }),
    ...(group.url === undefined
      ? {}
      : { url: readOptionalString(group.url, `${path}.url`) }),
    ...(group.interval === undefined
      ? {}
      : { interval: requiredNumber(group.interval, `${path}.interval`) }),
    ...(group.timeout === undefined
      ? {}
      : { timeout: readOptionalNumber(group.timeout, `${path}.timeout`) }),
    ...(group.tolerance === undefined
      ? {}
      : { tolerance: readOptionalNumber(group.tolerance, `${path}.tolerance`) }),
  };
}

function parseRuleSet(value: unknown, path: string): RuleSet {
  const ruleSet = readObject(value, path);
  assertKnownKeys(ruleSet, ["id", "enabled", "section", "policy", "source"], path);
  return {
    id: readString(ruleSet.id, `${path}.id`),
    ...(ruleSet.enabled === undefined
      ? {}
      : { enabled: readOptionalBoolean(ruleSet.enabled, `${path}.enabled`) }),
    ...(ruleSet.section === undefined
      ? {}
      : { section: readOptionalString(ruleSet.section, `${path}.section`) }),
    policy: readString(ruleSet.policy, `${path}.policy`),
    source: parseRuleSetSource(ruleSet.source, `${path}.source`),
  };
}

function parseRuleProvider(value: unknown, path: string): RuleProviderConfig {
  const provider = readObject(value, path);
  assertKnownKeys(
    provider,
    ["name", "output", "behavior", "enabled", "exclude", "remove", "sources"],
    path,
  );
  return {
    name: readString(provider.name, `${path}.name`),
    output: readString(provider.output, `${path}.output`),
    behavior: readEnum(provider.behavior, BEHAVIORS, `${path}.behavior`),
    ...(provider.enabled === undefined
      ? {}
      : { enabled: readOptionalBoolean(provider.enabled, `${path}.enabled`) }),
    ...(provider.exclude === undefined
      ? {}
      : { exclude: readStringArray(provider.exclude, `${path}.exclude`) }),
    ...(provider.remove === undefined
      ? {}
      : { remove: readStringArray(provider.remove, `${path}.remove`) }),
    sources: readArray(provider.sources, `${path}.sources`).map((item, index) =>
      parseProviderSource(item, `${path}.sources[${index}]`),
    ),
  };
}

function parseVendorRepo(value: unknown, path: string): VendorRepoConfig {
  const repo = readObject(value, path);
  assertKnownKeys(
    repo,
    ["name", "url", "path", "branch", "catalog", "templateDir"],
    path,
  );
  const catalog = repo.catalog === undefined
    ? undefined
    : readObject(repo.catalog, `${path}.catalog`);
  if (catalog) assertKnownKeys(catalog, ["dir", "kind"], `${path}.catalog`);
  return {
    name: readString(repo.name, `${path}.name`),
    url: readString(repo.url, `${path}.url`),
    path: readString(repo.path, `${path}.path`),
    ...(repo.branch === undefined
      ? {}
      : { branch: readOptionalString(repo.branch, `${path}.branch`) }),
    ...(catalog
      ? {
          catalog: {
            dir: readString(catalog.dir, `${path}.catalog.dir`),
            kind: readEnum(
              catalog.kind,
              ["domain-list", "list-dir", "provider-yaml", "ini-template"] as const,
              `${path}.catalog.kind`,
            ),
          },
        }
      : {}),
    ...(repo.templateDir === undefined
      ? {}
      : { templateDir: readOptionalString(repo.templateDir, `${path}.templateDir`) }),
  };
}

export function parseLegacyProjectConfig(value: unknown): RouteKitProjectConfig {
  const project = readObject(value, "config");
  assertKnownKeys(
    project,
    [
      "publishBaseUrl",
      "subconverterUrl",
      "defaults",
      "template",
      "vendorRepos",
      "globalRemove",
      "customProxyGroups",
      "ruleSets",
      "ruleProviders",
    ],
    "config",
  );
  return {
    publishBaseUrl: readString(project.publishBaseUrl, "publishBaseUrl"),
    ...(project.subconverterUrl === undefined
      ? {}
      : {
          subconverterUrl: readOptionalString(
            project.subconverterUrl,
            "subconverterUrl",
          ),
        }),
    ...(project.defaults === undefined
      ? {}
      : { defaults: parseDefaults(project.defaults, "defaults") }),
    template: parseTemplate(project.template, "template"),
    vendorRepos: readArray(
      project.vendorRepos === undefined ? [] : project.vendorRepos,
      "vendorRepos",
    ).map((item, index) => parseVendorRepo(item, `vendorRepos[${index}]`)),
    ...(project.globalRemove === undefined
      ? {}
      : {
          globalRemove: readOptionalStringArray(project.globalRemove, "globalRemove"),
        }),
    customProxyGroups: readArray(project.customProxyGroups, "customProxyGroups").map(
      (item, index) => parseCustomProxyGroup(item, `customProxyGroups[${index}]`),
    ),
    ruleSets: readArray(project.ruleSets, "ruleSets").map((item, index) =>
      parseRuleSet(item, `ruleSets[${index}]`),
    ),
    ruleProviders: readArray(
      project.ruleProviders === undefined ? [] : project.ruleProviders,
      "ruleProviders",
    ).map((item, index) => parseRuleProvider(item, `ruleProviders[${index}]`)),
  };
}
