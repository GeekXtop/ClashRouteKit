// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { RepoModal } from "../src/components/RepoModal.js";

afterEach(cleanup);

it("submits assembled input and does not expose vendor path", async () => {
  const onSubmit = vi.fn(async () => {});
  render(
    <AppProviders>
      <RepoModal open mode="add" onSubmit={onSubmit} onClose={() => {}} />
    </AppProviders>,
  );
  expect(screen.queryByText(/vendor\//)).toBeNull();
  fireEvent.change(screen.getByLabelText("名称"), { target: { value: "GeekX" } });
  fireEvent.change(screen.getByLabelText("Git URL"), { target: { value: "https://x.git" } });
  fireEvent.change(screen.getByLabelText("数据目录"), { target: { value: "rule" } });
  fireEvent.click(screen.getByText("保存"));
  await waitFor(() =>
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "GeekX",
        url: "https://x.git",
        catalog: { reldir: "rule", kind: expect.any(String) },
      }),
    ),
  );
});
