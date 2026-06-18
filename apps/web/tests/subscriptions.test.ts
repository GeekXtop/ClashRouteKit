import { describe, expect, it } from "vitest";
import {
  buildSubconverterUrl,
  parseProviderLines,
  serializeProviderSubscriptions,
} from "../src/subscriptions.js";

describe("subscriptions", () => {
  it("parses provider subscription lines", () => {
    expect(
      parseProviderLines(`
provider:wd,https://example.com/wd
provider:lxy,https://example.com/lxy?token=abc
`),
    ).toEqual([
      { id: "wd", name: "wd", url: "https://example.com/wd", enabled: true },
      { id: "lxy", name: "lxy", url: "https://example.com/lxy?token=abc", enabled: true },
    ]);
  });

  it("serializes enabled provider subscriptions only", () => {
    expect(
      serializeProviderSubscriptions([
        { id: "wd", name: "wd", url: "https://example.com/wd", enabled: true },
        { id: "off", name: "off", url: "https://example.com/off", enabled: false },
        { id: "blank", name: "blank", url: "", enabled: true },
      ]),
    ).toBe("provider:wd,https://example.com/wd");
  });

  it("builds a SubConverter URL from providers and host port endpoint", () => {
    const url = buildSubconverterUrl({
      providers: [
        { id: "wd", name: "wd", url: "https://example.com/wd", enabled: true },
        { id: "lxy", name: "lxy", url: "https://example.com/lxy?token=abc", enabled: true },
      ],
      publishBaseUrl: "https://raw.githubusercontent.com/GeekXtop/ClashRouteKit/publish",
      templateOutput: "Custom_Clash.ini",
      endpoint: "10.0.0.3:25500",
    });
    const parsed = new URL(url);

    expect(`${parsed.origin}${parsed.pathname}`).toBe("http://10.0.0.3:25500/sub");
    expect(parsed.searchParams.get("target")).toBe("clash");
    expect(parsed.searchParams.get("url")).toBe(
      "provider:wd,https://example.com/wd|provider:lxy,https://example.com/lxy?token=abc",
    );
    expect(parsed.searchParams.get("config")).toBe(
      "https://raw.githubusercontent.com/GeekXtop/ClashRouteKit/publish/templates/Custom_Clash.ini",
    );
  });

  it("uses subconverterUrl and appends ?v to config", () => {
    const url = buildSubconverterUrl({
      providers: [{ id: "a", name: "Air", url: "https://air/sub", enabled: true }],
      publishBaseUrl: "http://10.0.0.3:8787",
      templateOutput: "Custom_Clash.ini",
      subconverterUrl: "http://10.0.0.3:25500/sub",
      configVersion: 1718000000000,
    });
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe("http://10.0.0.3:25500/sub");
    expect(parsed.searchParams.get("config")).toBe(
      "http://10.0.0.3:8787/templates/Custom_Clash.ini?v=1718000000000",
    );
  });

  it("omits ?v when configVersion is absent", () => {
    const url = buildSubconverterUrl({
      providers: [{ id: "a", name: "Air", url: "https://air/sub", enabled: true }],
      publishBaseUrl: "http://10.0.0.3:8787",
      templateOutput: "Custom_Clash.ini",
      subconverterUrl: "http://10.0.0.3:25500/sub",
    });
    expect(new URL(url).searchParams.get("config")).toBe(
      "http://10.0.0.3:8787/templates/Custom_Clash.ini",
    );
  });
});
