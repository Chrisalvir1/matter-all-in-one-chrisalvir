import React from "react";
import { cameraView, type CameraViewSource } from "../../utils/camera-view";
import type { CameraRecord } from "../../types";
export function CameraAppleHomeStatus({
  camera,
}: {
  camera: CameraViewSource;
}) {
  const view = cameraView(camera);
  const record = camera as CameraRecord;
  const runtime = camera.homekitStatus;
  const audioDeclared =
    "hasAudio" in camera
      ? camera.hasAudio
      : record.capabilities?.observed?.hasAudio;
  const audioMeasured =
    "videoCodecSource" in camera
      ? camera.videoCodecSource === "ffprobe" && !!camera.codecProbedAt
      : record.source?.streamValidationStatus === "verified";
  const rows = [
    [
      "Live View",
      view.published ? "CONFIGURADO" : "NO VERIFICADO",
      "La publicación HAP no confirma reproducción en Casa.",
    ],
    [
      "Audio",
      audioDeclared === true
        ? "CONFIGURADO"
        : audioDeclared === false && audioMeasured
          ? "NO DISPONIBLE"
          : "NO VERIFICADO",
      "Capacidad informada por la fuente; reproducción no verificada.",
    ],
    [
      "Movimiento",
      runtime?.motionSensorSupported ||
      camera.realEntities?.some((entity) => entity.type === "motion") ||
      record.sensors?.some((sensor) => sensor.type === "motion")
        ? "CONFIGURADO"
        : "NO VERIFICADO",
      "Fuente de movimiento; no requiere clasificación visual.",
    ],
    [
      "HKSV",
      runtime?.hksvEnabled === false
        ? "NO DISPONIBLE"
        : runtime?.hksvEnabled === true || camera.hksvConfiguration
          ? "CONFIGURADO"
          : "NO VERIFICADO",
      "Un estado del backend no confirma un clip guardado en Casa.",
    ],
    [
      "Pairing",
      view.paired ? "CONFIGURADO" : "NO VERIFICADO",
      view.paired
        ? "El backend informa emparejamiento existente."
        : "Sin confirmación de emparejamiento.",
    ],
  ];
  return (
    <section className="camera-section">
      <h3>Apple Home</h3>
      <div className="camera-status-list">
        {rows.map(([name, status, note]) => (
          <div key={name}>
            <strong>{name}</strong>
            <span className="tag">{status}</span>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <p className="camera-note">
        FUNCIONANDO requiere evidencia de reproducción o acción real en Apple
        Home; este panel muestra configuración y estado informado.
      </p>
    </section>
  );
}
