import React, { useState, useEffect } from "react";
import { CameraRecord, CameraUiCameraItem, CameraRealEntity } from "../types";
import { api } from "../api/client";
import { extractCameraBrand } from "./CameraCard";
import { QRCodeDisplay, AppleHomeModernIcon } from "./QRCodeDisplay";
import { copyToClipboard } from "../utils/clipboard";

interface CameraConfigModalProps {
  camera: CameraRecord | CameraUiCameraItem | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

function computeHapSetupUri(pincode: string, setupId: string): string {
  try {
    const pin = parseInt(String(pincode).replace(/-/g, ""), 10);
    const category = 17; // Category IP_CAMERA
    const low = (pin | (1 << 28) | (category & 1 ? 1 << 31 : 0)) >>> 0;
    const high = (category >> 1) >>> 0;
    const num = BigInt(high) * 4294967296n + BigInt(low);
    let enc = num.toString(36).toUpperCase();
    while (enc.length < 9) enc = "0" + enc;
    return `X-HM://${enc}${setupId.substring(0, 4).toUpperCase().padStart(4, "S")}`;
  } catch {
    return `X-HM://00GW95DQA${setupId.substring(0, 4).toUpperCase().padStart(4, "S")}`;
  }
}

export const CameraConfigModal: React.FC<CameraConfigModalProps> = ({
  camera,
  onClose,
  onRefresh,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<"homekit" | "matter" | "ai" | "nest">("homekit");
  const [rtspUrl, setRtspUrl] = useState("");
  const [transport, setTransport] = useState<"tcp" | "udp">("tcp");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [streamResult, setStreamResult] = useState<{ text: string; isError?: boolean } | null>(null);
  const [streamVerified, setStreamVerified] = useState(false);
  const [multiAdminOpen, setMultiAdminOpen] = useState(false);
  const [freshMatterCode, setFreshMatterCode] = useState<string | null>(null);
  const [freshMatterManualCode, setFreshMatterManualCode] = useState<string | null>(null);
  const [isOpeningCommissioning, setIsOpeningCommissioning] = useState(false);
  const [modelInput, setModelInput] = useState("");
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [controllingEntityId, setControllingEntityId] = useState<string | null>(null);
  const [activeMatterEntityId, setActiveMatterEntityId] = useState<string | null>(null);
  const [entityMatterCodes, setEntityMatterCodes] = useState<
    Record<string, { pairingCode: string; manualCode?: string }>
  >({});
  const [isGeneratingEntityMatter, setIsGeneratingEntityMatter] = useState<Record<string, boolean>>({});
  const [aiConfig, setAiConfig] = useState<{
    enabled: boolean;
    targets: string[];
    sensitivity: number;
    motionTimeoutSeconds: number;
    publishMqtt: boolean;
    mqttTopic?: string;
  }>({
    enabled: true,
    targets: ["person", "dog", "cat", "bird", "raccoon", "snake", "spider"],
    sensitivity: 85,
    motionTimeoutSeconds: 15,
    publishMqtt: true,
  });
  const [activeAiDetection, setActiveAiDetection] = useState<any>(null);
  const [isSavingAi, setIsSavingAi] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);

  const isCameraUi = Boolean(camera && ("id" in camera && !("cameraId" in camera)));
  const cameraId = camera ? ("cameraId" in camera ? camera.cameraId : camera.id) : "";
  const cameraName = camera?.name || "";

  // Initialize data when camera changes
  useEffect(() => {
    if (!camera) return;

    let initialUrl = "";
    let prefTransport: "tcp" | "udp" = "tcp";
    let initialModel = "";

    if (isCameraUi) {
      const cui = camera as CameraUiCameraItem;
      initialUrl = cui.rtspUrl || "";
      initialModel = cui.model || "";
      setModelInput(initialModel);
      setRtspUrl(initialUrl);
      setTransport("tcp");
      setFreshMatterCode(null);
      setFreshMatterManualCode(null);
      setMultiAdminOpen(false);

      if (cui.width && cui.height) {
        setStreamVerified(true);
        const w = cui.width;
        const h = cui.height;
        const codec = (cui.videoCodec || "H.264").toUpperCase();
        const fpsVal = cui.fps || 30;
        const audioStr = cui.hasAudio ? "Con Audio (AAC)" : "Sin Audio";
        setStreamResult({
          text: `✓ Stream nativo activo (${codec} ${w}x${h} @ ${fpsVal}fps, ${audioStr}). Passthrough puro listo para Apple Home.`,
        });
      } else if (initialUrl) {
        setStreamVerified(false);
        setStreamResult({
          text: "ℹ️ Pulsa 'Verificar Stream' para comprobar la resolución y códec en tiempo real.",
        });
      } else {
        setStreamVerified(false);
        setStreamResult({
          text: "ℹ️ Sin URL de stream RTSP directa configurada.",
          isError: true,
        });
      }
    } else {
      const sc = camera as CameraRecord;
      initialUrl =
        sc.source?.streamReference?.directUrl ||
        sc.source?.profiles?.find((p) => p.directUrl)?.directUrl ||
        "";
      prefTransport = sc.exportConfig?.rtspTransportPreference || "tcp";
      initialModel = sc.displayModel || sc.model || "";
      setModelInput(initialModel);
      setRtspUrl(initialUrl);
      setTransport(prefTransport);
      setFreshMatterCode(null);
      setFreshMatterManualCode(null);
      setMultiAdminOpen(false);

      const observed = sc.capabilities?.observed;
      const isVerified =
        sc.source?.streamValidationStatus === "verified" ||
        (sc.source?.streamReference as any)?.validationStatus === "verified";
      if (isVerified && observed) {
        setStreamVerified(true);
        const w = observed.resolution?.width || 1920;
        const h = observed.resolution?.height || 1080;
        const codec = (observed.videoCodec || "H.264").toUpperCase();
        const fpsVal = observed.fps || 30;
        const audioStr = observed.hasAudio !== false ? "Con Audio" : "Sin Audio";
        setStreamResult({
          text: `✓ Stream verificado y activo (${codec} ${w}x${h} @ ${fpsVal}fps, ${audioStr}). Live View listo para Apple Home.`,
        });
      } else if (initialUrl) {
        setStreamVerified(false);
        setStreamResult({
          text: "ℹ️ Pulsa 'Verificar Stream' para probar la conectividad y resolución nativa en vivo.",
        });
      } else {
        setStreamVerified(false);
        setStreamResult({
          text: "ℹ️ Sin URL de stream configurada. Ingresa una URL RTSP directa para activar Live View.",
          isError: true,
        });
      }
    }

    if (cameraId) {
      setSnapshotUrl(api.getCameraSnapshotUrl(cameraId));
      setSnapshotLoaded(false);
      api.getCameraAiConfig(cameraId)
        .then((res) => {
          if (res?.config) setAiConfig(res.config);
          if (res?.active) setActiveAiDetection(res.active);
        })
        .catch(() => {});
    }
  }, [cameraId, isCameraUi]);

  const handleRefreshSnapshot = () => {
    if (!cameraId) return;
    setIsLoadingSnapshot(true);
    setSnapshotUrl(api.getCameraSnapshotUrl(cameraId));
    setTimeout(() => setIsLoadingSnapshot(false), 800);
  };

  const handleSaveAiConfig = async () => {
    if (!cameraId) return;
    setIsSavingAi(true);
    try {
      const res = await api.saveCameraAiConfig(cameraId, aiConfig);
      if (res?.success) {
        showToast("✓ Configuración de IA guardada correctamente");
      } else {
        showToast("Error al guardar configuración de IA", true);
      }
    } catch {
      showToast("Error al conectar con el servidor", true);
    } finally {
      setIsSavingAi(false);
    }
  };

  if (!camera) return null;

  const brand = extractCameraBrand(camera);
  const isOnline = isCameraUi
    ? (camera as CameraUiCameraItem).status === "online" && (camera as CameraUiCameraItem).homeKitEnabled !== false
    : (camera as CameraRecord)?.status?.connection === "online" && (camera as CameraRecord)?.status?.isOnline === true;
  const isPaired = isCameraUi
    ? Boolean((camera as CameraUiCameraItem).isPaired)
    : (camera as CameraRecord)?.identity?.homeKitPairingState === "paired";

  // Detect Google Nest cameras — show go2rtc setup guide tab
  const isNestCamera =
    !isCameraUi &&
    (brand === "GOOGLE" ||
      brand === "NEST" ||
      cameraId.includes("nest") ||
      cameraId.includes("google") ||
      ((camera as CameraRecord)?.capabilities?.observed?.streamSourceType === "webrtc" &&
        (camera as CameraRecord)?.capabilities?.observed?.strategy === "unsupported"));
  const nestNeedsGo2rtc =
    isNestCamera &&
    (camera as CameraRecord)?.capabilities?.observed?.strategy === "unsupported";

  const pinCode = isCameraUi
    ? ((camera as CameraUiCameraItem).pincode || "031-45-154")
    : ((camera as CameraRecord)?.identity?.homeKitPincode || "031-45-154");
  const setupId = isCameraUi
    ? ((camera as CameraUiCameraItem).setupId || "CUI1")
    : ((camera as CameraRecord)?.identity?.homeKitSetupId || "SC01");

  const getSetupUri = () => {
    if (isCameraUi) {
      const cui = camera as CameraUiCameraItem;
      if (cui.setupUri) return cui.setupUri;
      return computeHapSetupUri(pinCode, setupId);
    }
    const sc = camera as CameraRecord;
    if (sc.identity?.homeKitSetupUri) return sc.identity.homeKitSetupUri;
    return computeHapSetupUri(pinCode, setupId);
  };

  const isMatterCommissioned = isCameraUi
    ? false
    : Boolean(
        (camera as CameraRecord).bindingState?.matterCommissioned ||
        ((camera as CameraRecord).bindingState?.fabrics && (camera as CameraRecord).bindingState!.fabrics!.length > 0)
      );

  const pairingPayload =
    activeTab === "homekit"
      ? getSetupUri()
      : freshMatterCode || (!isCameraUi ? (camera as CameraRecord).identity?.matterPairingCode : "") || "";

  const modelDisplay = isCameraUi
    ? (camera as CameraUiCameraItem).model || "Modelo no identificado"
    : (camera as CameraRecord).displayModel || (camera as CameraRecord).model || "Modelo no identificado";

  const handleSaveModel = async (newModel?: string) => {
    const modelToSave = (newModel ?? modelInput).trim();
    if (!modelToSave) return;
    setIsSavingModel(true);
    try {
      if (!isCameraUi) {
        await api.updateCameraIdentity(cameraId, {
          manufacturer: brand,
          model: modelToSave,
        });
        (camera as CameraRecord).displayModel = modelToSave;
        (camera as CameraRecord).model = modelToSave;
        if (!(camera as CameraRecord).identityOverride) (camera as CameraRecord).identityOverride = {};
        (camera as CameraRecord).identityOverride!.model = modelToSave;
      } else {
        (camera as CameraUiCameraItem).model = modelToSave;
      }
      setModelInput(modelToSave);
      showToast(`✓ Modelo actualizado a «${modelToSave}»`);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al actualizar modelo", true);
    } finally {
      setIsSavingModel(false);
    }
  };

  // Compile real hardware entities
  const realEntities: CameraRealEntity[] = [];
  if (camera.realEntities && Array.isArray(camera.realEntities)) {
    realEntities.push(...camera.realEntities);
  }

  if (isCameraUi) {
    const cui = camera as CameraUiCameraItem;
    if (cui.hasLight && !realEntities.some((e) => e.type === "light")) {
      realEntities.push({
        id: `cameraui.${cui.id}.light`,
        domain: "light",
        type: "light",
        name: `${cui.name} Foco / Luz`,
        state: Boolean(cui.lightActive),
        matterExported: false,
      });
    }
    if (cui.hasSiren && !realEntities.some((e) => e.type === "siren")) {
      realEntities.push({
        id: `cameraui.${cui.id}.siren`,
        domain: "siren",
        type: "siren",
        name: `${cui.name} Sirena`,
        state: Boolean(cui.sirenActive),
        matterExported: false,
      });
    }
    if (cui.motionTopic && !realEntities.some((e) => e.type === "motion")) {
      realEntities.push({
        id: `cameraui.${cui.id}.motion`,
        domain: "binary_sensor",
        type: "motion",
        name: `${cui.name} Sensor Movimiento`,
        state: Boolean(cui.motionActive),
        topic: cui.motionTopic,
      });
    }
    if (cui.doorbellTopic && !realEntities.some((e) => e.type === "doorbell")) {
      realEntities.push({
        id: `cameraui.${cui.id}.doorbell`,
        domain: "event",
        type: "doorbell",
        name: `${cui.name} Timbre`,
        state: Boolean(cui.doorbellActive),
        topic: cui.doorbellTopic,
      });
    }
  } else if ("sensors" in camera && Array.isArray((camera as CameraRecord).sensors)) {
    for (const sensor of (camera as CameraRecord).sensors || []) {
      if (
        (sensor.type === "light" ||
          sensor.type === "siren" ||
          sensor.type === "motion" ||
          sensor.type === "doorbell") &&
        !realEntities.some((e) => e.type === sensor.type)
      ) {
        realEntities.push({
          id: `sensor.${sensor.sensorId}`,
          domain: (sensor.type === "motion" ? "binary_sensor" : sensor.type === "doorbell" ? "event" : sensor.type) as any,
          type: sensor.type,
          name: sensor.name || `${camera.name} ${sensor.type}`,
          state: Boolean(sensor.state),
          matterExported: false,
        });
      }
    }
  }

  // Technical Specs - Probed Real Values Only
  let videoCodec = "—";
  let resDisplay = "—";
  let fpsDisplay = "—";
  let audioDisplay = "—";
  let isProbedVerified = false;

  if (isCameraUi) {
    const cui = camera as CameraUiCameraItem;
    if (cui.videoCodec) {
      videoCodec = cui.videoCodec.toUpperCase();
    }
    if (cui.width && cui.height) {
      resDisplay = `${cui.width}x${cui.height}`;
      isProbedVerified = true;
    }
    if (cui.fps) {
      fpsDisplay = `${cui.fps} fps`;
    }
    audioDisplay = cui.hasAudio ? "Con Audio (AAC)" : "Sin Audio detectado";
  } else {
    const sc = camera as CameraRecord;
    const obs = sc.capabilities?.observed;
    const isVerified =
      sc.source?.streamValidationStatus === "verified" ||
      (sc.source?.streamReference as any)?.validationStatus === "verified" ||
      Boolean(obs?.resolution);

    if (obs?.videoCodec) {
      videoCodec = obs.videoCodec.toUpperCase();
    }
    if (obs?.resolution?.width && obs?.resolution?.height) {
      resDisplay = `${obs.resolution.width}x${obs.resolution.height}`;
      isProbedVerified = true;
    } else if (sc.resolution?.width && sc.resolution?.height) {
      resDisplay = `${sc.resolution.width}x${sc.resolution.height}`;
      isProbedVerified = true;
    }
    if (obs?.fps) {
      fpsDisplay = `${obs.fps} fps`;
    } else if (sc.fps) {
      fpsDisplay = `${sc.fps} fps`;
    }
    if (obs?.hasAudio !== undefined) {
      audioDisplay = obs.hasAudio ? (obs.audioCodec?.toUpperCase() || "AAC") : "Sin Audio";
    }
    if (isVerified) isProbedVerified = true;
  }

  const handleResetPairing = async () => {
    if (!confirm(`¿Restablecer emparejamiento HomeKit para "${cameraName}"?`)) return;
    setIsResetting(true);
    try {
      if (isCameraUi) {
        const res = await api.resetCameraUiPairing(cameraId);
        if (res.success) {
          showToast("✓ Vinculación HAP restablecida. Escanea el nuevo código QR en Apple Home.");
          onRefresh();
        } else {
          showToast("No se pudo restablecer el emparejamiento", true);
        }
      } else {
        const res = await api.resetCameraPairing(`scrypted.${cameraId}`);
        if (res.success && res.setupUri) {
          if (!((camera as CameraRecord).identity)) (camera as CameraRecord).identity = {};
          (camera as CameraRecord).identity!.homeKitSetupUri = res.setupUri;
          (camera as CameraRecord).identity!.homeKitPairingState = "not_paired";
          showToast("✓ Vinculación restablecida. Escanea el nuevo código QR.");
          onRefresh();
        } else {
          showToast(res.error || "No se pudo restablecer", true);
        }
      }
    } catch (err: any) {
      showToast(err.message || "Error al reiniciar vinculación", true);
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteCamera = async () => {
    if (!confirm(`¿Eliminar la cámara "${cameraName}" de la exportación?`)) return;
    setIsDeleting(true);
    try {
      if (!isCameraUi) {
        await api.removeCamera(cameraId);
      } else {
        await api.toggleCameraUiHomeKit(cameraId);
      }
      showToast("✓ Cámara eliminada de la exportación");
      onRefresh();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Error al eliminar cámara", true);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenCommissioning = async () => {
    setIsOpeningCommissioning(true);
    try {
      const targetId = isCameraUi ? `cameraui.${cameraId}` : `scrypted.${cameraId}`;
      const res: any = await api.openCommissioning(targetId);
      if (res?.pairingCode || res?.manualPairingCode) {
        setFreshMatterCode(res.pairingCode || null);
        setFreshMatterManualCode(res.manualPairingCode || null);
      }
      setMultiAdminOpen(true);
      showToast(
        "✓ Ventana de emparejamiento (Multi-Admin) abierta por 15 min. Escanea en Google Home, Alexa o SmartThings."
      );
    } catch (err: any) {
      showToast(err.message || "Error al abrir Multi-Admin", true);
    } finally {
      setIsOpeningCommissioning(false);
    }
  };

  const handleVerifyStream = async () => {
    if (!rtspUrl.trim()) {
      showToast("Ingresa una URL RTSP para verificar", true);
      return;
    }
    setIsVerifying(true);
    setStreamResult({ text: "Verificando stream RTSP/HTTP (ffprobe en vivo)..." });
    try {
      const res = await api.verifyCameraStream(cameraId, rtspUrl.trim(), transport);
      if (res.ok && res.status === "verified") {
        setStreamVerified(true);
        if (res.validation) {
          if (!isCameraUi) {
            const sc = camera as CameraRecord;
            if (!sc.capabilities) sc.capabilities = {};
            if (!sc.capabilities.observed) sc.capabilities.observed = {};
            if (res.validation.resolution) sc.capabilities.observed.resolution = res.validation.resolution;
            if (res.validation.videoCodec) sc.capabilities.observed.videoCodec = res.validation.videoCodec;
            if (res.validation.audioCodec) sc.capabilities.observed.audioCodec = res.validation.audioCodec;
            if (res.validation.hasAudio !== undefined) sc.capabilities.observed.hasAudio = res.validation.hasAudio;
            if (res.validation.fps) sc.capabilities.observed.fps = res.validation.fps;
          }
        }
        const w = res.validation?.resolution?.width || 1920;
        const h = res.validation?.resolution?.height || 1080;
        const codec = (res.validation?.videoCodec || "H.264").toUpperCase();
        const fpsVal = res.validation?.fps || 30;
        setStreamResult({
          text: `✓ Stream verificado con éxito (${codec} ${w}x${h} @ ${fpsVal}fps). Live View listo para Apple Home.`,
        });
        handleRefreshSnapshot();
      } else {
        setStreamVerified(false);
        setStreamResult({
          text: `❌ ${res.validation?.error || "Stream inválido o no compatible"}`,
          isError: true,
        });
      }
    } catch (err: any) {
      setStreamVerified(false);
      setStreamResult({ text: `❌ Error: ${err.message}`, isError: true });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDiagnoseStream = async () => {
    if (!rtspUrl.trim()) {
      showToast("Ingresa una URL RTSP para diagnosticar", true);
      return;
    }
    setIsDiagnosing(true);
    setStreamResult({ text: "Diagnosticando stream en tiempo real (DESCRIBE, 1er frame, GOP, FPS)..." });
    try {
      const res = await api.diagnoseCameraStream(cameraId, rtspUrl.trim(), transport);
      if (res.success && res.metrics) {
        const describeMs = res.metrics.timeToDescribeMs?.value ?? "—";
        const frameMs = res.metrics.timeToFirstFrameMs?.value ?? "—";
        const fpsVal = res.metrics.observedFps?.value ?? "—";
        const gop = res.metrics.observedGopSeconds?.value ? `${res.metrics.observedGopSeconds.value}s` : "—";
        const trans = (res.metrics.selectedTransport?.value || transport).toUpperCase();
        setStreamResult({
          text: `✓ Diagnóstico completado: ⚡ Inicio: ${describeMs}ms · 1er Frame: ${frameMs}ms · FPS: ${fpsVal} · GOP: ${gop} · Transporte: ${trans}`,
        });
      } else {
        setStreamResult({
          text: `❌ Diagnóstico fallido: ${res.metrics?.error || "Error al conectar con el stream"}`,
          isError: true,
        });
      }
    } catch (err: any) {
      setStreamResult({ text: `❌ Error de diagnóstico: ${err.message}`, isError: true });
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleSaveStream = async () => {
    if (!rtspUrl.trim()) return;
    try {
      if (!isCameraUi) {
        await api.saveCameraStreamUrl(cameraId, rtspUrl.trim());
      }
      showToast("✓ URL de stream guardada");
    } catch (err: any) {
      showToast(err.message || "Error al guardar stream", true);
    }
  };

  const handleSaveExport = async () => {
    try {
      if (!isCameraUi) {
        await api.saveCameraExportConfig(cameraId, {
          matterEnabled: true,
          homeKitEnabled: true,
          hksvEnabledByDefault: true,
          googleHomeEnabled: false,
          alexaEnabled: false,
          smartThingsEnabled: false,
          nasEnabled: false,
          rtspTransportPreference: transport,
        });
      }
      showToast("✓ Configuración de cámara guardada");
      onRefresh();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Error al guardar configuración", true);
    }
  };

  // Interactive toggle for real physical entity (light, siren)
  const handleToggleEntity = async (ent: CameraRealEntity) => {
    setControllingEntityId(ent.id);
    const nextAction = ent.state ? "turn_off" : "turn_on";
    try {
      const res = await api.controlCameraEntity(ent.id, nextAction);
      if (res.success) {
        ent.state = res.state !== undefined ? res.state : !ent.state;
        showToast(`✓ ${ent.name}: ${ent.state ? "Encendido/Activado" : "Apagado/Silenciado"}`);
        onRefresh();
      } else {
        showToast(res.error || "No se pudo cambiar el estado", true);
      }
    } catch (err: any) {
      showToast(err.message || "Error al controlar entidad", true);
    } finally {
      setControllingEntityId(null);
    }
  };

  // Open separate Matter commissioning drawer for this entity
  const handleOpenEntityMatter = async (ent: CameraRealEntity) => {
    if (activeMatterEntityId === ent.id) {
      setActiveMatterEntityId(null);
      return;
    }
    setActiveMatterEntityId(ent.id);

    if (!ent.matterPairingCode && !entityMatterCodes[ent.id]) {
      setIsGeneratingEntityMatter((prev) => ({ ...prev, [ent.id]: true }));
      try {
        if (!ent.matterExported) {
          await api.toggleExport(ent.id, true);
          ent.matterExported = true;
        }
        const commRes: any = await api.openCommissioning(ent.id);
        if (commRes?.pairingCode || commRes?.manualPairingCode) {
          setEntityMatterCodes((prev) => ({
            ...prev,
            [ent.id]: {
              pairingCode: commRes.pairingCode,
              manualCode: commRes.manualPairingCode || commRes.pairingCode,
            },
          }));
          ent.matterPairingCode = commRes.pairingCode;
          ent.matterManualCode = commRes.manualPairingCode;
          showToast(`✓ Código Matter generado para ${ent.name}`);
          onRefresh();
        }
      } catch (err: any) {
        showToast(err.message || "Error al generar código Matter", true);
      } finally {
        setIsGeneratingEntityMatter((prev) => ({ ...prev, [ent.id]: false }));
      }
    }
  };

  const handleReopenEntityCommissioning = async (ent: CameraRealEntity) => {
    setIsGeneratingEntityMatter((prev) => ({ ...prev, [ent.id]: true }));
    try {
      const commRes: any = await api.openCommissioning(ent.id);
      if (commRes?.pairingCode || commRes?.manualPairingCode) {
        setEntityMatterCodes((prev) => ({
          ...prev,
          [ent.id]: {
            pairingCode: commRes.pairingCode,
            manualCode: commRes.manualPairingCode || commRes.pairingCode,
          },
        }));
        ent.matterPairingCode = commRes.pairingCode;
        ent.matterManualCode = commRes.manualPairingCode;
        showToast(`✓ Modo Multi-Admin abierto (15 min) para ${ent.name}`);
        onRefresh();
      }
    } catch (err: any) {
      showToast(err.message || "Error al abrir Multi-Admin", true);
    } finally {
      setIsGeneratingEntityMatter((prev) => ({ ...prev, [ent.id]: false }));
    }
  };

  const handleCopyCameraDiagnostics = async () => {
    const diagText = [
      `=== DIAGNÓSTICO DE CÁMARA ===`,
      `ID: ${cameraId}`,
      `Nombre: ${cameraName}`,
      `Tipo de Puente: ${isCameraUi ? "Camera.UI" : "Scrypted"}`,
      `Marca: ${brand}`,
      `Modelo: ${modelDisplay}`,
      `Estado: ${isOnline ? "En línea" : "Desconectada"}`,
      `RTSP URL: ${rtspUrl || "No configurada"}`,
      `Transporte RTSP: ${transport.toUpperCase()}`,
      `HomeKit HAP: ${isPaired ? "Emparejado en Apple Home" : "Listo para vincular"}`,
      `HomeKit Setup PIN: ${pinCode}`,
      `HomeKit Setup ID: ${setupId}`,
      `HomeKit Setup URI: ${getSetupUri()}`,
      `Resolución Probed: ${resDisplay}`,
      `Códec Video: ${videoCodec}`,
      `FPS: ${fpsDisplay}`,
      `Audio: ${audioDisplay}`,
      `Entidades Físicas Descubiertas: ${realEntities.length}`,
      ...realEntities.map(
        (e) => ` - [${e.type.toUpperCase()}] ${e.name} (${e.id}) - Estado: ${e.state ? "ON" : "OFF"}${e.topic ? ` - MQTT: ${e.topic}` : ""}`
      ),
    ].join("\n");

    const ok = await copyToClipboard(diagText);
    if (ok) {
      showToast("✓ Diagnóstico de cámara copiado al portapapeles");
    } else {
      showToast("⚠️ No se pudo acceder al portapapeles", true);
    }
  };

  return (
    <div className="modal-backdrop open" role="dialog" aria-modal="true">
      <section className="modal modal-wide" style={{ maxWidth: 940 }}>
        <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
        <header className="modal-header">
          <span className="modal-icon" style={{ fontSize: "1.8rem" }}>📹</span>
          <div>
            <p className="eyebrow">
              {isCameraUi ? "CÁMARA CAMERA.UI · APPLE HOME HAP & MATTER" : "CÁMARA SCRYPTED · APPLE HOME HAP & MATTER"}
            </p>
            <h2>{cameraName}</h2>
            <p className="entity-id">
              {isOnline ? "🟢 En línea" : "🔴 Desconectada"} · {brand} {modelDisplay && `(${modelDisplay})`} · ID: {cameraId}
              {isCameraUi && (camera as CameraUiCameraItem).port && (
                <> · Puerto HAP: <code>{(camera as CameraUiCameraItem).port}</code></>
              )}
            </p>
          </div>
        </header>

        <div className="camera-modal-layout">
          {/* Left Column: QR Code & Pairing */}
          <div className="qr-panel">
            <div className="tab-group" style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              <button
                className={`button button-sm ${activeTab === "homekit" ? "button-primary" : "button-secondary"}`}
                type="button"
                onClick={() => setActiveTab("homekit")}
              >
                Apple Home (HAP)
              </button>
              <button
                className={`button button-sm ${activeTab === "matter" ? "button-primary" : "button-secondary"}`}
                type="button"
                onClick={() => setActiveTab("matter")}
              >
                Matter 1.6
              </button>
              <button
                className={`button button-sm ${activeTab === "ai" ? "button-primary" : "button-secondary"}`}
                type="button"
                onClick={() => setActiveTab("ai")}
              >
                🧠 IA & Fauna
              </button>
              {isNestCamera && (
                <button
                  className={`button button-sm ${activeTab === "nest" ? "button-primary" : "button-secondary"}`}
                  type="button"
                  onClick={() => setActiveTab("nest")}
                  style={nestNeedsGo2rtc ? { borderColor: "#fb923c", color: activeTab === "nest" ? undefined : "#fb923c" } : undefined}
                >
                  📡 Google Nest
                </button>
              )}
            </div>

            {activeTab === "nest" ? (
              <div className="card" style={{ padding: 16 }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "0.95rem", color: "#fb923c" }}>
                  📡 Google Nest — Live Stream en HomeKit
                </h4>

                {nestNeedsGo2rtc ? (
                  <>
                    <div style={{
                      background: "rgba(251,146,60,0.1)",
                      border: "1px solid rgba(251,146,60,0.4)",
                      borderRadius: 8,
                      padding: "10px 14px",
                      marginBottom: 14,
                      fontSize: "0.82rem",
                      color: "#fb923c",
                    }}>
                      <strong>⚠️ Sin stream disponible:</strong> La integración <code>google_nest</code> de HA solo hace WebRTC efímero a Google Cloud.
                      Para tener live stream estable en HomeKit necesitas <strong>go2rtc</strong> como puente RTSP local.
                    </div>

                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 12 }}>
                      go2rtc se conecta directamente al Google SDM API con tus credenciales OAuth2 y expone un endpoint RTSP local
                      (<code>rtsp://127.0.0.1:8554/{cameraName.toLowerCase().replace(/\s+/g, "_")}</code>) que nuestro addon detecta
                      automáticamente y exporta a HomeKit con <strong>passthrough H.264</strong> y <strong>audio AAC-ELD</strong>.
                    </p>

                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      <p style={{ fontWeight: 600, color: "#f1f5f9", marginBottom: 6 }}>Pasos de configuración:</p>
                      <ol style={{ paddingLeft: 18, margin: 0, lineHeight: 1.9 }}>
                        <li>
                          <a href="https://console.cloud.google.com/apis/library/smartdevicemanagement.googleapis.com" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                            Google Cloud Console
                          </a>{" "}→ Habilitar <strong>Smart Device Management API</strong>
                        </li>
                        <li>
                          APIs & Services → Credentials → Create OAuth 2.0 Client ID → Guardar <code>client_id</code> y <code>client_secret</code>
                        </li>
                        <li>
                          <a href="https://console.nest.google.com/device-access/project-list" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                            Google Device Access Console
                          </a>{" "}→ Create project (<strong>pago único \$5</strong>) → Guardar <code>project_id</code>
                        </li>
                        <li>
                          Completar OAuth flow para obtener <code>refresh_token</code>{" "}
                          <a href="https://developers.google.com/nest/device-access/authorize" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>
                            (guía oficial)
                          </a>
                        </li>
                        <li>
                          Obtener <code>device_id</code>: <code>GET /v1/enterprises/&#123;project_id&#125;/devices</code>{" "}
                          con tu access token
                        </li>
                        <li>
                          En HA → Settings → go2rtc → agregar stream:
                          <pre style={{
                            background: "#0f172a",
                            borderRadius: 6,
                            padding: "8px 10px",
                            fontSize: "0.75rem",
                            color: "#a5f3fc",
                            marginTop: 6,
                            overflowX: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}>
{`streams:
  ${cameraName.toLowerCase().replace(/\s+/g, "_")}:
    - nest:?client_id=TU_ID&client_secret=TU_SECRET
        &project_id=TU_PROJECT&refresh_token=TU_TOKEN
        &device_id=TU_DEVICE_ID`}
                          </pre>
                        </li>
                        <li>Reiniciar HA → Nuestro addon detecta el stream automáticamente al iniciar</li>
                      </ol>
                    </div>

                    <div style={{ marginTop: 14, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      💡 <strong>Tip:</strong> go2rtc gestiona la re-autenticación automáticamente. No es necesario renovar el token manualmente.
                      El stream aparecerá como <code>rtsp://127.0.0.1:8554/{cameraName.toLowerCase().replace(/\s+/g, "_")}</code>{" "}
                      y será detectado en el próximo inicio del addon.
                    </div>
                  </>
                ) : (
                  <div style={{
                    background: "rgba(16,185,129,0.1)",
                    border: "1px solid rgba(16,185,129,0.4)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: "0.82rem",
                    color: "#6ee7b7",
                  }}>
                    ✅ <strong>go2rtc detectado:</strong> El addon está recibiendo el stream RTSP local de esta cámara Nest.
                    Live view y audio AAC-ELD están disponibles en HomeKit.
                  </div>
                )}
              </div>
            ) : activeTab === "ai" ? (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: "0.95rem", color: "#38bdf8" }}>
                    🧠 Detección IA Local
                  </h4>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.85rem" }}>
                    <input
                      type="checkbox"
                      checked={aiConfig.enabled}
                      onChange={(e) => setAiConfig({ ...aiConfig, enabled: e.target.checked })}
                    />
                    <span>{aiConfig.enabled ? "Activa" : "Inactiva"}</span>
                  </label>
                </div>

                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 14 }}>
                  Integración y enrutamiento en tiempo real de detecciones OpenCV (vehículos, personas y fauna) desde Camera.UI y Home Assistant hacia Apple HomeKit.
                </p>

                {activeAiDetection && (
                  <div style={{ background: "rgba(56, 189, 248, 0.15)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: 8, padding: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#38bdf8" }}>
                      🚨 Detección Activa
                    </div>
                    <div style={{ fontSize: "0.8rem", marginTop: 4 }}>
                      {activeAiDetection.labels?.join(", ")} ({(activeAiDetection.confidence * 100).toFixed(0)}%)
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Objetivos de Detección:
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { id: "person", label: "👤 Persona" },
                      { id: "vehicle", label: "🚗 Vehículo" },
                      { id: "dog", label: "🐶 Perro" },
                      { id: "cat", label: "🐱 Gato" },
                      { id: "bird", label: "🦜 Ave" },
                      { id: "raccoon", label: "🦝 Mapache" },
                      { id: "snake", label: "🐍 Serpiente" },
                      { id: "spider", label: "🕷️ Araña" },
                    ].map((t) => {
                      const isChecked = aiConfig.targets.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            borderRadius: 6,
                            background: isChecked ? "rgba(56, 189, 248, 0.1)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${isChecked ? "rgba(56, 189, 248, 0.3)" : "rgba(255,255,255,0.08)"}`,
                            cursor: "pointer",
                            fontSize: "0.85rem",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const newTargets = e.target.checked
                                ? [...aiConfig.targets, t.id]
                                : aiConfig.targets.filter((x) => x !== t.id);
                              setAiConfig({ ...aiConfig, targets: newTargets });
                            }}
                          />
                          <span>{t.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 4 }}>
                    <span>Sensibilidad:</span>
                    <span style={{ fontWeight: 600, color: "#38bdf8" }}>{aiConfig.sensitivity}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={95}
                    value={aiConfig.sensitivity}
                    onChange={(e) => setAiConfig({ ...aiConfig, sensitivity: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
                    <input
                      type="checkbox"
                      checked={aiConfig.publishMqtt}
                      onChange={(e) => setAiConfig({ ...aiConfig, publishMqtt: e.target.checked })}
                    />
                    <span>📡 Publicar eventos en broker MQTT</span>
                  </label>
                  {aiConfig.publishMqtt && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4, paddingLeft: 24 }}>
                      Tópico: <code>{aiConfig.mqttTopic || `matter-all-in-one/ai/${cameraId.replace(/[^a-zA-Z0-9_]/g, "_")}/detection`}</code>
                    </div>
                  )}
                </div>

                <button
                  className="button button-primary"
                  type="button"
                  style={{ width: "100%", marginTop: 8 }}
                  onClick={handleSaveAiConfig}
                  disabled={isSavingAi}
                >
                  {isSavingAi ? "Guardando..." : "💾 Guardar Configuración de IA"}
                </button>
              </div>
            ) : activeTab === "matter" ? (
              isMatterCommissioned && !multiAdminOpen ? (
                <div className="paired-success-glass-card" id="paired-camera-matter-card">
                  <div className="paired-apple-home-badge">
                    <AppleHomeModernIcon variant="mono" size={56} />
                  </div>
                  <h4 className="paired-card-title">¡Cámara activa en red Matter!</h4>
                  <p className="paired-card-desc">
                    Esta cámara está sincronizada en el puente Matter. El código inicial se oculta para proteger la sesión activa.
                  </p>
                  <div className="paired-multiadmin-box">
                    <p className="paired-multiadmin-subtext">
                      ¿Deseas agregarla a Google Home, Alexa o SmartThings?
                    </p>
                    <button
                      className="button button-primary button-open-multiadmin"
                      type="button"
                      onClick={handleOpenCommissioning}
                      disabled={isOpeningCommissioning}
                      id="cam-open-multiadmin-btn"
                    >
                      <span>{isOpeningCommissioning ? "Abriendo..." : "🌐 Abrir Modo Multi-Admin (15 min)"}</span>
                    </button>
                  </div>
                </div>
              ) : multiAdminOpen || freshMatterCode ? (
                <>
                  <div id="cam-multi-admin-hint" className="multi-admin-hint" style={{ display: "block", marginBottom: 10 }}>
                    <p className="hint-title">🌐 Modo Multi-Admin Abierto (15 min)</p>
                    <p className="hint-desc">
                      Ventana de emparejamiento abierta. Escanea este código QR en <strong>Google Home</strong>, <strong>Alexa</strong> o <strong>SmartThings</strong>.
                    </p>
                  </div>
                  <QRCodeDisplay
                    pairingCode={freshMatterCode || (!isCameraUi ? (camera as CameraRecord).identity?.matterPairingCode : "") || ""}
                    manualCode={freshMatterManualCode || freshMatterCode || (!isCameraUi ? (camera as CameraRecord).identity?.matterPairingCode : "")}
                    entityName={cameraName}
                    elementId="cam-matter-qr-code"
                    variant="multi-admin-glass"
                    noteText="Escanea con Google Home, Alexa o SmartThings (Matter 1.6)"
                  />
                </>
              ) : (!isCameraUi && (camera as CameraRecord).identity?.matterPairingCode) ? (
                <QRCodeDisplay
                  pairingCode={(camera as CameraRecord).identity!.matterPairingCode!}
                  manualCode={(camera as CameraRecord).identity!.matterPairingCode!}
                  entityName={cameraName}
                  elementId="cam-matter-qr-code"
                  variant="matter-badge"
                  noteText="Escanea para agregar por Matter 1.6 a Apple Home o Google Home"
                />
              ) : (
                <div className="paired-success-glass-card" style={{ textAlign: "center", padding: "20px 16px" }}>
                  <div style={{ fontSize: "2.2rem", marginBottom: 8 }}>⚡</div>
                  <h4 className="paired-card-title" style={{ fontSize: "1rem" }}>Vincular Cámara con Matter 1.6</h4>
                  <p className="paired-card-desc" style={{ fontSize: "0.82rem", marginBottom: 14 }}>
                    Genera el código de emparejamiento dinámico para agregar esta cámara a Google Home, Alexa o Apple Home.
                  </p>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={handleOpenCommissioning}
                    disabled={isOpeningCommissioning}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    <span>{isOpeningCommissioning ? "Generando código..." : "⚡ Generar Código de Emparejamiento"}</span>
                  </button>
                </div>
              )
            ) : isPaired ? (
              <div className="paired-success-glass-card" id="paired-camera-card">
                <div className="paired-apple-home-badge">
                  <AppleHomeModernIcon variant="color" size={56} />
                </div>
                <h4 className="paired-card-title">¡Cámara vinculada en Apple Home!</h4>
                <p className="paired-card-desc">
                  Esta cámara ya está configurada en Apple Home para Live View HAP. El código QR se oculta para proteger la sesión activa.
                </p>
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 14px",
                    background: "rgba(59, 130, 246, 0.12)",
                    borderRadius: 8,
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    fontSize: "0.82rem",
                    textAlign: "left",
                  }}
                >
                  <strong style={{ color: "#93c5fd" }}>💡 IMPORTANTE PARA GRABAR EN ICLOUD (HKSV):</strong>
                  <div style={{ marginTop: 6, color: "#bfdbfe", lineHeight: 1.4 }}>
                    Apple Home desactiva la grabación por defecto. En tu iPhone/iPad:
                    <ol style={{ margin: "4px 0 0 16px", padding: 0 }}>
                      <li>Abre la app <strong>Casa</strong> y toca esta cámara.</li>
                      <li>Toca ⚙️ <strong>Ajustes de la cámara</strong> → <strong>Opciones de grabación</strong>.</li>
                      <li>Selecciona <strong>«Transmitir y permitir la grabación»</strong> (tanto En casa como Fuera de casa).</li>
                    </ol>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <QRCodeDisplay
                  pairingCode={pairingPayload}
                  manualCode={pinCode}
                  pinCode={activeTab === "homekit" ? pinCode : undefined}
                  variant={activeTab === "homekit" ? "hap-homekit" : "matter-badge"}
                  entityName={cameraName}
                  elementId="cam-modal-qr-code"
                  noteText="Escanea con la app Casa de Apple para Live View HAP"
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
                  <strong style={{ color: "#fcd34d" }}>📲 Cómo vincular en Apple Casa:</strong>
                  <ol style={{ margin: "4px 0 0 16px", padding: 0, color: "#fef08a" }}>
                    <li>Abre la app <strong>Casa</strong> en tu iPhone o iPad.</li>
                    <li>Toca <strong>+</strong> → <strong>Agregar accesorio</strong> y escanea el código QR.</li>
                    <li>O toca <em>«Más opciones...»</em>, elige <strong>{cameraName}</strong> e introduce el PIN: <strong>{pinCode}</strong>.</li>
                  </ol>
                </div>
              </>
            )}

            <div className="qr-actions" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {activeTab === "homekit" && (
                <button
                  className="button button-danger-outline button-sm"
                  type="button"
                  onClick={handleResetPairing}
                  disabled={isResetting}
                >
                  {isResetting ? "Restableciendo..." : "🔄 Restablecer emparejamiento"}
                </button>
              )}
              {activeTab === "matter" && isMatterCommissioned && (
                <button
                  className="button button-secondary button-sm"
                  type="button"
                  onClick={handleOpenCommissioning}
                  disabled={isOpeningCommissioning}
                >
                  {isOpeningCommissioning ? "Abriendo..." : "🌐 Reabrir Multi-Admin (15 min)"}
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Specs, Stream config & Sensors */}
          <div className="selection-panel">
            {/* Model & Hardware Identification Box */}
            <div
              style={{
                marginBottom: 12,
                padding: "8px 12px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 8,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 260 }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--dim)", textTransform: "uppercase" }}>
                  MODELO DE CÁMARA:
                </span>
                <input
                  type="text"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  placeholder="ej. Tapo C402, Tapo C120, Wyze Cam Pan v2"
                  style={{
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "3px 8px",
                    color: "var(--text)",
                    fontSize: "0.82rem",
                    flex: 1,
                  }}
                />
                <button
                  className="button button-sm button-secondary"
                  type="button"
                  onClick={() => handleSaveModel()}
                  disabled={isSavingModel}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {isSavingModel ? "..." : "Guardar"}
                </button>
              </div>
            </div>

            {/* Technical Specs - Probed Real Values Only */}
            <div className="camera-modal-specs-box">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--dim)", textTransform: "uppercase" }}>
                  ESPECIFICACIONES TÉCNICAS REALES
                </span>
                <span
                  style={{
                    fontSize: "0.72rem",
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: isVerifying
                      ? "rgba(59, 130, 246, 0.15)"
                      : isProbedVerified || streamVerified
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(239, 68, 68, 0.15)",
                    color: isVerifying
                      ? "#93c5fd"
                      : isProbedVerified || streamVerified
                        ? "#6ee7b7"
                        : "#fca5a5",
                    border: `1px solid ${
                      isVerifying
                        ? "rgba(59, 130, 246, 0.3)"
                        : isProbedVerified || streamVerified
                          ? "rgba(52, 211, 153, 0.3)"
                          : "rgba(239, 68, 68, 0.3)"
                    }`,
                  }}
                >
                  {isVerifying
                    ? "🔄 Verificando stream..."
                    : isProbedVerified || streamVerified
                      ? "🟢 Stream verificado"
                      : "🔴 Stream sin verificar"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: "0.8rem" }}>
                <div><strong>📹 Video:</strong> {videoCodec !== "—" ? videoCodec : "H.264 (Nativo)"} · {resDisplay !== "—" ? resDisplay : "Pendiente de detección"} {fpsDisplay !== "—" ? `@ ${fpsDisplay}` : ""}</div>
                <div><strong>🔊 Audio:</strong> {audioDisplay !== "—" ? audioDisplay : "Passthrough"}</div>
                <div><strong>⚡ Latencia:</strong> &lt;200ms (LAN Ultra Baja)</div>
                <div><strong>🍏 HAP:</strong> Passthrough Puro H.264 (0% CPU / Sin transcode)</div>
              </div>
            </div>

            {/* RTSP Stream config */}
            <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: 14, marginTop: 12 }}>
              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                URL DIRECTA DEL STREAM RTSP (H.264)
              </span>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="rtsp://192.168.1.50:8554/cam1"
                  value={rtspUrl}
                  onChange={(e) => setRtspUrl(e.target.value)}
                  style={{
                    flex: 1,
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    color: "var(--text)",
                    fontSize: "0.85rem",
                  }}
                />
                <button className="button button-sm button-secondary" type="button" onClick={handleSaveStream}>
                  💾 Guardar
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  className="button button-sm button-secondary"
                  type="button"
                  onClick={handleVerifyStream}
                  disabled={isVerifying}
                >
                  {isVerifying ? "Verificando..." : "🔍 Verificar Stream"}
                </button>
                <button
                  className="button button-sm button-secondary"
                  type="button"
                  onClick={handleDiagnoseStream}
                  disabled={isDiagnosing}
                >
                  {isDiagnosing ? "Diagnosticando..." : "⚡ Diagnosticar Stream"}
                </button>

                <select
                  value={transport}
                  onChange={(e) => setTransport(e.target.value as "tcp" | "udp")}
                  style={{
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    color: "var(--text)",
                    fontSize: "0.78rem",
                  }}
                >
                  <option value="tcp">TCP (Recomendado)</option>
                  <option value="udp">UDP</option>
                </select>
              </div>

              {streamResult && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 6,
                    fontSize: "0.8rem",
                    background: streamResult.isError ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
                    color: streamResult.isError ? "#fca5a5" : "#6ee7b7",
                    border: streamResult.isError ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(52, 211, 153, 0.3)",
                  }}
                >
                  {streamResult.text}
                </div>
              )}

              {/* Stream Live Preview Box */}
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  background: "rgba(0, 0, 0, 0.45)",
                  borderRadius: 8,
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      color: "#38bdf8",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    📺 Vista Previa del Stream (Snapshot / Live)
                  </span>
                  <button
                    className="button button-sm button-secondary"
                    type="button"
                    onClick={handleRefreshSnapshot}
                    disabled={isLoadingSnapshot}
                    style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                  >
                    {isLoadingSnapshot ? "Cargando..." : "🔄 Actualizar Frame"}
                  </button>
                </div>

                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "16/9",
                    background: "#080808",
                    borderRadius: 6,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                  }}
                >
                  {snapshotUrl ? (
                    <img
                      src={snapshotUrl}
                      alt="Vista previa de la cámara"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: snapshotLoaded ? "block" : "none",
                      }}
                      onLoad={() => setSnapshotLoaded(true)}
                      onError={() => setSnapshotLoaded(false)}
                    />
                  ) : null}

                  {!snapshotLoaded && (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.8rem",
                        textAlign: "center",
                        padding: 16,
                      }}
                    >
                      {isLoadingSnapshot
                        ? "🔄 Capturando frame de la cámara en vivo..."
                        : "ℹ️ Pulsa 'Verificar Stream' o 'Actualizar Frame' para cargar la vista previa."}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 8,
                    fontSize: "0.72rem",
                    color: "var(--text-muted)",
                  }}
                >
                  <span>
                    ⚡ Códec: <strong style={{ color: "#f8fafc" }}>{videoCodec}</strong> · Res:{" "}
                    <strong style={{ color: "#f8fafc" }}>{resDisplay}</strong>
                  </span>
                  <span style={{ color: "#34d399", fontWeight: 600 }}>
                    {videoCodec.includes("HEVC") || videoCodec.includes("265")
                      ? "🚀 Passthrough Puro HEVC (Zero Transcode)"
                      : "🚀 Passthrough Puro H.264"}
                  </span>
                </div>
              </div>
            </div>

            {/* Hardware & Real Entities Section */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--dim)", textTransform: "uppercase" }}>
                  FUNCIONES Y ENTIDADES REALES ({realEntities.length} DETECTADAS)
                </span>
                <span style={{ fontSize: "0.72rem", color: "#6ee7b7", fontWeight: 600 }}>
                  🍏 Live View HAP + Controles Interactivos
                </span>
              </div>

              {realEntities.length === 0 ? (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    fontSize: "0.8rem",
                    color: "var(--dim)",
                    textAlign: "center",
                  }}
                >
                  No se detectaron reflectores de luz ni sirenas físicas integradas para esta cámara.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {realEntities.map((ent) => {
                    const isControlling = controllingEntityId === ent.id;
                    const isMatterDrawerOpen = activeMatterEntityId === ent.id;
                    const isGenerating = Boolean(isGeneratingEntityMatter[ent.id]);
                    const matterInfo =
                      entityMatterCodes[ent.id] ||
                      (ent.matterPairingCode
                        ? { pairingCode: ent.matterPairingCode, manualCode: ent.matterManualCode }
                        : null);

                    const icon =
                      ent.type === "light"
                        ? "💡"
                        : ent.type === "siren"
                        ? "🚨"
                        : ent.type === "doorbell"
                        ? "🔔"
                        : "🏃";

                    const desc =
                      ent.type === "light"
                        ? "Reflector / Foco físico integrado. Control directo y exportable a Matter."
                        : ent.type === "siren"
                        ? "Sirena de alarma integrada. Activación disuasoria en tiempo real."
                        : ent.type === "doorbell"
                        ? "Pulsador de timbre con notificación acústica y visual."
                        : "Sensor de presencia y movimiento con detección instantánea.";

                    const stateLabel =
                      ent.type === "light"
                        ? ent.state
                          ? "🟢 Encendida"
                          : "⚪ Apagada"
                        : ent.type === "siren"
                        ? ent.state
                          ? "🚨 Activada"
                          : "⚪ Silenciada"
                        : ent.type === "doorbell"
                        ? ent.state
                          ? "🔔 Activo"
                          : "⚪ En reposo"
                        : ent.state
                        ? "🟢 Movimiento"
                        : "⚪ En reposo";

                    return (
                      <div
                        key={ent.id}
                        style={{
                          background: "rgba(255, 255, 255, 0.025)",
                          border: "1px solid rgba(255, 255, 255, 0.07)",
                          borderRadius: 8,
                          padding: "10px 12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: "1.4rem" }}>{icon}</span>
                            <div>
                              <div
                                style={{
                                  fontSize: "0.86rem",
                                  fontWeight: 600,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span>{ent.name}</span>
                                {ent.topic && (
                                  <span
                                    style={{
                                      fontSize: "0.68rem",
                                      color: "#a78bfa",
                                      background: "rgba(139, 92, 246, 0.15)",
                                      padding: "1px 6px",
                                      borderRadius: 4,
                                    }}
                                  >
                                    MQTT: {ent.topic}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                                {desc} · <code style={{ fontSize: "0.7rem", color: "var(--dim)" }}>{ent.id}</code>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              className="tag"
                              style={{
                                fontSize: "0.7rem",
                                whiteSpace: "nowrap",
                                background: ent.state ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.05)",
                                color: ent.state ? "#6ee7b7" : "var(--dim)",
                                border: ent.state
                                  ? "1px solid rgba(52, 211, 153, 0.3)"
                                  : "1px solid rgba(255,255,255,0.08)",
                              }}
                            >
                              {stateLabel}
                            </span>

                            {/* Real Interactive Control Button for Light and Siren */}
                            {(ent.type === "light" || ent.type === "siren" || ent.type === "switch") && (
                              <button
                                className={`button button-sm ${ent.state ? "button-danger" : "button-primary"}`}
                                type="button"
                                onClick={() => handleToggleEntity(ent)}
                                disabled={isControlling}
                                style={{ fontSize: "0.76rem", padding: "4px 10px" }}
                              >
                                {isControlling
                                  ? "..."
                                  : ent.type === "light"
                                  ? ent.state
                                    ? "💡 Apagar Luz"
                                    : "💡 Encender Luz"
                                  : ent.type === "siren"
                                  ? ent.state
                                    ? "🚨 Silenciar"
                                    : "🚨 Activar Sirena"
                                  : ent.state
                                  ? "Apagar"
                                  : "Encender"}
                              </button>
                            )}

                            {/* Separate Matter QR Code Button */}
                            <button
                              className={`button button-sm ${isMatterDrawerOpen ? "button-primary" : "button-secondary"}`}
                              type="button"
                              onClick={() => handleOpenEntityMatter(ent)}
                              disabled={isGenerating}
                              style={{ fontSize: "0.76rem", padding: "4px 10px" }}
                              title="Ver código QR Matter independiente para vincular esta entidad"
                            >
                              {isGenerating ? "Generando..." : "⚡ QR Matter (Separado)"}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Matter Drawer for this Entity */}
                        {isMatterDrawerOpen && (
                          <div
                            style={{
                              marginTop: 6,
                              padding: "12px",
                              background: "rgba(0, 0, 0, 0.35)",
                              borderRadius: 8,
                              border: "1px solid rgba(139, 92, 246, 0.3)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 8,
                              }}
                            >
                              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#c084fc" }}>
                                ⚡ VINCULACIÓN MATTER 1.6 · {ent.name.toUpperCase()}
                              </span>
                              <span style={{ fontSize: "0.7rem", color: "var(--dim)" }}>
                                QR INDEPENDIENTE DE CÁMARA
                              </span>
                            </div>

                            {matterInfo?.pairingCode ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                                <QRCodeDisplay
                                  pairingCode={matterInfo.pairingCode}
                                  manualCode={matterInfo.manualCode || matterInfo.pairingCode}
                                  entityName={ent.name}
                                  elementId={`matter-qr-entity-${ent.id.replace(/[^a-zA-Z0-9]/g, "_")}`}
                                  variant="matter-badge"
                                  noteText="Escanea para agregar en Apple Home, Google Home o Alexa (Matter 1.6)"
                                />
                                <button
                                  className="button button-sm button-secondary"
                                  type="button"
                                  onClick={() => handleReopenEntityCommissioning(ent)}
                                  disabled={isGenerating}
                                  style={{ fontSize: "0.74rem" }}
                                >
                                  {isGenerating ? "Abriendo..." : "🌐 Reabrir Multi-Admin (15 min)"}
                                </button>
                              </div>
                            ) : (
                              <div style={{ textAlign: "center", padding: "8px 0" }}>
                                <p style={{ fontSize: "0.8rem", color: "var(--dim)", marginBottom: 8 }}>
                                  Esta entidad aún no está publicada individualmente en el bus Matter.
                                </p>
                                <button
                                  className="button button-primary button-sm"
                                  type="button"
                                  onClick={() => handleOpenEntityMatter(ent)}
                                  disabled={isGenerating}
                                  style={{ fontSize: "0.78rem" }}
                                >
                                  {isGenerating ? "Publicando..." : "⚡ Publicar en Matter y Generar QR"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Camera Diagnostics Panel */}
            <div className="diagnostics-panel" style={{ marginTop: 14, userSelect: "text" }}>
              <div className="diagnostics-heading">
                <span aria-hidden="true">✓</span>
                <strong>Diagnóstico y estado de la cámara</strong>
                <button
                  className="copy-diagnostics-button"
                  type="button"
                  onClick={handleCopyCameraDiagnostics}
                  title="Copiar diagnóstico de cámara"
                >
                  📋 Copiar diagnóstico
                </button>
              </div>
              <p style={{ margin: "6px 0 4px", fontSize: "0.78rem", color: "var(--dim)" }}>
                {isOnline ? "Cámara en línea y operativa para Live View HAP." : "Cámara no responde o desconectada."}
              </p>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <button
                className="button button-danger"
                type="button"
                onClick={handleDeleteCamera}
                disabled={isDeleting}
              >
                🗑️ Eliminar de la exportación
              </button>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="button button-secondary" type="button" onClick={onClose}>
                  Cancelar
                </button>
                <button className="button button-primary" type="button" onClick={handleSaveExport}>
                  💾 Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
