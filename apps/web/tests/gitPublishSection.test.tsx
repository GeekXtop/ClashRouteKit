// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { GitPublishSection } from "../src/components/GitPublishSection.js";

afterEach(cleanup);

it("runs generate then commit then push", async () => {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    const m = /\/api\/actions\/([\w-]+)/.exec(u);
    if (m) calls.push(m[1]!);
    return { ok: true, json: async () => ({ action: m?.[1], ok: true, output: "ok" }) } as unknown as Response;
  });
  render(
    <AppProviders>
      <GitPublishSection rawTemplateUrl="https://raw/x" fetcher={fetcher} />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText(/构建并推送/));
  await waitFor(() => expect(calls).toEqual(expect.arrayContaining(["generate", "git-commit", "git-push"])));
});
