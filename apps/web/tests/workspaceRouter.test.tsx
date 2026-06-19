// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { WorkspaceRouter } from "../src/components/WorkspaceRouter.js";

afterEach(cleanup);

describe("WorkspaceRouter", () => {
  it("renders the library page for the library view", () => {
    render(
      <AppProviders>
        <WorkspaceRouter view="library" />
      </AppProviders>,
    );
    expect(screen.getByText(/规则库/)).toBeTruthy();
  });
});
