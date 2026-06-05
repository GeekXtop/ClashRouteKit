import type { DomainListCommunityOptions, DomainProviderInput } from "./types.js";

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

function domainPayload(rules: string[]): string[] {
  const payload: string[] = [];
  const seen = new Set<string>();
  for (const rawRule of rules) {
    const rule = parseRule(rawRule);
    if (!rule) continue;

    let entry: string | null = null;
    if (rule.kind === "DOMAIN-SUFFIX") {
      entry = `'+.${rule.value}'`;
    } else if (rule.kind === "DOMAIN") {
      entry = `'${rule.value}'`;
    }

    if (entry && !seen.has(entry)) {
      seen.add(entry);
      payload.push(entry);
    }
  }
  return payload.sort();
}

export function generateDomainProvider(input: DomainProviderInput): string {
  const payload = domainPayload(input.rules);
  const lines = [`# 生成自 ${input.source}`, `# 总数: ${payload.length}`, "", "payload:"];
  for (const entry of payload) {
    lines.push(`  - ${entry}`);
  }
  lines.push("");
  return lines.join("\n");
}
