import React from "react";
import type { CameraRecord } from "../../types";
import type { CameraViewSource } from "../../utils/camera-view";
export function CameraPerformance({ camera }: { camera: CameraViewSource }) {
  const metrics = (camera as CameraRecord).capabilities?.latencyMetrics;
  return (
    <section className="camera-section">
      <h3>Rendimiento</h3>
      <dl className="camera-facts">
        <div>
          <dt>Probe de fuente</dt>
          <dd>
            {metrics?.timeToDescribeMs
              ? `${metrics.timeToDescribeMs.value} ${metrics.timeToDescribeMs.unit}`
              : "No medido"}
          </dd>
        </div>
        <div>
          <dt>Primer fotograma</dt>
          <dd>
            {metrics?.timeToFirstFrameMs
              ? `${metrics.timeToFirstFrameMs.value} ${metrics.timeToFirstFrameMs.unit}`
              : "No medido"}
          </dd>
        </div>
        <div>
          <dt>Inicio completo en Casa</dt>
          <dd>No medido</dd>
        </div>
      </dl>
      <p className="camera-note">
        Las mediciones de ffprobe y el inicio del proceso no equivalen al tiempo
        de reproducción en Apple Home.
      </p>
      {metrics?.measuredAt && <small>Medición: {metrics.measuredAt}</small>}
    </section>
  );
}
