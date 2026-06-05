import { checkConfig, generateOutputs, previewRules, resolveProjectRoot, syncVendor } from "./program.js";

const command = process.argv[2] ?? "help";
const configFile = process.env.CLASH_ROUTE_KIT_CONFIG ?? "config/modules.yaml";
const root = process.env.CLASH_ROUTE_KIT_ROOT ?? resolveProjectRoot(process.cwd(), configFile);

async function main(): Promise<void> {
  if (command === "generate") {
    const result = await generateOutputs({ root, configFile });
    console.log(`[generate] template: ${result.templatePath}`);
    for (const provider of result.providers) {
      const sources = provider.sources
        .map((source) => `${source.name}:${source.domainRules}/${source.inputRules}`)
        .join(", ");
      console.log(`[generate] rules: ${provider.path}`);
      console.log(
        `[generate] summary: ${provider.name} output=${provider.outputRules} domain=${provider.domainRules} excluded=${provider.excludedRules} sources=[${sources}]`,
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

  console.log("Usage: clash-route-kit <generate|preview|check|sync-vendor>");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
