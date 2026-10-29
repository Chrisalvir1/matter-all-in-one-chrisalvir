import React, { useEffect, useRef, useState } from "react";
import type {
  CameraRecord,
  CameraUiCameraItem,
  CameraRealEntity,
  EntityRecord,
} from "../types";
import { api } from "../api/client";
import {
  cameraView,
  cameraControlAction,
  isCameraUiSource,
  safeCameraDiagnostics,
} from "../utils/camera-view";
import { normalizeRtspUrlInput } from "../utils/rtsp-url";
import { copyToClipboard } from "../utils/clipboard";
import { CameraOverview } from "./camera/CameraOverview";
import { CameraAppleHomeStatus } from "./camera/CameraAppleHomeStatus";
import { CameraControls } from "./camera/CameraControls";
import { CameraPerformance } from "./camera/CameraPerformance";
import { CameraExport } from "./camera/CameraExport";
import { CameraDiagnostics } from "./camera/CameraDiagnostics";
export { normalizeRtspUrlInput } from "../utils/rtsp-url";
interface CameraConfigModalProps {
  camera: CameraRecord | CameraUiCameraItem | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}
export const CameraConfigModal: React.FC<CameraConfigModalProps> = (props) =>
  props.camera ? (
    <CameraModalContent
      key={cameraView(props.camera).id}
      {...props}
      camera={props.camera}
    />
  ) : null;
