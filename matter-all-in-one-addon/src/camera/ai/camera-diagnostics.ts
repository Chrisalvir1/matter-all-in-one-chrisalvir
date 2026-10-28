import type { OmniCameraAllocationMetrics } from "../../homeAssistant.js";
import type { LiveViewSessionTelemetry } from "../homekit/live-view-telemetry.js";
import { sanitizeDiagnosticText } from "../homekit/live-view-telemetry.js";

export interface CameraDiagnosticInput {
  entityId: string;
  sourceType?: string;
  available: boolean;
  hapPublished: boolean;
  hapPaired: boolean;
  motionEntityId?: string;
  audioAvailable: boolean;
  hksvState?: string;
  hksvVerified: boolean;
  activeLiveView: readonly LiveViewSessionTelemetry[];
  recentLiveView: readonly LiveViewSessionTelemetry[];
  omniAllocation?: OmniCameraAllocationMetrics;
}

/** Explicitly allowlisted and non-mutating: never include URLs, session SDP,
 * credentials, pairing codes, recorder buffers, or raw integration logs. */
export function buildCameraAiDiagnostics(input: CameraDiagnosticInput) {
  const recent = input.recentLiveView[0];
  return {
    entityId: input.entityId,
    sourceType: input.sourceType || "unknown",
    available: input.available,
    homekit: {
      published: input.hapPublished,
      paired: input.hapPaired,
      audioAvailable: input.audioAvailable,
      motionEntityId: input.motionEntityId || null,
      hksvState: input.hksvState || "unknown",
      hksvVerified: input.hksvVerified,
      activeLiveViewSessions: input.activeLiveView.length,
      lastLiveView: recent
        ? {
            state: recent.state,
            startedAt: recent.startedAt,
            durationMs: recent.durationMs ?? null,
            processingMode: recent.effectiveMode,
            error: sanitizeDiagnosticText(recent.error) || null,
          }
        : null,
    },
    omniRtspAllocation: input.omniAllocation
      ? {
          requests: input.omniAllocation.requests,
          successes: input.omniAllocation.successes,
          failures: input.omniAllocation.failures,
          lastAttemptCount: input.omniAllocation.lastAttemptCount,
          lastDurationMs: input.omniAllocation.lastDurationMs,
          lastResult: input.omniAllocation.lastResult,
          lastAt: input.omniAllocation.lastAt,
        }
      : null,
  };
}
