import type {
  DomainListCommunityOptions,
  DomainProviderInput,
  DomainProviderRule,
  DomainProviderSummary,
} from "./types.js";

function stripComment(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return "";
  const commentIndex = trimmed.indexOf(" #");
  return commentIndex === -1 ? trimmed : trimmed.slice(0, commentIndex).trim();
}

function includeUrl(sourceUrl: string, includeName: string): string {
  return new URL(includeName, `${sourceUrl.substring(0, sourceUrl.lastIndexOf("/") + 1)}`).toString();
}

export async function convertDomainListCommunity(
  content: string,
  options: DomainListCommunityOptions,
  seenIncludes = new Set<string>(),
): Promise<string[]> {
  const rules: string[] = [];

  for (const rawLine of content.replace(/\r\n?/g, "\n").split("\n")) {
    const token = stripComment(rawLine).split(/\s+/)[0];
    if (!token) continue;

    if (token.startsWith("include:")) {
      const includeName = token.slice("include:".length);
      if (seenIncludes.has(includeName)) continue;
      seenIncludes.add(includeName);
      const nextUrl = includeUrl(options.sourceUrl, includeName);
      const included = await convertDomainListCommunity(
        await options.fetchText(nextUrl),
        { ...options, sourceUrl: nextUrl },
        seenIncludes,
      );
      rules.push(...included);
      continue;
    }

    if (token.startsWith("full:")) {
      rules.push(`DOMAIN,${token.slice("full:".length)}`);
    } else if (token.startsWith("keyword:")) {
      rules.push(`DOMAIN-KEYWORD,${token.slice("keyword:".length)}`);
    } else if (token.startsWith("domain:")) {
      rules.push(`DOMAIN-SUFFIX,${token.slice("domain:".length)}`);
    } else if (!token.includes(":")) {
      rules.push(`DOMAIN-SUFFIX,${token}`);
    }
  }

  return [...new Set(rules)];
}

function parseRule(rule: string): { kind: string; value: string } | null {
  const [kind, value] = rule.split(",", 3).map((part) => part.trim());
  if (!kind || !value) return null;
  return { kind: kind.toUpperCase(), value };
}

function normalizeDomainRule(rawRule: string): DomainProviderRule | null {
  const trimmed = rawRule.trim();
  const rule = parseRule(trimmed.includes(",") ? trimmed : `DOMAIN-SUFFIX,${trimmed}`);
  if (!rule) return null;

  if (rule.kind === "DOMAIN-SUFFIX") {
    return {
      payload: `'+.${rule.value}'`,
      key: `DOMAIN-SUFFIX,${rule.value.toLowerCase()}`,
      rule: `DOMAIN-SUFFIX,${rule.value}`,
    };
  }
  if (rule.kind === "DOMAIN") {
    return {
      payload: `'${rule.value}'`,
      key: `DOMAIN,${rule.value.toLowerCase()}`,
      rule: `DOMAIN,${rule.value}`,
    };
  }

  return null;
}

export function collectDomainProviderRules(input: DomainProviderInput): DomainProviderRule[] {
  const rules: DomainProviderRule[] = [];
  const seen = new Set<string>();
  const excluded = new Set(
    (input.exclude ?? [])
      .map(normalizeDomainRule)
      .filter((rule): rule is DomainProviderRule => rule !== null)
      .map((rule) => rule.key),
  );

  for (const rawRule of input.rules) {
    const rule = normalizeDomainRule(rawRule);
    if (!rule) continue;
    if (excluded.has(rule.key)) continue;

    if (!seen.has(rule.key)) {
      seen.add(rule.key);
      rules.push(rule);
    }
  }
  return rules.sort((left, right) => left.rule.localeCompare(right.rule));
}

function domainPayload(rules: string[], exclude: string[] = []): string[] {
  return collectDomainProviderRules({
    source: "",
    rules,
    exclude,
  }).map((rule) => rule.payload);
}

export function generateDomainProvider(input: DomainProviderInput): string {
  const payload = domainPayload(input.rules, input.exclude);
  const lines = [`# 生成自 ${input.source}`, `# 总数: ${payload.length}`, "", "payload:"];
  for (const entry of payload) {
    lines.push(`  - ${entry}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function summarizeDomainProvider(input: DomainProviderInput): DomainProviderSummary {
  const domainRules = domainPayload(input.rules).length;
  const outputRules = domainPayload(input.rules, input.exclude).length;
  return {
    inputRules: input.rules.length,
    domainRules,
    excludedRules: domainRules - outputRules,
    outputRules,
  };
}