function CameraModalContent({
  camera,
  onClose,
  onRefresh,
  showToast,
}: CameraConfigModalProps & { camera: CameraRecord | CameraUiCameraItem }) {
  const view = cameraView(camera);
  const [streamUrl, setStreamUrl] = useState(view.streamUrl);
  const [transport, setTransport] = useState<"tcp" | "udp">(
    (camera as CameraRecord).exportConfig?.rtspTransportPreference || "tcp",
  );
  const operationPending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [probe, setProbe] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [devices, setDevices] = useState<EntityRecord[]>([]);
  const [snapshot, setSnapshot] = useState<string>();
  const [snapshotError, setSnapshotError] = useState(false);
  const [matterCode, setMatterCode] = useState<{
    pairingCode: string;
    manualCode?: string;
  }>();
  const [ptz, setPtz] = useState<unknown>();
  const [model, setModel] = useState(view.model || "");
  const [bindings, setBindings] = useState({
    lightEntityId: (camera as CameraUiCameraItem).lightEntityId || "auto",
    sirenEntityId: (camera as CameraUiCameraItem).sirenEntityId || "auto",
    motionEntityId: (camera as CameraUiCameraItem).motionEntityId || "auto",
  });
  useEffect(() => {
    let active = true;
    api
      .getDevices()
      .then((list) => {
        if (active) setDevices(list);
      })
      .catch(() => {});
    api
      .getCamerasPtzInfo()
      .then((list) => {
        if (active) setPtz(list.find((item) => item.entityId === view.id));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [view.id]);
  const entities = [
    ...new Map(
      (camera.realEntities || []).map((entity) => {
        const state = devices.find((item) => item.entityId === entity.id);
        const next: CameraRealEntity =
          state && entity.rawState === undefined
            ? {
                ...entity,
                domain: state.domain as CameraRealEntity["domain"],
                rawState: state.state,
                state: state.state === "on",
                availability:
                  state.state === "unavailable"
                    ? "unavailable"
                    : state.state === "unknown"
                      ? "unknown"
                      : typeof state.state === "string"
                        ? "available"
                        : "unknown",
              }
            : entity;
        return [entity.id, next] as const;
      }),
    ).values(),
  ];
  async function run(action: () => Promise<unknown>, success?: string) {
    if (operationPending.current) return;
    operationPending.current = true;
    setBusy(true);
    try {
      const result = await action();
      if (
        result &&
        typeof result === "object" &&
        "success" in result &&
        result.success === false
      )
        throw new Error("El backend rechazó la operación");
      if (success) showToast(success);
      onRefresh();
      try {
        setDevices(await api.getDevices());
      } catch {}
    } catch (error) {
      showToast(
        safeCameraDiagnostics(
          error instanceof Error ? error.message : String(error),
        ),
        true,
      );
    } finally {
      operationPending.current = false;
      setBusy(false);
    }
  }
  const toggleHap = () =>
    run(
      () =>
        isCameraUiSource(camera)
          ? api.toggleCameraUiHomeKit(view.id)
          : api.toggleCameraHomeKit(view.id),
      "Solicitud HAP completada; reproducción pendiente de comprobación.",
    );
  const control = (entity: CameraRealEntity) => {
    const action = cameraControlAction(entity);
    if (action)
      void run(
        () => api.controlCameraEntity(entity.id, action),
        "Comando aceptado por el backend; actualizando estado.",
      );
  };
  const commission = (id: string) =>
    run(async () => {
      const response = await api.openCommissioning(id);
      if (!response.pairingCode)
        throw new Error("El backend no devolvió código Matter");
      setMatterCode({
        pairingCode: response.pairingCode,
        manualCode: response.manualPairingCode,
      });
    });
  const resetPairing = () => {
    if (
      !window.confirm(
        `¿Eliminar el emparejamiento HAP de ${view.name}? Tendrás que volver a enlazar esta cámara.`,
      )
    )
      return;
    void run(() =>
      isCameraUiSource(camera)
        ? api.resetCameraUiPairing(view.id)
        : api.resetCameraPairing(
            (camera as CameraRecord).provider === "home_assistant"
              ? view.id
              : `scrypted.${view.id}`,
          ),
    );
  };
  const inspect = (diagnose: boolean) =>
    run(async () => {
      const target = normalizeRtspUrlInput(streamUrl);
      const result = diagnose
        ? await api.diagnoseCameraStream(view.id, target, transport)
        : await api.verifyCameraStream(view.id, target, transport);
      setProbe(result);
      setMessage(
        diagnose
          ? "Diagnóstico recibido; consultar el resultado medido abajo."
          : "Resultado ffprobe recibido. No prueba reproducción en Apple Home.",
      );
    });
  const saveStream = () =>
    run(async () => {
      const target = normalizeRtspUrlInput(streamUrl);
      if (/[?&](?:token|sign|signature|auth|expires|expire|key)=/i.test(target))
        throw new Error(
          "Las URLs firmadas temporales deben renovarse desde su proveedor; no se guardan aquí.",
        );
      return api.saveCameraStreamUrl(view.id, target);
    }, "Fuente guardada.");
  const saveSettings = () =>
    run(
      () =>
        api.saveCameraExportConfig(
          view.id,
          isCameraUiSource(camera)
            ? bindings
            : { rtspTransportPreference: transport },
        ),
      "Configuración guardada.",
    );
  return (
    <div
      className="modal-backdrop open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <section className="modal camera-settings-modal">
        <header className="camera-settings-header">
          <h2 id="camera-modal-title">{view.name}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="Cerrar cámara"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="camera-settings-content">
          <CameraOverview camera={camera} />
          <CameraAppleHomeStatus camera={camera} />
          <CameraControls entities={entities} busy={busy} onAction={control} />
          <CameraPerformance camera={camera} />
          <CameraExport
            camera={camera}
            entities={entities}
            busy={busy}
            matterCode={matterCode}
            onToggle={toggleHap}
            onCommission={() => void commission(view.id)}
            onEntityCommission={(entity) => void commission(entity.id)}
            onReset={resetPairing}
          >
            {isCameraUiSource(camera) && (
              <fieldset>
                <legend>Entidades vinculadas a HAP</legend>
                {(
                  ["lightEntityId", "sirenEntityId", "motionEntityId"] as const
                ).map((key) => (
                  <label key={key}>
                    {key === "lightEntityId"
                      ? "Luz"
                      : key === "sirenEntityId"
                        ? "Sirena"
                        : "Movimiento"}
                    <select
                      value={bindings[key]}
                      onChange={(event) =>
                        setBindings({ ...bindings, [key]: event.target.value })
                      }
                    >
                      <option value="auto">Detección del backend</option>
                      <option value="none">Ninguna</option>
                      {bindings[key] !== "auto" &&
                        bindings[key] !== "none" &&
                        !entities.some(
                          (entity) => entity.id === bindings[key],
                        ) && (
                          <option value={bindings[key]}>
                            {bindings[key]} (no disponible)
                          </option>
                        )}
                      {entities
                        .filter(
                          (entity) =>
                            entity.type ===
                            (key === "lightEntityId"
                              ? "light"
                              : key === "sirenEntityId"
                                ? "siren"
                                : "motion"),
                        )
                        .map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void saveSettings()}
                >
                  Guardar entidades vinculadas
                </button>
              </fieldset>
            )}
            {!isCameraUiSource(camera) &&
              camera.provider !== "home_assistant" && (
                <label>
                  Transporte RTSP del accesorio
                  <select
                    value={transport}
                    onChange={(event) =>
                      setTransport(event.target.value as "tcp" | "udp")
                    }
                  >
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => void saveSettings()}
                  >
                    Guardar transporte
                  </button>
                </label>
              )}
          </CameraExport>
          <CameraDiagnostics camera={camera} probe={probe}>
            <label>
              URL RTSP de origen
              <input
                type="password"
                autoComplete="off"
                value={streamUrl}
                onChange={(event) => setStreamUrl(event.target.value)}
              />
            </label>
            <div className="camera-action-row">
              {(isCameraUiSource(camera) ||
                camera.provider !== "home_assistant") && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy || !streamUrl.trim()}
                  onClick={() => void saveStream()}
                >
                  Guardar fuente
                </button>
              )}
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => void inspect(false)}
              >
                Verificar con ffprobe
              </button>
              <button
                className="button button-secondary"
                type="button"
                disabled={busy}
                onClick={() => void inspect(true)}
              >
                Medir fuente
              </button>
            </div>
            <label>
              Transporte del diagnóstico
              <select
                value={transport}
                onChange={(event) =>
                  setTransport(event.target.value as "tcp" | "udp")
                }
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </label>
            <p role="status">
              {message || "Sin medición ffprobe vigente en este panel."}
            </p>
            <details>
              <summary>Snapshot del proveedor</summary>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setSnapshotError(false);
                  setSnapshot(api.getCameraSnapshotUrl(view.id));
                }}
              >
                Solicitar snapshot
              </button>
              {snapshot && !snapshotError && (
                <img
                  className="camera-snapshot"
                  src={snapshot}
                  alt="Snapshot del proveedor; puede ser una imagen almacenada y no confirma vídeo en vivo"
                  onError={() => setSnapshotError(true)}
                />
              )}
              {snapshotError && <p>Snapshot no disponible.</p>}
            </details>
            <details>
              <summary>PTZ, presets y posiciones</summary>
              <p>
                Solo se habilitan acciones con contrato real del proveedor. Las
                zonas configuradas del backend no demuestran presets nativos ni
                movimiento físico. Patrol y posición predeterminada no tienen
                contrato común conectado en este modal.
              </p>
              <pre>{safeCameraDiagnostics(ptz)}</pre>
              <p>
                Los botones PTZ nativos asociados, si existen, se muestran en
                Controles. No se genera un joystick a partir del nombre de la
                cámara.
              </p>
            </details>
            {isCameraUiSource(camera) && (
              <label>
                Modelo (etiqueta)
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busy || !model.trim()}
                  onClick={() =>
                    void run(
                      () =>
                        api.saveCameraExportConfig(view.id, {
                          model: model.trim(),
                        }),
                      "Etiqueta de modelo guardada.",
                    )
                  }
                >
                  Guardar etiqueta
                </button>
              </label>
            )}
            <button
              className="button button-secondary"
              type="button"
              onClick={() =>
                void copyToClipboard(
                  safeCameraDiagnostics({ camera, probe, ptz }),
                ).then((ok) =>
                  showToast(
                    ok
                      ? "Diagnóstico sin credenciales copiado"
                      : "No se pudo copiar",
                    !ok,
                  ),
                )
              }
            >
              Copiar diagnóstico sin credenciales
            </button>
          </CameraDiagnostics>
        </div>
        <footer className="camera-settings-footer">
          <span role="status">
            {busy
              ? "Procesando solicitud…"
              : "Los controles se guardan mediante su acción explícita."}
          </span>
          <button
            className="button button-secondary"
            type="button"
            onClick={onClose}
          >
            Cerrar
          </button>
        </footer>
      </section>
    </div>
  );
}
