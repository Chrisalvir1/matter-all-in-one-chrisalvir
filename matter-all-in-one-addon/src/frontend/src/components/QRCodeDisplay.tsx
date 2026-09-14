import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export type QRVariant = "hap-homekit" | "matter-badge" | "multi-admin-glass";

interface QRCodeDisplayProps {
  pairingCode: string;
  manualCode?: string;
  pinCode?: string;
  entityName?: string;
  elementId?: string;
  noteText?: string;
  variant?: QRVariant;
}

function formatManualCode(raw?: string): string {
  if (!raw) return "—————";
  const clean = String(raw).replace(/\D/g, "");
  if (clean.length === 11) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 21) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16)}`;
  }
  return raw;
}

function formatPinCode(raw?: string): string {
  if (!raw) return "———-——-———";
  const clean = String(raw).replace(/\D/g, "");
  if (clean.length === 8) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5)}`;
  }
  return raw;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  pairingCode,
  manualCode,
  pinCode,
  entityName = "matter-accessory",
  elementId = "device-qr-code",
  noteText,
  variant = "matter-badge",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const isMultiAdmin = variant === "multi-admin-glass";
  const isHomeKit = variant === "hap-homekit";

  useEffect(() => {
    if (!pairingCode || !canvasRef.current) return;
    setQrError(null);

    // Multi-admin glass uses High error correction for center logo. Clean badges use Medium.
    QRCode.toCanvas(canvasRef.current, pairingCode, {
      width: 180,
      margin: 1,
      color: { dark: isMultiAdmin ? "#09101f" : "#000000", light: "#ffffff" },
      errorCorrectionLevel: isMultiAdmin ? "H" : "M",
    }).catch((err) => {
      console.error("Error al renderizar código QR:", err);
      setQrError("Error al generar código QR");
    });
  }, [pairingCode, isMultiAdmin]);

  const handleCopyCode = async (codeToCopy?: string) => {
    const text = codeToCopy || manualCode || pinCode || pairingCode;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadQr = () => {
    if (!pairingCode) return;
    const filename = `${entityName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qr.png`;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      QRCode.toCanvas(canvas, pairingCode, {
        width: 920,
        margin: 2,
        errorCorrectionLevel: isMultiAdmin ? "H" : "M",
        color: { dark: isMultiAdmin ? "#09101f" : "#000000", light: "#ffffff" },
      })
        .then(() => {
          if (isMultiAdmin) {
            const logoImg = new Image();
            logoImg.onload = () => {
              const logoSize = 180;
              const pos = (1024 - logoSize) / 2;
              ctx.fillStyle = "#ffffff";
              ctx.beginPath();
              if (typeof (ctx as any).roundRect === "function") {
                (ctx as any).roundRect(pos - 12, pos - 12, logoSize + 24, logoSize + 24, 28);
              } else {
                ctx.rect(pos - 12, pos - 12, logoSize + 24, logoSize + 24);
              }
              ctx.fill();
              ctx.shadowColor = "rgba(0,0,0,0.25)";
              ctx.shadowBlur = 12;
              ctx.drawImage(logoImg, pos, pos, logoSize, logoSize);

              const a = document.createElement("a");
              a.download = filename;
              a.href = canvas.toDataURL("image/png");
              a.click();
            };
            logoImg.onerror = () => {
              const a = document.createElement("a");
              a.download = filename;
              a.href = canvas.toDataURL("image/png");
              a.click();
            };
            logoImg.src = "logo.png";
          } else {
            const a = document.createElement("a");
            a.download = filename;
            a.href = canvas.toDataURL("image/png");
            a.click();
          }
        })
        .catch((err) => console.error("Error al descargar QR:", err));
    } catch (err) {
      console.error("Error en descarga de QR:", err);
    }
  };

  if (!pairingCode) {
    return (
      <div className="qr-empty-card">
        Sin código QR disponible.
      </div>
    );
  }

  // Determine card container class
  const cardContainerClass = isMultiAdmin
    ? "qr-liquid-glass-card multi-admin-mode"
    : isHomeKit
    ? "qr-badge-card qr-card-homekit-badge"
    : "qr-badge-card qr-card-matter-badge";

  return (
    <div className={cardContainerClass} style={{ display: "block" }}>
      {/* Badge Header Bar */}
      {isHomeKit && (
        <div className="qr-badge-header homekit-header">
          <div className="qr-badge-title-group">
            <span className="homekit-house-icon-yellow" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
                <path d="M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3z" />
              </svg>
            </span>
            <div>
              <strong className="qr-badge-brand">Apple HomeKit</strong>
              <span className="qr-badge-type">Cámara HAP · Live View</span>
            </div>
          </div>
          <span className="qr-protocol-tag tag-homekit">HAP</span>
        </div>
      )}

      {variant === "matter-badge" && (
        <div className="qr-badge-header matter-header">
          <div className="qr-badge-title-group">
            <span className="matter-house-icon-mono" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#0f172a" stroke="none">
                <path d="M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3z" />
              </svg>
            </span>
            <div>
              <strong className="qr-badge-brand">Matter</strong>
              <span className="qr-badge-type">Apple Home & Multi-Ecosistema</span>
            </div>
          </div>
          <span className="qr-protocol-tag tag-matter">Matter</span>
        </div>
      )}

      {isMultiAdmin && (
        <div className="qr-badge-header multi-admin-header">
          <div className="qr-badge-title-group">
            <span className="multi-admin-sparkle-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </span>
            <div>
              <strong className="qr-badge-brand text-cyan">Modo Multi-Admin</strong>
              <span className="qr-badge-type">Ventana abierta (15 min)</span>
            </div>
          </div>
          <span className="qr-protocol-tag tag-multi-admin">Activo</span>
        </div>
      )}

      {/* QR Canvas Frame */}
      <div className="qr-visual-wrapper">
        {isMultiAdmin && <div className="qr-frame-glow" aria-hidden="true" />}
        <div className={`qr-frame ${!isMultiAdmin ? "qr-frame-clean" : ""}`}>
          <div id={elementId}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          </div>
          {isMultiAdmin && (
            <div className="qr-center-logo" aria-hidden="true">
              <img src="logo.png" alt="Matter Logo" className="qr-logo-img" />
            </div>
          )}
        </div>
      </div>

      {qrError && (
        <p style={{ color: "#f87171", fontSize: "0.8rem", marginTop: 6, textAlign: "center" }}>
          {qrError}
        </p>
      )}

      {/* Manual Code Box */}
      {isHomeKit ? (
        <div className="qr-manual-box box-homekit">
          <span className="manual-code-label">CÓDIGO DE CONFIGURACIÓN HOMEKIT</span>
          <div className="manual-code-row">
            <code className="manual-code-display code-black">
              {formatPinCode(pinCode || manualCode)}
            </code>
            <button
              className="button-copy-code"
              type="button"
              onClick={() => handleCopyCode(pinCode || manualCode)}
              title="Copiar código PIN de 8 dígitos"
              aria-label="Copiar código PIN"
            >
              <span className="copy-icon">📋</span>
              <span className="copy-text">{copied ? "¡Copiado!" : "Copiar"}</span>
            </button>
          </div>
        </div>
      ) : isMultiAdmin ? (
        <div className="qr-manual-box box-multi-admin">
          <span className="manual-code-label">CÓDIGO MATTER MULTI-ADMIN</span>
          <div className="manual-code-row">
            <code className="manual-code-display code-cyan">
              {formatManualCode(manualCode || pairingCode)}
            </code>
            <button
              className="button-copy-code"
              type="button"
              onClick={() => handleCopyCode(manualCode || pairingCode)}
              title="Copiar código temporal Matter"
              aria-label="Copiar código manual"
            >
              <span className="copy-icon">📋</span>
              <span className="copy-text">{copied ? "¡Copiado!" : "Copiar"}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="qr-manual-box box-matter">
          <span className="manual-code-label">CÓDIGO NUMÉRICO MANUAL MATTER</span>
          <div className="manual-code-row">
            <code className="manual-code-display code-black">
              {formatManualCode(manualCode || pairingCode)}
            </code>
            <button
              className="button-copy-code"
              type="button"
              onClick={() => handleCopyCode(manualCode || pairingCode)}
              title="Copiar código numérico Matter"
              aria-label="Copiar código manual"
            >
              <span className="copy-icon">📋</span>
              <span className="copy-text">{copied ? "¡Copiado!" : "Copiar"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Download Action */}
      <div className="qr-card-actions">
        <button
          className="button-download-qr"
          type="button"
          onClick={handleDownloadQr}
          title="Descargar código QR en alta resolución"
        >
          <span>💾 Descargar QR (PNG)</span>
        </button>
      </div>

      {noteText && <small className="qr-note">{noteText}</small>}
    </div>
  );
};
