// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { RepoModal } from "../src/components/RepoModal.js";

afterEach(cleanup);

it("decouples name from local folder; dirs show the folder name (no vendor leak)", async () => {
  const onSubmit = vi.fn(async () => {});
  render(
    <AppProviders>
      <RepoModal open mode="add" onSubmit={onSubmit} onClose={() => {}} />
    </AppProviders>,
  );
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Aethersailor" } });
  fireEvent.change(screen.getByLabelText("Git URL"), {
    target: { value: "https://github.com/GeekXtop/Custom_OpenClash_Rules.git" },
  });
  // folder defaults to the URL repo basename and is the base for both dir fields — name stays separate
  expect(screen.getAllByText("Custom_OpenClash_Rules/").length).toBe(2);
  fireEvent.change(screen.getByLabelText("数据目录"), { target: { value: "rule" } });
  fireEvent.change(screen.getByLabelText("模板目录"), { target: { value: "cfg" } });
  fireEvent.click(screen.getByText("保存"));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Aethersailor",
        url: "https://github.com/GeekXtop/Custom_OpenClash_Rules.git",
        folder: "Custom_OpenClash_Rules",
        catalog: { reldir: "rule", kind: expect.any(String) },
        templateReldir: "cfg",
      }),
    ),
  );
});
