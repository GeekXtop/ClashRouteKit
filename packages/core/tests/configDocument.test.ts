import { describe, expect, it } from "vitest";
import {
  parseAuthorProjectConfig,
  ConfigDiagnosticError,
} from "../src/index.js";

const v2Yaml = `schemaVersion: 2
project:
  template:
    output: Custom_Clash.ini
proxyGroups:
  - id: proxy
    name: Proxy
    type: select
    members:
      - builtin: DIRECT
routes:
  - id: final
    policy:
      group: proxy
    source:
      type: final
ruleProviders: []
`;

describe("parseAuthorProjectConfig · schema v2 only", () => {
  it("parses a schemaVersion: 2 document", () => {
    const parsed = parseAuthorProjectConfig(v2Yaml);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.v2.proxyGroups[0]?.id).toBe("proxy");
  });

  it("rejects v1 documents (no schemaVersion key) with an explicit message", () => {
    const v1Yaml = `publishBaseUrl: http://127.0.0.1:8787
template:
  output: Custom_Clash.ini
customProxyGroups: []
ruleSets: []
`;
    expect(() => parseAuthorProjectConfig(v1Yaml)).toThrow(ConfigDiagnosticError);
    expect(() => parseAuthorProjectConfig(v1Yaml)).toThrow(/不支持 v1/);
  });

  it("rejects unsupported schemaVersion values", () => {
    expect(() => parseAuthorProjectConfig("schemaVersion: 3\n")).toThrow(ConfigDiagnosticError);
  });

  it("rejects malformed YAML with a parse diagnostic", () => {
    expect(() => parseAuthorProjectConfig("::::")).toThrow(ConfigDiagnosticError);
  });
});
