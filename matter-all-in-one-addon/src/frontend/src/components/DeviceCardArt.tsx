import React from "react";
import { rgbToHex } from "../utils/colors";

interface DeviceCardArtProps {
  domain: string;
  state?: string;
  isDay?: boolean;
  attributes?: Record<string, any>;
  fanPercentage?: number;
  isFanOn?: boolean;
  lightRgb?: [number, number, number];
  lightBrightness?: number;
  isLightOn?: boolean;
}

export const DeviceCardArt: React.FC<DeviceCardArtProps> = ({
  domain,
  state = "off",
  isDay = true,
  attributes = {},
  fanPercentage,
  isFanOn: propFanOn,
  lightRgb = [255, 209, 89],
  lightBrightness = 0,
  isLightOn = false,
}) => {
  const isFanActive = propFanOn ?? (domain === "fan" && (state === "on" || (fanPercentage ?? 0) > 0));
  const effectiveFanPct = fanPercentage ?? (isFanActive ? 100 : 0);
  const fanDurationSec = isFanActive
    ? Math.max(0.18, Math.min(2.4, (100 / Math.max(10, effectiveFanPct)) * 0.55))
    : 0;

  const [lr, lg, lb] = lightRgb;
  const lightHex = rgbToHex([lr, lg, lb]);

  const hasFan = isFanActive || domain === "fan" || (fanPercentage !== undefined && fanPercentage > 0);
  const hasLight = isLightOn || domain === "light" || lightBrightness > 0;

  return (
    <div
      className="card-art-backdrop"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
        borderRadius: "inherit",
      }}
      aria-hidden="true"
    >
      {/* 1. Volumetric Kelvin / RGB Light Illumination (baña físicamente la tarjeta) */}
      {isLightOn && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 82% 20%, rgba(${lr}, ${lg}, ${lb}, ${
              0.42 * lightBrightness
            }) 0%, rgba(${lr}, ${lg}, ${lb}, ${
              0.16 * lightBrightness
            }) 45%, transparent 75%)`,
            transition: "background 0.5s ease",
            pointerEvents: "none",
          }}
        />
      )}

      {/* 2. Vector Artwork Canvas */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "230px",
          height: "100%",
          opacity: isFanActive || isLightOn || state === "on" ? 0.95 : 0.4,
          transition: "opacity 0.6s ease",
          maskImage:
            "linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 98%)",
          WebkitMaskImage:
            "linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 98%)",
        }}
      >
        <svg
          viewBox="0 0 160 140"
          width="100%"
          height="100%"
          preserveAspectRatio="xMaxYMid meet"
        >
          <defs>
            {/* Lamp light cone gradient matching exact Kelvin / RGB */}
            <radialGradient id="lampConeGrad" cx="50%" cy="0%" r="90%">
              <stop
                offset="0%"
                stopColor={`rgb(${lr}, ${lg}, ${lb})`}
                stopOpacity={isLightOn ? 0.6 * lightBrightness : 0.05}
              />
              <stop
                offset="60%"
                stopColor={`rgb(${lr}, ${lg}, ${lb})`}
                stopOpacity={isLightOn ? 0.2 * lightBrightness : 0}
              />
              <stop offset="100%" stopColor="#0B0D13" stopOpacity="0" />
            </radialGradient>

            {/* Pedestal Stand Gradient */}
            <linearGradient id="pedestalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3A3F4D" />
              <stop offset="100%" stopColor="#181B22" />
            </linearGradient>

            {/* Dynamic Breeze Wave Gradient */}
            <linearGradient id="breezeGrad" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#007AFF" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* ── LIGHT COMPONENT (Either standalone light or composite fan+light) ── */}
          {(hasLight || domain === "light") && (
            <g className="art-light-fixture">
              {/* Cord & Pendant Fixture */}
              <line x1="124" y1="0" x2="124" y2="28" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
              <path
                d="M108 38 C108 28 140 28 140 38 Z"
                fill={isLightOn ? lightHex : "#262A34"}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1.5"
                style={{
                  filter: isLightOn ? `drop-shadow(0 0 12px ${lightHex})` : undefined,
                  transition: "fill 0.4s ease, filter 0.4s ease",
                }}
              />
              {/* Radiating Light Cone */}
              {isLightOn && (
                <polygon
                  points="108,38 140,38 160,140 84,140"
                  fill="url(#lampConeGrad)"
                  style={{
                    mixBlendMode: "screen",
                  }}
                />
              )}
            </g>
          )}

          {/* ── FAN COMPONENT (Standalone fan or composite fan+light) ── */}
          {(hasFan || domain === "fan") && (
            <g className="art-fan-fixture">
              {/* Pedestal Base & Pole */}
              <rect x="110" y="78" width="8" height="58" rx="4" fill="url(#pedestalGrad)" />
              <ellipse cx="114" cy="132" rx="28" ry="6" fill="#14171E" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

              {/* Protective Grille */}
              <circle
                cx="114"
                cy="48"
                r="36"
                fill="rgba(255,255,255,0.02)"
                stroke={isFanActive ? "rgba(0, 122, 255, 0.45)" : "rgba(255,255,255,0.12)"}
                strokeWidth="1.8"
              />

              {/* REAL PHYSICAL ROTATING FAN BLADES (Dan vueltas a toda velocidad en vivo) */}
              <g
                className={`art-fan-blades ${isFanActive ? "spinning" : ""}`}
                style={{
                  transformOrigin: "114px 48px",
                  animation: isFanActive ? `fan-spin ${fanDurationSec}s linear infinite` : "none",
                }}
              >
                {/* Blade 1 (Top) */}
                <path
                  d="M114 48 C112 34 100 20 108 16 C116 12 122 28 114 48 Z"
                  fill={isFanActive ? "#007AFF" : "#71717A"}
                  opacity={isFanActive ? 0.95 : 0.65}
                />
                {/* Blade 2 (Bottom Right) */}
                <path
                  d="M114 48 C126 42 144 44 144 54 C144 62 128 56 114 48 Z"
                  fill={isFanActive ? "#007AFF" : "#71717A"}
                  opacity={isFanActive ? 0.95 : 0.65}
                />
                {/* Blade 3 (Bottom Left) */}
                <path
                  d="M114 48 C110 60 100 74 90 70 C82 64 96 54 114 48 Z"
                  fill={isFanActive ? "#007AFF" : "#71717A"}
                  opacity={isFanActive ? 0.95 : 0.65}
                />
              </g>

              {/* Center Metallic Hub */}
              <circle
                cx="114"
                cy="48"
                r="5.5"
                fill="#27272A"
                stroke={isFanActive ? "#007AFF" : "#52525B"}
                strokeWidth="1.5"
              />

              {/* Dynamic Airflow Breeze Waves (Velocidad visual proporcional) */}
              {isFanActive && (
                <g className="airflow-stream" style={{ opacity: Math.max(0.4, effectiveFanPct / 100) }}>
                  <path
                    d="M72 34 C52 32 38 38 22 34"
                    fill="none"
                    stroke="url(#breezeGrad)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="breeze-line-1"
                  />
                  <path
                    d="M68 48 C46 46 32 52 14 48"
                    fill="none"
                    stroke="url(#breezeGrad)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    className="breeze-line-2"
                  />
                  <path
                    d="M74 62 C56 60 42 66 26 62"
                    fill="none"
                    stroke="url(#breezeGrad)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    className="breeze-line-3"
                  />
                </g>
              )}
            </g>
          )}

          {/* ── CLIMATE / THERMOSTAT ── */}
          {domain === "climate" && !hasFan && !hasLight && (
            <g className="art-climate-fixture">
              <circle
                cx="115"
                cy="60"
                r="38"
                fill="none"
                stroke={state === "heat" ? "rgba(255, 149, 0, 0.4)" : "rgba(0, 199, 190, 0.4)"}
                strokeWidth="4"
                strokeDasharray="180 30"
              />
              <circle
                cx="115"
                cy="60"
                r="30"
                fill="rgba(0, 0, 0, 0.3)"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="1"
              />
              <text
                x="115"
                y="66"
                textAnchor="middle"
                fill="#F8FAFC"
                fontSize="18"
                fontWeight="700"
                fontFamily="system-ui, sans-serif"
              >
                {typeof attributes.current_temperature === "number" ? `${attributes.current_temperature}°` : "AC"}
              </text>
            </g>
          )}

          {/* ── COVER / WINDOW BLINDS ── */}
          {domain === "cover" && !hasFan && !hasLight && (
            <g className="art-cover-fixture">
              <rect
                x="85"
                y="15"
                width="62"
                height="110"
                rx="4"
                fill="rgba(15, 20, 30, 0.6)"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1.6"
              />
              {/* Slats adjusting to position */}
              <line x1="88" y1="28" x2="144" y2="28" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="42" x2="144" y2="42" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="56" x2="144" y2="56" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="70" x2="144" y2="70" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="84" x2="144" y2="84" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
            </g>
          )}

          {/* ── LOCK / DEADBOLT ── */}
          {domain === "lock" && !hasFan && !hasLight && (
            <g className="art-lock-fixture">
              <rect x="92" y="38" width="48" height="64" rx="8" fill="#20242E" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <path
                d="M102 38 L102 24 C102 16 130 16 130 24 L130 38"
                fill="none"
                stroke={state === "locked" ? "#FF453A" : "#30D158"}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <circle cx="116" cy="66" r="5" fill={state === "locked" ? "#FF453A" : "#30D158"} />
            </g>
          )}

          {/* ── SWITCH / PLUG ── */}
          {(domain === "switch" || domain === "plug") && !hasFan && !hasLight && (
            <g className="art-switch-fixture">
              <circle cx="116" cy="65" r="32" fill="#1C1F28" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
              <circle
                cx="116"
                cy="65"
                r="22"
                fill="none"
                stroke={state === "on" ? "#30D158" : "rgba(255,255,255,0.2)"}
                strokeWidth="3"
                strokeDasharray={state === "on" ? "100" : "40 10"}
              />
              <rect x="110" y="58" width="4" height="14" rx="1.5" fill="rgba(255,255,255,0.4)" />
              <rect x="118" y="58" width="4" height="14" rx="1.5" fill="rgba(255,255,255,0.4)" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
