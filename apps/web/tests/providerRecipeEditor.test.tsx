// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppProviders } from "../src/components/AppProviders.js";
import { ProviderRecipeEditor } from "../src/components/ProviderRecipeEditor.js";

afterEach(cleanup);

it("updates output on blur", () => {
  const onUpdate = vi.fn();
  render(
    <AppProviders>
      <ProviderRecipeEditor
        provider={{ name: "AI", output: "AI.yaml", behavior: "domain", sources: [] }}
        onUpdate={onUpdate}
        onSetSources={() => {}}
        onSetListField={() => {}}
        onDelete={() => {}}
      />
    </AppProviders>,
  );
  const output = screen.getByLabelText("输出文件名");
  fireEvent.change(output, { target: { value: "AI2.yaml" } });
  fireEvent.blur(output);
  expect(onUpdate).toHaveBeenCalledWith({ output: "AI2.yaml" });
});
