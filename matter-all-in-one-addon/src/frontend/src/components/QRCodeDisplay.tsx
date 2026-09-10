import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface QRCodeDisplayProps {
  pairingCode: string;
  manualCode?: string;
  entityName?: string;
  elementId?: string;
  noteText?: string;
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

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  pairingCode,
  manualCode,
  entityName = "matter-accessory",
  elementId = "device-qr-code",
  noteText = "Escanea con Apple Home, Google Home, Alexa o SmartThings",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (!pairingCode || !canvasRef.current) return;
    setQrError(null);

    QRCode.toCanvas(canvasRef.current, pairingCode, {
      width: 208,
      margin: 1,
      color: { dark: "#09101f", light: "#ffffff" },
      errorCorrectionLevel: "H", // High error correction permits center logo overlay
    }).catch((err) => {
      console.error("Error al renderizar código QR:", err);
      setQrError("Error al generar código QR");
    });
  }, [pairingCode]);

  const handleCopyCode = async () => {
    const codeToCopy = manualCode || pairingCode;
    if (!codeToCopy) return;
    try {
      await navigator.clipboard.writeText(codeToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = codeToCopy;
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
        errorCorrectionLevel: "H",
        color: { dark: "#09101f", light: "#ffffff" },
      })
        .then(() => {
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
        })
        .catch((err) => console.error("Error al descargar QR:", err));
    } catch (err) {
      console.error("Error en descarga de QR:", err);
    }
  };

  if (!pairingCode) {
    return (
      <div className="qr-liquid-glass-card" style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
        Sin código QR disponible.
      </div>
    );
  }

  return (
    <div
      className="qr-liquid-glass-card"
      style={{ display: "block", flexShrink: 0, minHeight: "fit-content" }}
    >
      <div className="qr-visual-wrapper" style={{ flexShrink: 0 }}>
        <div className="qr-frame-glow" aria-hidden="true" />
        <div className="qr-frame" style={{ flexShrink: 0 }}>
          <div
            id={elementId}
            style={{ width: 208, height: 208, minWidth: 208, minHeight: 208, flexShrink: 0 }}
          >
            <canvas
              ref={canvasRef}
              style={{ width: "100%", height: "100%", display: "block" }}
            />
          </div>
          <div className="qr-center-logo" aria-hidden="true">
            <img src="logo.png" alt="Matter Logo" className="qr-logo-img" />
          </div>
        </div>
      </div>

      {qrError && (
        <p style={{ color: "#f87171", fontSize: "0.8rem", marginTop: 6, textAlign: "center" }}>
          {qrError}
        </p>
      )}

      {manualCode && (
        <div className="qr-manual-box">
          <span className="manual-code-label">CÓDIGO NUMÉRICO MANUAL</span>
          <div className="manual-code-row">
            <code className="manual-code-display">{formatManualCode(manualCode)}</code>
            <button
              className="button-copy-code"
              type="button"
              onClick={handleCopyCode}
              title="Copiar código al portapapeles"
              aria-label="Copiar código manual"
            >
              <span className="copy-icon">📋</span>
              <span className="copy-text">{copied ? "¡Copiado!" : "Copiar"}</span>
            </button>
          </div>
        </div>
      )}

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
