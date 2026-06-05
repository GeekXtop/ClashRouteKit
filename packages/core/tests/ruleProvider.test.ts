import { describe, expect, it } from "vitest";
import { convertDomainListCommunity, generateDomainProvider, summarizeDomainProvider } from "../src/index.js";

describe("domain-list-community conversion", () => {
  it("converts rules and expands includes with stable de-duplication", async () => {
    const converted = await convertDomainListCommunity("include:ubuntu\nfull:exact.example\nkeyword:wallet\n", {
      sourceUrl: "https://example.com/data/category-dev",
      fetchText: async (url) => {
        expect(url).toBe("https://example.com/data/ubuntu");
        return "ubuntu.com\nubuntu.net\n";
      },
    });

    expect(converted).toEqual([
      "DOMAIN-SUFFIX,ubuntu.com",
      "DOMAIN-SUFFIX,ubuntu.net",
      "DOMAIN,exact.example",
      "DOMAIN-KEYWORD,wallet",
    ]);
  });
});

describe("generateDomainProvider", () => {
  it("renders domain provider YAML from exact and suffix rules only", () => {
    const yaml = generateDomainProvider({
      source: "config/rules/Tech.list",
      rules: [
        "DOMAIN-SUFFIX,debian.org",
        "DOMAIN,exact.example",
        "DOMAIN-KEYWORD,ignored-in-domain-provider",
        "IP-CIDR,192.0.2.0/24,no-resolve",
      ],
    });

    expect(yaml).toContain("# 生成自 config/rules/Tech.list");
    expect(yaml).toContain("# 总数: 2");
    expect(yaml).toContain("  - '+.debian.org'");
    expect(yaml).toContain("  - 'exact.example'");
    expect(yaml).not.toContain("ignored-in-domain-provider");
    expect(yaml).not.toContain("192.0.2.0/24");
  });

  it("excludes configured exact and suffix domain rules from provider payload", () => {
    const yaml = generateDomainProvider({
      source: "config/rules/Tech.list",
      rules: [
        "DOMAIN-SUFFIX,debian.org",
        "DOMAIN-SUFFIX,tracker.example",
        "DOMAIN,api.example",
        "DOMAIN,keep.example",
      ],
      exclude: [
        "tracker.example",
        "DOMAIN,api.example",
      ],
    });

    expect(yaml).toContain("# 总数: 2");
    expect(yaml).toContain("  - '+.debian.org'");
    expect(yaml).toContain("  - 'keep.example'");
    expect(yaml).not.toContain("tracker.example");
    expect(yaml).not.toContain("api.example");
  });

  it("summarizes raw, eligible, excluded, and output domain rule counts", () => {
    const summary = summarizeDomainProvider({
      source: "config/rules/Tech.list",
      rules: [
        "DOMAIN-SUFFIX,debian.org",
        "DOMAIN-SUFFIX,debian.org",
        "DOMAIN,api.example",
        "DOMAIN-SUFFIX,tracker.example",
        "DOMAIN-KEYWORD,ignored",
      ],
      exclude: [
        "tracker.example",
      ],
    });

    expect(summary).toEqual({
      inputRules: 5,
      domainRules: 3,
      excludedRules: 1,
      outputRules: 2,
    });
  });
});
