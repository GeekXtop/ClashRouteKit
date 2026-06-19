// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ListFileEditor } from "../src/components/ListFileEditor.js";

afterEach(cleanup);

it("loads and saves a list file", async () => {
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    ({
      ok: true,
      json: async () => ({ file: "Direct.list", text: init?.method === "PUT" ? "DOMAIN,x.cn\n" : "DOMAIN,a.cn\n" }),
    }) as unknown as Response,
  );
  render(
    <AppProviders>
      <ListFileEditor file="Direct.list" fetcher={fetcher} />
    </AppProviders>,
  );
  await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("a.cn"));
  fireEvent.click(screen.getByText("保存"));
  await waitFor(() => expect(fetcher.mock.calls.some(([, i]) => (i as RequestInit)?.method === "PUT")).toBe(true));
});
