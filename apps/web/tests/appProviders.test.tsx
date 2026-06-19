// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";

afterEach(cleanup);

describe("AppProviders", () => {
  it("renders children inside antd providers", () => {
    render(
      <AppProviders>
        <span>hello-shell</span>
      </AppProviders>,
    );
    expect(screen.getByText("hello-shell")).toBeTruthy();
  });
});
