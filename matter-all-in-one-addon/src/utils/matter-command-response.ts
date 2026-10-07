/** Maximum time a Matter command waits for Home Assistant before acknowledging. */
export const MATTER_COMMAND_ACK_BUDGET_MS = 750;

type CommandOutcome =
  | { kind: "result"; result: unknown }
  | { kind: "error"; error: unknown }
  | { kind: "timeout" };

export interface MatterCommandResponsePolicy {
  timeoutMs?: number;
  onCommandStart?: (command: string) => void;
  onCommandOutcome?: (
    command: string,
    durationMs: number,
    outcome: "completed" | "failed" | "handler_returned_pending",
    late?: boolean,
  ) => void;
  onFailure?: (command: string, error: unknown, late: boolean) => void | Promise<void>;
  onSlowCompletion?: (command: string, durationMs: number) => void;
}

interface InstalledPolicy {
  policy: MatterCommandResponsePolicy;
}

const installedPolicies = new WeakMap<object, InstalledPolicy>();

/**
 * Keep Matter command replies independent of slow HA services. A command that
 * completes inside the budget retains its normal result/error. If it exceeds
 * the budget, Matter is acknowledged while the original operation continues;
 * late failures are reported through onFailure and never become unhandled.
 */
export function installMatterCommandResponsePolicy(
  endpoint: any,
  policy: MatterCommandResponsePolicy,
): void {
  const commandHandler = endpoint?.commandHandler;
  if (!commandHandler || typeof commandHandler.executeHandler !== "function") return;

  const installed = installedPolicies.get(commandHandler);
  if (installed) {
    installed.policy = policy;
    return;
  }

  const originalExecuteHandler = commandHandler.executeHandler.bind(commandHandler);
  const installedPolicy: InstalledPolicy = { policy };
  installedPolicies.set(commandHandler, installedPolicy);

  commandHandler.executeHandler = async (command: string, ...args: unknown[]) => {
    const startedAt = Date.now();
    installedPolicy.policy.onCommandStart?.(command);
    const operation: Promise<CommandOutcome> = Promise.resolve()
      .then(() => originalExecuteHandler(command, ...args))
      .then(
        (result) => ({ kind: "result", result }),
        (error) => ({ kind: "error", error }),
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = installedPolicy.policy.timeoutMs ?? MATTER_COMMAND_ACK_BUDGET_MS;
    const outcome = await Promise.race([
      operation,
      new Promise<CommandOutcome>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);

    if (outcome.kind === "timeout") {
      installedPolicy.policy.onCommandOutcome?.(
        command,
        Date.now() - startedAt,
        "handler_returned_pending",
      );
      void operation.then(async (lateOutcome) => {
        const durationMs = Date.now() - startedAt;
        installedPolicy.policy.onCommandOutcome?.(
          command,
          durationMs,
          lateOutcome.kind === "error" ? "failed" : "completed",
          true,
        );
        if (lateOutcome.kind === "error") {
          try {
            await installedPolicy.policy.onFailure?.(command, lateOutcome.error, true);
          } catch {
            // A diagnostic failure must not leak into Matter's already-sent ACK.
          }
        } else {
          installedPolicy.policy.onSlowCompletion?.(command, durationMs);
        }
      });
      return undefined;
    }

    if (timer) clearTimeout(timer);
    if (outcome.kind === "error") {
      installedPolicy.policy.onCommandOutcome?.(
        command,
        Date.now() - startedAt,
        "failed",
      );
      void Promise.resolve(installedPolicy.policy.onFailure?.(command, outcome.error, false)).catch(
        () => undefined,
      );
      throw outcome.error;
    }

    installedPolicy.policy.onCommandOutcome?.(
      command,
      Date.now() - startedAt,
      "completed",
    );

    return outcome.result;
  };
}
