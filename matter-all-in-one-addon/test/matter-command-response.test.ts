import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installMatterCommandResponsePolicy,
  MATTER_COMMAND_ACK_BUDGET_MS,
} from "../src/utils/matter-command-response.js";

function makeEndpoint(executeHandler: (...args: any[]) => Promise<unknown>) {
  return { commandHandler: { executeHandler } };
}

describe("Matter command response policy", () => {
  afterEach(() => vi.useRealTimers());

  it("preserves fast results", async () => {
    const endpoint = makeEndpoint(async () => "done");
    installMatterCommandResponsePolicy(endpoint, { timeoutMs: 50 });

    await expect(
      endpoint.commandHandler.executeHandler("OnOff.on"),
    ).resolves.toBe("done");
  });

  it("keeps slow Home Assistant work running after the Matter ACK budget", async () => {
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    const endpoint = makeEndpoint(
      () => new Promise<string>((resolve) => (finish = resolve)),
    );
    installMatterCommandResponsePolicy(endpoint, {
      timeoutMs: MATTER_COMMAND_ACK_BUDGET_MS,
    });

    const response = endpoint.commandHandler.executeHandler("OnOff.on");
    await vi.advanceTimersByTimeAsync(MATTER_COMMAND_ACK_BUDGET_MS);
    await expect(response).resolves.toBeUndefined();
    finish("HA completed");
    await Promise.resolve();
  });

  it("reports a late failure without rejecting the already returned Matter ACK", async () => {
    vi.useFakeTimers();
    let fail!: (error: Error) => void;
    const onFailure = vi.fn();
    const endpoint = makeEndpoint(
      () => new Promise((_, reject) => (fail = reject)),
    );
    installMatterCommandResponsePolicy(endpoint, {
      timeoutMs: 20,
      onFailure,
    });

    const response = endpoint.commandHandler.executeHandler("OnOff.off");
    await vi.advanceTimersByTimeAsync(20);
    await expect(response).resolves.toBeUndefined();
    fail(new Error("HA device timed out"));
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledWith(
      "OnOff.off",
      expect.objectContaining({ message: "HA device timed out" }),
      true,
    ));
  });

  it("preserves fast failures for Matter and starts diagnostics", async () => {
    const onFailure = vi.fn();
    const endpoint = makeEndpoint(async () => {
      throw new Error("HA rejected service");
    });
    installMatterCommandResponsePolicy(endpoint, { timeoutMs: 50, onFailure });

    await expect(
      endpoint.commandHandler.executeHandler("OnOff.off"),
    ).rejects.toThrow("HA rejected service");
    expect(onFailure).toHaveBeenCalledWith(
      "OnOff.off",
      expect.objectContaining({ message: "HA rejected service" }),
      false,
    );
  });
});
