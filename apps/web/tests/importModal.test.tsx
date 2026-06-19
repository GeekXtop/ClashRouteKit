// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ImportModal } from "../src/components/ImportModal.js";

afterEach(cleanup);

it("imports pasted ini (overwrite)", () => {
  const onImport = vi.fn();
  render(
    <AppProviders>
      <ImportModal open sources={[]} onClose={() => {}} onImport={onImport} fetcher={vi.fn()} />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText("粘贴 INI"));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "[custom]\nruleset=Proxy,[]FINAL" } });
  fireEvent.click(screen.getByText("覆盖导入"));
  expect(onImport).toHaveBeenCalledWith("[custom]\nruleset=Proxy,[]FINAL");
});
