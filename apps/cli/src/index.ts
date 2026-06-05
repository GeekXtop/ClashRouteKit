import { checkConfig, generateOutputs, previewRules, resolveProjectRoot } from "./program.js";

const command = process.argv[2] ?? "help";
const configFile = process.env.CLASH_ROUTE_KIT_CONFIG ?? "config/modules.yaml";
const root = process.env.CLASH_ROUTE_KIT_ROOT ?? resolveProjectRoot(process.cwd(), configFile);

async function main(): Promise<void> {
  if (command === "generate") {
    const result = await generateOutputs({ root, configFile });
    console.log(`[generate] template: ${result.templatePath}`);
    for (const rulePath of result.rulePaths) {
      console.log(`[generate] rules: ${rulePath}`);
    }
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

  console.log("Usage: clash-route-kit <generate|preview|check>");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
