import React from "react";
import { QRCodeDisplay } from "../QRCodeDisplay";
import { cameraView, type CameraViewSource } from "../../utils/camera-view";
import type { CameraRealEntity } from "../../types";
export function CameraExport({
  camera,
  entities,
  busy,
  matterCode,
  onToggle,
  onCommission,
  onEntityCommission,
  onReset,
  children,
}: {
  camera: CameraViewSource;
  entities: CameraRealEntity[];
  busy: boolean;
  matterCode?: { pairingCode: string; manualCode?: string };
  onToggle: () => void;
  onCommission: () => void;
  onEntityCommission: (entity: CameraRealEntity) => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const view = cameraView(camera);
  return (
    <section className="camera-section">
      <h3>Exportación</h3>
      <p>
        HAP:{" "}
        {view.published
          ? "Publicado según el backend"
          : "Sin publicación confirmada"}{" "}
        · Pairing: {view.paired ? "Emparejado" : "Sin confirmar"}
      </p>
      <details>
        <summary>Exportación avanzada</summary>
        <p>Apple Home HAP</p>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={onToggle}
        >
          {view.published
            ? "Desactivar exportación HAP"
            : "Activar exportación HAP"}
        </button>
        {!view.paired && view.setupUri && (
          <QRCodeDisplay
            pairingCode={view.setupUri}
            pinCode={view.pin}
            entityName={view.name}
            variant="hap-homekit"
          />
        )}
        <p>
          El código HAP procede del accesorio; no se genera una identidad
          alternativa.
        </p>
        {view.provider === "Scrypted" && (
          <button
            className="button button-secondary"
            type="button"
            disabled={busy}
            onClick={onCommission}
          >
            Abrir commissioning Matter de la cámara
          </button>
        )}
        {matterCode && (
          <QRCodeDisplay
            pairingCode={matterCode.pairingCode}
            manualCode={matterCode.manualCode}
            entityName={view.name}
            variant="matter-badge"
          />
        )}
        <details>
          <summary>QR Matter por entidad</summary>
          {entities
            .filter((entity) => entity.matterExported)
            .map((entity) => (
              <button
                key={entity.id}
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => onEntityCommission(entity)}
              >
                {entity.name}: abrir commissioning
              </button>
            ))}
          <p>
            Las entidades no exportadas se administran desde su ficha; abrir
            este panel no publica accesorios.
          </p>
        </details>
        {children}
        <details>
          <summary>Recuperación de emparejamiento</summary>
          <p>
            Restablecer elimina el emparejamiento HAP de esta cámara. Requiere
            confirmación explícita y no se recomienda para diagnosticar vídeo.
          </p>
          <button
            className="button button-danger"
            type="button"
            disabled={busy}
            onClick={onReset}
          >
            Restablecer pairing de esta cámara…
          </button>
        </details>
      </details>
    </section>
  );
}
