import { describe, expect, it } from "vitest";
import { renderIni } from "../src/index.js";

describe("renderIni", () => {
  it("renders module rules, provider rules, groups, and proxy final in order", () => {
    const ini = renderIni({
      publishBaseUrl: "https://example.com/publish",
      proxyGroups: [
        {
          name: "🚀 手动选择",
          type: "select",
          options: ["♻️ 自动选择", "🎯 全球直连"],
          nodeFilters: [".*"],
        },
        {
          name: "💻 Tech",
          type: "select",
          options: ["🚀 手动选择", "🎯 全球直连"],
        },
        {
          name: "🎯 全球直连",
          type: "select",
          options: ["DIRECT"],
        },
      ],
      modules: [
        {
          id: "direct",
          policy: "🎯 全球直连",
          geosite: ["private"],
          geoip: ["private"],
        },
        {
          id: "tech",
          policy: "💻 Tech",
          geosite: ["github", "category-dev"],
          providers: [{ behavior: "domain", file: "External_Developer_Domain.yaml" }],
        },
        {
          id: "global",
          policy: "🚀 手动选择",
          geosite: ["geolocation-!cn"],
        },
        {
          id: "china",
          policy: "🎯 全球直连",
          geosite: ["cn"],
          geoip: ["cn"],
        },
      ],
      final: { policy: "🚀 手动选择" },
    });

    expect(ini.split("\n")).toContain("[custom]");
    expect(ini).toContain("ruleset=🎯 全球直连,[]GEOSITE,private");
    expect(ini).toContain("ruleset=🎯 全球直连,[]GEOIP,private,no-resolve");
    expect(ini).toContain(
      "ruleset=💻 Tech,clash-domain:https://example.com/publish/rules/External_Developer_Domain.yaml,28800",
    );
    expect(ini).toContain("ruleset=💻 Tech,[]GEOSITE,github");
    expect(ini).toContain("ruleset=🚀 手动选择,[]GEOSITE,geolocation-!cn");
    expect(ini).toContain("ruleset=🚀 手动选择,[]FINAL");
    expect(ini).toContain("custom_proxy_group=🚀 手动选择`select`[]♻️ 自动选择`[]🎯 全球直连`.*");
    expect(ini).not.toContain("[].*");
    expect(ini).toContain("custom_proxy_group=💻 Tech`select`[]🚀 手动选择`[]🎯 全球直连");

    expect(ini.indexOf("ruleset=💻 Tech,[]GEOSITE,github")).toBeLessThan(
      ini.indexOf("ruleset=💻 Tech,[]GEOSITE,category-dev"),
    );
    expect(ini.indexOf("ruleset=🚀 手动选择,[]GEOSITE,geolocation-!cn")).toBeLessThan(
      ini.indexOf("ruleset=🎯 全球直连,[]GEOSITE,cn"),
    );
  });
});
