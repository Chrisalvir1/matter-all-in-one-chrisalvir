import React, { useState, useEffect, useMemo } from "react";
import { DeviceRecord, EntityRecord, HapProfile } from "../types";
import { api } from "../api/client";
import { QRCodeDisplay, AppleHomeModernIcon } from "./QRCodeDisplay";
import { copyToClipboard } from "../utils/clipboard";
import { HapExportModal, isHapEligible, isMatterOnlyDomain } from "./HapExportModal";

interface DeviceModalProps {
  device: DeviceRecord | null;
  targetEntity?: EntityRecord | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

function getDomainIcon(domain?: string): string {
  switch (domain) {
    case "light":
      return "💡";
    case "switch":
      return "🔌";
    case "camera":
      return "📹";
    case "climate":
      return "❄️";
    case "fan":
      return "🌀";
    case "cover":
      return "🪟";
    case "lock":
      return "🔒";
    case "sensor":
      return "🌡️";
    case "binary_sensor":
      return "🔔";
    case "vacuum":
      return "🤖";
    case "humidifier":
      return "💧";
    default:
      return "⚡";
  }
}

function getControllerBadge(vendorId?: number | null, controllerName?: string): { icon: string; name: string } {
  const name = controllerName || "Controlador Matter";
  const vid = vendorId !== null && vendorId !== undefined ? Number(vendorId) : null;
  if (vid === 0x1349 || /apple/i.test(name)) {
    return { icon: "🍎", name: "Apple Home" };
  }
  if (vid === 0x6006 || /google/i.test(name)) {
    return { icon: "🌐", name: "Google Home" };
  }
  if (vid === 0x1211 || /amazon|alexa/i.test(name)) {
    return { icon: "🔊", name: "Amazon Alexa" };
  }
  if (
    (vid !== null && [0x10e1, 0x110a, 0x127b, 0x1175, 0x1360].includes(vid)) ||
    /smartthings|samsung/i.test(name)
  ) {
    return { icon: "💠", name: "Samsung SmartThings" };
  }
  if (vid === 0x130d || /home assistant/i.test(name)) {
    return { icon: "🏠", name: "Home Assistant" };
  }
  return { icon: "📱", name };
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
  const [freshPairingCode, setFreshPairingCode] = useState<string | null>(null);
  const [freshManualCode, setFreshManualCode] = useState<string | null>(null);
  const [resetFabrics, setResetFabrics] = useState<boolean>(false);
  /** Entidad seleccionada para exportar como HAP — abre el modal HAP */
  const [hapExportTarget, setHapExportTarget] = useState<EntityRecord | null>(null);
  /** Resultado de un export HAP reciente para mostrar QR/PIN */
  const [hapFreshPin, setHapFreshPin] = useState<{ pincode: string; port: number } | null>(null);
  // localCompositeExported tracks the toggle state as proper React state so that
  // flipping the master switch immediately re-renders the QR panel without waiting
  // for onRefresh() to complete (mutating device.entities props directly is invisible to React).
  const [localCompositeExported, setLocalCompositeExported] = useState<boolean>(
    () => Boolean(device?.entities.some((e) => e.composite && e.exported))
  );

  const isDeviceHapPublished = Boolean(
    device?.entities.some((e) => e.hapAccessory?.published)
  );

  const activeHapAccessory =
    device?.entities.find((e) => e.hapAccessory?.published)?.hapAccessory ||
    (device?.entities[0]?.hapAccessory?.published ? device.entities[0].hapAccessory : null);

  const isHapRecommended = Boolean(
    device?.entities.some((e) =>
      ["humidifier", "media_player", "valve", "alarm_control_panel"].includes(e.domain)
    )
  );

  const [selectedProtocol, setSelectedProtocol] = useState<"matter" | "hap">(() => {
    if (isDeviceHapPublished) return "hap";
    if (isHapRecommended) return "hap";
    return "matter";
  });

  const [hapProfiles, setHapProfiles] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedHapProfile, setSelectedHapProfile] = useState<HapProfile>(() => {
    const dom = device?.entities.find((e) => e.domain === "humidifier")
      ? "humidifier"
      : device?.entities[0]?.domain || "";
    if (dom === "humidifier") return "humidifier";
    if (dom === "media_player") return "television";
    if (dom === "valve") return "valve_irrigation";
    if (dom === "alarm_control_panel") return "security_system";
    if (dom === "cover") return "garage_door";
    return "humidifier";
  });

