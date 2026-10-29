import React from "react";
import type { CameraRecord } from "../../types";
import {
  safeCameraDiagnostics,
  type CameraViewSource,
} from "../../utils/camera-view";
export function CameraDiagnostics({
  camera,
  probe,
  children,
}: {
  camera: CameraViewSource;
  probe: unknown;
  children: React.ReactNode;
}) {
  const record = camera as CameraRecord;
  const sections = [
    [
      "Fuente detectada",
      {
        source: record.source,
        capabilities: record.capabilities,
        providerMetadata: camera,
        probe,
      },
    ],
    ["Live View anunciado a Apple Home", camera.liveViewCapabilities],
    [
      "Solicitud Live View de Apple Home",
      camera.liveViewTelemetry?.active.map((session) => ({
        requestedVideo: session.requestedVideo,
        requestedAudio: session.requestedAudio,
        videoSsrc: session.videoSsrc,
      })),
    ],
    ["Salida efectiva de FFmpeg", camera.liveViewTelemetry],
    [
      "Grabación HKSV",
      {
        configuration: camera.hksvConfiguration,
        capabilities: camera.recordingCapabilities,
        status: camera.homekitStatus,
      },
    ],
  ];
  return (
    <details className="camera-section camera-advanced">
      <summary>Diagnóstico avanzado</summary>
      <p>
        Configuración declarada, no medida: los datos de proveedor y
        configuración se distinguen de las muestras del proceso. Sin medición
        ffprobe vigente no implica cámara averiada.
      </p>
      {children}
      {sections.map(([name, data]) => (
        <details key={String(name)}>
          <summary>{String(name)}</summary>
          <pre>{safeCameraDiagnostics(data)}</pre>
        </details>
      ))}
      <p className="camera-note">
        Incluye metadata disponible de códec, profile/level, resolución, FPS,
        bitrate, pix_fmt, GOP, audio/sample rate/channels, ffprobe, negociación
        HAP, SSRC, RTP/SRTP, Matter y telemetría. Un campo ausente permanece sin
        verificar. No se muestran claves ni URLs firmadas.
      </p>
    </details>
  );
}
