import React, { useState, useEffect } from "react";
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

  const activeEntity = selectedEntity || sortedEntities[0] || null;

  // Pairing code: primary entity's code or selected entity's code
  const pairingCode =
    activeEntity?.pairingCode ||
    device.entities.find((e) => e.pairingCode)?.pairingCode ||
    "";
  const manualCode =
    activeEntity?.manualPairingCode ||
    device.entities.find((e) => e.manualPairingCode)?.manualPairingCode ||
    pairingCode;

  const isExported = Boolean(activeEntity?.exported);
  const isCommissioned = Boolean(activeEntity?.commissioned);

  const isH7133 =
    (device.model || "").toUpperCase().includes("H7133") ||
    (device.name || "").toLowerCase().includes("h7133") ||
    (detected.brand === "Govee" && (detected.subtype === "tower_fan" || (device.name || "").toLowerCase().includes("ventilador")));

  const handleExportPlan = async (plan: "plan_a" | "plan_b" | "both") => {
    setIsBusy(true);
    try {
      if (plan === "plan_a") {
        // Plan A: Fan + Night Light + Temperature Sensor
        for (const ent of device.entities) {
          const isFanOrLightOrTemp =
            ent.domain === "fan" ||
            ent.domain === "light" ||
            ent.domain === "sensor" ||
            ent.entityId.toLowerCase().includes("ventilador") ||
            (ent.domain === "switch" && !ent.entityId.includes("auto_stop"));
          if (isFanOrLightOrTemp && !ent.exported) {
            await api.toggleExport(ent.entityId, true);
            ent.exported = true;
          }
        }
        showToast("✓ Plan A Activado: Ventilador + Luz Nocturna + Sensor de Temperatura expuestos en Matter");
      } else if (plan === "plan_b") {
        // Plan B: Heater / Thermostat + Temperature Sensor
        for (const ent of device.entities) {
          const isHeaterOrTemp =
            ent.domain === "climate" ||
            ent.domain === "sensor" ||
            (ent.domain === "switch" && !ent.entityId.includes("auto_stop"));
          if (isHeaterOrTemp && !ent.exported) {
            await api.toggleExport(ent.entityId, true);
            ent.exported = true;
          }
        }
        showToast("✓ Plan B Activado: Calefactor / Termostato expuesto en Matter");
      } else {
        // Both / All
        for (const ent of device.entities) {
          if (!ent.exported) {
            await api.toggleExport(ent.entityId, true);
            ent.exported = true;
          }
        }
        showToast("✓ Todas las entidades del accesorio publicadas en Matter");
      }
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al exportar entidades", true);
    } finally {
      setIsBusy(false);
    }
  };

  const getFriendlyEntityName = (ent: EntityRecord | null): string => {
    if (!ent) return "Selecciona una entidad";
    const id = ent.entityId.toLowerCase();
    const name = (ent.name || "").toLowerCase();
    if (isH7133 || id.includes("h7133") || name.includes("ventilador")) {
      if (ent.domain === "light") return "💡 Luz Nocturna / LED";
      if (id.includes("auto_stop")) return "⏱️ Parada Automática (Auto-Stop)";
      if (id.includes("temp") || ent.domain === "sensor") return "🌡️ Sensor de Temperatura Ambiente";
      if (id.includes("ventilador") || ent.domain === "fan" || ent.domain === "switch") return "🌪️ Ventilador Principal (Encendido / Velocidad)";
    }
    return ent.name || ent.entityId;
  };

  const handleToggleExport = async (entity: EntityRecord) => {
    try {
      const nextState = !entity.exported;
      await api.toggleExport(entity.entityId, nextState);
      entity.exported = nextState;
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
    if (!activeEntity) return;
    setIsBusy(true);
    showToast("Reconectando accesorio Matter...");
    try {
      await api.reconnectAccessory(
        activeEntity.compositeDeviceId || activeEntity.entityId
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
    if (!activeEntity) return;
    setIsBusy(true);
    try {
      await api.openCommissioning(activeEntity.entityId);
      setMultiAdminOpen(true);
      showToast(
        "✓ Modo Multi-Admin Abierto. Puedes emparejar en una segunda plataforma."
      );
    } catch (err: any) {
      showToast(err.message || "Error al abrir Multi-Admin", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetAccessory = async () => {
    if (!activeEntity) return;
    if (
      !confirm(
        "¿Desconectar este accesorio de todas las casas y generar un nuevo código QR limpio?"
      )
    )
      return;
    setIsBusy(true);
    try {
      await api.resetAccessory(activeEntity.entityId);
      showToast("✓ Accesorio desvinculado y nuevo QR generado");
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al desvincular", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyDiagnostics = () => {
    if (!activeEntity) return;
    const diagText = JSON.stringify(
      {
        entityId: activeEntity.entityId,
        name: activeEntity.name,
        domain: activeEntity.domain,
        exported: activeEntity.exported,
        commissioned: activeEntity.commissioned,
        logs: selectedEntity?.logs || activeEntity.logs || [],
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
                    onClick={() => setSelectedEntity(ent)}
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
            {isH7133 && (
              <div
                className="h7133-assistant-card"
                style={{
                  background: "linear-gradient(135deg, rgba(2, 132, 199, 0.18) 0%, rgba(14, 165, 233, 0.08) 100%)",
                  border: "1.5px solid rgba(56, 189, 248, 0.4)",
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>🌪️🔥</span>
                  <div>
                    <strong style={{ fontSize: 13, color: "#38BDF8", display: "block" }}>
                      Govee H7133 · Modos de Publicación Matter
                    </strong>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>
                      Ventilador de Torre, Calefactor, Luz Nocturna y Sensor
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button"
                    onClick={() => handleExportPlan("plan_a")}
                    disabled={isBusy}
                    title="Exporta como accesorio Ventilador Matter con velocidades, luz nocturna y lectura de temperatura"
                    style={{
                      flex: 1,
                      minWidth: "140px",
                      padding: "8px 10px",
                      background: "rgba(2, 132, 199, 0.35)",
                      border: "1px solid #38BDF8",
                      color: "#FFF",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    🌪️ Plan A: Ventilador Matter
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => handleExportPlan("plan_b")}
                    disabled={isBusy}
                    title="Exporta como accesorio Termostato/Calefactor con dial térmico y sensor de temperatura"
                    style={{
                      flex: 1,
                      minWidth: "140px",
                      padding: "8px 10px",
                      background: "rgba(234, 88, 12, 0.3)",
                      border: "1px solid #FB923C",
                      color: "#FFF",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    🔥 Plan B: Calefactor / Clima
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => handleExportPlan("both")}
                    disabled={isBusy}
                    title="Activa todos los canales para exponer el conjunto completo"
                    style={{
                      width: "100%",
                      padding: "6px 10px",
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      color: "#E2E8F0",
                      borderRadius: 8,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    ⚡ Publicar Todo (Ventilador + Luz + Sensor)
                  </button>
                </div>
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
                  {logs.slice(-6).map((l, i) => (
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
            <p className="card-label">CÓDIGO MATTER</p>
            <div
              className={`qr-status-label${isCommissioned ? " commissioned" : isExported ? " active" : ""}`}
              id="qr-status-label"
            >
              {isCommissioned
                ? "Vinculado a Matter"
                : isExported
                  ? "Listo para emparejar"
                  : "Sin publicar"}
            </div>

            {isCommissioned && !multiAdminOpen && (
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

            {isExported ? (
              <QRCodeDisplay
                pairingCode={pairingCode}
                manualCode={manualCode}
                entityName={activeEntity?.name || device.name}
                elementId="device-qr-code"
              />
            ) : (
              <div
                className="qr-liquid-glass-card"
                style={{
                  padding: 24,
                  textAlign: "center",
                  background: "rgba(255, 255, 255, 0.03)",
                  borderRadius: 16,
                  border: "1px dashed rgba(255, 255, 255, 0.15)",
                }}
              >
                <p style={{ color: "var(--text-secondary, #94a3b8)", fontSize: 13, marginBottom: 14 }}>
                  Activa la entidad para generar el código QR de vinculación Matter.
                </p>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() =>
                    isH7133
                      ? handleExportPlan("plan_a")
                      : activeEntity
                      ? handleToggleExport(activeEntity)
                      : handleToggleExport(sortedEntities[0])
                  }
                  disabled={isBusy}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  🚀 {isH7133 ? "Publicar como Ventilador (Plan A)" : "Activar y Generar Código QR"}
                </button>
              </div>
            )}

            <div className="accessory-controls" id="accessory-controls" style={{ marginTop: "auto", paddingTop: 12 }}>
              {isExported && (
                <div className="matter-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    className="button button-secondary action-btn"
                    id="reconnect-accessory-button"
                    type="button"
                    onClick={handleReconnect}
                    disabled={isBusy}
                    title="Refresca la conexión con Home Assistant y Matter"
                  >
                    ↻ Recargar / Sincronizar
                  </button>

                  <button
                    className="button button-secondary action-btn"
                    id="regenerate-code-button"
                    type="button"
                    onClick={handleOpenCommissioning}
                    disabled={isBusy}
                  >
                    Abrir Modo Multi-Admin
                  </button>

                  <button
                    className="button button-danger action-btn"
                    id="reset-accessory-button"
                    type="button"
                    onClick={handleResetAccessory}
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
