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
  videoCodec?: string;
  isHevc?: boolean;
  badgeLabel?: string;
}

/**
 * Official Modern Apple Home App Icon (3-tiered layered depth with chimney)
 * Variant "color": Apple signature warm orange & golden amber for HAP H.264
 * Variant "purple": Royal violet & purple for HAP HEVC / HKSV3
 * Variant "mono": Sleek dark graphite & silver for Matter IoT
 */
export const AppleHomeModernIcon: React.FC<{ variant?: "color" | "mono" | "purple"; size?: number }> = ({
  variant = "color",
  size = 48,
}) => {
  const isPurple = variant === "purple";
  const isColor = variant === "color";
  const p = isPurple ? "purp" : isColor ? "col" : "mon";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden="true"
    >
      <defs>
        {isPurple ? (
          <>
            <linearGradient id={`${p}-out`} x1="50" y1="8" x2="50" y2="92" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#9333ea" />
              <stop offset="100%" stopColor="#7e22ce" />
            </linearGradient>
            <linearGradient id={`${p}-mid`} x1="50" y1="26" x2="50" y2="82" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <linearGradient id={`${p}-in`} x1="50" y1="44" x2="50" y2="74" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#faf5ff" />
              <stop offset="100%" stopColor="#f3e8ff" />
            </linearGradient>
            <filter id={`${p}-sh1`} x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#581c87" floodOpacity="0.4" />
            </filter>
            <filter id={`${p}-sh2`} x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#6b21a8" floodOpacity="0.3" />
            </filter>
          </>
        ) : isColor ? (
          <>
            <linearGradient id={`${p}-out`} x1="50" y1="8" x2="50" y2="92" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ff9f0a" />
              <stop offset="100%" stopColor="#f57c00" />
            </linearGradient>
            <linearGradient id={`${p}-mid`} x1="50" y1="26" x2="50" y2="82" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffc83b" />
              <stop offset="100%" stopColor="#ffab10" />
            </linearGradient>
            <linearGradient id={`${p}-in`} x1="50" y1="44" x2="50" y2="74" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fffde7" />
              <stop offset="100%" stopColor="#fff3b0" />
            </linearGradient>
            <filter id={`${p}-sh1`} x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#b25000" floodOpacity="0.35" />
            </filter>
            <filter id={`${p}-sh2`} x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#d97706" floodOpacity="0.25" />
            </filter>
          </>
        ) : (
          <>
            <linearGradient id={`${p}-out`} x1="50" y1="8" x2="50" y2="92" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0f172a" />
            </linearGradient>
            <linearGradient id={`${p}-mid`} x1="50" y1="26" x2="50" y2="82" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
            <linearGradient id={`${p}-in`} x1="50" y1="44" x2="50" y2="74" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f1f5f9" />
            </linearGradient>
            <filter id={`${p}-sh1`} x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.45" />
            </filter>
            <filter id={`${p}-sh2`} x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#0f172a" floodOpacity="0.3" />
            </filter>
          </>
        )}
      </defs>

      {/* Chimney on the right */}
      <path
        d="M72 18V38H84V22.5C84 20.01 81.99 18 79.5 18H72Z"
        fill={`url(#${p}-out)`}
      />

      {/* Layer 1: Outer House */}
      <path
        d="M47.45 9.77C48.98 8.44 51.02 8.44 52.55 9.77L90.8 42.87C92.68 44.5 91.53 47.6 89.04 47.6H79.5V81.5C79.5 86.47 75.47 90.5 70.5 90.5H29.5C24.53 90.5 20.5 86.47 20.5 81.5V47.6H10.96C8.47 47.6 7.32 44.5 9.2 42.87L47.45 9.77Z"
        fill={`url(#${p}-out)`}
      />

      {/* Layer 2: Middle Concentric House */}
      <path
        d="M48.1 27.8C49.2 26.8 50.8 26.8 51.9 27.8L71.8 44.7C73.2 45.9 72.4 48.2 70.5 48.2H66.5V74.5C66.5 77.8 63.8 80.5 60.5 80.5H39.5C36.2 80.5 33.5 77.8 33.5 74.5V48.2H29.5C27.6 48.2 26.8 45.9 28.2 44.7L48.1 27.8Z"
        fill={`url(#${p}-mid)`}
        filter={`url(#${p}-sh1)`}
      />

      {/* Layer 3: Inner Concentric House */}
      <path
        d="M48.7 44.2C49.5 43.5 50.5 43.5 51.3 44.2L60.5 52.1C61.4 52.9 60.8 54.5 59.6 54.5H57.5V69.5C57.5 71.4 55.9 73 54 73H46C44.1 73 42.5 71.4 42.5 69.5V54.5H40.4C39.2 54.5 38.6 52.9 39.5 52.1L48.7 44.2Z"
        fill={`url(#${p}-in)`}
        filter={`url(#${p}-sh2)`}
      />
    </svg>
  );
};

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

/**
 * Splits digits for the Apple Home sticker layout (like the user photo)
 * For HAP: 8 digits split into 2 rows of 4 digits (e.g. 6640 / 7443)
 * For Matter: 11 digits (e.g. 3497 / 011-2983)
 */
