import { checkConfig } from "./check/checkConfig.js";
import { generateOutputs } from "./generate/generateOutputs.js";
import type { CheckConfigFn, GenerateOutputsFn, SyncVendorFn } from "./git/gitActions.js";
import { syncVendor } from "./vendor/syncVendor.js";

export const DEFAULT_PROJECT_CONFIG_FILE = "config/routes.yaml";

export interface DefaultDependencies {
  checkConfig: CheckConfigFn;
  generateOutputs: GenerateOutputsFn;
  syncVendor: SyncVendorFn;
}

/**
 * 组装绑定到指定项目定位的默认用例集合（check/generate/syncVendor）。
 * 供 createLocalServerContext / CLI 组装层缺省注入，使 vite dev 与 serve
 * 无需自行提供实现即获得完整动作能力；显式注入的依赖仍优先。
 */
export function createDefaultDependencies(
  root: string,
  configFile: string = DEFAULT_PROJECT_CONFIG_FILE,
): DefaultDependencies {
  return {
    checkConfig: (options) => checkConfig({ ...options, root, configFile }),
    generateOutputs: (options) => generateOutputs({ ...options, root, configFile }),
    syncVendor: (options) => syncVendor({ ...options, root, configFile }),
  };
}
