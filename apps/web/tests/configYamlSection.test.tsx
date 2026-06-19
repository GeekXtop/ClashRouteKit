// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ConfigYamlSection } from "../src/components/ConfigYamlSection.js";

afterEach(cleanup);

it("builds a subconverter download url from in-memory subscriptions", async () => {
  render(
    <AppProviders>
      <ConfigYamlSection
        publishBaseUrl="http://127.0.0.1:8787"
        templateOutput="Custom_Clash.ini"
        subconverterUrl="http://10.0.0.3:25500/sub"
      />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText("添加订阅"));
  fireEvent.change(screen.getByPlaceholderText("订阅 URL"), { target: { value: "https://air/sub" } });
  fireEvent.click(screen.getByText("生成 config.yaml"));
  await waitFor(() =>
    expect(screen.getByText("下载").closest("a")?.getAttribute("href")).toContain("10.0.0.3:25500/sub"),
  );
});
