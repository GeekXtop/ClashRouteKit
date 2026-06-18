// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SubscribeAssembler } from "../src/components/SubscribeAssembler.js";

vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64,xxx" } }));

afterEach(cleanup);

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

const fetcher = (async () => jsonResponse({ mtime: 1718000000000 })) as unknown as typeof fetch;

describe("SubscribeAssembler", () => {
  it("builds subscription url with subconverter + config ?v and shows QR", async () => {
    render(
      <SubscribeAssembler
        publishBaseUrl="http://10.0.0.3:8787"
        templateOutput="Custom_Clash.ini"
        subconverterUrl="http://10.0.0.3:25500/sub"
        fetcher={fetcher}
      />,
    );

    fireEvent.change(screen.getByLabelText("机场订阅链接"), {
      target: { value: "provider:Air,https://air/sub" },
    });

    const link = (await screen.findByText("下载 yaml")).closest("a") as HTMLAnchorElement;
    expect(link.href).toContain("10.0.0.3:25500/sub");
    expect(decodeURIComponent(link.href)).toContain("/templates/Custom_Clash.ini?v=1718000000000");

    await waitFor(() => expect(screen.getByAltText("订阅二维码")).toBeTruthy());
  });

  it("shows empty state without airport links", () => {
    render(
      <SubscribeAssembler
        publishBaseUrl="http://10.0.0.3:8787"
        templateOutput="Custom_Clash.ini"
        subconverterUrl="http://10.0.0.3:25500/sub"
        fetcher={fetcher}
      />,
    );
    expect(screen.getByText(/粘贴至少一条机场链接/)).toBeTruthy();
  });
});