function getStickerDigits(code?: string, isHomeKit?: boolean): { line1: string; line2: string } {
  if (!code) return { line1: "••••", line2: "••••" };
  const clean = String(code).replace(/\D/g, "");
  if (clean.length === 8) {
    return {
      line1: clean.slice(0, 4).split("").join(" "),
      line2: clean.slice(4, 8).split("").join(" "),
    };
  }
  if (clean.length === 11) {
    return {
      line1: clean.slice(0, 4).split("").join(" "),
      line2: `${clean.slice(4, 7)}-${clean.slice(7)}`,
    };
  }
  if (clean.length === 21) {
    return {
      line1: clean.slice(0, 4).split("").join(" "),
      line2: `${clean.slice(4, 11)}...`,
    };
  }
  const mid = Math.ceil(clean.length / 2);
  return {
    line1: clean.slice(0, mid).split("").join(" "),
    line2: clean.slice(mid),
  };
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  pairingCode,
  manualCode,
  pinCode,
  entityName = "matter-accessory",
  elementId = "device-qr-code",
  noteText,
  variant = "matter-badge",
  videoCodec,
  isHevc = false,
  badgeLabel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const isMultiAdmin = variant === "multi-admin-glass";
  const isHomeKit = variant === "hap-homekit";
  const isHevcCodec = Boolean(isHevc);

  useEffect(() => {
    if (!pairingCode || !canvasRef.current) return;
    setQrError(null);

    // Multi-admin glass uses High error correction for center logo. Clean badges use Medium.
    QRCode.toCanvas(canvasRef.current, pairingCode, {
      width: 180,
      margin: 1,
      color: {
        dark: isMultiAdmin ? "#09101f" : "#000000",
        light: "#ffffff",
      },
      errorCorrectionLevel: isMultiAdmin ? "H" : "M",
    }).catch((err) => {
      console.error("Error al renderizar código QR:", err);
      setQrError("Error al generar código QR");
    });
  }, [pairingCode, isMultiAdmin, isHevcCodec]);

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

  const rawCode = isHomeKit ? pinCode || manualCode : manualCode || pairingCode;
  const stickerDigits = getStickerDigits(rawCode, isHomeKit);

  return (
    <div className="qr-display-container" style={{ display: "block" }}>
      {/* 1. iOS 27 Liquid Glass Physical Setup Sticker (HAP and Matter IoT) */}
      {!isMultiAdmin ? (
        <div className={`ios27-glass-sticker ${isHevcCodec ? "sticker-hevc" : isHomeKit ? "sticker-hap" : "sticker-matter"}`}>
          {/* Top Header: Apple Home Modern Layered Icon (Left) + 2-Row Digits (Right) */}
          <div className="sticker-header">
            <div className="sticker-house-col">
              <AppleHomeModernIcon variant={isHevcCodec ? "purple" : isHomeKit ? "color" : "mono"} size={48} />
            </div>
            <div className="sticker-code-col">
              <div className="sticker-code-line line-1">{stickerDigits.line1}</div>
              <div className="sticker-code-line line-2">{stickerDigits.line2}</div>
            </div>
          </div>

          {/* Center QR Canvas Frame */}
          <div className="sticker-qr-frame">
            <div id={elementId} className="sticker-qr-canvas-wrapper">
              <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
            </div>
          </div>

          {/* Quick Copy Pill Inside Sticker Footer */}
          <div className="sticker-footer-row">
            <span className="sticker-badge-tag">
              {badgeLabel || (isHomeKit ? "Apple HomeKit HAP" : "Matter (Multi-plataforma)")}
            </span>
            <button
              className="button-sticker-copy"
              type="button"
              onClick={() => handleCopyCode(rawCode)}
              title="Copiar código"
              aria-label="Copiar código"
            >
              <span>{copied ? "¡Copiado!" : "Copiar"}</span>
            </button>
          </div>
        </div>
      ) : (
        /* 2. Modern Multi-Admin Liquid Glass Mode */
        <div className="qr-liquid-glass-card multi-admin-mode">
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

          <div className="qr-visual-wrapper">
            <div className="qr-frame-glow" aria-hidden="true" />
            <div className="qr-frame">
              <div id={elementId}>
                <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
              </div>
              <div className="qr-center-logo" aria-hidden="true">
                <img src="logo.png" alt="Matter Logo" className="qr-logo-img" />
              </div>
            </div>
          </div>

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
        </div>
      )}

      {qrError && (
        <p style={{ color: "#f87171", fontSize: "0.8rem", marginTop: 6, textAlign: "center" }}>
          {qrError}
        </p>
      )}

      {/* Download High-Res QR Button */}
      <div className="qr-card-actions">
        <button
          className="button-download-qr"
          type="button"
          onClick={handleDownloadQr}
          title="Descargar código QR en alta resolución (PNG)"
        >
          <span>💾 Descargar QR (PNG)</span>
        </button>
      </div>

      {noteText && <small className="qr-note">{noteText}</small>}
    </div>
  );
};
