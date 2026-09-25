import React, { useState, useEffect, useMemo } from "react";
import { DeviceRecord, EntityRecord, HapProfile, HapAccessoryInfo } from "../types";
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

const HAP_CATEGORY_IDS: Record<string, number> = {
  humidifier: 8,
  dehumidifier: 8,
  air_purifier: 19,
  television: 24,
  television_speaker: 24,
  valve_irrigation: 29,
  valve_faucet: 29,
  valve_shower: 29,
  security_system: 11,
  garage_door: 4,
  doorbell: 18,
  fan_hap: 3,
  heater_cooler: 9,
  thermostat_hap: 9,
  outlet_hap: 7,
  switch_hap: 8,
  lightbulb_hap: 5,
  lock_hap: 6,
  window_covering_hap: 14,
  door_hap: 12,
  window_hap: 13,
  motion_sensor_hap: 10,
  contact_sensor_hap: 10,
  smoke_sensor_hap: 10,
  carbon_monoxide_sensor_hap: 10,
  carbon_dioxide_sensor_hap: 10,
  leak_sensor_hap: 10,
  occupancy_sensor_hap: 10,
  temperature_sensor_hap: 10,
  humidity_sensor_hap: 10,
  light_sensor_hap: 10,
  air_quality_sensor_hap: 10,
  battery_hap: 16,
  speaker_hap: 26,
  irrigation_system: 28,
};

function computeHapSetupUri(
  pincode: string,
  setupId: string = "HAP1",
  profile: string = "humidifier",
): string {
  try {
    const cleanPin = parseInt((pincode || "").replace(/-/g, ""), 10);
    if (isNaN(cleanPin)) return "";
    const category = HAP_CATEGORY_IDS[profile] || 1;
    const total = (BigInt(category) << 31n) | (1n << 28n) | BigInt(cleanPin);
    let encoded = total.toString(36).toUpperCase();
    while (encoded.length < 9) encoded = "0" + encoded;
    const cleanSetupId = (setupId || "HAP1")
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, "")
      .slice(0, 4)
      .padEnd(4, "0");
    return "X-HM://" + encoded + cleanSetupId;
  } catch {
    return "";
  }
}

interface HapRecommendation {
  isRecommended: boolean;
  recommendedProfile: HapProfile;
  categoryName: string;
  badgeText: string;
  reason: string;
  appleAdvantage: string;
}

