import { useEffect, useMemo, useState } from "react";
import type { RouteKitProjectConfig } from "@clash-route-kit/core";
import {
  buildSubconverterUrl,
  parseProviderLines,
  type ProviderSubscription,
} from "./subscriptions.js";

const subscriptionStorageKey = "clash-route-kit-subscriptions";
const defaultSubconverterEndpoint = "10.0.0.3:25500";

function isProviderSubscription(value: unknown): value is ProviderSubscription {
  const candidate = value as ProviderSubscription;
  return (
    typeof candidate?.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.enabled === "boolean"
  );
}

function loadSubscriptions(): ProviderSubscription[] {
  if (typeof window === "undefined") return [];
  const text = window.localStorage.getItem(subscriptionStorageKey);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isProviderSubscription) : [];
  } catch {
    return [];
  }
}

export function useSubscriptions(config: RouteKitProjectConfig) {
  const [providers, setProviders] = useState(loadSubscriptions);
  const [endpoint, setEndpoint] = useState(defaultSubconverterEndpoint);
  const [copied, setCopied] = useState(false);

  const outputUrl = useMemo(() => {
    const hasProvider = providers.some((provider) => provider.enabled && provider.name.trim() && provider.url.trim());
    if (!hasProvider) return "";
    return buildSubconverterUrl({
      endpoint,
      providers,
      publishBaseUrl: config.publishBaseUrl,
      templateOutput: config.template.output,
    });
  }, [config.publishBaseUrl, config.template.output, endpoint, providers]);

  useEffect(() => {
    window.localStorage.setItem(subscriptionStorageKey, JSON.stringify(providers));
  }, [providers]);

  function update(id: string, patch: Partial<ProviderSubscription>) {
    setProviders((current) => current.map((provider) => (provider.id === id ? { ...provider, ...patch } : provider)));
    setCopied(false);
  }

  function add() {
    setProviders((current) => [...current, { id: `provider-${Date.now()}`, name: "", url: "", enabled: true }]);
    setCopied(false);
  }

  function importLines(value: string) {
    const imported = parseProviderLines(value);
    if (imported.length === 0) return;
    const now = Date.now();
    setProviders((current) => [
      ...current,
      ...imported.map((provider, index) => ({ ...provider, id: `${provider.id}-${now}-${index}` })),
    ]);
    setCopied(false);
  }

  function remove(id: string) {
    setProviders((current) => current.filter((provider) => provider.id !== id));
    setCopied(false);
  }

  function updateEndpoint(value: string) {
    setEndpoint(value);
    setCopied(false);
  }

  async function copyOutputUrl() {
    if (!outputUrl) return;
    await navigator.clipboard.writeText(outputUrl);
    setCopied(true);
  }

  return {
    add,
    copied,
    copyOutputUrl,
    endpoint,
    importLines,
    outputUrl,
    providers,
    remove,
    update,
    updateEndpoint,
  };
}