  useEffect(() => {
    api
      .getHapProfiles()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setHapProfiles(data);
        }
      })
      .catch(() => {});
  }, []);

  const sortedEntities = device
    ? [...device.entities].sort((a, b) => {
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
      })
    : [];

  useEffect(() => {
    if (!device) return;
    // Sync composite exported state whenever the parent pushes fresh device data
    setLocalCompositeExported(device.entities.some((e) => e.composite && e.exported));
    if (isDeviceHapPublished) {
      setSelectedProtocol("hap");
    }
    setSelectedEntity((prev) => {
      if (prev) {
        const found = device.entities.find((e) => e.entityId === prev.entityId);
        if (found) return found;
      }
      return targetEntity || sortedEntities[0] || device.entities[0] || null;
    });
    setMultiAdminOpen(false);
    const newDevicePairingCode =
      device.entities.find((e) => e.exported && e.pairingCode)?.pairingCode ?? null;
    if (newDevicePairingCode) {
      setFreshPairingCode(null);
      setFreshManualCode(null);
    }
    const stillCommissioned = device.entities.some((e) => e.commissioned);
    if (!stillCommissioned) {
      setResetFabrics(false);
    }
  }, [device, targetEntity, isDeviceHapPublished]);

  if (!device) return null;

  const activeEntity = selectedEntity || sortedEntities[0] || null;

  const hasFan = device.entities.some((e) => e.domain === "fan" && !e.auxiliary);
  const hasLight = device.entities.some((e) => e.domain === "light" && !e.auxiliary);
  const isComposite =
    device.entities.some((e) => e.composite) || (hasFan && hasLight);
  const compositePrimary =
    device.entities.find((e) => e.entityId === e.compositePrimaryEntityId) ||
    device.entities.find((e) => e.domain === "fan") ||
    device.entities.find((e) => e.domain === "humidifier") ||
    device.entities[0];
  const isCompositeExported = localCompositeExported;

  // Pairing code: fresh code from reset, primary entity's code, or selected entity's code
  const pairingCode =
    freshPairingCode ||
    (isComposite ? compositePrimary?.pairingCode : activeEntity?.pairingCode) ||
    device.entities.find((e) => e.exported && e.pairingCode)?.pairingCode ||
    "";
  const manualCode =
    freshManualCode ||
    (isComposite ? compositePrimary?.manualPairingCode : activeEntity?.manualPairingCode) ||
    device.entities.find((e) => e.exported && e.manualPairingCode)?.manualPairingCode ||
    "";

  const matterFabrics = resetFabrics
    ? []
    : Array.isArray(activeEntity?.matterFabrics) && activeEntity.matterFabrics.length > 0
    ? activeEntity.matterFabrics
    : Array.isArray(compositePrimary?.matterFabrics) && compositePrimary.matterFabrics.length > 0
    ? compositePrimary.matterFabrics
    : Array.isArray(device.entities.find((e) => e.matterFabrics?.length)?.matterFabrics)
    ? device.entities.find((e) => e.matterFabrics?.length)!.matterFabrics!
    : [];

  const isExported = isComposite
    ? Boolean(isCompositeExported)
    : Boolean(activeEntity?.exported);
  const isCommissioned =
    !resetFabrics &&
    (isComposite
      ? Boolean(compositePrimary?.commissioned) ||
        device.entities.some((e) => e.composite && e.commissioned)
      : Boolean(activeEntity?.commissioned));

  // Optimistic, instantaneous toggle for Composite Matter
  const handleToggleCompositeExport = async () => {
    if (!compositePrimary) return;
    const nextState = !isCompositeExported;
    setLocalCompositeExported(nextState);
    device.entities.forEach((e) => {
      if (e.composite) {
        e.exported = nextState;
      }
    });
    try {
      const res: any = await api.toggleExport(compositePrimary.entityId, nextState);
      if (nextState && (res as any)?.pairingCode) {
        setFreshPairingCode((res as any).pairingCode);
      }
      if (nextState && (res as any)?.manualPairingCode) {
        setFreshManualCode((res as any).manualPairingCode);
      }
      showToast(
        nextState
          ? `✓ Accesorio publicado en Matter`
          : `Accesorio retirado de Matter`
      );
      void onRefresh();
    } catch (err: any) {
      setLocalCompositeExported(!nextState);
      device.entities.forEach((e) => {
        if (e.composite) {
          e.exported = !nextState;
        }
      });
      showToast(err.message || "Error al modificar publicación", true);
    }
  };

  // Optimistic, instantaneous toggle for Individual Matter entity
  const handleToggleExport = async (entity: EntityRecord) => {
    const nextState = !entity.exported;
    entity.exported = nextState;
    try {
      const res: any = await api.toggleExport(entity.entityId, nextState);
      if (nextState && res?.pairingCode) {
        setFreshPairingCode(res.pairingCode);
      }
      if (nextState && res?.manualPairingCode) {
        setFreshManualCode(res.manualPairingCode);
      }
      showToast(
        nextState
          ? `✓ ${entity.name || entity.entityId} publicado en Matter`
          : `${entity.name || entity.entityId} retirado de Matter`
      );
      void onRefresh();
    } catch (err: any) {
      entity.exported = !nextState;
      showToast(err.message || "Error al modificar publicación", true);
    }
  };

  // Direct HAP publish handler
  const handlePublishHapDirect = async () => {
    const targetId = compositePrimary?.entityId || activeEntity?.entityId || device.entities[0].entityId;
    setIsBusy(true);
    try {
      const res = await api.registerHap(targetId, selectedHapProfile);
      if (res.success) {
        showToast(`✓ Publicado en HomeKit HAP (PIN: ${res.pincode})`);
        const updatedAcc = {
          published: true,
          isPaired: false,
          hapProfile: selectedHapProfile,
          profileLabel: hapProfiles.find((p) => p.id === selectedHapProfile)?.label || selectedHapProfile,
          pincode: res.pincode || "",
          port: res.port || 0,
        };
        device.entities.forEach((e) => {
          e.hapAccessory = updatedAcc as any;
        });
        if (activeEntity) activeEntity.hapAccessory = updatedAcc as any;
        setHapFreshPin({ pincode: res.pincode || "", port: res.port || 0 });
        void onRefresh();
      } else {
        showToast(res.error || "Error al publicar HAP", true);
      }
    } catch (err: any) {
      showToast(err.message || "Error al publicar HAP", true);
    } finally {
      setIsBusy(false);
    }
  };

  // Direct HAP unregister handler
  const handleUnregisterHapDirect = async () => {
    if (!confirm("¿Retirar este accesorio de HomeKit HAP?")) return;
    const targetId = compositePrimary?.entityId || activeEntity?.entityId || device.entities[0].entityId;
    setIsBusy(true);
    try {
      await api.unregisterHap(targetId);
      device.entities.forEach((e) => {
        e.hapAccessory = null;
      });
      if (activeEntity) activeEntity.hapAccessory = null;
      showToast("Accesorio retirado de HomeKit HAP");
      void onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al retirar de HAP", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveFabric = async (fabricIndex: number | string) => {
    if (!activeEntity) return;
    if (!confirm("¿Desconectar este accesorio de este controlador Matter?")) return;
    setIsBusy(true);
    const targetEntityId = isComposite
      ? (compositePrimary?.entityId || activeEntity.entityId)
      : activeEntity.entityId;
    try {
      const res: any = await api.removeFabric(targetEntityId, fabricIndex);
      if (res?.remainingFabrics === 0) {
        setResetFabrics(true);
        if (res?.pairingCode) setFreshPairingCode(res.pairingCode);
        if (res?.manualPairingCode) setFreshManualCode(res.manualPairingCode);
        activeEntity.commissioned = false;
        activeEntity.matterFabrics = [];
        device.entities.forEach((e) => {
          e.commissioned = false;
          e.matterFabrics = [];
        });
      } else {
        if (activeEntity.matterFabrics) {
          activeEntity.matterFabrics = activeEntity.matterFabrics.filter(
            (f: any) =>
              String(f.fabricIndex) !== String(fabricIndex) &&
              String(f.fabricId) !== String(fabricIndex)
          );
        }
        device.entities.forEach((e) => {
          if (e.matterFabrics) {
            e.matterFabrics = e.matterFabrics.filter(
              (f: any) =>
                String(f.fabricIndex) !== String(fabricIndex) &&
                String(f.fabricId) !== String(fabricIndex)
            );
          }
        });
      }
      showToast("✓ Fabric desconectado de este accesorio");
      void onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al desconectar fabric", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReconnect = async () => {
    if (!activeEntity) return;
    setIsBusy(true);
    showToast("Reconectando accesorio Matter...");
    const targetEntityId = isComposite
      ? (compositePrimary?.entityId || activeEntity.entityId)
      : activeEntity.entityId;
    try {
      await api.reconnectAccessory(
        activeEntity.compositeDeviceId || targetEntityId
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
    const targetEntityId = isComposite
      ? (compositePrimary?.entityId || activeEntity.entityId)
      : activeEntity.entityId;
    try {
      await api.openCommissioning(targetEntityId);
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
        "¿Desconectar este accesorio de todas las casas y generar un nuevo código QR limpio?\n\nIMPORTANTE: Si ya agregaste este accesorio en Apple Home, primero elimínalo de la app Casa (Ajustes -> Eliminar accesorio) para evitar que Apple Home intente reconectar una sesión obsoleta."
      )
    )
      return;
    setIsBusy(true);
    const targetEntityId = isComposite
      ? (compositePrimary?.entityId || activeEntity.entityId)
      : activeEntity.entityId;
    try {
      const res: any = await api.resetAccessory(targetEntityId);
      if (res?.pairingCode || res?.manualPairingCode) {
        setFreshPairingCode(res.pairingCode || null);
        setFreshManualCode(res.manualPairingCode || null);
        setResetFabrics(true);
        activeEntity.pairingCode = res.pairingCode || activeEntity.pairingCode;
        activeEntity.manualPairingCode = res.manualPairingCode || activeEntity.manualPairingCode;
        activeEntity.commissioned = false;
        activeEntity.matterFabrics = [];
        device.entities.forEach((e) => {
          e.commissioned = false;
          e.matterFabrics = [];
          if (res?.pairingCode) e.pairingCode = res.pairingCode;
          if (res?.manualPairingCode) e.manualPairingCode = res.manualPairingCode;
        });
      }
      showToast("✓ Accesorio desvinculado y nuevo QR generado");
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al desvincular", true);
    } finally {
      setIsBusy(false);
    }
  };

  const currentEntity = selectedEntity || activeEntity;
  const entityState = (currentEntity?.state || "").toLowerCase();
  const isEntityUnavailable = entityState === "unavailable" || entityState === "unknown" || entityState === "offline";
  const entityDiagnostics = currentEntity?.diagnostics || [];
  const rawLogs = selectedEntity?.logs || currentEntity?.logs || [];

  const combinedEvents = useMemo(() => {
    const list: Array<{ text: string; level: string; timestamp?: string }> = [];

    if (isEntityUnavailable) {
      list.push({
        text: `Home Assistant informa estado "${entityState.toUpperCase()}". El dispositivo físico no responde (posiblemente apagado, sin batería, fuera de rango o con la integración origen caída).`,
        level: "warning",
      });
    }

    for (const d of entityDiagnostics) {
      list.push({
        text: d.message,
        level: d.level || "warning",
        timestamp: d.timestamp,
      });
    }

    for (const l of rawLogs) {
      const msg = typeof l === "string" ? l : (l as any)?.message || JSON.stringify(l);
      const lvl = typeof l === "object" && (l as any)?.level ? (l as any).level : "error";
      list.push({ text: msg, level: lvl });
    }

    return list;
  }, [isEntityUnavailable, entityState, entityDiagnostics, rawLogs]);

  const handleCopyDiagnostics = async () => {
    if (!activeEntity) return;
    const formattedEvents = combinedEvents
      .map((e: { text: string; level: string; timestamp?: string }) => {
        const timeStr = e.timestamp ? `[${new Date(e.timestamp).toLocaleTimeString()}] ` : "";
        return `${timeStr}[${e.level.toUpperCase()}] ${e.text}`;
      })
      .join("\n");

    const diagText = [
      `=== DIAGNÓSTICO DE ACCESORIO MATTER ===`,
      `Entidad: ${activeEntity.entityId}`,
      `Nombre: ${activeEntity.name || activeEntity.friendly_name || "Desconocido"}`,
      `Dominio: ${activeEntity.domain}`,
      `Estado en Home Assistant: ${activeEntity.state ? activeEntity.state.toUpperCase() : "N/A"}`,
      ...(isEntityUnavailable
        ? [`Causa detectada: Dispositivo físico no responde en Home Assistant (apagado, sin batería o sin enlace con la integración)`]
        : []),
      `Publicado en Matter: ${activeEntity.exported ? "SÍ" : "NO"}`,
      `Emparejado: ${activeEntity.commissioned ? "SÍ (Vinculado)" : "NO"}`,
      `Código de emparejamiento manual: ${activeEntity.manualPairingCode || "N/A"}`,
      `Incidencias activas: ${activeEntity.hasIssue || isEntityUnavailable ? "SÍ" : "NO"}`,
      `\n=== HISTORIAL DE EVENTOS Y DIAGNÓSTICO (${combinedEvents.length}) ===`,
      formattedEvents || "(Sin incidencias ni eventos registrados)",
    ].join("\n");

    const ok = await copyToClipboard(diagText);
    if (ok) {
      showToast("✓ Diagnóstico y logs copiados al portapapeles");
    } else {
      showToast("⚠️ No se pudo acceder al portapapeles, intenta seleccionar el texto manualmente", true);
    }
  };

  const activeNodesCount = new Set(
    device.entities.filter((e) => e.exported).map((e) => e.compositeDeviceId || e.entityId)
  ).size;

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
            {getDomainIcon(activeEntity?.domain || sortedEntities[0]?.domain || device.entities[0]?.domain)}
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

        {/* ── Protocol Selector Bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            gap: 12,
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              background: "rgba(255,255,255,0.05)",
              padding: "3px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              gap: 4,
            }}
          >
            <button
              type="button"
              onClick={() => setSelectedProtocol("matter")}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                background: selectedProtocol === "matter" ? "#2563eb" : "transparent",
                color: selectedProtocol === "matter" ? "#ffffff" : "var(--muted)",
                transition: "all 0.15s ease",
              }}
            >
              ⚡ Matter (Multi-plataforma) {isExported ? "✓ Activo" : ""}
            </button>
            <button
              type="button"
              onClick={() => setSelectedProtocol("hap")}
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                border: selectedProtocol === "hap" ? "1px solid rgba(245,158,11,0.5)" : "none",
                background: selectedProtocol === "hap" ? "rgba(245,158,11,0.22)" : "transparent",
                color: selectedProtocol === "hap" ? "#fcd34d" : "var(--muted)",
                transition: "all 0.15s ease",
              }}
            >
              🏠 HomeKit HAP {isDeviceHapPublished ? "✓ Activo" : isHapRecommended ? "⭐ Recomendado para Apple" : ""}
            </button>
          </div>

          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {selectedProtocol === "matter"
              ? "Compatible con Apple Home, Google Home, Alexa y SmartThings"
              : "Accesorio HomeKit nativo (reconocido como Difusor, TV, Válvula, etc.)"}
          </div>
        </div>

        {/* ── Smart Recommendation Banner (Apple Home) ── */}
        {isHapRecommended && selectedProtocol === "matter" && !isExported && (
          <div
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.28)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>💡</span>
              <div style={{ fontSize: 12, color: "#fef3c7", lineHeight: 1.4 }}>
                <strong>Recomendación para Apple Home:</strong> Este dispositivo es un{" "}
                <span style={{ color: "#fcd34d", fontWeight: 700 }}>
                  {device.entities.find((e) => e.domain === "humidifier")
                    ? "Difusor / Humidificador"
                    : activeEntity?.domain === "media_player"
                    ? "Televisor"
                    : "Accesorio especial"}
                </span>
                . Apple Home en Matter lo expondrá como un ventilador con deslizador de niebla.
                En <strong>HomeKit HAP</strong> aparecerá con icono nativo de <strong>Difusor / Humidificador</strong> y control real de humedad.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProtocol("hap")}
              style={{
                whiteSpace: "nowrap",
                padding: "6px 14px",
                background: "rgba(245, 158, 11, 0.2)",
                border: "1px solid rgba(245, 158, 11, 0.45)",
                color: "#fde68a",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cambiar a HomeKit HAP →
            </button>
          </div>
        )}

        <div
          className="modal-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "310px minmax(0, 1fr) 370px",
            gap: 16,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            alignItems: "stretch",
          }}
        >
          {/* Column 1: Entity List / HAP Action */}
          <div className="entity-list-col" style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
            <div className="section-header" style={{ marginBottom: isComposite ? "8px" : "12px" }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  {selectedProtocol === "hap"
                    ? "Accesorio HomeKit HAP"
                    : isComposite
                    ? "Endpoints del Accesorio"
                    : "Entidades disponibles"}
                </h3>
                <p style={{ fontSize: "11px", color: "var(--muted)", margin: "2px 0 0" }}>
                  {selectedProtocol === "hap"
                    ? isDeviceHapPublished
                      ? "1 accesorio activo en HomeKit HAP"
                      : "Sin publicar en HomeKit HAP"
                    : isComposite
                    ? "1 accesorio Matter unificado (1 solo código QR)"
                    : `0/${device.entities.length} publicadas`}
                </p>
              </div>
              <span id="modal-export-count">
                {selectedProtocol === "hap"
                  ? isDeviceHapPublished
                    ? "✓ 1/1 HAP"
                    : "0/1 HAP"
                  : isComposite
                  ? isCompositeExported
                    ? "✓ 1 accesorio activo en Matter"
                    : "0 accesorios en Matter"
                  : activeNodesCount
                  ? `${activeNodesCount} accesorio Matter · ${device.entities.filter((e) => e.exported).length}/${device.entities.length} endpoints`
                  : `0/${device.entities.length} publicadas`}
              </span>
            </div>

            {selectedProtocol === "hap" ? (
              <div
                style={{
                  padding: "14px",
                  background: isDeviceHapPublished ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
                  border: `1px solid ${isDeviceHapPublished ? "rgba(16, 185, 129, 0.28)" : "rgba(245, 158, 11, 0.28)"}`,
                  borderRadius: "10px",
                  marginBottom: "10px",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: isDeviceHapPublished ? "#34d399" : "#fcd34d" }}>
                      {isDeviceHapPublished ? "✓ Activo en HomeKit HAP" : "🏠 Exportar a Apple HomeKit"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                      {isDeviceHapPublished
                        ? `Puerto: ${activeHapAccessory?.port || 52000}`
                        : "Anuncia el accesorio directamente en Apple Home"}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: "12px" }}>
                  {isDeviceHapPublished ? (
                    <button
                      type="button"
                      className="button button-danger"
                      style={{ width: "100%", padding: "8px 12px", fontSize: "12px" }}
                      onClick={handleUnregisterHapDirect}
                      disabled={isBusy}
                    >
                      {isBusy ? "Retirando…" : "Retirar de HomeKit HAP"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button"
                      style={{
                        width: "100%",
                        padding: "9px 14px",
                        fontSize: "12.5px",
                        fontWeight: 700,
                        background: "rgba(245, 158, 11, 0.2)",
                        border: "1px solid rgba(245, 158, 11, 0.5)",
                        color: "#fcd34d",
                        borderRadius: "8px",
                        cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                      onClick={handlePublishHapDirect}
                      disabled={isBusy}
                    >
                      {isBusy ? "Publicando en HAP…" : "🏠 Publicar en HomeKit HAP"}
                    </button>
                  )}
                </div>
              </div>
            ) : isComposite ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: isCompositeExported
                    ? "rgba(16, 185, 129, 0.08)"
                    : "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${isCompositeExported ? "rgba(16, 185, 129, 0.25)" : "var(--border)"}`,
                  borderRadius: "10px",
                  marginBottom: "10px",
                  flexShrink: 0,
                }}
              >
                <div>
                  <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text)" }}>
                    Publicar Accesorio en Matter
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                    Ventilador y luz juntos bajo un solo código QR
                  </div>
                </div>
                <label className="toggle" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(isCompositeExported)}
                    onChange={handleToggleCompositeExport}
                  />
                  <span />
                </label>
              </div>
            ) : null}

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
                const isPrimaryEndpoint =
                  ent.entityId === ent.compositePrimaryEntityId ||
                  (isComposite && ent.domain === "fan");
                const isIntegratedEndpoint =
                  isComposite &&
                  (ent.domain === "fan" || ent.domain === "light") &&
                  !ent.auxiliary;
                const isExcludedAuxiliary = isComposite && ent.auxiliary;

                return (
                  <div
                    key={ent.entityId}
                    className={`entity-row${ent.exported ? "" : " dimmed"}${isSelected ? " selected" : ""}`}
                    onClick={() => setSelectedEntity(ent)}
                  >
                    <span className="entity-row-icon">
                      {getDomainIcon(ent.domain)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="entity-row-name">
                        {ent.name || ent.entityId}
                      </div>
                      <div className="entity-row-id">{ent.entityId}</div>
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          alignItems: "center",
                          marginTop: "3px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          className={`entity-state${ent.state === "on" ? " on" : ""}`}
                        >
                          {ent.state || "desconocido"}
                        </span>
                        {isComposite && isPrimaryEndpoint && (
                          <span
                            className="tag"
                            style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              background: "rgba(59, 130, 246, 0.15)",
                              color: "#60a5fa",
                              border: "1px solid rgba(59, 130, 246, 0.3)",
                            }}
                          >
                            Endpoint 1 · Ventilador
                          </span>
                        )}
                        {isComposite && !isPrimaryEndpoint && isIntegratedEndpoint && (
                          <span
                            className="tag"
                            style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "#34d399",
                              border: "1px solid rgba(16, 185, 129, 0.3)",
                            }}
                          >
                            Endpoint 2 · Luz (Dimmer + Kelvin)
                          </span>
                        )}
                        {isExcludedAuxiliary && (
                          <span
                            className="tag"
                            style={{
                              fontSize: "10px",
                              padding: "1px 6px",
                              background: "rgba(156, 163, 175, 0.15)",
                              color: "#9ca3af",
                              border: "1px solid rgba(156, 163, 175, 0.25)",
                            }}
                          >
                            Auxiliar (Omitido)
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className="export-control"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isComposite ? (
                        isExcludedAuxiliary ? (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--muted)",
                              fontStyle: "italic",
                            }}
                          >
                            Excluido
                          </span>
                        ) : (
                          <span
                            className={`badge ${ent.exported ? "badge-success" : "badge-muted"}`}
                            style={{
                              fontSize: "10.5px",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              background: ent.exported
                                ? "rgba(16, 185, 129, 0.15)"
                                : "rgba(255, 255, 255, 0.05)",
                              color: ent.exported ? "#34d399" : "var(--muted)",
                              border: `1px solid ${ent.exported ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.1)"}`,
                              fontWeight: 500,
                            }}
                          >
                            {ent.exported ? "✓ En Matter" : "Inactivo"}
                          </span>
                        )
                      ) : (
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(ent.exported)}
                            onChange={() => handleToggleExport(ent)}
                          />
                          <span />
                        </label>
                      )}
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
            <p className="card-label">
              {selectedProtocol === "hap"
                ? "CONFIGURACIÓN HOMEKIT HAP"
                : "SELECCIÓN Y CONFIGURACIÓN"}
            </p>
            <h3 id="selection-title">
              <span className="selection-title-text">
                {selectedProtocol === "hap"
                  ? `${device.name} (Apple Home)`
                  : activeEntity?.name || activeEntity?.entityId || "Selecciona una entidad"}
              </span>
              {selectedProtocol === "hap" ? (
                isDeviceHapPublished && (
                  <span
                    className="home-badge"
                    style={{
                      background: activeHapAccessory?.isPaired
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(245, 158, 11, 0.15)",
                      color: activeHapAccessory?.isPaired ? "#34d399" : "#fcd34d",
                      border: `1px solid ${
                        activeHapAccessory?.isPaired
                          ? "rgba(16, 185, 129, 0.3)"
                          : "rgba(245, 158, 11, 0.3)"
                      }`,
                    }}
                  >
                    {activeHapAccessory?.isPaired ? "🍏 Vinculado" : "⏳ PIN Activo"}
                  </span>
                )
              ) : (
                isCommissioned && (
                  <span className="home-badge commissioned">
                    🏠 Vinculado
                  </span>
                )
              )}
            </h3>

            {selectedProtocol === "hap" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p id="selection-description" style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
                  HomeKit HAP expone este dispositivo directamente a Apple Home usando la especificación oficial de accesorios de Apple (HAP 2.2.3).
                </p>

                {/* HAP Profile Selector */}
                <div
                  className="profile-field"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: 14,
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    borderRadius: 10,
                  }}
                >
                  <label
                    htmlFor="hap-profile-select"
                    style={{
                      fontSize: 10,
                      fontWeight: 750,
                      letterSpacing: "0.05em",
                      color: "#fcd34d",
                      textTransform: "uppercase",
                    }}
                  >
                    Tipo de Accesorio en Apple Home (Perfil HAP)
                  </label>
                  <select
                    id="hap-profile-select"
                    aria-label="Perfil HomeKit HAP"
                    value={selectedHapProfile}
                    onChange={(e) => setSelectedHapProfile(e.target.value as any)}
                    disabled={isDeviceHapPublished || isBusy}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      background: "#0b1528",
                      color: "var(--text)",
                      border: "1px solid rgba(245, 158, 11, 0.4)",
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: isDeviceHapPublished ? "default" : "pointer",
                    }}
                  >
                    {hapProfiles.map((p) => (
                      <option key={p.id} value={p.id} style={{ background: "#1a1a2e" }}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <small style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.4 }}>
                    {selectedHapProfile === "humidifier"
                      ? "Apple Home lo reconocerá como Difusor / Humidificador nativo con icono de gota, porcentaje de humedad actual y deslizador de vapor/humedad deseada."
                      : selectedHapProfile === "television"
                      ? "Apple Home lo reconocerá como Televisor nativo con selector de entradas HDMI y control remoto integrado en iOS."
                      : selectedHapProfile === "valve_irrigation"
                      ? "Apple Home lo reconocerá como Válvula de Riego con temporizador nativo."
                      : selectedHapProfile === "security_system"
                      ? "Apple Home lo reconocerá como Panel de Seguridad y Alarma."
                      : "Apple Home creará el accesorio con los servicios y características nativas de este tipo de perfil."}
                  </small>
                </div>

                <dl className="selection-meta" id="selection-meta">
                  <div>
                    <dt>Entidad Principal</dt>
                    <dd>{compositePrimary?.entityId || activeEntity?.entityId || device.entities[0]?.entityId}</dd>
                  </div>
                  <div>
                    <dt>Fabricante</dt>
                    <dd>{device.manufacturer || "Home Assistant"}</dd>
                  </div>
                  <div>
                    <dt>Modelo</dt>
                    <dd>{device.model || "HAP Device"}</dd>
                  </div>
                  <div>
                    <dt>Estado HAP</dt>
                    <dd style={{ color: isDeviceHapPublished ? (activeHapAccessory?.isPaired ? "#34d399" : "#fcd34d") : "var(--muted)" }}>
                      {isDeviceHapPublished
                        ? activeHapAccessory?.isPaired
                          ? "✓ Vinculado a Apple Home (Activo)"
                          : "Listo para vincular (PIN activo)"
                        : "Sin publicar"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <>
                <p id="selection-description">
                  {isComposite
                    ? activeEntity?.auxiliary
                      ? "Esta entidad es auxiliar (ej. buzzer/beeper) y se omite en Matter para mantener limpio el accesorio."
                      : isExported
                      ? "Este canal forma parte del accesorio unificado y está activo en Matter bajo el mismo código QR."
                      : "Activa el interruptor general arriba para publicar el accesorio (ventilador y luz juntos en 1 QR)."
                    : isExported
                    ? "Esta entidad está activa y expuesta a través de Matter."
                    : "Activa el interruptor para publicar este canal en Matter."}
                </p>

                {/* Matter Profile Selector */}
                {activeEntity && Array.isArray(activeEntity.profiles) && activeEntity.profiles.length > 0 && !activeEntity.auxiliary && (
                  <div
                    className="profile-field"
                    id="profile-field"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      marginTop: 14,
                      padding: 12,
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                    }}
                  >
                    <label
                      htmlFor="profile-select"
                      style={{
                        fontSize: 10,
                        fontWeight: 750,
                        letterSpacing: "0.05em",
                        color: "var(--dim)",
                        textTransform: "uppercase",
                      }}
                    >
                      Perfil Matter
                    </label>
                    <select
                      id="profile-select"
                      aria-label="Perfil Matter"
                      value={activeEntity.profileId || activeEntity.matterType || ""}
                      onChange={async (e) => {
                        const newProfile = e.target.value;
                        try {
                          setIsBusy(true);
                          await api.setDeviceProfile(activeEntity.entityId, newProfile);
                          activeEntity.profileId = newProfile;
                          activeEntity.matterType = newProfile;
                          showToast(`✓ Perfil Matter actualizado a ${newProfile}`);
                          void onRefresh();
                        } catch (err: any) {
                          showToast(err.message || "Error al cambiar perfil Matter", true);
                        } finally {
                          setIsBusy(false);
                        }
                      }}
                      disabled={isBusy}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        background: "#0b1528",
                        color: "var(--text)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {activeEntity.profiles.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                          {p.appleHome === "supported"
                            ? ""
                            : p.appleHome === "experimental"
                            ? " · experimental"
                            : " · no compatible con Apple Home"}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const cur =
                        activeEntity.profiles.find(
                          (p: any) =>
                            p.id === (activeEntity.profileId || activeEntity.matterType)
                        ) || activeEntity.profiles[0];
                      return cur ? (
                        <small
                          id="profile-note"
                          style={{ color: "var(--muted)", fontSize: 10, lineHeight: 1.4 }}
                        >
                          {cur.description}
                        </small>
                      ) : null;
                    })()}
                  </div>
                )}

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

                {/* Fabrics section */}
                <section className="fabrics-section" id="fabrics-section">
                  <div className="fabrics-heading">
                    <span className="fabrics-icon" aria-hidden="true">🏠</span>
                    <strong>Casas / Controladores Conectados</strong>
                  </div>
                  <p className="fabrics-subtitle">
                    Desconectar de ecosistemas Matter existentes si cambias de controlador o si ya eliminaste este accesorio en tu app de Apple Home, Google Home o Alexa.
                  </p>

                  {matterFabrics.length > 0 ? (
                    <div className="fabrics-list">
                      {matterFabrics.map((fabric: any, idx: number) => {
                        const badge = getControllerBadge(fabric.vendorId, fabric.controller);
                        const targetIndex = fabric.fabricIndex ?? fabric.fabricId ?? idx + 1;
                        return (
                          <div key={targetIndex} className="fabric-item">
                            <div className="fabric-info">
                              <div className="fabric-controller-line">
                                <span style={{ fontSize: 15 }}>{badge.icon}</span>
                                <span className="fabric-name">{badge.name}</span>
                              </div>
                              {fabric.label && (
                                <span className="fabric-home-name">
                                  Casa: <strong>{fabric.label}</strong>
                                </span>
                              )}
                              <span className="fabric-detail">
                                Fabric {targetIndex}
                                {fabric.vendorId ? ` · VID: 0x${Number(fabric.vendorId).toString(16).toUpperCase()}` : ""}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="button button-danger-outline button-xs"
                              onClick={() => handleRemoveFabric(targetIndex)}
                              disabled={isBusy}
                              title="Desconectar únicamente esta casa"
                              style={{
                                padding: "4px 8px",
                                fontSize: "11px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                background: "rgba(239, 68, 68, 0.15)",
                                color: "#fca5a5",
                                border: "1px solid rgba(239, 68, 68, 0.35)",
                              }}
                            >
                              Desconectar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", padding: "4px 0" }}>
                      {isCommissioned
                        ? "Sesión registrada en el puente (sin etiquetas de controlador reportadas)."
                        : "No hay casas ni controladores vinculados a este accesorio."}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Fabrics section */}
            <section className="fabrics-section" id="fabrics-section">
              <div className="fabrics-heading">
                <span className="fabrics-icon" aria-hidden="true">🏠</span>
                <strong>Casas / Controladores Conectados</strong>
              </div>
              <p className="fabrics-subtitle">
                Desconectar de ecosistemas Matter existentes si cambias de controlador o si ya eliminaste este accesorio en tu app de Apple Home, Google Home o Alexa.
              </p>

              {matterFabrics.length > 0 ? (
                <div className="fabrics-list">
                  {matterFabrics.map((fabric: any, idx: number) => {
                    const badge = getControllerBadge(fabric.vendorId, fabric.controller);
                    const targetIndex = fabric.fabricIndex ?? fabric.fabricId ?? idx + 1;
                    return (
                      <div key={targetIndex} className="fabric-item">
                        <div className="fabric-info">
                          <div className="fabric-controller-line">
                            <span style={{ fontSize: 15 }}>{badge.icon}</span>
                            <span className="fabric-name">{badge.name}</span>
                          </div>
                          {fabric.label && (
                            <span className="fabric-home-name">
                              Casa: <strong>{fabric.label}</strong>
                            </span>
                          )}
                          <span className="fabric-detail">
                            Fabric {targetIndex}
                            {fabric.vendorId ? ` · VID: 0x${Number(fabric.vendorId).toString(16).toUpperCase()}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button button-danger-outline button-xs"
                          onClick={() => handleRemoveFabric(targetIndex)}
                          disabled={isBusy}
                          title="Desconectar únicamente esta casa"
                          style={{
                            padding: "4px 8px",
                            fontSize: "11px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            background: "rgba(239, 68, 68, 0.15)",
                            color: "#fca5a5",
                            border: "1px solid rgba(239, 68, 68, 0.35)",
                          }}
                        >
                          Desconectar
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", padding: "4px 0" }}>
                  {isCommissioned
                    ? "Sesión registrada en el puente (sin etiquetas de controlador reportadas)."
                    : "No hay casas ni controladores vinculados a este accesorio."}
                </div>
              )}
            </section>

            {/* Diagnostics Panel */}
            <section
              className={`diagnostics-panel ${isEntityUnavailable || activeEntity?.hasIssue ? "has-issues" : ""}`}
              id="diagnostics-panel"
              aria-live="polite"
              style={{
                userSelect: "text",
                background: isEntityUnavailable
                  ? "rgba(245, 158, 11, 0.08)"
                  : "rgba(255, 255, 255, 0.03)",
                border: isEntityUnavailable
                  ? "1px solid rgba(245, 158, 11, 0.3)"
                  : "1px solid var(--border)",
                borderRadius: "10px",
                padding: "14px",
              }}
            >
              <div className="diagnostics-heading" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span id="diagnostics-icon" aria-hidden="true" style={{ fontSize: "16px" }}>
                    {isEntityUnavailable || activeEntity?.hasIssue ? "⚠️" : combinedEvents.length > 0 ? "ℹ️" : "✓"}
                  </span>
                  <strong id="diagnostics-heading-text" style={{ fontSize: "13px" }}>
                    {isEntityUnavailable ? "Estado de Conexión y Diagnóstico" : "Diagnóstico y logs"}
                  </strong>
                </div>
                <button
                  id="copy-diagnostics-button"
                  className="copy-diagnostics-button"
                  type="button"
                  onClick={handleCopyDiagnostics}
                  title="Copiar diagnóstico y logs al portapapeles"
                >
                  📋 Copiar logs
                </button>
              </div>

              {isEntityUnavailable && (
                <div
                  style={{
                    background: "rgba(245, 158, 11, 0.15)",
                    borderLeft: "3px solid #f59e0b",
                    padding: "8px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    color: "#fbbf24",
                    marginBottom: "8px",
                    lineHeight: "1.4",
                  }}
                >
                  <strong>⚠️ Dispositivo no disponible en Home Assistant (Estado: {entityState.toUpperCase()})</strong>
                  <div style={{ marginTop: "3px", color: "var(--text)" }}>
                    Home Assistant perdió comunicación con el dispositivo físico. El puente Matter sigue activo, pero el aparato no responde en su origen (posiblemente apagado, sin batería o sin Wi-Fi).
                  </div>
                </div>
              )}

              <p id="diagnostics-summary" style={{ margin: "4px 0", fontSize: "11.5px", color: isEntityUnavailable ? "#fbbf24" : "var(--muted)" }}>
                {combinedEvents.length === 0 ? (
                  "Sin errores registrados para este accesorio."
                ) : (
                  `${combinedEvents.length} evento${combinedEvents.length === 1 ? "" : "s"} registrado${combinedEvents.length === 1 ? "" : "s"}`
                )}
              </p>
              {combinedEvents.length > 0 && (
                <ul
                  id="diagnostics-list"
                  style={{ userSelect: "text", maxHeight: "180px", overflowY: "auto", margin: "6px 0 0", paddingLeft: "16px", fontSize: "11px", display: "flex", flexDirection: "column", gap: "4px" }}
                >
                  {combinedEvents.slice(-25).map((e: { text: string; level: string; timestamp?: string }, i: number) => (
                    <li key={i} style={{ userSelect: "text", wordBreak: "break-word", color: e.level === "warning" ? "#fbbf24" : e.level === "error" ? "#f87171" : "var(--text)" }}>
                      {e.timestamp ? <span style={{ opacity: 0.6, marginRight: "5px" }}>[{new Date(e.timestamp).toLocaleTimeString()}]</span> : null}
                      <span style={{ fontWeight: 600, marginRight: "4px" }}>[{e.level.toUpperCase()}]</span>
                      {e.text}
                    </li>
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
              gap: 8,
              minHeight: 0,
              height: "100%",
              overflowY: "auto",
              overflowX: "hidden",
              paddingRight: 6,
            }}
          >
            <p className="card-label" style={{ margin: "0 0 2px 0", flexShrink: 0 }}>
              {selectedProtocol === "hap" ? "CÓDIGO HOMEKIT HAP" : "CÓDIGO MATTER"}
            </p>
            <div
              className={`qr-status-label${
                selectedProtocol === "hap"
                  ? isDeviceHapPublished
                    ? activeHapAccessory?.isPaired
                      ? " commissioned"
                      : " active"
                    : ""
                  : isCommissioned
                  ? " commissioned"
                  : isExported
                  ? " active"
                  : ""
              }`}
              id="qr-status-label"
              style={{ flexShrink: 0 }}
            >
              {selectedProtocol === "hap"
                ? isDeviceHapPublished
                  ? activeHapAccessory?.isPaired
                    ? "Vinculado a Apple Home"
                    : "Listo para emparejar"
                  : "Sin publicar"
                : isCommissioned
                ? "Vinculado a Matter"
                : isExported
                ? "Listo para emparejar"
                : "Sin publicar"}
            </div>

            {selectedProtocol === "hap" ? (
              isDeviceHapPublished && activeHapAccessory ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div
                    style={{
                      background: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                      borderRadius: 14,
                      padding: "20px 16px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 10.5, fontWeight: 750, color: "#fcd34d", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      CÓDIGO PIN DE CONFIGURACIÓN
                    </div>
                    <div
                      style={{
                        fontSize: 32,
                        fontWeight: 800,
                        letterSpacing: 4,
                        color: "#fef08a",
                        fontFamily: "monospace",
                        margin: "10px 0",
                        cursor: "pointer",
                        userSelect: "all",
                      }}
                      title="Clic para copiar"
                      onClick={() => {
                        void navigator.clipboard?.writeText(activeHapAccessory.pincode);
                        showToast("✓ PIN copiado al portapapeles");
                      }}
                    >
                      {activeHapAccessory.pincode}
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        style={{
                          padding: "5px 14px",
                          borderRadius: 6,
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.18)",
                          color: "#e5e7eb",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          void navigator.clipboard?.writeText(activeHapAccessory.pincode);
                          showToast("✓ PIN copiado al portapapeles");
                        }}
                      >
                        📋 Copiar PIN
                      </button>
                      <span
                        style={{
                          padding: "5px 12px",
                          borderRadius: 6,
                          background: activeHapAccessory.isPaired ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                          color: activeHapAccessory.isPaired ? "#6ee7b7" : "#fcd34d",
                          border: `1px solid ${activeHapAccessory.isPaired ? "rgba(52, 211, 153, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {activeHapAccessory.isPaired ? "🍏 Enlazada a Casa" : "⏳ Esperando Vinculación"}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "14px 16px",
                      fontSize: 12,
                      color: "var(--muted)",
                      lineHeight: 1.6,
                    }}
                  >
                    <strong style={{ color: "#fcd34d", display: "block", marginBottom: 6 }}>
                      📱 Pasos para añadir a Apple Home:
                    </strong>
                    <ol style={{ margin: 0, paddingLeft: 18 }}>
                      <li>Abre la app <strong>Casa</strong> en tu iPhone, iPad o Mac.</li>
                      <li>Toca <strong>+</strong> en la esquina superior derecha y selecciona <strong>Añadir accesorio</strong>.</li>
                      <li>Toca <strong>Más opciones...</strong> (o <em>"¿No tienes un código o no puedes escanearlo?"</em>).</li>
                      <li>Selecciona <strong>{device.name}</strong> de la lista de accesorios cercanos.</li>
                      <li>Introduce el PIN de 8 dígitos: <strong style={{ color: "#fef08a" }}>{activeHapAccessory.pincode}</strong></li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div
                  className="qr-liquid-glass-card"
                  style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)", flexShrink: 0 }}
                >
                  <p style={{ fontSize: 13.5, color: "#fcd34d", fontWeight: 600, marginBottom: 8 }}>
                    🏠 HomeKit HAP no publicado
                  </p>
                  <p style={{ fontSize: 12, lineHeight: 1.5 }}>
                    Selecciona el perfil deseado en la columna central y pulsa <strong>"Publicar en HomeKit HAP"</strong> en la columna izquierda para generar el código PIN de 8 dígitos y anunciar el accesorio en Apple Home.
                  </p>
                </div>
              )
            ) : isExported ? (
              isCommissioned && !multiAdminOpen ? (
                <div className="paired-success-glass-card" id="paired-device-card">
                  <div className="paired-apple-home-badge">
                    <AppleHomeModernIcon variant="color" size={56} />
                  </div>
                  <h4 className="paired-card-title">¡Accesorio vinculado en Apple Home!</h4>
                  <p className="paired-card-desc">
                    Este dispositivo ya está emparejado y activo en tu red Matter.
                    El código QR inicial se oculta para proteger la sesión activa.
                  </p>
                  <div className="paired-multiadmin-box">
                    <p className="paired-multiadmin-subtext">
                      ¿Deseas compartirlo con Google Home, Alexa o SmartThings?
                    </p>
                    <button
                      className="button button-primary button-open-multiadmin"
                      type="button"
                      onClick={handleOpenCommissioning}
                      disabled={isBusy}
                      id="paired-open-multiadmin-btn"
                    >
                      <span>🌐 Abrir Modo Multi-Admin (15 min)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {multiAdminOpen && (
                    <div id="multi-admin-hint" className="multi-admin-hint" style={{ display: "block", flexShrink: 0 }}>
                      <p className="hint-title">🌐 Modo Multi-Admin Abierto (15 min)</p>
                      <p className="hint-desc">
                        Ventana de emparejamiento abierta. Escanea este código QR en
                        <strong> Google Home</strong>, <strong>Alexa</strong> o{" "}
                        <strong>SmartThings</strong>.
                      </p>
                    </div>
                  )}
                  <QRCodeDisplay
                    pairingCode={pairingCode}
                    manualCode={manualCode}
                    entityName={
                      isComposite
                        ? compositePrimary?.name || device.name
                        : activeEntity?.name || device.name
                    }
                    elementId="device-qr-code"
                    variant={multiAdminOpen ? "multi-admin-glass" : "matter-badge"}
                  />
                </>
              )
            ) : (
              <div
                className="qr-liquid-glass-card"
                style={{ padding: 20, textAlign: "center", color: "var(--text-secondary)", flexShrink: 0 }}
              >
                {isComposite
                  ? "Activa el interruptor general del accesorio para generar el código QR de Matter."
                  : "Activa la entidad para generar el código QR de Matter."}
              </div>
            )}

            <div className="accessory-controls" id="accessory-controls" style={{ flexShrink: 0, paddingTop: 6 }}>
              {isExported && (
                <div className="matter-actions" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    className="button button-secondary action-btn"
                    id="reconnect-accessory-button"
                    type="button"
                    onClick={handleReconnect}
                    disabled={isBusy}
                    title="Refresca la conexión con Home Assistant y Matter"
                    style={{ padding: "7px 10px", fontSize: 11.5 }}
                  >
                    ↻ Recargar / Sincronizar
                  </button>

                  <button
                    className="button button-secondary action-btn"
                    id="regenerate-code-button"
                    type="button"
                    onClick={handleOpenCommissioning}
                    disabled={isBusy}
                    style={{ padding: "7px 10px", fontSize: 11.5 }}
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
                    style={{ padding: "7px 10px", fontSize: 11.5 }}
                  >
                    Desconectar todo y nuevo QR
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* HAP Export Modal — rendered outside the scroll container */}
      {hapExportTarget && (
        <HapExportModal
          entity={hapExportTarget}
          onClose={() => setHapExportTarget(null)}
          onSuccess={(pincode, port) => {
            // Update entity's hapAccessory inline so the panel refreshes immediately
            if (hapExportTarget) {
              hapExportTarget.hapAccessory = {
                published: true,
                isPaired: false,
                hapProfile: "humidifier" as any,
                profileLabel: "",
                pincode,
                port,
              };
            }
            setHapExportTarget(null);
            setHapFreshPin({ pincode, port });
            onRefresh();
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};