function detectHapRecommendation(
  device: DeviceRecord | null | undefined,
): HapRecommendation {
  if (!device || !device.entities || device.entities.length === 0) {
    return {
      isRecommended: false,
      recommendedProfile: "humidifier",
      categoryName: "",
      badgeText: "",
      reason: "",
      appleAdvantage: "",
    };
  }

  const allStrings = [
    device.name || "",
    device.model || "",
    device.manufacturer || "",
    ...device.entities.flatMap((e) => [
      e.entityId,
      e.name || "",
      e.domain || "",
      (e as any).device_class || "",
    ]),
  ]
    .join(" ")
    .toLowerCase();

  const domains = new Set(device.entities.map((e) => e.domain));

  // 1. Panel de Alarma / Security System
  if (
    domains.has("alarm_control_panel") ||
    /alarm|alarma|argus|seguridad|security|panel_alarma|siren|sirena/i.test(
      allStrings,
    )
  ) {
    return {
      isRecommended: true,
      recommendedProfile: "security_system",
      categoryName: "Panel de Alarma / Sistema de Seguridad",
      badgeText: "⭐ Recomendado para Apple Home (Sistema de Alarma)",
      reason:
        "Apple Home no soporta Paneles de Alarma de forma nativa en la especificación actual de Matter.",
      appleAdvantage:
        "En HomeKit HAP se reconoce con el widget nativo de Sistema de Seguridad en Apple Casa (Armar en casa, Armar fuera, Noche y Desarmar) con alertas y notificaciones críticas de iOS.",
    };
  }

  // 2. Difusor / Humidificador / Deshumidificador
  if (
    domains.has("humidifier") ||
    /difusor|diffuser|humidif|deshumidif|dehumidif|aroma|esencia/i.test(
      allStrings,
    )
  ) {
    const isDehum = /deshumidif|dehumidif/i.test(allStrings);
    return {
      isRecommended: true,
      recommendedProfile: isDehum ? "dehumidifier" : "humidifier",
      categoryName: isDehum ? "Deshumidificador" : "Difusor / Humidificador",
      badgeText: `⭐ Recomendado para Apple Home (${isDehum ? "Deshumidificador" : "Difusor"})`,
      reason:
        "Matter no incluye la categoría de Difusor ni Humidificador en Apple Home, exponiéndolos como simples ventiladores con niebla.",
      appleAdvantage: `En HomeKit HAP se integra como ${isDehum ? "Deshumidificador" : "Difusor / Humidificador"} nativo en Apple Casa con icono propio y ajuste porcentual de humedad relativa.`,
    };
  }

  // 3. Purificador de Aire
  if (/purificad|air_purifier|purifier|filtro_aire/i.test(allStrings)) {
    return {
      isRecommended: true,
      recommendedProfile: "air_purifier",
      categoryName: "Purificador de Aire",
      badgeText: "⭐ Recomendado para Apple Home (Purificador)",
      reason:
        "En Matter los purificadores suelen exponerse como simples interruptores o ventiladores sin calidad de aire.",
      appleAdvantage:
        "En HomeKit HAP se integra como Purificador de Aire nativo con velocidad de ventilador, calidad del aire y estado de filtro.",
    };
  }

  // 4. Televisión / Reproductor Multimedia
  if (
    domains.has("media_player") ||
    /televisi[oó]n|tv|media_player|roku|appletv|apple_tv|chromecast|soundbar|kodi/i.test(
      allStrings,
    )
  ) {
    return {
      isRecommended: true,
      recommendedProfile: "television",
      categoryName: "Televisor / Reproductor Multimedia",
      badgeText: "⭐ Recomendado para Apple Home (Televisor)",
      reason:
        "Apple Home no soporta reproductores multimedia en Matter de manera completa.",
      appleAdvantage:
        "En HomeKit HAP se integra como Televisor en Apple Casa y activa el mando a distancia interactivo en el Centro de Control de iOS con cambio de entradas y encendido/apagado.",
    };
  }

  // 5. Válvula / Riego / Grifo
  if (
    domains.has("valve") ||
    /v[aá]lvula|valve|riego|irrigation|grifo|faucet|sprinkler/i.test(allStrings)
  ) {
    const isFaucet = /grifo|faucet/i.test(allStrings);
    return {
      isRecommended: true,
      recommendedProfile: isFaucet ? "valve_faucet" : "valve_irrigation",
      categoryName: isFaucet ? "Grifo / Válvula" : "Sistema de Riego / Válvula",
      badgeText: "⭐ Recomendado para Apple Home (Válvula)",
      reason:
        "Las válvulas en Matter tienen soporte limitado y no interactivo en Apple Home.",
      appleAdvantage:
        "En HomeKit HAP ofrece temporizador de apertura configurable y control directo de agua en Apple Casa.",
    };
  }

  // 6. Puerta de Garaje
  if (/garaje|garage/i.test(allStrings)) {
    return {
      isRecommended: true,
      recommendedProfile: "garage_door",
      categoryName: "Puerta de Garaje",
      badgeText: "⭐ Recomendado para Apple Home (Garaje)",
      reason: "En Matter suele aparecer como persiana genérica.",
      appleAdvantage:
        "En HomeKit HAP muestra el icono nativo de Garaje, estados 'Abriendo/Cerrando' y compatibilidad con Siri y CarPlay al aproximarte a tu casa.",
    };
  }

  return {
    isRecommended: false,
    recommendedProfile: "humidifier",
    categoryName: "",
    badgeText: "",
    reason: "",
    appleAdvantage: "",
  };
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

function getControllerBadge(
  vendorId?: number | null,
  controllerName?: string,
): { icon: string; name: string } {
  const name = controllerName || "Controlador Matter";
  const vid =
    vendorId !== null && vendorId !== undefined ? Number(vendorId) : null;
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

  // Recommendations calculated once based on device properties
  const hapRecDetails = useMemo(() => detectHapRecommendation(device), [device]);

  // Initial props extraction
  const activeHapFromProps =
    device?.entities.find((e) => e.hapAccessory?.published)?.hapAccessory ||
    (device?.entities[0]?.hapAccessory?.published ? device.entities[0].hapAccessory : null);

  // localHapAccessory tracks HAP publication as proper React state for 0ms reactivity
  const [localHapAccessory, setLocalHapAccessory] = useState<HapAccessoryInfo | null>(
    () => activeHapFromProps || null
  );

  // localCompositeExported tracks the toggle state as proper React state
  const [localCompositeExported, setLocalCompositeExported] = useState<boolean>(
    () => Boolean(device?.entities.some((e) => e.composite && e.exported))
  );

  const isDeviceHapPublished = Boolean(localHapAccessory?.published);
  const activeHapAccessory = localHapAccessory;
  const isHapRecommended = hapRecDetails.isRecommended;

  const [selectedProtocol, setSelectedProtocol] = useState<"matter" | "hap">(() => {
    if (activeHapFromProps?.published) return "hap";
    if (hapRecDetails.isRecommended && !device?.entities.some((e) => e.exported)) return "hap";
    return "matter";
  });

  const [hapProfiles, setHapProfiles] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedHapProfile, setSelectedHapProfile] = useState<HapProfile>(() => {
    if (activeHapFromProps?.hapProfile) return activeHapFromProps.hapProfile;
    if (hapRecDetails.isRecommended) return hapRecDetails.recommendedProfile;
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
    if (activeHapFromProps) {
      setLocalHapAccessory(activeHapFromProps);
    }
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
  }, [device, targetEntity, isDeviceHapPublished, activeHapFromProps]);

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
    if (!nextState) {
      setFreshPairingCode(null);
      setFreshManualCode(null);
    }
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
    if (activeEntity?.entityId === entity.entityId) {
      setSelectedEntity({ ...activeEntity, exported: nextState });
    }
    if (!nextState) {
      setFreshPairingCode(null);
      setFreshManualCode(null);
    }
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
      if (activeEntity?.entityId === entity.entityId) {
        setSelectedEntity({ ...activeEntity, exported: !nextState });
      }
      showToast(err.message || "Error al modificar publicación", true);
    }
  };

  // Direct HAP publish handler with 0ms optimistic UI update
  const handlePublishHapDirect = async () => {
    const targetId = compositePrimary?.entityId || activeEntity?.entityId || device.entities[0].entityId;
    setIsBusy(true);
    try {
      const res = await api.registerHap(targetId, selectedHapProfile);
      if (res.success) {
        showToast(`✓ Publicado en HomeKit HAP (PIN: ${res.pincode})`);
        const setupUri =
          res.setupUri ||
          computeHapSetupUri(
            res.pincode || "",
            res.setupId || "HAP1",
            selectedHapProfile
          );
        const updatedAcc: HapAccessoryInfo = {
          published: true,
          isPaired: false,
          hapProfile: selectedHapProfile,
          profileLabel:
            hapProfiles.find((p) => p.id === selectedHapProfile)?.label ||
            selectedHapProfile,
          pincode: res.pincode || "",
          port: res.port || 0,
          setupId: res.setupId || "HAP1",
          setupUri,
          pairingState: "⏳ Listo para vincular (Escanea el código QR en Apple Home)",
        };
        device.entities.forEach((e) => {
          e.hapAccessory = updatedAcc as any;
        });
        if (activeEntity) activeEntity.hapAccessory = updatedAcc as any;
        setLocalHapAccessory(updatedAcc);
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

  // Direct HAP unregister handler with 0ms optimistic UI update
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
      setLocalHapAccessory(null);
      setHapFreshPin(null);
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
              🏠 HomeKit HAP {isDeviceHapPublished ? "✓ Activo" : hapRecDetails.isRecommended ? `⭐ Recomendado (${hapRecDetails.categoryName})` : ""}
            </button>
          </div>

          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {selectedProtocol === "matter"
              ? "Compatible con Apple Home, Google Home, Alexa y SmartThings"
              : hapRecDetails.isRecommended
              ? `Accesorio HomeKit nativo (reconocido como ${hapRecDetails.categoryName})`
              : "Accesorio HomeKit nativo (reconocido como Alarma, Difusor, TV, Válvula, etc.)"}
          </div>
        </div>

        {/* ── Smart Recommendation Banner (Apple Home) ── */}
        {hapRecDetails.isRecommended && selectedProtocol === "matter" && !isExported && (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(245, 158, 11, 0.05))",
              border: "1px solid rgba(245, 158, 11, 0.35)",
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
              <span style={{ fontSize: 20 }}>⭐</span>
              <div style={{ fontSize: 12, color: "#fef3c7", lineHeight: 1.4 }}>
                <strong style={{ color: "#fcd34d" }}>Recomendación para Apple Home ({hapRecDetails.categoryName}):</strong>{" "}
                {hapRecDetails.reason}{" "}
                {hapRecDetails.appleAdvantage}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedProtocol("hap");
                if (hapRecDetails.recommendedProfile) {
                  setSelectedHapProfile(hapRecDetails.recommendedProfile);
                }
              }}
              style={{
                whiteSpace: "nowrap",
                padding: "6px 14px",
                background: "rgba(245, 158, 11, 0.25)",
                border: "1px solid rgba(245, 158, 11, 0.5)",
                color: "#fde68a",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 650,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(245,158,11,0.2)",
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
                  <small style={{ color: "#fef08a", fontSize: 11, lineHeight: 1.4, marginTop: 4 }}>
                    {selectedHapProfile === "security_system"
                      ? "Apple Home lo reconocerá como Panel de Alarma / Sistema de Seguridad nativo con modos En Casa, Fuera, Noche y Desarmado."
                      : selectedHapProfile === "humidifier"
                      ? "Apple Home lo reconocerá como Difusor / Humidificador nativo con icono de gota, porcentaje de humedad y control de niebla."
                      : selectedHapProfile === "dehumidifier"
                      ? "Apple Home lo reconocerá como Deshumidificador nativo con control porcentual de humedad."
                      : selectedHapProfile === "air_purifier"
                      ? "Apple Home lo reconocerá como Purificador de Aire nativo con velocidad de ventilador y estado de filtros."
                      : selectedHapProfile === "television"
                      ? "Apple Home lo reconocerá como Televisor nativo con selector de entradas HDMI y control remoto integrado en iOS."
                      : selectedHapProfile.startsWith("valve")
                      ? "Apple Home lo reconocerá como Válvula / Sistema de Riego con temporizador nativo."
                      : selectedHapProfile === "garage_door"
                      ? "Apple Home lo reconocerá como Puerta de Garaje con compatibilidad Siri y CarPlay."
                      : "Apple Home creará el accesorio con los servicios y características nativas de hap-nodejs 2.2.3."}
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
                activeHapAccessory.isPaired ? (
                  <div className="paired-success-glass-card" id="paired-hap-device-card">
                    <div className="paired-apple-home-badge">
                      <AppleHomeModernIcon variant="color" size={56} />
                    </div>
                    <h4 className="paired-card-title">¡Accesorio HAP vinculado en Apple Home!</h4>
                    <p className="paired-card-desc">
                      Este accesorio ya está vinculado y activo en tu app Casa de Apple como{" "}
                      <strong style={{ color: "#fcd34d" }}>
                        {activeHapAccessory.profileLabel || activeHapAccessory.hapProfile}
                      </strong>.
                    </p>
                    <div
                      style={{
                        marginTop: 12,
                        padding: "10px 14px",
                        background: "rgba(245, 158, 11, 0.1)",
                        borderRadius: 10,
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        fontSize: 12,
                        textAlign: "left",
                        color: "#fde68a",
                      }}
                    >
                      <div>
                        <strong>Código PIN de configuración:</strong> <code>{activeHapAccessory.pincode}</code>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <strong>Puerto HAP:</strong> {activeHapAccessory.port}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <QRCodeDisplay
                      pairingCode={
                        activeHapAccessory.setupUri ||
                        computeHapSetupUri(
                          activeHapAccessory.pincode,
                          activeHapAccessory.setupId || "HAP1",
                          activeHapAccessory.hapProfile
                        )
                      }
                      manualCode={activeHapAccessory.pincode}
                      pinCode={activeHapAccessory.pincode}
                      variant="hap-homekit"
                      entityName={device.name}
                      elementId="hap-device-qr-code"
                      noteText="Escanea con la app Casa de Apple para vincular accesorio HAP"
                    />
                    <div
                      style={{
                        marginTop: 10,
                        padding: "10px 12px",
                        background: "rgba(245, 158, 11, 0.1)",
                        borderRadius: 8,
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        fontSize: "0.78rem",
                        textAlign: "left",
                      }}
                    >
                      <strong style={{ color: "#fcd34d" }}>
                        📲 Cómo vincular en Apple Casa:
                      </strong>
                      <ol style={{ margin: "4px 0 0 16px", padding: 0, color: "#fef3c7", lineHeight: 1.4 }}>
                        <li>Abre la app <strong>Casa</strong> en tu iPhone, iPad o Mac.</li>
                        <li>Toca <strong>+</strong> y selecciona <strong>Añadir accesorio</strong>.</li>
                        <li>Escanea la pegatina interactiva amarilla de arriba o introduce el PIN manual <strong>{activeHapAccessory.pincode}</strong>.</li>
                      </ol>
                    </div>
                  </>
                )
              ) : (
                <div
                  className="qr-liquid-glass-card"
                  style={{ padding: 22, textAlign: "center", color: "var(--text-secondary)", flexShrink: 0 }}
                >
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                    <AppleHomeModernIcon variant="color" size={54} />
                  </div>
                  <h4 style={{ margin: "0 0 8px 0", color: "#fcd34d", fontSize: 15, fontWeight: 700 }}>
                    Accesorio HomeKit HAP no publicado
                  </h4>
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 16px 0", color: "#e5e7eb" }}>
                    {hapRecDetails.isRecommended
                      ? `Recomendado para este dispositivo (${hapRecDetails.categoryName}): se publicará como accesorio HAP nativo con soporte directo en Apple Casa.`
                      : "Publica este accesorio en HomeKit HAP para generar su código QR interactivo con la casita amarilla de Apple Casa y código PIN de 8 dígitos."}
                  </p>
                  <button
                    type="button"
                    className="button button-primary"
                    style={{
                      background: "linear-gradient(135deg, #f59e0b, #d97706)",
                      color: "#000",
                      fontWeight: 750,
                      padding: "9px 18px",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      width: "100%",
                      boxShadow: "0 4px 12px rgba(245, 158, 11, 0.25)",
                    }}
                    onClick={handlePublishHapDirect}
                    disabled={isBusy}
                  >
                    ⚡ Publicar en HomeKit HAP ahora
                  </button>
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
              {selectedProtocol === "matter" && isExported && (
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
              {selectedProtocol === "hap" && isDeviceHapPublished && (
                <div className="hap-actions" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    className="button button-danger action-btn"
                    id="unregister-hap-button"
                    type="button"
                    onClick={handleUnregisterHapDirect}
                    disabled={isBusy}
                    title="Retirar accesorio de HomeKit HAP"
                    style={{ padding: "7px 10px", fontSize: 11.5 }}
                  >
                    Retirar de HomeKit HAP
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
