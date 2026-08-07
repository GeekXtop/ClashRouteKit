import path from "node:path";
import {
  buildSubconverterUrl,
  checkConfig,
  generateOutputs,
  importIni,
  previewRules,
  readConfig,
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
        console.error(`[check] ${diagnostic}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log("[check] ok");
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
    console.log(
      await buildSubconverterUrl({
        root,
        configFile,
        subscriptionUrl: process.env.CLASH_ROUTE_KIT_SUBSCRIPTION_URL,
        subconverterBaseUrl: process.env.CLASH_ROUTE_KIT_SUBCONVERTER_BASE_URL,
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
    const config = await readConfig({ root, configFile });
    const { startServe } = await import("./serve.js");
    await startServe({
      root,
      configFile,
      host: flag("--host") ?? process.env.CLASH_ROUTE_KIT_HOST ?? "0.0.0.0",
      port: Number(flag("--port") ?? process.env.CLASH_ROUTE_KIT_PORT ?? 8787),
      publicBase:
        flag("--public-base") ?? process.env.CLASH_ROUTE_KIT_PUBLISH_BASE_URL ?? config.publishBaseUrl,
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
    "Usage: clash-route-kit <generate|preview|check|sync-vendor|subconvert-url|import|serve>",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
