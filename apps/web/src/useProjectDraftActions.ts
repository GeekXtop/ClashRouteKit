import type { Dispatch, SetStateAction } from "react";
import type {
  CustomProxyGroup,
  ImportedConfig,
  RouteKitProjectConfig,
  RuleProviderConfig,
  RuleProviderSource,
  RuleSet,
  RuleSetSource,
} from "@clash-route-kit/core";
import { parseIniToConfig } from "@clash-route-kit/core";
import {
  addCustomProxyGroup,
  addRuleProvider,
  addRuleSet,
  createCustomProxyGroup,
  createRuleProvider,
  createRuleSet,
  deleteCustomProxyGroup,
  deleteRuleProvider,
  deleteRuleSet,
  mergeImportedConfig,
  renameCustomProxyGroup,
  reorderRuleSets,
  replaceImportedConfig,
  setCustomProxyGroupListField,
  setGlobalRemove,
  setRuleProviderListField,
  setRuleProviderSources,
  setTemplateField,
  toggleRuleSet,
  updateCustomProxyGroup,
  updateRuleProvider,
  updateRuleSet,
} from "./configMutations.js";
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
            selectedView: "ruleSets",
          };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    createCustomProxyGroup() {
      setProject((current) => {
        try {
          const group = createCustomProxyGroup(current.draftConfig);
          const next = applyDraftConfig(current, addCustomProxyGroup(current.draftConfig, group));
          return {
            ...dirtyMessage(next),
            selectedCustomProxyGroupName: group.name,
            selectedView: "customProxyGroups",
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
            selectedView: "providers",
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
    renameCustomProxyGroup(groupName: string, nextGroupName: string) {
      setProject((current) => {
        try {
          const next = applyDraftConfig(current, renameCustomProxyGroup(current.draftConfig, groupName, nextGroupName));
          return dirtyMessage({
            ...next,
            selectedCustomProxyGroupName: nextGroupName.trim() || next.selectedCustomProxyGroupName,
          });
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    selectRuleSet(selectedRuleSetId: string) {
      setProject((current) => setProjectSelection(current, { selectedRuleSetId }));
    },
    setCustomProxyGroupListField(groupName: string, field: "options" | "nodeFilters", values: string[]) {
      mutate((current) => setCustomProxyGroupListField(current, groupName, field, values));
    },
    setGlobalRemove(values: string[]) {
      mutate((current) => setGlobalRemove(current, values));
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
          return { ...dirtyMessage(next), selectedRuleSetId: id, selectedView: "ruleSets" };
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
            selectedView: "ruleSets",
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
          const warned = imported.warnings.length;
          return {
            ...dirtyMessage(next),
            message: warned ? `已覆盖导入模板（${warned} 条警告）` : "已覆盖导入模板",
            selectedView: "customProxyGroups",
          };
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    toggleRuleSet(ruleSetId: string) {
      mutate((current) => toggleRuleSet(current, ruleSetId));
    },
    updateRuleSet(ruleSetId: string, patch: Partial<RuleSet>) {
      setProject((current) => {
        try {
          const next = applyDraftConfig(current, updateRuleSet(current.draftConfig, ruleSetId, patch));
          return dirtyMessage({
            ...next,
            selectedRuleSetId: patch.id ?? next.selectedRuleSetId,
          });
        } catch (error: unknown) {
          return mutationError(current, error);
        }
      });
    },
    updateCustomProxyGroup(groupName: string, patch: Partial<CustomProxyGroup>) {
      mutate((current) => updateCustomProxyGroup(current, groupName, patch));
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
