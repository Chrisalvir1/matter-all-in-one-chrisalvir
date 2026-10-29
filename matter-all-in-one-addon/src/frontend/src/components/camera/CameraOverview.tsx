import React from "react";
import { cameraView, type CameraViewSource } from "../../utils/camera-view";
export function CameraOverview({ camera }: { camera: CameraViewSource }) {
  const view = cameraView(camera);
  return (
    <section className="camera-section" aria-labelledby="camera-overview-title">
      <h3 id="camera-overview-title">Cámara / Resumen</h3>
      <dl className="camera-facts">
        <div>
          <dt>Nombre</dt>
          <dd>{view.name}</dd>
        </div>
        <div>
          <dt>Fuente</dt>
          <dd>{view.provider}</dd>
        </div>
        {view.model && (
          <div>
            <dt>Modelo</dt>
            <dd>{view.model}</dd>
          </div>
        )}
        <div>
          <dt>Estado general</dt>
          <dd>
            {view.availability === "stale"
              ? "Estado del proveedor desactualizado"
              : view.online
                ? "En línea según el proveedor"
                : view.availability === "offline"
                  ? "Fuera de línea según el proveedor"
                  : "Disponibilidad no verificada"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
