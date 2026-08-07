// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ListFileEditor } from "../src/components/ListFileEditor.js";

afterEach(cleanup);

afterEach(() => {
  vi.useRealTimers();
});

it("loads and auto-saves a list file", async () => {
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
  await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("DOMAIN,a.cn\n"));
  expect(screen.queryByText("保存")).toBeNull();

  vi.useFakeTimers();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "DOMAIN,x.cn" } });
  expect(fetcher.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "PUT")).toBe(false);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(599);
  });
  expect(fetcher.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === "PUT")).toBe(false);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  const putCalls = () => fetcher.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "PUT");
  expect(putCalls()).toHaveLength(1);
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("DOMAIN,x.cn\n");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_200);
  });
  expect(putCalls()).toHaveLength(1);
});

it("keeps one in-flight auto-save when the status changes", async () => {
  const putResponses: Array<(response: Response) => void> = [];
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT") {
      return new Promise<Response>((resolve) => putResponses.push(resolve));
    }
    return {
      ok: true,
      json: async () => ({ file: "Direct.list", text: "DOMAIN,a.cn\n" }),
    } as unknown as Response;
  });
  render(
    <AppProviders>
      <ListFileEditor file="Direct.list" fetcher={fetcher} />
    </AppProviders>,
  );
  await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("DOMAIN,a.cn\n"));

  vi.useFakeTimers();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "DOMAIN,x.cn" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });

  const putCalls = () => fetcher.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === "PUT");
  expect(putCalls()).toHaveLength(1);

  await act(async () => {
    putResponses[0]?.({
      ok: true,
      json: async () => ({ file: "Direct.list", text: "DOMAIN,x.cn\n" }),
    } as unknown as Response);
    await Promise.resolve();
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_200);
  });

  expect(putCalls()).toHaveLength(1);
  expect(screen.getByLabelText("保存状态").textContent).toBe("已保存");
});
