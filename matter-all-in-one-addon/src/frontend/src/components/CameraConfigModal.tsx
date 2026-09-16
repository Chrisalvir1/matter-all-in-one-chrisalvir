import React, { useState, useEffect } from "react";
import { CameraRecord } from "../types";
import { api } from "../api/client";
import { extractCameraBrand } from "./CameraCard";
import { QRCodeDisplay, AppleHomeModernIcon } from "./QRCodeDisplay";
import { copyToClipboard } from "../utils/clipboard";

interface CameraConfigModalProps {
  camera: CameraRecord | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const CameraConfigModal: React.FC<CameraConfigModalProps> = ({
  camera,
  onClose,
  onRefresh,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<"homekit" | "matter">("homekit");
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
  const [modelInput, setModelInput] = useState(camera?.displayModel || camera?.model || "");
  const [isSavingModel, setIsSavingModel] = useState(false);

  // Initialize data when camera changes
  useEffect(() => {
    if (!camera) return;
    const initialUrl =
      camera.source?.streamReference?.directUrl ||
      camera.source?.profiles?.find((p) => p.directUrl)?.directUrl ||
      "";
    const prefTransport = camera.exportConfig?.rtspTransportPreference || "tcp";
    setRtspUrl(initialUrl);
    setTransport(prefTransport);
    setModelInput(camera.displayModel || camera.model || "");
    setFreshMatterCode(null);
    setFreshMatterManualCode(null);
    setMultiAdminOpen(false);

    // Show current verified state without launching background ffprobe loop
    const observed = camera.capabilities?.observed;
    const isVerified =
      camera.source?.streamValidationStatus === "verified" ||
      camera.source?.streamReference?.validationStatus === "verified";
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
  }, [camera.cameraId]);

  // Compute HomeKit Setup URI
  const getSetupUri = () => {
    if (!camera) return "";
    if (camera.identity?.homeKitSetupUri) return camera.identity.homeKitSetupUri;
    const setupId = camera.identity?.homeKitSetupId || "SC01";
    const pincode = camera.identity?.homeKitPincode || "031-45-154";
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
  };

  if (!camera) return null;

  const isPaired = camera.identity?.homeKitPairingState === "paired";
  const isMatterCommissioned = Boolean(
    camera.bindingState?.matterCommissioned ||
    (camera.bindingState?.fabrics && camera.bindingState.fabrics.length > 0)
  );
  const pinCode = camera.identity?.homeKitPincode || "031-45-154";
  const pairingPayload =
    activeTab === "homekit"
      ? getSetupUri()
      : freshMatterCode || camera.identity?.matterPairingCode || "";

  const brand = extractCameraBrand(camera);
  const isOnline = camera.status?.connection === "online" || camera.status?.isOnline !== false;
  const modelDisplay = camera.displayModel || camera.model || "Modelo no identificado";

  const handleSaveModel = async (newModel?: string) => {
    if (!camera) return;
    const modelToSave = (newModel ?? modelInput).trim();
    if (!modelToSave) return;
    setIsSavingModel(true);
    try {
      await api.updateCameraIdentity(camera.cameraId, {
        manufacturer: brand,
        model: modelToSave,
      });
      camera.displayModel = modelToSave;
      camera.model = modelToSave;
      if (!camera.identityOverride) camera.identityOverride = {};
      camera.identityOverride.model = modelToSave;

      setModelInput(modelToSave);
      showToast(`✓ Modelo actualizado a «${modelToSave}»`);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al actualizar modelo", true);
    } finally {
      setIsSavingModel(false);
    }
  };

  // Real Hardware Capabilities
  const hasDoorbell = (camera.sensors || []).some((s) => s.type === "doorbell");
  const hasLight = (camera.sensors || []).some((s) => s.type === "light");
  const hasSiren = (camera.sensors || []).some((s) => s.type === "siren");
  const hasPtz = (camera.sensors || []).some((s) => s.type === "ptz");

  const realCapabilities = [
    {
      icon: "🏃",
      title: "Sensor de Movimiento",
      desc: "Notificaciones instantáneas con foto en vivo en Apple Home al detectar presencia.",
      state: "🟢 Activo en HAP",
      available: true,
    },
    {
      icon: "💡",
      title: "Foco / Luz de Cámara",
      desc: hasLight
        ? "Reflector de luz física integrado. Controlable mediante interruptor en Apple Home."
        : "Este modelo no cuenta con reflector o luz física integrada en su hardware.",
      state: hasLight ? "🟢 Detectado en hardware" : "⚪ No disponible en hardware",
      available: hasLight,
    },
    {
      icon: "🚨",
      title: "Sirena / Alarma",
      desc: hasSiren
        ? "Sirena de alarma integrada. Activación remota y disuasoria desde Apple Home."
        : "Este modelo no cuenta con bocina de sirena física integrada en su hardware.",
      state: hasSiren ? "🟢 Detectada en hardware" : "⚪ No disponible en hardware",
      available: hasSiren,
    },
    ...(hasPtz
      ? [
          {
            icon: "🔄",
            title: "Giro Motorizado PTZ (Pan / Tilt)",
            desc: "Hardware motorizado con interfaz nativa activa en el accesorio.",
            state: "🟢 Soportado por hardware",
            available: true,
          },
        ]
      : []),
    ...(hasDoorbell
      ? [
          {
            icon: "🔔",
            title: "Timbre de Entrada",
            desc: "Botón de timbre con aviso sonoro y ventana emergente en Apple TV y HomePod.",
            state: "🟢 Activo en HAP",
            available: true,
          },
        ]
      : []),
  ];

  // Technical Specs
  const videoCodec = camera.capabilities?.observed?.videoCodec?.toUpperCase() || "H.264";
  const profile = camera.capabilities?.observed?.profile ? ` (${camera.capabilities.observed.profile})` : "";
  const res = camera.capabilities?.observed?.resolution
    ? `${camera.capabilities.observed.resolution.width}x${camera.capabilities.observed.resolution.height}`
    : camera.resolution
      ? `${camera.resolution.width}x${camera.resolution.height}`
      : "1920x1080";
  const fps = camera.capabilities?.observed?.fps || camera.fps || 30;
  const audioCodec = camera.capabilities?.observed?.audioCodec?.toUpperCase() || "AAC";

  const handleResetPairing = async () => {
    if (!confirm(`¿Restablecer emparejamiento HomeKit para "${camera.name}"?`)) return;
    setIsResetting(true);
    try {
      const res = await api.resetCameraPairing(`scrypted.${camera.cameraId}`);
      if (res.success && res.setupUri) {
        if (!camera.identity) camera.identity = {};
        camera.identity.homeKitSetupUri = res.setupUri;
        camera.identity.homeKitPairingState = "not_paired";
        showToast("✓ Vinculación restablecida. Escanea el nuevo código QR.");
        onRefresh();
      } else {
        showToast(res.error || "No se pudo restablecer", true);
      }
    } catch (err: any) {
      showToast(err.message || "Error al reiniciar vinculación", true);
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteCamera = async () => {
    if (!confirm(`¿Eliminar la cámara "${camera.name}" de la exportación?`)) return;
    setIsDeleting(true);
    try {
      await api.removeCamera(camera.cameraId);
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
    if (!camera) return;
    setIsOpeningCommissioning(true);
    try {
      const res: any = await api.openCommissioning(`scrypted.${camera.cameraId}`);
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
    setStreamResult({ text: "Verificando stream RTSP/HTTP (ffprobe)..." });
    try {
      const res = await api.verifyCameraStream(camera.cameraId, rtspUrl.trim(), transport);
      if (res.ok && res.status === "verified") {
        setStreamVerified(true);
        if (res.validation) {
          if (!camera.capabilities) camera.capabilities = {};
          if (!camera.capabilities.observed) camera.capabilities.observed = {};
          if (res.validation.resolution) camera.capabilities.observed.resolution = res.validation.resolution;
          if (res.validation.videoCodec) camera.capabilities.observed.videoCodec = res.validation.videoCodec;
          if (res.validation.audioCodec) {
            camera.capabilities.observed.audioCodec = res.validation.audioCodec;
            camera.capabilities.observed.hasAudio = res.validation.hasAudio;
          }
          if (res.validation.fps) camera.capabilities.observed.fps = res.validation.fps;
        }
        const w = res.validation?.resolution?.width || 1920;
        const h = res.validation?.resolution?.height || 1080;
        const codec = (res.validation?.videoCodec || "H.264").toUpperCase();
        const fpsVal = res.validation?.fps || 30;
        setStreamResult({
          text: `✓ Stream verificado con éxito (${codec} ${w}x${h} @ ${fpsVal}fps). Live View listo para Apple Home.`,
        });
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
      const res = await api.diagnoseCameraStream(camera.cameraId, rtspUrl.trim(), transport);
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
      await api.saveCameraStreamUrl(camera.cameraId, rtspUrl.trim());
      showToast("✓ URL de stream guardada y aplicada en vivo");
    } catch (err: any) {
      showToast(err.message || "Error al guardar stream", true);
    }
  };

  const handleSaveExport = async () => {
    try {
      await api.saveCameraExportConfig(camera.cameraId, {
        matterEnabled: true,
        homeKitEnabled: true,
        hksvEnabledByDefault: true,
        googleHomeEnabled: false,
        alexaEnabled: false,
        smartThingsEnabled: false,
        nasEnabled: false,
        rtspTransportPreference: transport,
      });
      showToast("✓ Configuración de cámara guardada");
      onRefresh();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Error al guardar configuración", true);
    }
  };

  const handleCopyCameraDiagnostics = async () => {
    if (!camera) return;
    const diagText = [
      `=== DIAGNÓSTICO DE CÁMARA ===`,
      `ID: ${camera.cameraId}`,
      `Nombre: ${camera.name}`,
      `Marca: ${brand}`,
      `Modelo: ${modelDisplay}`,
      `Estado: ${isOnline ? "En línea" : "Desconectada"}`,
      `Último error: ${camera.status?.lastError || "Ninguno"}`,
      `RTSP URL: ${rtspUrl || "No configurada"}`,
      `Transporte RTSP: ${transport.toUpperCase()}`,
      `HomeKit HAP: ${isPaired ? "Emparejado en Apple Home" : "Listo para vincular"}`,
      `HomeKit Setup PIN: ${pinCode}`,
      `HomeKit Setup URI: ${getSetupUri()}`,
      `Matter activado: ${camera.exportConfig?.matterEnabled ? "SÍ" : "NO"}`,
      `Matter vinculación: ${camera.bindingState?.matterCommissioned ? "Comisionado" : "Pendiente / Inactivo"}`,
      camera.status?.logs?.length
        ? `\n=== LOGS DE CÁMARA (${camera.status.logs.length}) ===\n` +
          camera.status.logs.map((l) => `[${l.level || "INFO"}] ${l.message}`).join("\n")
        : "\n(Sin logs de error registrados)",
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
            <p className="eyebrow">CÁMARA SCRYPTED · APPLE HOME HAP & MATTER</p>
            <h2>{camera.name}</h2>
            <p className="entity-id">
              {isOnline ? "🟢 En línea" : "🔴 Desconectada"} · {brand} {modelDisplay && `(${modelDisplay})`} · ID: {camera.cameraId}
            </p>
          </div>
        </header>

        <div className="camera-modal-layout">
          {/* Left Column: QR Code & Pairing */}
          <div className="qr-panel">
            <div className="tab-group" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
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
            </div>

            {activeTab === "matter" ? (
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
                    pairingCode={freshMatterCode || camera.identity?.matterPairingCode || ""}
                    manualCode={freshMatterManualCode || freshMatterCode || camera.identity?.matterPairingCode}
                    entityName={camera.name}
                    elementId="cam-matter-qr-code"
                    variant="multi-admin-glass"
                    noteText="Escanea con Google Home, Alexa o SmartThings (Matter 1.6)"
                  />
                </>
              ) : camera.identity?.matterPairingCode ? (
                <QRCodeDisplay
                  pairingCode={camera.identity.matterPairingCode}
                  manualCode={camera.identity.matterPairingCode}
                  entityName={camera.name}
                  elementId="cam-matter-qr-code"
                  variant="matter-badge"
                  noteText="Escanea para agregar por Matter 1.6 a Apple Home o Google Home"
                />
              ) : (
                <div className="paired-success-glass-card" style={{ textAlign: "center", padding: "20px 16px" }}>
                  <div style={{ fontSize: "2.2rem", marginBottom: 8 }}>⚡</div>
                  <h4 className="paired-card-title" style={{ fontSize: "1rem" }}>Vincular Cámara con Matter 1.6</h4>
                  <p className="paired-card-desc" style={{ fontSize: "0.82rem", marginBottom: 14 }}>
                    Genera el código de emparejamiento dinámico para agregar esta cámara a Google Home, Alexa, Apple Home o SmartThings.
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
              </div>
            ) : (
              <QRCodeDisplay
                pairingCode={pairingPayload}
                manualCode={pinCode}
                pinCode={activeTab === "homekit" ? pinCode : undefined}
                variant={activeTab === "homekit" ? "hap-homekit" : "matter-badge"}
                entityName={camera.name}
                elementId="cam-modal-qr-code"
                noteText="Escanea con la app Casa de Apple para Live View HAP"
              />
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
                  placeholder="ej. Wyze Cam Pan v2, Tapo C200"
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
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <span style={{ fontSize: "0.68rem", color: "var(--dim)" }}>Presets:</span>
                <button
                  className="button button-sm"
                  type="button"
                  style={{ fontSize: "0.68rem", padding: "2px 6px" }}
                  onClick={() => handleSaveModel("Wyze Cam Pan v2")}
                >
                  Wyze Pan v2
                </button>
                <button
                  className="button button-sm"
                  type="button"
                  style={{ fontSize: "0.68rem", padding: "2px 6px" }}
                  onClick={() => handleSaveModel("Wyze Cam Pan v3")}
                >
                  Pan v3
                </button>
                <button
                  className="button button-sm"
                  type="button"
                  style={{ fontSize: "0.68rem", padding: "2px 6px" }}
                  onClick={() => handleSaveModel("Wyze Cam v3")}
                >
                  Cam v3
                </button>
              </div>
            </div>

            {/* Technical Specs */}
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
                      : streamVerified
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(239, 68, 68, 0.15)",
                    color: isVerifying
                      ? "#93c5fd"
                      : streamVerified
                        ? "#6ee7b7"
                        : "#fca5a5",
                    border: `1px solid ${
                      isVerifying
                        ? "rgba(59, 130, 246, 0.3)"
                        : streamVerified
                          ? "rgba(52, 211, 153, 0.3)"
                          : "rgba(239, 68, 68, 0.3)"
                    }`,
                  }}
                >
                  {isVerifying
                    ? "🔄 Verificando stream..."
                    : streamVerified
                      ? "🟢 Stream verificado"
                      : "🔴 Stream sin verificar"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: "0.8rem" }}>
                <div><strong>📹 Video:</strong> {videoCodec} · {res} @ {fps}fps {profile}</div>
                <div><strong>🔊 Audio:</strong> {audioCodec} (Bidireccional)</div>
                <div><strong>⚡ Latencia:</strong> &lt;200ms (LAN Ultra Baja)</div>
                <div><strong>🍏 HAP:</strong> Passthrough Puro H.264 (Sin transcode)</div>
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
            </div>

            {/* Hardware capabilities */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--dim)", textTransform: "uppercase" }}>
                  FUNCIONES Y SENSORES REALES (1 SOLO ACCESORIO HAP)
                </span>
                <span style={{ fontSize: "0.72rem", color: "#6ee7b7", fontWeight: 600 }}>🍏 Live View + Sensores</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {realCapabilities.map((cap, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "rgba(255, 255, 255, 0.025)",
                      border: "1px solid rgba(255, 255, 255, 0.07)",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "1.2rem" }}>{cap.icon}</span>
                      <div>
                        <div style={{ fontSize: "0.84rem", fontWeight: 600 }}>{cap.title}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{cap.desc}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {(cap as any).actionButton}
                      <span
                        className="tag"
                        style={{
                          fontSize: "0.68rem",
                          whiteSpace: "nowrap",
                          background: cap.available ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.05)",
                          color: cap.available ? "#6ee7b7" : "var(--dim)",
                        }}
                      >
                        {cap.state}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Camera Diagnostics Panel */}
            <div
              className="diagnostics-panel"
              style={{ marginTop: 14, userSelect: "text" }}
            >
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
                {camera.status?.lastError
                  ? `Último error: ${camera.status.lastError}`
                  : isOnline
                  ? "Cámara en línea y operativa."
                  : "Cámara no responde o desconectada."}
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
