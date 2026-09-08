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
  subtype?: string;
  brand?: string;
  model?: string;
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
  subtype = "generic",
  brand = "",
  model = "",
}) => {
  const isFanActive = propFanOn ?? (domain === "fan" && (state === "on" || (fanPercentage ?? 0) > 0));
  const effectiveFanPct = fanPercentage ?? (isFanActive ? 100 : 0);
  const fanDurationSec = isFanActive
    ? Math.max(0.18, Math.min(2.4, (100 / Math.max(10, effectiveFanPct)) * 0.55))
    : 0;

  const [lr, lg, lb] = lightRgb;
  const lightHex = rgbToHex([lr, lg, lb]);

  const isOn =
    state === "on" ||
    state === "heat" ||
    state === "cool" ||
    state === "open" ||
    state === "unlocked" ||
    isFanActive ||
    isLightOn;

  const hasFan = isFanActive || domain === "fan" || (fanPercentage !== undefined && fanPercentage > 0);
  const hasLight = isLightOn || domain === "light" || lightBrightness > 0;

  // Resolve active visual archetype
  let visualType = subtype;
  if (visualType === "generic") {
    if (domain === "fan") visualType = "pedestal_fan";
    else if (domain === "light") visualType = "bulb";
    else if (domain === "climate") visualType = "thermostat";
    else if (domain === "vacuum") visualType = "vacuum";
    else if (domain === "lock") visualType = "lock";
    else if (domain === "cover") visualType = "cover";
    else if (domain === "switch") visualType = "plug";
    else if (domain === "camera") visualType = "camera";
  }

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
          opacity: isOn ? 0.95 : 0.45,
          transition: "opacity 0.6s ease",
          maskImage:
            "linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 60%, transparent 98%)",
          WebkitMaskImage:
            "linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 60%, transparent 98%)",
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
                stopOpacity={isLightOn ? 0.65 * lightBrightness : 0.05}
              />
              <stop
                offset="60%"
                stopColor={`rgb(${lr}, ${lg}, ${lb})`}
                stopOpacity={isLightOn ? 0.22 * lightBrightness : 0}
              />
              <stop offset="100%" stopColor="#0B0D13" stopOpacity="0" />
            </radialGradient>

            {/* Pedestal Stand Gradient */}
            <linearGradient id="pedestalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3A3F4D" />
              <stop offset="100%" stopColor="#181B22" />
            </linearGradient>

            {/* Tower Body Gradient */}
            <linearGradient id="towerChassisGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#181D26" />
              <stop offset="35%" stopColor="#2E3544" />
              <stop offset="70%" stopColor="#222834" />
              <stop offset="100%" stopColor="#12151C" />
            </linearGradient>

            {/* Dynamic Breeze Wave Gradient */}
            <linearGradient id="breezeGrad" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#007AFF" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
            </linearGradient>

            {/* LED Neon Strip Gradient */}
            <linearGradient id="neonStripGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={isLightOn ? lightHex : "#334155"} />
              <stop offset="50%" stopColor={isLightOn ? "#00F0FF" : "#475569"} />
              <stop offset="100%" stopColor={isLightOn ? "#AF52DE" : "#1E293B"} />
            </linearGradient>
          </defs>

          {/* ── 1. TOWER FAN (e.g. Govee H7133 / Dreo Smart Tower) ── */}
          {visualType === "tower_fan" && (
            <g className="art-tower-fan">
              {/* Elliptical Stable Base */}
              <ellipse cx="118" cy="132" rx="26" ry="6" fill="#141822" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />

              {/* Tower Body Column */}
              <rect x="104" y="14" width="28" height="116" rx="6" fill="url(#towerChassisGrad)" stroke={isFanActive ? "rgba(0, 240, 255, 0.4)" : "rgba(255,255,255,0.15)"} strokeWidth="1.5" />

              {/* Top Angled Control Touch Panel */}
              <path d="M106 14 L130 14 L128 24 L108 24 Z" fill="#0C0E14" />
              <circle cx="118" cy="19" r="2.2" fill={isFanActive ? "#00F0FF" : "#64748B"} style={{ filter: isFanActive ? "drop-shadow(0 0 4px #00F0FF)" : undefined }} />

              {/* Vertical Airflow Vent Grille with Oscillating Horizontal Vanes */}
              <rect x="110" y="28" width="16" height="92" rx="3" fill="#0A0D13" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              {Array.from({ length: 9 }).map((_, i) => {
                const yPos = 35 + i * 9.5;
                return (
                  <line
                    key={i}
                    x1="112"
                    y1={yPos}
                    x2="124"
                    y2={yPos}
                    stroke={isFanActive ? "#38BDF8" : "rgba(255,255,255,0.2)"}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    className={isFanActive ? "fan-tower-vane" : ""}
                    style={{ animationDelay: `${i * 0.12}s` }}
                  />
                );
              })}

              {/* Dynamic Airflow Breeze Waves */}
              {isFanActive && (
                <g className="airflow-stream" style={{ opacity: Math.max(0.4, effectiveFanPct / 100) }}>
                  <path d="M98 42 C76 40 58 46 36 42" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.8" strokeLinecap="round" className="breeze-line-1" />
                  <path d="M94 65 C68 62 48 70 24 66" fill="none" stroke="url(#breezeGrad)" strokeWidth="3.4" strokeLinecap="round" className="breeze-line-2" />
                  <path d="M98 88 C74 86 54 92 34 88" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.5" strokeLinecap="round" className="breeze-line-3" />
                </g>
              )}
            </g>
          )}

          {/* ── 2. CEILING FAN WITH LIGHT (e.g. Ventilador de Sala / Hunter) ── */}
          {visualType === "ceiling_fan" && (
            <g className="art-ceiling-fan">
              {/* Ceiling Mount Canopy & Downrod */}
              <path d="M106 0 L122 0 L118 12 L110 12 Z" fill="#2E3544" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <line x1="114" y1="12" x2="114" y2="34" stroke="#4B5563" strokeWidth="3" />

              {/* Horizontal Aerodynamic Rotating Ceiling Blades */}
              <g
                className={`art-fan-blades ${isFanActive ? "spinning" : ""}`}
                style={{
                  transformOrigin: "114px 38px",
                  animation: isFanActive ? `fan-spin ${fanDurationSec}s linear infinite` : "none",
                }}
              >
                <path d="M114 38 C110 32 60 22 54 28 C48 34 100 42 114 38 Z" fill={isFanActive ? "#38BDF8" : "#6B7280"} opacity="0.85" />
                <path d="M114 38 C118 32 168 22 174 28 C180 34 128 42 114 38 Z" fill={isFanActive ? "#38BDF8" : "#6B7280"} opacity="0.85" />
                <path d="M114 38 C120 42 136 84 128 88 C120 92 112 50 114 38 Z" fill={isFanActive ? "#007AFF" : "#4B5563"} opacity="0.9" />
                <path d="M114 38 C108 42 92 84 100 88 C108 92 116 50 114 38 Z" fill={isFanActive ? "#007AFF" : "#4B5563"} opacity="0.9" />
              </g>

              {/* Center Frosted Glass Light Dome */}
              <ellipse
                cx="114"
                cy="44"
                rx="16"
                ry="10"
                fill={isLightOn ? lightHex : "#222734"}
                stroke={isLightOn ? "#FFF" : "rgba(255,255,255,0.2)"}
                strokeWidth="1.5"
                style={{
                  filter: isLightOn ? `drop-shadow(0 0 16px ${lightHex})` : undefined,
                  transition: "fill 0.4s ease",
                }}
              />

              {/* Radiating Light Cone */}
              {isLightOn && (
                <polygon
                  points="100,46 128,46 160,140 68,140"
                  fill="url(#lampConeGrad)"
                  style={{ mixBlendMode: "screen" }}
                />
              )}

              {/* Downward Breeze Lines */}
              {isFanActive && (
                <g className="airflow-stream" style={{ opacity: Math.max(0.4, effectiveFanPct / 100) }}>
                  <path d="M84 62 C74 74 68 94 62 112" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.2" strokeLinecap="round" className="breeze-line-1" />
                  <path d="M114 62 C114 80 114 100 114 120" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.8" strokeLinecap="round" className="breeze-line-2" />
                  <path d="M144 62 C154 74 160 94 166 112" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.2" strokeLinecap="round" className="breeze-line-3" />
                </g>
              )}
            </g>
          )}

          {/* ── 3. PEDESTAL / DESK FAN ── */}
          {visualType === "pedestal_fan" && (
            <g className="art-pedestal-fan">
              {/* Stand & Base */}
              <rect x="110" y="78" width="8" height="58" rx="4" fill="url(#pedestalGrad)" />
              <ellipse cx="114" cy="132" rx="28" ry="6" fill="#14171E" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

              {/* Wire Guard Grille */}
              <circle
                cx="114"
                cy="48"
                r="36"
                fill="rgba(255,255,255,0.02)"
                stroke={isFanActive ? "rgba(0, 122, 255, 0.45)" : "rgba(255,255,255,0.12)"}
                strokeWidth="1.8"
              />

              {/* Aerodynamic Rotating Propeller Blades */}
              <g
                className={`art-fan-blades ${isFanActive ? "spinning" : ""}`}
                style={{
                  transformOrigin: "114px 48px",
                  animation: isFanActive ? `fan-spin ${fanDurationSec}s linear infinite` : "none",
                }}
              >
                <path d="M114 48 C112 34 100 20 108 16 C116 12 122 28 114 48 Z" fill={isFanActive ? "#007AFF" : "#71717A"} opacity={isFanActive ? 0.95 : 0.65} />
                <path d="M114 48 C126 42 144 44 144 54 C144 62 128 56 114 48 Z" fill={isFanActive ? "#007AFF" : "#71717A"} opacity={isFanActive ? 0.95 : 0.65} />
                <path d="M114 48 C110 60 100 74 90 70 C82 64 96 54 114 48 Z" fill={isFanActive ? "#007AFF" : "#71717A"} opacity={isFanActive ? 0.95 : 0.65} />
              </g>

              {/* Metallic Center Cap */}
              <circle cx="114" cy="48" r="5.5" fill="#27272A" stroke={isFanActive ? "#007AFF" : "#52525B"} strokeWidth="1.5" />

              {/* Breeze Stream */}
              {isFanActive && (
                <g className="airflow-stream" style={{ opacity: Math.max(0.4, effectiveFanPct / 100) }}>
                  <path d="M72 34 C52 32 38 38 22 34" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.5" strokeLinecap="round" className="breeze-line-1" />
                  <path d="M68 48 C46 46 32 52 14 48" fill="none" stroke="url(#breezeGrad)" strokeWidth="3.2" strokeLinecap="round" className="breeze-line-2" />
                  <path d="M74 62 C56 60 42 66 26 62" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.2" strokeLinecap="round" className="breeze-line-3" />
                </g>
              )}
            </g>
          )}

          {/* ── 4. RGBIC / NEON LED STRIP (e.g. Govee H618A / Nanoleaf) ── */}
          {visualType === "led_strip" && (
            <g className="art-led-strip">
              {/* Outer Bloom Track */}
              {isLightOn && (
                <path
                  d="M60 120 C85 85 95 105 125 65 C145 35 125 15 155 12"
                  fill="none"
                  stroke={lightHex}
                  strokeWidth="16"
                  strokeLinecap="round"
                  opacity={0.35 * lightBrightness}
                  style={{ filter: "blur(6px)" }}
                />
              )}

              {/* Sinuous Flexible Neon Ribbon */}
              <path
                d="M60 120 C85 85 95 105 125 65 C145 35 125 15 155 12"
                fill="none"
                stroke="url(#neonStripGrad)"
                strokeWidth="6.5"
                strokeLinecap="round"
              />

              {/* LED Segment Highlight Nodes */}
              {[
                [60, 120],
                [80, 96],
                [105, 92],
                [125, 65],
                [136, 42],
                [142, 22],
                [155, 12],
              ].map(([cx, cy], i) => (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r="3.5"
                  fill={isLightOn ? "#FFF" : "#64748B"}
                  opacity={isLightOn ? 0.9 : 0.4}
                />
              ))}
            </g>
          )}

          {/* ── 5. SMART BULB (e.g. Tapo L530 / Philips Hue White & Color) ── */}
          {(visualType === "bulb" || (visualType === "generic" && hasLight)) && (
            <g className="art-smart-bulb">
              {/* Cord / Fixture Drop */}
              <line x1="120" y1="0" x2="120" y2="22" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />

              {/* Bulb Screw Base (E26/E27) */}
              <rect x="113" y="22" width="14" height="12" rx="2" fill="#4B5563" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <line x1="113" y1="26" x2="127" y2="26" stroke="#9CA3AF" strokeWidth="1.2" />
              <line x1="113" y1="30" x2="127" y2="30" stroke="#9CA3AF" strokeWidth="1.2" />

              {/* Glass Envelope Silhouette */}
              <path
                d="M 120 34 C 111 34 100 44 100 58 C 100 72 108 80 113 90 L 127 90 C 132 80 140 72 140 58 C 140 44 129 34 120 34 Z"
                transform="rotate(180 120 62)"
                fill={isLightOn ? lightHex : "#1E2430"}
                stroke={isLightOn ? "#FFFFFF" : "rgba(255,255,255,0.25)"}
                strokeWidth="1.8"
                style={{
                  filter: isLightOn ? `drop-shadow(0 0 16px ${lightHex})` : undefined,
                  transition: "fill 0.4s ease",
                }}
              />

              {/* Internal Filament Glowing */}
              {isLightOn && (
                <path
                  d="M116 54 L120 46 L124 54"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}

              {/* Radiating Light Cone */}
              {isLightOn && (
                <polygon
                  points="106,75 134,75 160,140 80,140"
                  fill="url(#lampConeGrad)"
                  style={{ mixBlendMode: "screen" }}
                />
              )}
            </g>
          )}

          {/* ── 6. ROBOT VACUUM (e.g. Roborock S8 / Roomba) ── */}
          {visualType === "vacuum" && (
            <g className="art-robot-vacuum">
              {/* Circular Main Chassis */}
              <circle cx="114" cy="70" r="38" fill="#1A1F2C" stroke={isOn ? "#E11D48" : "rgba(255,255,255,0.2)"} strokeWidth="2.2" />

              {/* Front Curved Bumper */}
              <path d="M 80 54 A 38 38 0 0 1 148 54" fill="none" stroke={isOn ? "#FB7185" : "rgba(255,255,255,0.15)"} strokeWidth="3" strokeLinecap="round" />

              {/* Dustbin Hatch Outline */}
              <rect x="94" y="66" width="40" height="26" rx="4" fill="#131620" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

              {/* Top LiDAR Turret */}
              <circle cx="114" cy="70" r="13" fill="#262D3D" stroke={isOn ? "#E11D48" : "#475569"} strokeWidth="1.6" />

              {/* Spinning LiDAR Laser Beam (Gira 360° en vivo cuando está activa) */}
              <g
                className={isOn ? "art-lidar-spin" : ""}
                style={{
                  transformOrigin: "114px 70px",
                  animation: isOn ? "fan-spin 1.2s linear infinite" : "none",
                }}
              >
                <line x1="114" y1="70" x2="148" y2="70" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px #EF4444)" }} />
                <circle cx="146" cy="70" r="2" fill="#FFF" />
              </g>

              {/* Power / Clean Button Ring */}
              <circle cx="114" cy="70" r="4.5" fill={isOn ? "#E11D48" : "#475569"} />
            </g>
          )}

          {/* ── 7. THERMOSTAT / CLIMATE (e.g. Nest / Ecobee) ── */}
          {visualType === "thermostat" && (
            <g className="art-thermostat">
              {/* Outer Dial Bezel */}
              <circle cx="114" cy="68" r="38" fill="#121620" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />

              {/* Active Temperature Arc Ring (Orange for Heat, Cyan for Cool) */}
              <circle
                cx="114"
                cy="68"
                r="38"
                fill="none"
                stroke={state === "heat" ? "#FF9500" : state === "cool" ? "#00C7BE" : "#30D158"}
                strokeWidth="4"
                strokeDasharray={isOn ? "150 90" : "40 200"}
                strokeLinecap="round"
                transform="rotate(-90 114 68)"
              />

              {/* Glass Dial Face */}
              <circle cx="114" cy="68" r="28" fill="#1E2433" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

              {/* Current Temperature Readout */}
              <text
                x="114"
                y="74"
                textAnchor="middle"
                fill="#F8FAFC"
                fontSize="18"
                fontWeight="750"
                fontFamily="system-ui, sans-serif"
              >
                {typeof attributes.current_temperature === "number" ? `${attributes.current_temperature}°` : "AC"}
              </text>
            </g>
          )}

          {/* ── 8. SMART PLUG (e.g. Tapo P110 / Shelly Plug) ── */}
          {visualType === "plug" && (
            <g className="art-smart-plug">
              {/* Plug Chassis */}
              <rect x="88" y="38" width="52" height="64" rx="14" fill="#1A1F2C" stroke="rgba(255,255,255,0.15)" strokeWidth="1.8" />

              {/* Illuminated Power Status Ring */}
              <circle
                cx="114"
                cy="70"
                r="18"
                fill={isOn ? "rgba(48, 209, 88, 0.12)" : "rgba(255,255,255,0.04)"}
                stroke={isOn ? "#30D158" : "rgba(255,255,255,0.2)"}
                strokeWidth="2.2"
                style={{ filter: isOn ? "drop-shadow(0 0 8px rgba(48, 209, 88, 0.5))" : undefined }}
              />

              {/* Ground Pin & Sockets */}
              <circle cx="114" cy="62" r="2.2" fill={isOn ? "#30D158" : "#64748B"} />
              <rect x="106" y="68" width="3" height="8" rx="1.2" fill={isOn ? "#FFFFFF" : "#64748B"} />
              <rect x="119" y="68" width="3" height="8" rx="1.2" fill={isOn ? "#FFFFFF" : "#64748B"} />
            </g>
          )}

          {/* ── 9. SMART LOCK (e.g. Yale / August / SwitchBot Lock) ── */}
          {visualType === "lock" && (
            <g className="art-smart-lock">
              <rect x="92" y="34" width="48" height="72" rx="10" fill="#1C212E" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />

              {/* Shackle / Deadbolt */}
              <path
                d="M102 34 L102 20 C102 12 130 12 130 20 L130 34"
                fill="none"
                stroke={state === "locked" ? "#30D158" : "#FF453A"}
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Thumbturn Escutcheon Dial */}
              <circle cx="116" cy="68" r="14" fill="#2A3144" stroke={state === "locked" ? "#30D158" : "#FF453A"} strokeWidth="2" />
              <line x1="116" y1="60" x2="116" y2="76" stroke={state === "locked" ? "#30D158" : "#FF453A"} strokeWidth="3" strokeLinecap="round" />
            </g>
          )}

          {/* ── 10. COVER / MOTORIZED BLIND ── */}
          {visualType === "cover" && (
            <g className="art-cover-fixture">
              <rect x="85" y="15" width="62" height="110" rx="4" fill="rgba(15, 20, 30, 0.6)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.6" />
              <line x1="88" y1="28" x2="144" y2="28" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="42" x2="144" y2="42" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="56" x2="144" y2="56" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="70" x2="144" y2="70" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="84" x2="144" y2="84" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
            </g>
          )}

          {/* ── 11. CAMERA (e.g. Tapo C200 / Reolink) ── */}
          {visualType === "camera" && (
            <g className="art-camera">
              {/* Dome Housing */}
              <circle cx="114" cy="68" r="32" fill="#1A1F2C" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              {/* Glass Lens Element */}
              <circle cx="114" cy="68" r="18" fill="#0C0E14" stroke="#38BDF8" strokeWidth="2" />
              <circle cx="114" cy="68" r="8" fill="#0284C7" />
              <circle cx="116" cy="66" r="3" fill="#FFF" opacity="0.85" />
              {/* Active Recording Dot */}
              <circle cx="114" cy="44" r="2.5" fill={isOn ? "#EF4444" : "#64748B"} style={{ filter: isOn ? "drop-shadow(0 0 4px #EF4444)" : undefined }} />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
