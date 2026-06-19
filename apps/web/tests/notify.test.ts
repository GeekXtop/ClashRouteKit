import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyError, notifySuccess, setNotifyApi } from "../src/notify.js";

afterEach(() => setNotifyApi(null));

describe("notify bridge", () => {
  it("routes calls to the registered api", () => {
    const error = vi.fn();
    const success = vi.fn();
    setNotifyApi({ error, success });
    notifyError("boom");
    notifySuccess("ok");
    expect(error).toHaveBeenCalledWith("boom");
    expect(success).toHaveBeenCalledWith("ok");
  });

  it("is a no-op when no api is registered", () => {
    expect(() => notifyError("x")).not.toThrow();
  });
});
