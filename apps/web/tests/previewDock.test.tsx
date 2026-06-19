// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { PreviewDock } from "../src/components/PreviewDock.js";

afterEach(cleanup);

it("expands to show ini", () => {
  render(
    <AppProviders>
      <PreviewDock ini={"[custom]\nruleset=Proxy,[]FINAL"} />
    </AppProviders>,
  );
  fireEvent.click(screen.getByText("INI 预览"));
  expect(screen.getByText(/ruleset=Proxy/)).toBeTruthy();
});
