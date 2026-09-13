import path from "node:path";
import { formatDiagnostic, hasDiagnosticErrors } from "@clash-route-kit/core";
import { loadLocalSettings } from "@clash-route-kit/local-server";
import {
  buildSubconverterUrl,
  checkConfig,
  generateOutputs,
  importIni,
  migrateConfig,
  previewRules,
  resolveProjectRoot,
  syncVendor,
} from "./program.js";

const command = process.argv[2] ?? "help";
const configFile = process.env.CLASH_ROUTE_KIT_CONFIG ?? "config/routes.yaml";
const root = process.env.CLASH_ROUTE_KIT_ROOT ?? resolveProjectRoot(process.cwd(), configFile);

async function main(): Promise<void> {
  if (command === "generate") {
    const result = await generateOutputs({ root, configFile });
    console.log(`[generate] template: ${result.templatePath}`);
    for (const provider of result.providers) {
      const sources = provider.sources
        .map((source) => `${source.name}:${source.outputRules}/${source.inputRules}`)
        .join(", ");
      console.log(`[generate] rules: ${provider.path}`);
      console.log(
        `[generate] summary: ${provider.name} output=${provider.outputRules} excluded=${provider.excludedRules} sources=[${sources}]`,
      );
    }
    const duplicateRuleCount = result.duplicates.reduce((count, provider) => count + provider.rules.length, 0);
    console.log(`[generate] duplicates: providers=${result.duplicates.length} rules=${duplicateRuleCount}`);
    console.log(`[generate] overlaps: rules=${result.overlaps.length}`);
    console.log(`[generate] report: ${result.reportPath}`);
    return;
  }

  if (command === "preview") {
    console.log((await previewRules({ root, configFile })).join("\n"));
    return;
  }

  if (command === "check") {
    const diagnostics = await checkConfig({ root, configFile });
    if (diagnostics.length > 0) {
      for (const diagnostic of diagnostics) {
        const output = `[check] ${formatDiagnostic(diagnostic)}`;
        if (diagnostic.severity === "error") {
          console.error(output);
        } else if (diagnostic.severity === "warning") {
          console.warn(output);
        } else {
          console.log(output);
        }
      }
      if (hasDiagnosticErrors(diagnostics)) process.exitCode = 1;
      return;
    }
    console.log("[check] ok");
    return;
  }

  if (command === "migrate") {
    const write = process.argv.slice(3).includes("--write");
    const result = await migrateConfig({ root, configFile, write });
    if (result.alreadyV2) {
      console.log("[migrate] 配置已是 schemaVersion: 2，无需迁移");
      return;
    }
    const plan = result.plan;
    if (plan === null) return;
    console.log(
      `[migrate] summary: groups=${plan.summary.groups} routes=${plan.summary.routes} ` +
        `providers=${plan.summary.providers} memberSets=${plan.summary.memberSets} issues=${plan.summary.issues}`,
    );
    for (const issue of plan.issues) {
      const output = `[migrate] ${formatDiagnostic(issue)}`;
      if (issue.severity === "error") {
        console.error(output);
      } else if (issue.severity === "warning") {
        console.warn(output);
      } else {
        console.log(output);
      }
    }
    if (result.written) {
      console.log(`[migrate] written: ${result.outputPath}`);
    } else {
      console.log(`[migrate] dry-run: 未写盘；--write 将写入 ${result.outputPath}`);
    }
    return;
  }

  if (command === "sync-vendor") {
    const results = await syncVendor({ root, configFile });
    for (const result of results) {
      console.log(`[sync-vendor] ${result.action}: ${result.name} -> ${result.path}`);
    }
    return;
  }

  if (command === "subconvert-url") {
    // SubConverter 端点默认经本地设置解析：CLI 参数（无）> env > local.yaml > 默认值。
    const settings = await loadLocalSettings({ root });
    console.log(
      await buildSubconverterUrl({
        root,
        configFile,
        subscriptionUrl: process.env.CLASH_ROUTE_KIT_SUBSCRIPTION_URL,
        subconverterBaseUrl: settings.subconverterUrl,
        target: process.env.CLASH_ROUTE_KIT_SUBCONVERTER_TARGET,
      }),
    );
    return;
  }

  if (command === "serve") {
    const args = process.argv.slice(3);
    const flag = (name: string): string | undefined => {
      const index = args.indexOf(name);
      return index >= 0 ? args[index + 1] : undefined;
    };
    // host/port/publicBaseUrl 默认值经本地设置解析；
    // 优先级：CLI 显式参数 > 环境变量 > .clashroutekit/local.yaml > 默认值。
    const hostFlag = flag("--host");
    const portFlag = flag("--port");
    const settings = await loadLocalSettings({
      root,
      overrides: {
        serve: {
          host: hostFlag,
          port: portFlag === undefined ? undefined : Number(portFlag),
          publicBaseUrl: flag("--public-base"),
        },
      },
    });
    const { startServe } = await import("./serve.js");
    await startServe({
      root,
      configFile,
      host: settings.serve.host,
      port: settings.serve.port,
      publicBase: settings.serve.publicBaseUrl,
      webRoot: flag("--web-root") ?? path.resolve(root, "apps/web/dist"),
    });
    return;
  }

  if (command === "import") {
    const iniFile = process.argv[3];
    if (!iniFile) {
      console.error("Usage: clash-route-kit import <ini-file>");
      process.exitCode = 1;
      return;
    }
    const result = await importIni({ root, configFile, iniFile });
    console.log(
      `[import] groups=${result.customProxyGroups.length} ruleSets=${result.ruleSets.length} warnings=${result.warnings.length}`,
    );
    for (const warning of result.warnings) {
      console.warn(`[import] ${warning}`);
    }
    console.log(`[import] scaffold: ${result.scaffoldPath}`);
    return;
  }

  console.log(
    "Usage: clash-route-kit <generate|preview|check|migrate|sync-vendor|subconvert-url|import|serve>",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
