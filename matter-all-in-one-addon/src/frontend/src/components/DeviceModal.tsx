import React, { useState, useEffect, useMemo } from "react";
import { DeviceRecord, EntityRecord } from "../types";
import { api } from "../api/client";
import { QRCodeDisplay } from "./QRCodeDisplay";
import { AppleHomeIcon } from "./AppleHomeIcon";
import {
  detectDevice,
  getDeviceVisualOverride,
  setDeviceVisualOverride,
  APPLE_HOMEPOD_COLORS,
} from "../utils/deviceDetector";

interface DeviceModalProps {
  device: DeviceRecord | null;
  targetEntity?: EntityRecord | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const DeviceModal: React.FC<DeviceModalProps> = ({
  device,
  targetEntity,
  onClose,
  onRefresh,
  showToast,
}) => {
  const [selectedEntity, setSelectedEntity] = useState<EntityRecord | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [multiAdminOpen, setMultiAdminOpen] = useState(false);

  const [visualType, setVisualType] = useState<string>("auto");
  const [appleColor, setAppleColor] = useState<string>("space_gray");
  const [customRoom, setCustomRoom] = useState<string>("");

  useEffect(() => {
    if (!device) return;
    const initial = targetEntity || device.entities[0] || null;
    setSelectedEntity(initial);
    setMultiAdminOpen(false);

    const ov =
      getDeviceVisualOverride(device.id) ||
      (device.entities[0] ? getDeviceVisualOverride(device.entities[0].entityId) : null);
    const det = detectDevice(device);
    setVisualType(ov?.visualType || "auto");
    setAppleColor(ov?.appleColor || det.appleColor || "space_gray");
    setCustomRoom(ov?.roomLabel || "");
  }, [device, targetEntity]);

  if (!device) return null;

  const detected = detectDevice(device);
  const effectiveSubtype = visualType === "auto" ? detected.subtype : visualType;
  const isHomePodSubtype =
    effectiveSubtype === "homepod_mini" || effectiveSubtype === "homepod";
  const activeHomePodModel =
    effectiveSubtype === "homepod" ? "homepod" : "homepod_mini";
  const availableAppleColors =
    APPLE_HOMEPOD_COLORS[activeHomePodModel] || APPLE_HOMEPOD_COLORS.homepod_mini;

  const handleSaveVisualOverride = (
    newType: string,
    newColor: string,
    newRoom: string
  ) => {
    setDeviceVisualOverride(device.id, {
      visualType: newType,
      appleColor: newColor,
      roomLabel: newRoom.trim() || undefined,
    });
    setVisualType(newType);
    setAppleColor(newColor);
    setCustomRoom(newRoom);
    showToast("✓ Apariencia de hardware guardada");
    onRefresh();
  };

  const sortedEntities = [...device.entities].sort((a, b) => {
    if (targetEntity) {
      if (a.entityId === targetEntity.entityId) return -1;
      if (b.entityId === targetEntity.entityId) return 1;
    }
    const primaryDelta =
      Number(b.entityId === b.compositePrimaryEntityId) -
      Number(a.entityId === a.compositePrimaryEntityId);
    return (
      primaryDelta ||
      Number(b.exported) - Number(a.exported) ||
      (a.name || a.entityId).localeCompare(b.name || b.entityId)
    );
  });

  const isH7133 =
    (device.model || "").toUpperCase().includes("H7133") ||
    (device.name || "").toLowerCase().includes("h7133") ||
    (detected.brand === "Govee" &&
      (detected.subtype === "tower_fan" ||
        (device.name || "").toLowerCase().includes("ventilador")));

  const planAEntity = useMemo(() => {
    return (
      device.entities.find(
        (e) =>
          e.domain === "fan" ||
          (e.domain === "switch" &&
            !e.entityId.includes("auto_stop") &&
            (e.entityId.toLowerCase().includes("ventilador") ||
              (e.name || "").toLowerCase().includes("ventilador")))
      ) ||
      device.entities.find(
        (e) => e.domain === "switch" && !e.entityId.includes("auto_stop")
      ) ||
      device.entities[0] ||
      null
    );
  }, [device.entities]);

  const planBEntity = useMemo(() => {
    return (
      device.entities.find(
        (e) =>
          e.domain === "climate" ||
          e.entityId.includes("auto_stop") ||
          (e.name || "").toLowerCase().includes("auto_stop") ||
          (e.name || "").toLowerCase().includes("calefactor")
      ) ||
      device.entities.find(
        (e) => e.entityId !== planAEntity?.entityId && e.domain === "switch"
      ) ||
      device.entities[1] ||
      null
    );
  }, [device.entities, planAEntity]);

  const [h7133Tab, setH7133Tab] = useState<"plan_a" | "plan_b">("plan_a");

  const effectiveEntity = isH7133
    ? h7133Tab === "plan_a"
      ? selectedEntity && (selectedEntity.entityId === planAEntity?.entityId || selectedEntity.domain === "light" || selectedEntity.domain === "sensor")
        ? selectedEntity
        : planAEntity
      : selectedEntity && (selectedEntity.entityId === planBEntity?.entityId || selectedEntity.domain === "climate")
      ? selectedEntity
      : planBEntity
    : selectedEntity || sortedEntities[0] || null;

  const activeEntity = effectiveEntity;

  // The entity targeted by the QR code panel:
  const targetQrEntity = isH7133
    ? (h7133Tab === "plan_a" ? planAEntity : planBEntity) || activeEntity
    : activeEntity;

  const isTargetExported = Boolean(targetQrEntity?.exported);
  const isTargetCommissioned = Boolean(targetQrEntity?.commissioned);

  // Pairing code: target QR entity's code, or fall back to device code
  const pairingCode =
    targetQrEntity?.pairingCode ||
    (isH7133
      ? (h7133Tab === "plan_a" ? planAEntity?.pairingCode : planBEntity?.pairingCode) || ""
      : device.entities.find((e) => e.pairingCode)?.pairingCode || "");

  const manualCode =
    targetQrEntity?.manualPairingCode ||
    (isH7133
      ? (h7133Tab === "plan_a" ? planAEntity?.manualPairingCode : planBEntity?.manualPairingCode) || pairingCode
      : device.entities.find((e) => e.manualPairingCode)?.manualPairingCode || pairingCode);

  const isExported = Boolean(activeEntity?.exported);
  const isCommissioned = Boolean(activeEntity?.commissioned);

  const handleActivatePlanA = async () => {
    if (!planAEntity) return;
    setIsBusy(true);
    showToast("Activando Plan A (Ventilador Matter)...");
    try {
      await api.setDeviceProfile(planAEntity.entityId, "fan").catch(() => {});
      const reg = await api.toggleExport(planAEntity.entityId, true);
      planAEntity.exported = true;
      if (reg?.pairingCode) {
        planAEntity.pairingCode = reg.pairingCode;
        if (reg.manualPairingCode) planAEntity.manualPairingCode = reg.manualPairingCode;
      } else {
        const comm = await api.openCommissioning(planAEntity.entityId).catch(() => null);
        if (comm?.pairingCode) {
          planAEntity.pairingCode = comm.pairingCode;
          if (comm.manualPairingCode) planAEntity.manualPairingCode = comm.manualPairingCode;
        }
      }

      // Also publish companion light & temperature if present
      const lightEnt = device.entities.find((e) => e.domain === "light");
      if (lightEnt && !lightEnt.exported) {
        await api.toggleExport(lightEnt.entityId, true).catch(() => {});
        lightEnt.exported = true;
      }
      const tempEnt = device.entities.find((e) => e.domain === "sensor");
      if (tempEnt && !tempEnt.exported) {
        await api.toggleExport(tempEnt.entityId, true).catch(() => {});
        tempEnt.exported = true;
      }

      setH7133Tab("plan_a");
      setSelectedEntity(planAEntity);
      showToast("✓ Plan A Activado: Código QR de Ventilador generado exitosamente");
      setTimeout(() => onRefresh(), 500);
    } catch (err: any) {
      showToast(err.message || "Error al activar Plan A", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleActivatePlanB = async () => {
    if (!planBEntity) return;
    setIsBusy(true);
    showToast("Activando Plan B (Calefactor / Clima)...");
    try {
      await api.setDeviceProfile(planBEntity.entityId, "thermostat").catch(() => {});
      const reg = await api.toggleExport(planBEntity.entityId, true);
      planBEntity.exported = true;
      if (reg?.pairingCode) {
        planBEntity.pairingCode = reg.pairingCode;
        if (reg.manualPairingCode) planBEntity.manualPairingCode = reg.manualPairingCode;
      } else {
        const comm = await api.openCommissioning(planBEntity.entityId).catch(() => null);
        if (comm?.pairingCode) {
          planBEntity.pairingCode = comm.pairingCode;
          if (comm.manualPairingCode) planBEntity.manualPairingCode = comm.manualPairingCode;
        }
      }

      // Also ensure temperature sensor is exported for thermostat readings
      const tempEnt = device.entities.find((e) => e.domain === "sensor");
      if (tempEnt && !tempEnt.exported) {
        await api.toggleExport(tempEnt.entityId, true).catch(() => {});
        tempEnt.exported = true;
      }

      setH7133Tab("plan_b");
      setSelectedEntity(planBEntity);
      showToast("✓ Plan B Activado: Código QR de Calefactor generado por separado");
      setTimeout(() => onRefresh(), 500);
    } catch (err: any) {
      showToast(err.message || "Error al activar Plan B", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleExportPlan = async (plan: "plan_a" | "plan_b" | "both") => {
    if (plan === "plan_a") {
      await handleActivatePlanA();
    } else if (plan === "plan_b") {
      await handleActivatePlanB();
    } else {
      await handleActivatePlanA();
      await handleActivatePlanB();
      showToast("✓ Ambos planes activados: Cada uno tiene su propio Código QR");
    }
  };

  const getFriendlyEntityName = (ent: EntityRecord | null): string => {
    if (!ent) return "Selecciona una entidad";
    const id = ent.entityId.toLowerCase();
    const name = (ent.name || "").toLowerCase();
    if (isH7133 || id.includes("h7133") || name.includes("ventilador")) {
      if (ent.domain === "light") return "💡 Luz Nocturna / LED";
      if (id.includes("auto_stop")) return "🔥 Calefactor / Auto-Stop (Plan B)";
      if (id.includes("temp") || ent.domain === "sensor") return "🌡️ Sensor de Temperatura Ambiente";
      if (id.includes("ventilador") || ent.domain === "fan" || ent.domain === "switch") return "🌪️ Ventilador Principal (Plan A)";
    }
    return ent.name || ent.entityId;
  };

  const handleToggleExport = async (entity: EntityRecord) => {
    try {
      const nextState = !entity.exported;
      const res = await api.toggleExport(entity.entityId, nextState);
      entity.exported = nextState;
      if (nextState && res?.pairingCode) {
        entity.pairingCode = res.pairingCode;
        if (res.manualPairingCode) entity.manualPairingCode = res.manualPairingCode;
      }
      showToast(
        nextState
          ? `✓ ${getFriendlyEntityName(entity)} publicado en Matter`
          : `Retirado de Matter`
      );
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al modificar publicación", true);
    }
  };

  const handleReconnect = async () => {
    await handleReconnectForEntity(targetQrEntity || activeEntity);
  };

  const handleReconnectForEntity = async (ent: EntityRecord | null) => {
    if (!ent) return;
    setIsBusy(true);
    showToast("Reconectando accesorio Matter...");
    try {
      await api.reconnectAccessory(
        ent.compositeDeviceId || ent.entityId
      );
      showToast("✓ Accesorio reconectado");
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al reconectar", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenCommissioning = async () => {
    await handleOpenCommissioningForEntity(targetQrEntity || activeEntity);
  };

  const handleOpenCommissioningForEntity = async (ent: EntityRecord | null) => {
    if (!ent) return;
    setIsBusy(true);
    try {
      const res = await api.openCommissioning(ent.entityId);
      if (res?.pairingCode) {
        ent.pairingCode = res.pairingCode;
        if (res.manualPairingCode) ent.manualPairingCode = res.manualPairingCode;
      }
      setMultiAdminOpen(true);
      showToast(
        "✓ Código QR generado y modo emparejamiento abierto (15 min)"
      );
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al abrir Multi-Admin", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetAccessory = async () => {
    await handleResetAccessoryForEntity(targetQrEntity || activeEntity);
  };

  const handleResetAccessoryForEntity = async (ent: EntityRecord | null) => {
    if (!ent) return;
    if (
      !confirm(
        "¿Desconectar este accesorio de todas las casas y generar un nuevo código QR limpio?"
      )
    )
      return;
    setIsBusy(true);
    try {
      const res = await api.resetAccessory(ent.entityId);
      if (res?.pairingCode) {
        ent.pairingCode = res.pairingCode;
        if (res.manualPairingCode) ent.manualPairingCode = res.manualPairingCode;
      }
      showToast("✓ Accesorio desvinculado y nuevo QR generado");
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al desvincular", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyDiagnostics = () => {
    const target = targetQrEntity || activeEntity;
    if (!target) return;
    const diagText = JSON.stringify(
      {
        entityId: target.entityId,
        name: target.name,
        domain: target.domain,
        exported: target.exported,
        commissioned: target.commissioned,
        logs: selectedEntity?.logs || target.logs || [],
      },
      null,
      2
    );
    navigator.clipboard.writeText(diagText).then(() => {
      showToast("✓ Diagnóstico copiado al portapapeles");
    });
  };

  const activeNodesCount = new Set(
    device.entities.filter((e) => e.exported).map((e) => e.compositeDeviceId || e.entityId)
  ).size;

  const logs = selectedEntity?.logs || activeEntity?.logs || [];

  return (
    <div
      className="modal-backdrop open"
      id="device-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-modal-name"
    >
      <section
        className="modal modal-wide modal-fullscreen"
        style={{
          width: "min(98vw, 1720px)",
          maxWidth: "98vw",
          height: "min(96vh, 960px)",
          maxHeight: "96vh",
          display: "flex",
          flexDirection: "column",
          padding: "24px 32px",
        }}
      >
        <button
          className="icon-button"
          id="device-modal-close"
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
        >
          ×
        </button>

        <header className="modal-header" style={{ marginBottom: 8 }}>
          <span className="modal-icon" id="device-modal-icon">
            <AppleHomeIcon
              domain={device.entities[0]?.domain || "switch"}
              state={device.entities[0]?.state}
              attributes={device.entities[0]?.attributes}
              size={36}
            />
          </span>
          <div>
            <p className="eyebrow">DISPOSITIVO IOT · MATTER ALL-IN-ONE</p>
            <h2 id="device-modal-name">{device.name}</h2>
            <p className="entity-id" id="device-modal-id">
              {device.manufacturer ? `${device.manufacturer} · ` : ""}
              {device.model ? `${device.model} · ` : ""}
              {device.area ? `📍 ${device.area}` : device.id}
            </p>
          </div>
        </header>

        <div
          className="modal-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "350px minmax(0, 1fr) 420px",
            gap: 24,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            alignItems: "stretch",
          }}
        >
          {/* Column 1: Entity List */}
          <div className="entity-list-col" style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
            <div className="section-header">
              <h3>Entidades disponibles</h3>
              <span id="modal-export-count">
                {activeNodesCount
                  ? `${activeNodesCount} accesorio Matter · ${device.entities.filter((e) => e.exported).length}/${device.entities.length} endpoints`
                  : `0/${device.entities.length} publicadas`}
              </span>
            </div>
            <div
              className="entity-list"
              id="entity-list"
              style={{
                flex: 1,
                minHeight: 0,
                maxHeight: "none",
                overflowY: "auto",
              }}
            >
              {sortedEntities.map((ent) => {
                const isSelected = activeEntity?.entityId === ent.entityId;
                return (
                  <div
                    key={ent.entityId}
                    className={`entity-row${ent.exported ? "" : " dimmed"}${isSelected ? " selected" : ""}`}
                    onClick={() => {
                      setSelectedEntity(ent);
                      if (isH7133) {
                        if (ent.entityId === planAEntity?.entityId) {
                          setH7133Tab("plan_a");
                        } else if (ent.entityId === planBEntity?.entityId) {
                          setH7133Tab("plan_b");
                        }
                      }
                    }}
                  >
                    <span className="entity-row-icon">
                      <AppleHomeIcon
                        domain={ent.domain}
                        state={ent.state}
                        attributes={ent.attributes}
                        size={22}
                      />
                    </span>
                    <div>
                      <div className="entity-row-name">
                        {getFriendlyEntityName(ent)}
                      </div>
                      <div className="entity-row-id">{ent.entityId}</div>
                      <span
                        className={`entity-state${ent.state === "on" ? " on" : ""}`}
                      >
                        {ent.state || "desconocido"}
                      </span>
                    </div>
                    <div
                      className="export-control"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(ent.exported)}
                          onChange={() => handleToggleExport(ent)}
                        />
                        <span />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 2: Selection Panel */}
          <aside
            className="selection-panel"
            id="selection-panel"
            style={{
              flex: 1,
              minHeight: 0,
              maxHeight: "none",
              overflowY: "auto",
              padding: 22,
              gap: 14,
            }}
          >
            {/* Govee H7133 Plan A & Plan B Quick Assistant */}
            {/* Govee H7133 Dual Plan Selector Assistant Card */}
            {isH7133 && (
              <div
                className="h7133-assistant-card"
                style={{
                  background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))",
                  border: "1px solid rgba(56, 189, 248, 0.35)",
                  borderRadius: 14,
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24 }}>🌪️🔥</span>
                    <div>
                      <strong style={{ fontSize: 13, color: "#38BDF8", display: "block" }}>
                        Govee H7133 · Publicación Matter Independiente
                      </strong>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>
                        Cada plan genera su propio Código QR para Apple Home / Google Home
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {/* Plan A Card */}
                  <div
                    style={{
                      background: h7133Tab === "plan_a" ? "rgba(2, 132, 199, 0.22)" : "rgba(255, 255, 255, 0.04)",
                      border: h7133Tab === "plan_a" ? "1.5px solid #38BDF8" : "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ fontSize: 12, color: "#38BDF8" }}>🌪️ Plan A: Ventilador</strong>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: planAEntity?.commissioned
                            ? "rgba(34, 197, 94, 0.2)"
                            : planAEntity?.exported
                            ? "rgba(56, 189, 248, 0.2)"
                            : "rgba(255, 255, 255, 0.1)",
                          color: planAEntity?.commissioned
                            ? "#4ade80"
                            : planAEntity?.exported
                            ? "#38bdf8"
                            : "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        {planAEntity?.commissioned ? "🏠 Vinculado" : planAEntity?.exported ? "✓ QR Listo" : "Sin publicar"}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "#cbd5e1", margin: 0 }}>
                      Ventilador de torre con velocidades, oscilación, luz nocturna y sensor.
                    </p>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setH7133Tab("plan_a");
                          if (planAEntity) setSelectedEntity(planAEntity);
                          if (!planAEntity?.exported) handleActivatePlanA();
                        }}
                        disabled={isBusy}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: planAEntity?.exported
                            ? (h7133Tab === "plan_a" ? "#0284c7" : "rgba(56, 189, 248, 0.25)")
                            : "linear-gradient(135deg, #0284c7, #0369a1)",
                          border: "1px solid #38bdf8",
                          color: "#FFF",
                          cursor: "pointer",
                        }}
                      >
                        {planAEntity?.exported ? "📱 Ver QR Plan A" : "🚀 Activar Plan A"}
                      </button>
                    </div>
                  </div>

                  {/* Plan B Card */}
                  <div
                    style={{
                      background: h7133Tab === "plan_b" ? "rgba(234, 88, 12, 0.22)" : "rgba(255, 255, 255, 0.04)",
                      border: h7133Tab === "plan_b" ? "1.5px solid #FB923C" : "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <strong style={{ fontSize: 12, color: "#FB923C" }}>🔥 Plan B: Calefactor</strong>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: planBEntity?.commissioned
                            ? "rgba(34, 197, 94, 0.2)"
                            : planBEntity?.exported
                            ? "rgba(251, 146, 60, 0.2)"
                            : "rgba(255, 255, 255, 0.1)",
                          color: planBEntity?.commissioned
                            ? "#4ade80"
                            : planBEntity?.exported
                            ? "#fb923c"
                            : "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        {planBEntity?.commissioned ? "🏠 Vinculado" : planBEntity?.exported ? "✓ QR Listo" : "Sin publicar"}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "#cbd5e1", margin: 0 }}>
                      Accesorio Calefactor / Termostato Matter independiente con dial térmico.
                    </p>
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setH7133Tab("plan_b");
                          if (planBEntity) setSelectedEntity(planBEntity);
                          if (!planBEntity?.exported) handleActivatePlanB();
                        }}
                        disabled={isBusy}
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          background: planBEntity?.exported
                            ? (h7133Tab === "plan_b" ? "#ea580c" : "rgba(251, 146, 60, 0.25)")
                            : "linear-gradient(135deg, #ea580c, #c2410c)",
                          border: "1px solid #fb923c",
                          color: "#FFF",
                          cursor: "pointer",
                        }}
                      >
                        {planBEntity?.exported ? "📱 Ver QR Plan B" : "🚀 Activar Plan B"}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleExportPlan("both")}
                  disabled={isBusy}
                  style={{
                    padding: "7px 12px",
                    background: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 8,
                    color: "#E2E8F0",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <span>⚡ Activar Ambos Planes (QR Ventilador + QR Calefactor)</span>
                </button>
              </div>
            )}

            <p className="card-label">SELECCIÓN Y CONFIGURACIÓN</p>
            <h3 id="selection-title">
              <span className="selection-title-text">
                {getFriendlyEntityName(activeEntity)}
              </span>
              {isCommissioned && (
                <span className="home-badge commissioned">
                  🏠 Vinculado
                </span>
              )}
            </h3>
            <p id="selection-description">
              {isExported
                ? "Esta entidad está activa y expuesta a través de Matter."
                : "Activa el interruptor para publicar este canal en Matter."}
            </p>

            <dl className="selection-meta" id="selection-meta">
              <div>
                <dt>Entidad ID</dt>
                <dd>{activeEntity?.entityId || "—"}</dd>
              </div>
              <div>
                <dt>Dominio</dt>
                <dd>{activeEntity?.domain || "—"}</dd>
              </div>
              {activeEntity?.area_name && (
                <div>
                  <dt>Área</dt>
                  <dd>{activeEntity.area_name}</dd>
                </div>
              )}
              <div>
                <dt>Estado Matter</dt>
                <dd>{isCommissioned ? "Emparejado en red Matter" : isExported ? "Listo para vincular" : "Sin publicar"}</dd>
              </div>
            </dl>

            {/* Custom Visual Silhouette / Hardware Appearance */}
            <section
              className="appearance-customization-section"
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🎨</span>
                  <strong style={{ fontSize: 13, color: "var(--text-primary, #fff)" }}>
                    Silueta y Hardware Visual
                  </strong>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-secondary, #94A3B8)" }}>
                  {detected.brand} · {detected.category}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary, #94A3B8)", fontWeight: 500 }}>
                  Tipo de Accesorio / Silueta
                </label>
                <select
                  value={visualType}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleSaveVisualOverride(val, appleColor, customRoom);
                  }}
                  style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    color: "var(--text-primary, #fff)",
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="auto">✨ Detección Inteligente Automática ({detected.category})</option>
                  <optgroup label="💡 Iluminación">
                    <option value="bulb">Bombilla Estándar / Techo</option>
                    <option value="chandelier">Candelabro Colgante de Techo (Cristal)</option>
                    <option value="hanging_bulbs">Bombillos de Filamento Colgantes con Dimmer</option>
                    <option value="ceiling_spot">Foco Empotrado en Techo (Downlight / Spot Govee)</option>
                    <option value="led_strip">Tira LED / Neón RGBIC</option>
                    <option value="govee_light_bars">Barras de Luz RGBIC / Torres (Govee Flow)</option>
                    <option value="govee_dreamview">Govee DreamView TV Backlight</option>
                    <option value="govee_permanent_outdoor">Luces Exteriores Permanentes (Govee)</option>
                    <option value="govee_ground_lights">Luces de Suelo / Sendero Exterior (Govee)</option>
                    <option value="govee_lyra">Lámpara de Pie Esquina (Govee Lyra)</option>
                  </optgroup>
                  <optgroup label="🌀 Clima y Ventilación">
                    <option value="ceiling_fan">Ventilador de Techo Negro Mate con Luz</option>
                    <option value="tower_fan">Ventilador de Torre Oscilante</option>
                  </optgroup>
                  <optgroup label="🍎 Apple Audio y Video">
                    <option value="apple_tv">Apple TV 4K (Pantalla 16:9 OLED con Carátula)</option>
                    <option value="homepod_mini">Apple HomePod Mini (Esfera Acústica 3D)</option>
                    <option value="homepod">Apple HomePod (Cilindro Acústico Grande)</option>
                  </optgroup>
                  <optgroup label="📦 Amazon Alexa & Echo">
                    <option value="echo_dot">Amazon Echo Dot (Esfera Acústica con Anillo Cyan)</option>
                    <option value="echo_show">Amazon Echo Show (Pantalla Inteligente 16:9)</option>
                    <option value="echo_studio">Amazon Echo Studio (Altavoz de Alta Fidelidad)</option>
                    <option value="echo_pop">Amazon Echo Pop (Altavoz Compacto Frontal)</option>
                    <option value="fire_tv">Amazon Fire TV (Stick HDMI con Control)</option>
                  </optgroup>
                  <optgroup label="🔒 Seguridad y Cámaras">
                    <option value="doorbell">Timbre con Video y Campanilla</option>
                    <option value="ptz_camera">Cámara Domo PTZ 360°</option>
                    <option value="bullet_camera">Cámara Exterior Bala</option>
                    <option value="keypad_deadbolt">Cerradura con Teclado Numérico Táctil</option>
                    <option value="smart_turn_lock">Cerrojo Giratorio Interior</option>
                  </optgroup>
                  <optgroup label="🔌 Interruptores y Energía">
                    <option value="multi_gang_switch">Apagador Táctil de Pared (Multi-Canal)</option>
                    <option value="smart_plug">Enchufe Inteligente con Medidor</option>
                  </optgroup>
                </select>
              </div>

              {/* HomePod Official Apple Color Picker */}
              {isHomePodSubtype && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary, #94A3B8)", fontWeight: 500 }}>
                    Color Oficial de Venta Apple ({activeHomePodModel === "homepod_mini" ? "HomePod Mini" : "HomePod"})
                  </label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {Object.entries(availableAppleColors).map(([colorKey, colorCfg]) => {
                      const isSelected = appleColor === colorKey;
                      return (
                        <button
                          key={colorKey}
                          type="button"
                          onClick={() => handleSaveVisualOverride(visualType, colorKey, customRoom)}
                          title={`Color Apple: ${colorCfg.name}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 10px",
                            borderRadius: 16,
                            background: isSelected ? "rgba(255, 255, 255, 0.16)" : "rgba(255, 255, 255, 0.05)",
                            border: isSelected ? "1.5px solid #38BDF8" : "1px solid rgba(255, 255, 255, 0.1)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              background: colorCfg.hex,
                              boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              display: "inline-block",
                            }}
                          />
                          <span style={{ fontSize: 11, color: isSelected ? "#fff" : "var(--text-secondary, #94A3B8)" }}>
                            {colorCfg.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Room / Area Label Override */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, color: "var(--text-secondary, #94A3B8)", fontWeight: 500 }}>
                  Habitación / Área Visual (Deducida: {detected.inferredArea || "Sin área"})
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={customRoom}
                    placeholder="Ej. Sala, Cocina, Playroom, Balcón..."
                    onChange={(e) => setCustomRoom(e.target.value)}
                    onBlur={() => handleSaveVisualOverride(visualType, appleColor, customRoom)}
                    style={{
                      flex: 1,
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "var(--text-primary, #fff)",
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      outline: "none",
                    }}
                  />
                  {customRoom && (
                    <button
                      type="button"
                      onClick={() => handleSaveVisualOverride(visualType, appleColor, "")}
                      style={{
                        padding: "4px 10px",
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        color: "var(--text-secondary, #94A3B8)",
                        borderRadius: 8,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Fabrics section */}
            <section className="fabrics-section" id="fabrics-section">
              <div className="fabrics-heading">
                <span className="fabrics-icon" aria-hidden="true">🏠</span>
                <strong>Casas / Controladores Conectados</strong>
              </div>
              <p className="fabrics-subtitle">
                Desconectar de ecosistemas Matter existentes si cambias de controlador o si ya eliminaste este accesorio en tu app de Apple Home, Google Home o Alexa.
              </p>
            </section>

            {/* Diagnostics Panel */}
            <section
              className="diagnostics-panel"
              id="diagnostics-panel"
              aria-live="polite"
            >
              <div className="diagnostics-heading">
                <span id="diagnostics-icon" aria-hidden="true">✓</span>
                <strong id="diagnostics-heading-text">Diagnóstico y logs</strong>
                <button
                  id="copy-diagnostics-button"
                  className="copy-diagnostics-button"
                  type="button"
                  onClick={handleCopyDiagnostics}
                  title="Copiar diagnóstico y logs"
                >
                  Copiar
                </button>
              </div>
              <p id="diagnostics-summary">
                {logs.length === 0 ? (
                  "Sin errores registrados para este accesorio."
                ) : (
                  `${logs.length} eventos registrados`
                )}
              </p>
              {logs.length > 0 && (
                <ul id="diagnostics-list">
                  {(logs as any[]).slice(-6).map((l: any, i: number) => (
                    <li key={i}>{typeof l === "string" ? l : (l as any)?.message || JSON.stringify(l)}</li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          {/* Column 3: QR Panel */}
          <div
            className="qr-panel"
            id="qr-panel"
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              height: "100%",
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {/* Govee H7133 Dedicated QR Plan Switcher */}
            {isH7133 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  background: "rgba(0, 0, 0, 0.35)",
                  padding: 5,
                  borderRadius: 12,
                  marginBottom: 14,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setH7133Tab("plan_a");
                    if (planAEntity) setSelectedEntity(planAEntity);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: h7133Tab === "plan_a" ? "1.5px solid #38BDF8" : "1px solid transparent",
                    background: h7133Tab === "plan_a" ? "rgba(2, 132, 199, 0.45)" : "transparent",
                    color: h7133Tab === "plan_a" ? "#FFF" : "#94A3B8",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>🌪️ QR Plan A</span>
                  <small style={{ fontSize: 10, color: planAEntity?.exported ? "#38bdf8" : "#94a3b8" }}>
                    Ventilador {planAEntity?.commissioned ? "🏠 Vinculado" : planAEntity?.exported ? "✓ QR Listo" : "(Inactivo)"}
                  </small>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setH7133Tab("plan_b");
                    if (planBEntity) setSelectedEntity(planBEntity);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: h7133Tab === "plan_b" ? "1.5px solid #FB923C" : "1px solid transparent",
                    background: h7133Tab === "plan_b" ? "rgba(234, 88, 12, 0.4)" : "transparent",
                    color: h7133Tab === "plan_b" ? "#FFF" : "#94A3B8",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 2,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>🔥 QR Plan B</span>
                  <small style={{ fontSize: 10, color: planBEntity?.exported ? "#fb923c" : "#94a3b8" }}>
                    Calefactor {planBEntity?.commissioned ? "🏠 Vinculado" : planBEntity?.exported ? "✓ QR Listo" : "(Inactivo)"}
                  </small>
                </button>
              </div>
            )}

            <p className="card-label">
              {isH7133
                ? h7133Tab === "plan_a"
                  ? "CÓDIGO QR · PLAN A (VENTILADOR MATTER)"
                  : "CÓDIGO QR · PLAN B (CALEFACTOR / TERMOSTATO)"
                : "CÓDIGO MATTER"}
            </p>
            <div
              className={`qr-status-label${isTargetCommissioned ? " commissioned" : isTargetExported ? " active" : ""}`}
              id="qr-status-label"
            >
              {isTargetCommissioned
                ? "Vinculado a Matter"
                : isTargetExported
                  ? "Listo para emparejar"
                  : "Sin publicar"}
            </div>

            {isTargetCommissioned && !multiAdminOpen && (
              <div className="commissioned-hint" style={{ display: "block" }}>
                <p className="hint-title">🔒 Vinculado a Matter</p>
                <p className="hint-desc">
                  Este accesorio ya tiene una casa registrada en Matter. Para
                  emparejarlo en una segunda plataforma, pulsa «Modo Multi-Admin».
                </p>
              </div>
            )}

            {multiAdminOpen && (
              <div id="multi-admin-hint" className="multi-admin-hint" style={{ display: "block" }}>
                <p className="hint-title">🌐 Modo Multi-Admin Abierto (15 min)</p>
                <p className="hint-desc">
                  Ventana de emparejamiento abierta. Escanea este código QR en
                  <strong> Google Home</strong>, <strong>Alexa</strong> o{" "}
                  <strong>SmartThings</strong>.
                </p>
              </div>
            )}

            {isTargetExported ? (
              pairingCode ? (
                <QRCodeDisplay
                  pairingCode={pairingCode}
                  manualCode={manualCode}
                  entityName={
                    isH7133
                      ? (h7133Tab === "plan_a" ? "Govee H7133 Ventilador" : "Govee H7133 Calefactor")
                      : targetQrEntity?.name || device.name
                  }
                  elementId="device-qr-code"
                  noteText={
                    isH7133
                      ? (h7133Tab === "plan_a"
                          ? "🌪️ Plan A: Escanea para vincular como Ventilador Matter en Apple Home o Google Home"
                          : "🔥 Plan B: Escanea para vincular como Calefactor / Termostato en Apple Home o Google Home")
                      : "Escanea con Apple Home, Google Home, Alexa o SmartThings"
                  }
                />
              ) : (
                <div
                  className="qr-liquid-glass-card"
                  style={{
                    padding: 24,
                    textAlign: "center",
                    background: "rgba(255, 255, 255, 0.04)",
                    borderRadius: 16,
                    border: "1px dashed rgba(56, 189, 248, 0.4)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 32 }}>🔄</div>
                  <strong style={{ color: "#FFF", fontSize: 13 }}>
                    {isH7133
                      ? (h7133Tab === "plan_a" ? "Plan A (Ventilador) Publicado en Matter" : "Plan B (Calefactor) Publicado en Matter")
                      : "Accesorio Publicado en Matter"}
                  </strong>
                  <p style={{ color: "#94A3B8", fontSize: 12, margin: 0 }}>
                    Pulsa a continuación para abrir la ventana de emparejamiento y visualizar el Código QR.
                  </p>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => handleOpenCommissioningForEntity(targetQrEntity)}
                    disabled={isBusy}
                    style={{
                      padding: "10px 18px",
                      fontSize: 13,
                      fontWeight: 600,
                      borderRadius: 10,
                      background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                      border: "none",
                      color: "#FFF",
                      cursor: "pointer",
                      boxShadow: "0 2px 10px rgba(2, 132, 199, 0.4)",
                    }}
                  >
                    ⚡ Mostrar Código QR de Emparejamiento
                  </button>
                </div>
              )
            ) : (
              <div
                className="qr-liquid-glass-card"
                style={{
                  padding: 24,
                  textAlign: "center",
                  background: "rgba(255, 255, 255, 0.03)",
                  borderRadius: 16,
                  border: "1px dashed rgba(255, 255, 255, 0.15)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 32 }}>{isH7133 ? (h7133Tab === "plan_a" ? "🌪️" : "🔥") : "⚡"}</div>
                <strong style={{ color: "#FFF", fontSize: 14 }}>
                  {isH7133
                    ? (h7133Tab === "plan_a" ? "Código QR · Plan A: Ventilador" : "Código QR · Plan B: Calefactor")
                    : "Accesorio Matter Inactivo"}
                </strong>
                <p style={{ color: "var(--text-secondary, #94a3b8)", fontSize: 12, margin: 0 }}>
                  {isH7133
                    ? (h7133Tab === "plan_a"
                        ? "Activa el Plan A para generar su propio Código QR de vinculación como Ventilador Matter."
                        : "Activa el Plan B para generar su propio Código QR de vinculación como Calefactor / Termostato.")
                    : "Activa la entidad para generar el código QR de vinculación Matter."}
                </p>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    if (isH7133) {
                      if (h7133Tab === "plan_a") handleActivatePlanA();
                      else handleActivatePlanB();
                    } else if (targetQrEntity) {
                      handleToggleExport(targetQrEntity);
                    } else if (sortedEntities[0]) {
                      handleToggleExport(sortedEntities[0]);
                    }
                  }}
                  disabled={isBusy}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    borderRadius: "10px",
                    background: isH7133 && h7133Tab === "plan_b"
                      ? "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)"
                      : "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.3)",
                  }}
                >
                  🚀 {isH7133 ? (h7133Tab === "plan_a" ? "Activar y Generar QR de Ventilador (Plan A)" : "Activar y Generar QR de Calefactor (Plan B)") : "Activar y Generar Código QR"}
                </button>
              </div>
            )}

            <div className="accessory-controls" id="accessory-controls" style={{ marginTop: "auto", paddingTop: 12 }}>
              {isTargetExported && (
                <div className="matter-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    className="button button-secondary action-btn"
                    id="reconnect-accessory-button"
                    type="button"
                    onClick={() => handleReconnectForEntity(targetQrEntity)}
                    disabled={isBusy}
                    title="Refresca la conexión con Home Assistant y Matter"
                  >
                    ↻ Recargar / Sincronizar
                  </button>

                  <button
                    className="button button-secondary action-btn"
                    id="regenerate-code-button"
                    type="button"
                    onClick={() => handleOpenCommissioningForEntity(targetQrEntity)}
                    disabled={isBusy}
                  >
                    Abrir Modo Multi-Admin
                  </button>

                  <button
                    className="button button-danger action-btn"
                    id="reset-accessory-button"
                    type="button"
                    onClick={() => handleResetAccessoryForEntity(targetQrEntity)}
                    disabled={isBusy}
                    title="Desconectar de todas las casas y generar un nuevo código QR"
                  >
                    Desconectar todo y nuevo QR
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
