import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandHandler } from "matterbridge";
import {
  installMatterCommandResponsePolicy,
  MATTER_COMMAND_ACK_BUDGET_MS,
} from "../src/utils/matter-command-response.js";

// Match Matterbridge 3.11.1's prototype protection used by the production CLI.
Object.freeze(CommandHandler.prototype);

function makeEndpoint(
  handler: (...args: any[]) => Promise<unknown>,
  command = "on",
) {
  const commandHandler = new CommandHandler();
  commandHandler.addHandler(command as any, handler as any);
  return { commandHandler };
}

describe("Matter command response policy", () => {
  afterEach(() => vi.useRealTimers());

  it("wraps registered handlers without mutating the frozen execute method", async () => {
    const endpoint = makeEndpoint(async () => "done");
    const onCommandStart = vi.fn();
    const onCommandOutcome = vi.fn();
    installMatterCommandResponsePolicy(endpoint, {
      timeoutMs: 50,
      onCommandStart,
      onCommandOutcome,
    });

    expect(
      Object.isFrozen(Object.getPrototypeOf(endpoint.commandHandler)),
    ).toBe(true);
    expect(Object.hasOwn(endpoint.commandHandler, "executeHandler")).toBe(
      false,
    );
    await expect(
      endpoint.commandHandler.executeHandler("OnOff.on"),
    ).resolves.toBe("done");
    expect(onCommandStart).toHaveBeenCalledWith("on");
    expect(onCommandOutcome).toHaveBeenCalledWith(
      "on",
      expect.any(Number),
      "completed",
    );
  });

  it("wraps handlers registered after the policy is installed", async () => {
    const endpoint = makeEndpoint(async () => "first");
    const onCommandStart = vi.fn();
    installMatterCommandResponsePolicy(endpoint, { onCommandStart });
    endpoint.commandHandler.addHandler("off", async () => "second");

    await expect(
      endpoint.commandHandler.executeHandler("OnOff.off"),
    ).resolves.toBe("second");
    expect(onCommandStart).toHaveBeenCalledWith("off");
  });

  it("keeps slow Home Assistant work running after the Matter ACK budget", async () => {
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    const onCommandOutcome = vi.fn();
    const endpoint = makeEndpoint(
      () => new Promise<string>((resolve) => (finish = resolve)),
    );
    installMatterCommandResponsePolicy(endpoint, {
      timeoutMs: MATTER_COMMAND_ACK_BUDGET_MS,
      onCommandOutcome,
    });

    const response = endpoint.commandHandler.executeHandler("on");
    await vi.advanceTimersByTimeAsync(MATTER_COMMAND_ACK_BUDGET_MS);
    await expect(response).resolves.toBeUndefined();
    expect(onCommandOutcome).toHaveBeenCalledWith(
      "on",
      MATTER_COMMAND_ACK_BUDGET_MS,
      "handler_returned_pending",
    );
    finish("HA completed");
    await Promise.resolve();
  });

  it("reports a late failure without rejecting the already returned Matter ACK", async () => {
    vi.useFakeTimers();
    let fail!: (error: Error) => void;
    const onFailure = vi.fn();
    const endpoint = makeEndpoint(
      () => new Promise((_, reject) => (fail = reject)),
      "off",
    );
    installMatterCommandResponsePolicy(endpoint, {
      timeoutMs: 20,
      onFailure,
    });

    const response = endpoint.commandHandler.executeHandler("off");
    await vi.advanceTimersByTimeAsync(20);
    await expect(response).resolves.toBeUndefined();
    fail(new Error("HA device timed out"));
    await vi.waitFor(() =>
      expect(onFailure).toHaveBeenCalledWith(
        "off",
        expect.objectContaining({ message: "HA device timed out" }),
        true,
      ),
    );
  });

  it("preserves fast failures for Matter and starts diagnostics", async () => {
    const onFailure = vi.fn();
    const endpoint = makeEndpoint(async () => {
      throw new Error("HA rejected service");
    }, "off");
    installMatterCommandResponsePolicy(endpoint, { timeoutMs: 50, onFailure });

    await expect(endpoint.commandHandler.executeHandler("off")).rejects.toThrow(
      "HA rejected service",
    );
    expect(onFailure).toHaveBeenCalledWith(
      "off",
      expect.objectContaining({ message: "HA rejected service" }),
      false,
    );
  });
});
