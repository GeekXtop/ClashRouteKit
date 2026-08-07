import type { Dispatch, SetStateAction } from "react";
import type {
  CustomProxyGroup,
  ImportedConfig,
  RouteKitDefaults,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
  RuleSet,
  RuleSetSource,
} from "@clash-route-kit/core";
import { parseIniToConfig } from "@clash-route-kit/core";
import {
  addCustomProxyGroup,
  addRoute,
  addRuleProvider,
  addRuleSet,
  createCustomProxyGroup,
  createRuleProvider,
  createRuleSet,
  deleteCustomProxyGroup,
  deleteRuleProvider,
  deleteRuleSet,
  mergeImportedConfig,
  reorderRuleSets,
  replaceCustomProxyGroup,
  replaceImportedConfig,
  replaceRuleSet,
  setGlobalRemove,
  setProjectDefaults,
  setRuleProviderListField,
  setRuleProviderSources,
  setTemplateField,
  toggleRuleSet,
  updateRuleProvider,
} from "./configMutations.js";
import { validateDraftConfig } from "./draftValidation.js";
import {
  applyDraftConfig,
  setProjectSelection,
  type ProjectControllerState,
} from "./projectController.js";

function dirtyMessage(next: ProjectControllerState): ProjectControllerState {
  return {
    ...next,
    message: next.dirty ? "有未保存的本地配置修改" : next.message,
    status: next.status === "error" ? "ready" : next.status,
  };
}

