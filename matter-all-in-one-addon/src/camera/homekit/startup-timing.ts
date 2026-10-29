export type StartupStage =
  "T0" | "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7";
/** In-memory monotonic timestamps; absent packet stages stay unmeasured. */
export class StreamStartupTiming {
  private readonly start = performance.now();
  readonly stages: Partial<Record<StartupStage, number>> = { T0: 0 };
  readonly metrics: Partial<
    Record<
      | "allocation1Ms"
      | "probeMs"
      | "allocation2Ms"
      | "ffmpegSpawnMs"
      | "firstPacketMs"
      | "retries",
      number
    >
  > = {};
  mark(stage: StartupStage) {
    if (this.stages[stage] === undefined)
      this.stages[stage] =
        Math.round((performance.now() - this.start) * 100) / 100;
    if (stage === "T5") this.metrics.firstPacketMs = this.stages.T5;
  }
}
