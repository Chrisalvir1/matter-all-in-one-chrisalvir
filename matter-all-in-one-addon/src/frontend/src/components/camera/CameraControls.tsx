import React from "react";
import type { CameraRealEntity } from "../../types";
import { describeCameraControl } from "../../utils/camera-control-presentation";
import {
  cameraControlAction,
  controlAvailability,
} from "../../utils/camera-view";
export function CameraControls({
  entities,
  busy,
  onAction,
}: {
  entities: CameraRealEntity[];
  busy: boolean;
  onAction: (entity: CameraRealEntity) => void;
}) {
  return (
    <section className="camera-section">
      <h3>Controles</h3>
      {!entities.length && (
        <p>
          No hay controles ni sensores asociados informados por el proveedor.
        </p>
      )}
      <div className="camera-controls-list">
        {entities.map((entity) => {
          const presentation = describeCameraControl(entity);
          const available = controlAvailability(entity);
          const action = cameraControlAction(entity);
          return (
            <article key={entity.id} className="camera-control-row">
              <div>
                <strong>
                  {presentation.icon} {entity.name}
                </strong>
                <p>{presentation.description}</p>
                <small>
                  {entity.domain} ·{" "}
                  {available === "stale"
                    ? "Estado desactualizado"
                    : available === "unavailable"
                      ? "No disponible"
                      : available === "unknown"
                        ? "Disponibilidad no verificada"
                        : presentation.stateLabel}
                </small>
              </div>
              {action && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => onAction(entity)}
                >
                  {action === "press"
                    ? /aliment|feed/i.test(`${entity.name} ${entity.id}`)
                      ? "Alimentar ahora"
                      : "Pulsar"
                    : action === "turn_on"
                      ? "Activar"
                      : "Desactivar"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
