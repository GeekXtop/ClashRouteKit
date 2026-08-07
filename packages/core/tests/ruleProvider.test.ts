import { describe, expect, it } from "vitest";
import {
  convertDomainListCommunity,
  generateClassicalProvider,
  generateDomainProvider,
  generateIpcidrProvider,
  generateRuleProvider,
  summarizeDomainProvider,
  summarizeRuleProvider,
} from "../src/index.js";

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

describe("generateClassicalProvider", () => {
  it("keeps complete supported rule lines with dedupe, sorting, and excludes", () => {
    const yaml = generateClassicalProvider({
      source: "config/rules/Mixed.list",
      rules: [
        "DOMAIN-SUFFIX,example.com",
        "IP-CIDR,192.0.2.0/24,no-resolve",
        "PROCESS-NAME,Telegram.exe",
        "domain-suffix,example.com",
      ],
      exclude: ["PROCESS-NAME,Telegram.exe"],
    });

    expect(yaml).toContain("# 生成自 config/rules/Mixed.list");
    expect(yaml).toContain("# 总数: 2");
    expect(yaml).toContain("  - 'DOMAIN-SUFFIX,example.com'");
    expect(yaml).toContain("  - 'IP-CIDR,192.0.2.0/24,no-resolve'");
    expect(yaml).not.toContain("Telegram.exe");
  });
});

describe("generateIpcidrProvider", () => {
  it("keeps only IP-CIDR and IP-CIDR6 values with dedupe, sorting, and excludes", () => {
    const yaml = generateIpcidrProvider({
      source: "config/rules/IP.list",
      rules: [
        "DOMAIN-SUFFIX,ignored.example",
        "IP-CIDR,192.0.2.0/24,no-resolve",
        "IP-CIDR6,2001:db8::/32,no-resolve",
        "ip-cidr,192.0.2.0/24",
        "IP-CIDR,198.51.100.0/24",
      ],
      exclude: ["198.51.100.0/24"],
    });

    expect(yaml).toContain("# 总数: 2");
    expect(yaml).toContain("  - '192.0.2.0/24'");
    expect(yaml).toContain("  - '2001:db8::/32'");
    expect(yaml).not.toContain("ignored.example");
    expect(yaml).not.toContain("198.51.100.0/24");
  });

  it("dispatches provider generation and summaries by behavior", () => {
    const input = {
      source: "config/rules/Mixed.list",
      rules: ["DOMAIN-SUFFIX,example.com", "IP-CIDR,192.0.2.0/24,no-resolve"],
    };

    expect(generateRuleProvider("domain", input)).toContain("'+.example.com'");
    expect(generateRuleProvider("classical", input)).toContain("'IP-CIDR,192.0.2.0/24,no-resolve'");
    expect(generateRuleProvider("ipcidr", input)).toContain("'192.0.2.0/24'");
    expect(summarizeRuleProvider("ipcidr", input)).toEqual({
      inputRules: 2,
      outputRules: 1,
      excludedRules: 0,
    });
  });
});
