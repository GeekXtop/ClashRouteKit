// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ConfigYamlSection } from "../src/components/ConfigYamlSection.js";

afterEach(cleanup);

const jsonOk = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

const baseProps = {
  publishBaseUrl: "http://127.0.0.1:8787",
  templateOutput: "Custom_Clash.ini",
  subconverterUrl: "http://10.0.0.3:25500/sub",
};

function renderSection(overrides: Partial<Parameters<typeof ConfigYamlSection>[0]> = {}) {
  return render(
    <AppProviders>
      <ConfigYamlSection {...baseProps} fetcher={vi.fn(async () => jsonOk({}))} {...overrides} />
    </AppProviders>,
  );
}

function addSubscription(url: string) {
  fireEvent.click(screen.getByText("添加订阅"));
  fireEvent.change(screen.getByPlaceholderText("订阅 URL"), { target: { value: url } });
}

it("builds a subconverter download url from in-memory subscriptions", async () => {
  renderSection();
  addSubscription("https://air/sub");
  fireEvent.click(screen.getByText("生成 config.yaml"));
  await waitFor(() =>
    expect(screen.getByText("下载").closest("a")?.getAttribute("href")).toContain("10.0.0.3:25500/sub"),
  );
});

it("reports missing input and keeps the form editable for a retry", async () => {
  renderSection();
  fireEvent.change(screen.getByPlaceholderText("如：家庭 / 旅行（留空则用 config）"), { target: { value: "家庭" } });
  fireEvent.click(screen.getByText("生成 config.yaml"));
  expect((await screen.findByTestId("generate-failure")).textContent).toContain("输入缺失");
  expect(screen.queryByText("下载")).toBeNull();
  // 表单内容全部保留，补上订阅后同一表单即可生成成功
  addSubscription("https://air/sub");
  fireEvent.click(screen.getByText("生成 config.yaml"));
  await waitFor(() => expect(screen.getByText("下载")).toBeTruthy());
  expect((screen.getByPlaceholderText("如：家庭 / 旅行（留空则用 config）") as HTMLInputElement).value).toBe("家庭");
});

it("reports an unreachable template and keeps the entered subscriptions", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/templates/")) throw new TypeError("network down");
    return jsonOk({});
  });
  renderSection({ fetcher });
  addSubscription("https://air/sub");
  fireEvent.click(screen.getByText("生成 config.yaml"));
  expect((await screen.findByTestId("generate-failure")).textContent).toContain("模板不可达");
  expect(screen.queryByText("下载")).toBeNull();
  expect((screen.getByPlaceholderText("订阅 URL") as HTMLInputElement).value).toBe("https://air/sub");
});

it("reports an unreachable subconverter endpoint when the conversion request fails", async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("25500")) throw new TypeError("network down");
    return jsonOk({});
  });
  renderSection({ fetcher });
  addSubscription("https://air/sub");
  fireEvent.click(screen.getByText("生成 config.yaml"));
  expect((await screen.findByTestId("generate-failure")).textContent).toContain(
    "SubConverter 不可达（检查 .clashroutekit/local.yaml 或端点）",
  );
});

it("uses the provided remote template url when given", async () => {
  const remoteUrl = "https://raw.githubusercontent.com/acme/routes/publish/templates/Custom_Clash.ini";
  renderSection({ templateUrl: remoteUrl });
  addSubscription("https://air/sub");
  fireEvent.click(screen.getByText("生成 config.yaml"));
  await waitFor(() => {
    const href = screen.getByText("下载").closest("a")?.getAttribute("href") ?? "";
    expect(decodeURIComponent(href)).toContain(remoteUrl);
  });
});

it("collapses advanced convert options by default and reveals them on expand", () => {
  renderSection();
  expect(screen.queryByText("筛选节点（名称匹配，& = 同时包含）")).toBeNull();
  expect(screen.queryByText("User-Agent")).toBeNull();
  fireEvent.click(screen.getByText("高级转换选项"));
  expect(screen.getByText("筛选节点（名称匹配，& = 同时包含）")).toBeTruthy();
  expect(screen.getByText("User-Agent")).toBeTruthy();
  expect(screen.getByText("使用规则集")).toBeTruthy();
});
