import type { Dispatch, SetStateAction } from "react";
import type { ProviderReference, RouteModule } from "@clash-route-kit/core";
import {
  addModule,
  createModule,
  deleteModule,
  setModuleProviderRefs,
  setModuleTags,
  toggleModule,
  updateModule,
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

export function useProjectDraftActions(setProject: Dispatch<SetStateAction<ProjectControllerState>>) {
  function mutate(mutator: (config: ProjectControllerState["draftConfig"]) => ProjectControllerState["draftConfig"]) {
    setProject((current) => dirtyMessage(applyDraftConfig(current, mutator(current.draftConfig))));
  }

  return {
    createModule() {
      setProject((current) => {
        const module = createModule(current.draftConfig);
        const next = applyDraftConfig(current, addModule(current.draftConfig, module));
        return {
          ...dirtyMessage(next),
          selectedModuleId: module.id,
          selectedView: "modules",
        };
      });
    },
    deleteModule(moduleId: string) {
      mutate((current) => deleteModule(current, moduleId));
    },
    selectModule(selectedModuleId: string) {
      setProject((current) => setProjectSelection(current, { selectedModuleId }));
    },
    setModuleProviderRefs(moduleId: string, providers: ProviderReference[]) {
      mutate((current) => setModuleProviderRefs(current, moduleId, providers));
    },
    setModuleTags(moduleId: string, field: "geosite" | "geoip", tags: string[]) {
      mutate((current) => setModuleTags(current, moduleId, field, tags));
    },
    toggleModule(moduleId: string) {
      mutate((current) => toggleModule(current, moduleId));
    },
    updateModule(moduleId: string, patch: Partial<RouteModule>) {
      setProject((current) => {
        const next = applyDraftConfig(current, updateModule(current.draftConfig, moduleId, patch));
        return dirtyMessage({
          ...next,
          selectedModuleId: patch.id ?? next.selectedModuleId,
        });
      });
    },
  };
}