function mutationError(current: ProjectControllerState, error: unknown): ProjectControllerState {
  return {
    ...current,
    status: "error",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function useProjectDraftActions(setProject: Dispatch<SetStateAction<ProjectControllerState>>) {
  function mutate(mutator: (config: ProjectControllerState["draftConfig"]) => ProjectControllerState["draftConfig"]) {
    setProject((current) => {
      try {
        return dirtyMessage(applyDraftConfig(current, mutator(current.draftConfig)));
      } catch (error: unknown) {
        return mutationError(current, error);
      }
    });
  }

  return {
    createRuleSet(sourceType: RuleSetSource["type"] = "geosite") {
      setProject((current) => {
        try {
          const ruleSet = createRuleSet(current.draftConfig, { sourceType });
          const next = applyDraftConfig(current, addRuleSet(current.draftConfig, ruleSet));
          return {
            ...dirtyMessage(next),
            selectedRuleSetId: ruleSet.id,
            selectedView: "routing",
          };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    createCustomProxyGroup(type: CustomProxyGroup["type"] = "select") {
      setProject((current) => {
        try {
          const group = createCustomProxyGroup(current.draftConfig, type);
          const next = applyDraftConfig(current, addCustomProxyGroup(current.draftConfig, group));
          return {
            ...dirtyMessage(next),
            selectedCustomProxyGroupName: group.name,
            selectedView: "routing",
          };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    createProvider() {
      setProject((current) => {
        try {
          const provider = createRuleProvider(current.draftConfig);
          const next = applyDraftConfig(current, addRuleProvider(current.draftConfig, provider));
          return {
            ...dirtyMessage(next),
            selectedProviderName: provider.name,
            selectedView: "library",
          };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    deleteRuleSet(ruleSetId: string) {
      mutate((current) => deleteRuleSet(current, ruleSetId));
    },
    deleteCustomProxyGroup(groupName: string) {
      mutate((current) => deleteCustomProxyGroup(current, groupName));
    },
    deleteProvider(providerName: string) {
      mutate((current) => deleteRuleProvider(current, providerName));
    },
    saveCustomProxyGroup(originalName: string, nextGroup: CustomProxyGroup) {
      setProject((current) => {
        try {
          const next = applyDraftConfig(
            current,
            replaceCustomProxyGroup(current.draftConfig, originalName, nextGroup),
          );
          return dirtyMessage({
            ...next,
            selectedCustomProxyGroupName:
              current.selectedCustomProxyGroupName === originalName
                ? nextGroup.name
                : next.selectedCustomProxyGroupName,
          });
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    selectRuleSet(selectedRuleSetId: string) {
      setProject((current) => setProjectSelection(current, { selectedRuleSetId }));
    },
    setGlobalRemove(values: string[]) {
      mutate((current) => setGlobalRemove(current, values));
    },
    setProjectDefaults(defaults: RouteKitDefaults | undefined) {
      mutate((current) => setProjectDefaults(current, defaults));
    },
    setTemplateField(patch: Partial<RouteKitProjectConfig["template"]>) {
      mutate((current) => setTemplateField(current, patch));
    },
    setProviderListField(providerName: string, field: "exclude" | "remove", values: string[]) {
      mutate((current) => setRuleProviderListField(current, providerName, field, values));
    },
    setProviderSources(providerName: string, sources: RuleProviderSource[]) {
      mutate((current) => setRuleProviderSources(current, providerName, sources));
    },
    reorderRuleSets(orderedIds: string[]) {
      mutate((current) => reorderRuleSets(current, orderedIds));
    },
    addRoute(source: RuleSetSource, policy: string, section?: string) {
      setProject((current) => {
        try {
          const next = applyDraftConfig(current, addRoute(current.draftConfig, { source, policy, section }));
          const added = next.draftConfig.ruleSets.at(-1);
          return { ...dirtyMessage(next), selectedRuleSetId: added?.id ?? next.selectedRuleSetId, selectedView: "routing" };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    addGeositeRoute(value: string, policy: string, section?: string) {
      setProject((current) => {
        try {
          const trimmed = value.trim();
          const existing = new Set(current.draftConfig.ruleSets.map((ruleSet) => ruleSet.id));
          const base = `geosite-${trimmed || "entry"}`;
          let id = base;
          let suffix = 2;
          while (existing.has(id)) id = `${base}-${suffix++}`;
          const ruleSet: RuleSet = {
            id,
            policy,
            source: { type: "geosite", value: trimmed },
            ...(section ? { section } : {}),
          };
          const next = applyDraftConfig(current, addRuleSet(current.draftConfig, ruleSet));
          return { ...dirtyMessage(next), selectedRuleSetId: id, selectedView: "routing" };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    importIni(text: string) {
      setProject((current) => {
        try {
          const imported = parseIniToConfig(text);
          const next = applyDraftConfig(current, mergeImportedConfig(current.draftConfig, imported));
          const warned = imported.warnings.length;
          return {
            ...dirtyMessage(next),
            message: warned ? `已导入 INI（${warned} 条警告）` : "已导入 INI",
            selectedView: "routing",
          };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    importTemplate(imported: ImportedConfig) {
      setProject((current) => {
        try {
          const next = applyDraftConfig(current, replaceImportedConfig(current.draftConfig, imported));
          const importWarnings = imported.warnings.length;
          const placeholderWarnings = validateDraftConfig(next.draftConfig).warnings.length;
          const warningCount = importWarnings + placeholderWarnings;
          return {
            ...dirtyMessage(next),
            message: warningCount
              ? `已覆盖导入模板，${warningCount} 条警告（${placeholderWarnings} 个规则源待补全）`
              : "已覆盖导入模板",
            selectedView: "routing",
          };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    toggleRuleSet(ruleSetId: string) {
      mutate((current) => toggleRuleSet(current, ruleSetId));
    },
    saveRuleSet(originalId: string, nextRuleSet: RuleSet) {
      setProject((current) => {
        try {
          const next = applyDraftConfig(
            current,
            replaceRuleSet(current.draftConfig, originalId, nextRuleSet),
          );
          return dirtyMessage({
            ...next,
            selectedRuleSetId:
              current.selectedRuleSetId === originalId
                ? nextRuleSet.id
                : next.selectedRuleSetId,
          });
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    updateProvider(providerName: string, patch: Partial<RuleProviderConfig>) {
      setProject((current) => {
        try {
          const next = applyDraftConfig(current, updateRuleProvider(current.draftConfig, providerName, patch));
          return dirtyMessage({
            ...next,
            selectedProviderName: patch.name ?? next.selectedProviderName,
          });
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
  };
}
