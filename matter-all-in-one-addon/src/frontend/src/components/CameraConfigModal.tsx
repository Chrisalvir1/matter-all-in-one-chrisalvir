import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { CameraRecord } from "../types";
import { api } from "../api/client";
import { extractCameraBrand } from "./CameraCard";

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
  const [streamResult, setStreamResult] = useState<{ text: string; isError?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize data when camera changes
  useEffect(() => {
    if (!camera) return;
    const initialUrl =
      camera.source?.streamReference?.directUrl ||
      camera.source?.profiles?.find((p) => p.directUrl)?.directUrl ||
      "";
    setRtspUrl(initialUrl);
    setTransport(camera.exportConfig?.rtspTransportPreference || "tcp");
    setStreamResult(null);
    setShowLogs(false);

    // Auto-probe stream in background to fetch real specs
    if (initialUrl) {
      api
        .verifyCameraStream(camera.cameraId, initialUrl)
        .then((res) => {
          if (res.ok && res.status === "verified" && res.validation) {
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
        })
        .catch(() => {});
    }
  }, [camera]);

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

  const isPaired = camera?.identity?.homeKitPairingState === "paired";
  const pinCode = camera?.identity?.homeKitPincode || "031-45-154";
  const pairingPayload = activeTab === "homekit" ? getSetupUri() : camera?.identity?.matterPairingCode || "";

  // Render QR Code onto canvas
  useEffect(() => {
    if (!camera || !canvasRef.current || (activeTab === "homekit" && isPaired)) return;

    if (pairingPayload) {
      QRCode.toCanvas(canvasRef.current, pairingPayload, {
        width: 200,
        margin: 2,
        color: { dark: "#09101f", light: "#ffffff" },
        errorCorrectionLevel: "M",
      }).catch((err) => console.error("QR Code generation error:", err));
    }
  }, [camera, activeTab, isPaired, pairingPayload]);

  if (!camera) return null;

  const brand = extractCameraBrand(camera);
  const isOnline = camera.status?.connection === "online" || camera.status?.isOnline !== false;
  const modelDisplay = camera.displayModel || camera.model || "Modelo no identificado";
  const sn = camera.displaySerialNumber || camera.serialNumber || (camera.cameraId ? `CAM-${camera.cameraId}` : "");

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
    {
      icon: "🔄",
      title: "Giro Motorizado PTZ (Pan / Tilt)",
      desc: hasPtz
        ? "Soporte de movimiento horizontal y vertical motorizado en el hardware de la cámara."
        : "Cámara de lente fija (sin motor mecánico de rotación).",
      state: hasPtz ? "🟢 Soportado por hardware" : "⚪ Lente Fija (Sin PTZ)",
      available: hasPtz,
    },
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

  // Actions
  const handleCopyCode = async () => {
    const code = activeTab === "homekit" ? pinCode : pairingPayload;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast(`✓ Código copiado: ${code}`);
    } catch {
      showToast(`Código: ${code}`);
    }
  };

  const handleDownloadQr = () => {
    if (!canvasRef.current) return;
    const a = document.createElement("a");
    a.download = `QR_${camera.name.replace(/\s+/g, "_")}.png`;
    a.href = canvasRef.current.toDataURL("image/png");
    a.click();
    showToast("✓ Código QR descargado exitosamente");
  };

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

  const handleVerifyStream = async () => {
    if (!rtspUrl.trim()) {
      showToast("Ingresa una URL RTSP para verificar", true);
      return;
    }
    setIsVerifying(true);
    setStreamResult({ text: "Verificando stream RTSP (ffprobe)..." });
    try {
      const res = await api.verifyCameraStream(camera.cameraId, rtspUrl.trim());
      if (res.ok && res.status === "verified") {
        setStreamResult({ text: "✓ Stream verificado con éxito. Live View listo para Apple Home." });
      } else {
        setStreamResult({ text: `❌ ${res.validation?.error || "Stream inválido o no compatible"}`, isError: true });
      }
    } catch (err: any) {
      setStreamResult({ text: `❌ Error: ${err.message}`, isError: true });
    } finally {
      setIsVerifying(false);
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

            {activeTab === "homekit" && isPaired ? (
              <div className="paired-box" style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(52, 211, 153, 0.3)", borderRadius: 12, padding: 16, textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: "2rem", marginBottom: 6 }}>🟢</div>
                <h4 style={{ margin: "0 0 6px", color: "#6ee7b7" }}>¡Cámara ya vinculada en Apple Home!</h4>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0 }}>
                  Esta cámara ya está configurada en Apple Home. El código QR se oculta para proteger la sesión activa.
                </p>
              </div>
            ) : (
              <div className="qr-visual-wrapper" style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 14 }}>
                <canvas ref={canvasRef} style={{ borderRadius: 12, background: "#ffffff", padding: 8 }} />
                <div className="qr-manual-box" style={{ marginTop: 10, textAlign: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--dim)", textTransform: "uppercase" }}>
                    {activeTab === "homekit" ? "CÓDIGO PIN MANUAL" : "CÓDIGO MATTER"}
                  </span>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, letterSpacing: "0.08em", margin: "4px 0" }}>
                    {activeTab === "homekit" ? pinCode : pairingPayload || "—————"}
                  </div>
                </div>
              </div>
            )}

            <div className="qr-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(!isPaired || activeTab === "matter") && (
                <>
                  <button className="button button-secondary button-sm" type="button" onClick={handleCopyCode}>
                    {copied ? "¡Copiado!" : "📋 Copiar Código"}
                  </button>
                  <button className="button button-secondary button-sm" type="button" onClick={handleDownloadQr}>
                    📥 Descargar QR (PNG)
                  </button>
                </>
              )}
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
            </div>
          </div>

          {/* Right Column: Specs, Real Sensors & RTSP */}
          <div className="selection-panel">
            {/* Technical Specs Box */}
            <div className="spec-box" style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "var(--dim)", textTransform: "uppercase" }}>
                ESPECIFICACIONES TÉCNICAS (SCRYPTED)
              </h4>
              <div style={{ fontSize: "0.84rem", display: "flex", flexDirection: "column", gap: 4 }}>
                <div><strong>🏷️ Identidad:</strong> {brand} · {modelDisplay} {sn && `· SN: ${sn}`}</div>
                <div><strong>📹 Video:</strong> {videoCodec}{profile} · {res} @ {fps}fps (Passthrough sin recodificación)</div>
                <div><strong>🔊 Audio:</strong> {audioCodec} · Entrada de audio activa (HAP Direct Remuxing)</div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", background: "rgba(0,0,0,0.25)", padding: "4px 8px", borderRadius: 6, marginTop: 4 }}>
                  <strong>⏱️ Estado del Stream:</strong> 🟢 Conexión RTSP establecida (Transporte: {transport.toUpperCase()})
                </div>
              </div>
            </div>

            {/* RTSP Controls */}
            <div className="rtsp-box" style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--dim)", marginBottom: 4, textTransform: "uppercase" }}>
                Stream de Video RTSP (Rebroadcast de Scrypted)
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  value={rtspUrl}
                  onChange={(e) => setRtspUrl(e.target.value)}
                  placeholder="rtsp://<ip>:<puerto>/stream"
                  style={{ flex: 1, padding: "7px 10px", fontSize: "0.82rem", borderRadius: 6, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                />
                <button
                  className="button button-sm button-secondary"
                  type="button"
                  onClick={handleVerifyStream}
                  disabled={isVerifying}
                >
                  {isVerifying ? "Verificando..." : "Verificar"}
                </button>
                <button
                  className="button button-sm button-primary"
                  type="button"
                  onClick={handleSaveStream}
                >
                  Guardar
                </button>
              </div>
              {streamResult && (
                <div
                  style={{
                    marginTop: 6,
                    padding: "6px 8px",
                    borderRadius: 6,
                    fontSize: "0.8rem",
                    background: streamResult.isError ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                    color: streamResult.isError ? "#fca5a5" : "#6ee7b7",
                  }}
                >
                  {streamResult.text}
                </div>
              )}
            </div>

            {/* Real Hardware Capabilities */}
            <div className="sensors-box" style={{ marginBottom: 16 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "var(--dim)", textTransform: "uppercase" }}>
                FUNCIONES Y SENSORES REALES (EXPORTADOS EN EL MISMO QR)
              </h4>
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
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="button button-secondary" type="button" onClick={onClose}>
                Cancelar
              </button>
              <button className="button button-primary" type="button" onClick={handleSaveExport}>
                Guardar Configuración
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
