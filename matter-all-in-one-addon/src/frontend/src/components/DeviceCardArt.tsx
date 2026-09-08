import React from "react";
import { rgbToHex } from "../utils/colors";
import { APPLE_HOMEPOD_COLORS } from "../utils/deviceDetector";

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
  appleColor?: string;
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
  appleColor = "space_gray",
}) => {
  const isFanActive = propFanOn ?? (domain === "fan" && (state === "on" || (fanPercentage ?? 0) > 0));
  const effectiveFanPct = fanPercentage ?? (isFanActive ? 100 : 0);
  const fanDurationSec = isFanActive
    ? Math.max(0.18, Math.min(2.4, (100 / Math.max(10, effectiveFanPct)) * 0.55))
    : 0;

  const [lr, lg, lb] = lightRgb;
  const lightHex = rgbToHex([lr, lg, lb]);

  const isMediaActive = state === "playing" || state === "paused";
  const isOn =
    state === "on" ||
    state === "heat" ||
    state === "cool" ||
    state === "open" ||
    state === "unlocked" ||
    state === "cleaning" ||
    isMediaActive ||
    isFanActive ||
    isLightOn;

  const entityPicture = attributes?.entity_picture;

  // Resolve active visual archetype
  let visualType = subtype;
  if (visualType === "generic") {
    if (domain === "media_player") visualType = "apple_tv";
    else if (domain === "fan") visualType = "ceiling_fan";
    else if (domain === "light") visualType = "bulb";
    else if (domain === "climate") visualType = "thermostat";
    else if (domain === "vacuum") visualType = "vacuum";
    else if (domain === "lock") visualType = "keypad_deadbolt";
    else if (domain === "cover") visualType = "cover";
    else if (domain === "switch") visualType = "plug";
    else if (domain === "camera") visualType = "doorbell";
  }

  // Official HomePod Apple Color Resolution
  const miniColorConfig =
    APPLE_HOMEPOD_COLORS.homepod_mini[appleColor] || APPLE_HOMEPOD_COLORS.homepod_mini.space_gray;
  const standardColorConfig =
    APPLE_HOMEPOD_COLORS.homepod[appleColor] || APPLE_HOMEPOD_COLORS.homepod.midnight;

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
      {/* 1. Volumetric Light Illumination (Baña físicamente la tarjeta) */}
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

      {/* 2. Apple TV Cinematic Dark Gradient: La mitad inferior se degrada suavemente a negro OLED */}
      {visualType === "apple_tv" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(15, 23, 42, 0.4) 0%, rgba(5, 8, 15, 0.75) 45%, #000000 100%)",
            pointerEvents: "none",
          }}
        />
      )}

      {/* 3. Vector Artwork Canvas */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: visualType === "apple_tv" || visualType === "chandelier" ? "100%" : "230px",
          height: "100%",
          opacity: isOn ? 0.96 : 0.45,
          transition: "opacity 0.6s ease",
          maskImage:
            visualType === "apple_tv"
              ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 60%, transparent 100%)"
              : visualType === "chandelier"
              ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 70%, transparent 100%)"
              : "linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 60%, transparent 98%)",
          WebkitMaskImage:
            visualType === "apple_tv"
              ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 60%, transparent 100%)"
              : visualType === "chandelier"
              ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.9) 70%, transparent 100%)"
              : "linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 60%, transparent 98%)",
        }}
      >
        <svg
          viewBox={visualType === "apple_tv" || visualType === "chandelier" ? "0 0 280 140" : "0 0 160 140"}
          width="100%"
          height="100%"
          preserveAspectRatio={visualType === "apple_tv" ? "xMidYMid slice" : "xMaxYMid meet"}
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

            {/* Pedestal Stand Gradient (Matte Black / Obsidian) */}
            <linearGradient id="pedestalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#252A34" />
              <stop offset="100%" stopColor="#111317" />
            </linearGradient>

            {/* Tower Body Gradient (Sleek Matte Black / Obsidian) */}
            <linearGradient id="towerChassisGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#111318" />
              <stop offset="35%" stopColor="#222733" />
              <stop offset="70%" stopColor="#1A1F29" />
              <stop offset="100%" stopColor="#0D0E13" />
            </linearGradient>

            {/* Dynamic Breeze Wave Gradient */}
            <linearGradient id="breezeGrad" x1="100%" y1="0%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#007AFF" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
            </linearGradient>

            {/* Siri Rainbow Fluid Gradient for HomePod Touch Disc */}
            <linearGradient id="siriWaveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00F0FF" />
              <stop offset="35%" stopColor="#AF52DE" />
              <stop offset="70%" stopColor="#FF2D55" />
              <stop offset="100%" stopColor="#FF9500" />
            </linearGradient>

            {/* LED Neon Strip Gradient */}
            <linearGradient id="neonStripGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={isLightOn ? lightHex : "#334155"} />
              <stop offset="50%" stopColor={isLightOn ? "#00F0FF" : "#475569"} />
              <stop offset="100%" stopColor={isLightOn ? "#AF52DE" : "#1E293B"} />
            </linearGradient>
          </defs>

          {/* ── 1. APPLE TV 4K CON PANTALLA 16:9 Y DEGRADADO A NEGRO ── */}
          {visualType === "apple_tv" && (
            <g className="art-apple-tv">
              {/* 16:9 TV Screen Bezel */}
              <rect x="50" y="8" width="180" height="98" rx="6" fill="#0A0D14" stroke="#2D3748" strokeWidth="2" />
              {/* Screen Inner Display */}
              <rect x="53" y="11" width="174" height="92" rx="4" fill="#04060A" />

              {/* Contenido en Vivo: Si hay carátula de Home Assistant se muestra dentro de la TV */}
              {entityPicture ? (
                <image
                  href={entityPicture}
                  x="53"
                  y="11"
                  width="174"
                  height="92"
                  preserveAspectRatio="xMidYMid slice"
                  opacity={isMediaActive ? 0.95 : 0.4}
                />
              ) : (
                <g opacity={isMediaActive ? 0.9 : 0.3}>
                  {/* Apple TV Cinematic Glow */}
                  <rect x="53" y="11" width="174" height="92" fill="url(#siriWaveGrad)" opacity="0.18" />
                  {/* Apple Logo Silhouette in Center of Screen */}
                  <path
                    d="M138 52 C138 48 141 45 143 43 C141 40 137 38 133 38 C128 38 126 40 123 40 C120 40 117 38 113 38 C107 38 102 43 102 51 C102 61 113 75 119 75 C122 75 124 73 127 73 C130 73 132 75 136 75 C142 75 147 67 149 63 C143 60 138 56 138 52 Z M130 36 C132 33 134 29 133 26 C130 26 126 28 124 31 C122 34 121 37 122 40 C126 40 129 38 130 36 Z"
                    fill="#FFFFFF"
                    transform="scale(0.55) translate(100, 15)"
                    opacity="0.8"
                  />
                  <text x="140" y="78" textAnchor="middle" fill="#94A3B8" fontSize="8" fontWeight="600" letterSpacing="0.1em">
                    {attributes?.app_name || (isMediaActive ? "REPRODUCIENDO" : "APPLE TV 4K")}
                  </text>
                </g>
              )}

              {/* TV Metallic Stand Base */}
              <rect x="126" y="106" width="28" height="6" rx="2" fill="#4B5563" />
              <rect x="115" y="112" width="50" height="3" rx="1.5" fill="#374151" />

              {/* Physical Apple TV Puck Unit (Black box on table) */}
              <rect x="195" y="104" width="32" height="14" rx="4" fill="#0A0B0E" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />
              {/* Apple TV White Status Power LED */}
              <circle cx="211" cy="114" r="1.4" fill={isMediaActive ? "#FFFFFF" : "#64748B"} style={{ filter: isMediaActive ? "drop-shadow(0 0 4px #FFF)" : undefined }} />
            </g>
          )}

          {/* ── 2. APPLE HOMEPOD MINI (COLOR OFICIAL APPLE) ── */}
          {visualType === "homepod_mini" && (
            <g className="art-homepod-mini">
              {/* Spherical 3D Acoustic Mesh Body */}
              <circle cx="114" cy="74" r="40" fill={miniColorConfig.mesh} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
              {/* Acoustic Mesh Subtle Texture Highlight */}
              <ellipse cx="114" cy="74" rx="38" ry="37" fill={miniColorConfig.hex} opacity="0.35" />

              {/* Top Touch Glass Disc */}
              <ellipse cx="114" cy="38" rx="20" ry="7" fill={miniColorConfig.top} stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />

              {/* Glowing Siri Dynamic Rainbow Waveform (Gira cuando reproduce) */}
              {isMediaActive && (
                <ellipse
                  cx="114"
                  cy="38"
                  rx="14"
                  ry="5"
                  fill="url(#siriWaveGrad)"
                  style={{ filter: "drop-shadow(0 0 6px rgba(0, 240, 255, 0.8))" }}
                />
              )}

              {/* Acoustic Sound Waves when playing */}
              {isMediaActive && (
                <g opacity="0.75">
                  <path d="M64 74 C58 64 58 84 64 74" stroke={miniColorConfig.hex} strokeWidth="2" strokeLinecap="round" />
                  <path d="M54 74 C46 58 46 90 54 74" stroke={miniColorConfig.hex} strokeWidth="2.5" strokeLinecap="round" />
                </g>
              )}
            </g>
          )}

          {/* ── 3. APPLE HOMEPOD ESTÁNDAR (COLOR OFICIAL APPLE) ── */}
          {visualType === "homepod" && (
            <g className="art-homepod-standard">
              {/* Tall Cylindrical Mesh Acoustic Speaker */}
              <rect x="90" y="24" width="48" height="92" rx="20" fill={standardColorConfig.mesh} stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
              <rect x="92" y="26" width="44" height="88" rx="18" fill={standardColorConfig.hex} opacity="0.35" />

              {/* Top Touch Disc */}
              <ellipse cx="114" cy="28" rx="18" ry="6" fill={standardColorConfig.top} stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />

              {/* Siri Waveform */}
              {isMediaActive && (
                <ellipse
                  cx="114"
                  cy="28"
                  rx="12"
                  ry="4"
                  fill="url(#siriWaveGrad)"
                  style={{ filter: "drop-shadow(0 0 6px rgba(0, 240, 255, 0.8))" }}
                />
              )}
            </g>
          )}

          {/* ── 4. CANDELABRO ORNAMENTAL SUSPENDIDO DEL TECHO ── */}
          {visualType === "chandelier" && (
            <g className="art-chandelier">
              {/* Ceiling Rose Canopy & Hanging Metallic Chain */}
              <rect x="132" y="0" width="16" height="8" rx="2" fill="#B45309" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <line x1="140" y1="8" x2="140" y2="32" stroke="#D97706" strokeWidth="2.5" strokeDasharray="3 2" />

              {/* Central Baroque Spindle Body */}
              <path d="M136 32 L144 32 L142 54 L138 54 Z" fill="#92400E" />
              <circle cx="140" cy="54" r="6" fill="#B45309" stroke="#D97706" strokeWidth="1.2" />

              {/* Symmetrical Curved Ornate Arms */}
              <path d="M140 54 C120 54 104 42 104 36" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M140 54 C160 54 176 42 176 36" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M140 54 C116 58 84 46 84 38" fill="none" stroke="#B45309" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M140 54 C164 58 196 46 196 38" fill="none" stroke="#B45309" strokeWidth="2.2" strokeLinecap="round" />

              {/* Candle Cups & Candle Sleeves */}
              {[84, 104, 140, 176, 196].map((x, i) => (
                <g key={i}>
                  {/* Bobeche dish */}
                  <ellipse cx={x} cy={i === 2 ? 28 : 36} rx="6" ry="2.2" fill="#D97706" />
                  {/* Candle sleeve */}
                  <rect x={x - 2} y={i === 2 ? 18 : 26} width="4" height="10" fill="#FEF3C7" />
                  {/* Glowing Flame */}
                  <ellipse
                    cx={x}
                    cy={i === 2 ? 14 : 22}
                    rx="2.5"
                    ry="4.5"
                    fill={isLightOn ? lightHex : "#78350F"}
                    style={{ filter: isLightOn ? `drop-shadow(0 0 6px ${lightHex})` : undefined }}
                  />
                  {/* Hanging Crystal Teardrops */}
                  <line x1={x} y1={i === 2 ? 30 : 38} x2={x} y2={i === 2 ? 40 : 48} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                  <circle cx={x} cy={i === 2 ? 41 : 49} r="2" fill="rgba(255,255,255,0.7)" />
                </g>
              ))}

              {/* Bottom Crystal Finial Drop */}
              <circle cx="140" cy="64" r="3.5" fill="rgba(255,255,255,0.8)" stroke="#D97706" strokeWidth="1" />

              {/* Volumetric downward radiance cone */}
              {isLightOn && (
                <polygon
                  points="110,45 170,45 230,140 50,140"
                  fill="url(#lampConeGrad)"
                  style={{ mixBlendMode: "screen" }}
                />
              )}
            </g>
          )}

          {/* ── 5. VENTILADOR DE TECHO EN NEGRO MATE / OBSIDIAN ── */}
          {visualType === "ceiling_fan" && (
            <g className="art-ceiling-fan">
              {/* Ceiling Mount Canopy & Downrod (Negro Mate Obsidian) */}
              <path d="M106 0 L122 0 L118 12 L110 12 Z" fill="#14171E" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <line x1="114" y1="12" x2="114" y2="34" stroke="#1E2430" strokeWidth="3.5" />

              {/* Horizontal Aerodynamic Rotating Ceiling Blades (Elegante Negro Mate) */}
              <g
                className={`art-fan-blades ${isFanActive ? "spinning" : ""}`}
                style={{
                  transformOrigin: "114px 38px",
                  animation: isFanActive ? `fan-spin ${fanDurationSec}s linear infinite` : "none",
                }}
              >
                {/* 4 Blades in Matte Obsidian with subtle satin edges */}
                <path d="M114 38 C110 32 60 22 54 28 C48 34 100 42 114 38 Z" fill="#181D26" stroke="#2B3242" strokeWidth="1" />
                <path d="M114 38 C118 32 168 22 174 28 C180 34 128 42 114 38 Z" fill="#181D26" stroke="#2B3242" strokeWidth="1" />
                <path d="M114 38 C120 42 136 84 128 88 C120 92 112 50 114 38 Z" fill="#14171F" stroke="#2B3242" strokeWidth="1" />
                <path d="M114 38 C108 42 92 84 100 88 C108 92 116 50 114 38 Z" fill="#14171F" stroke="#2B3242" strokeWidth="1" />
              </g>

              {/* Center Frosted Glass Light Dome */}
              <ellipse
                cx="114"
                cy="44"
                rx="16"
                ry="10"
                fill={isLightOn ? lightHex : "#1E2430"}
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

          {/* ── 6. VENTILADOR DE TORRE EN NEGRO MATE (e.g. Govee H7133) ── */}
          {visualType === "tower_fan" && (
            <g className="art-tower-fan">
              <ellipse cx="118" cy="132" rx="26" ry="6" fill="#0E1015" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
              <rect x="104" y="14" width="28" height="116" rx="6" fill="url(#towerChassisGrad)" stroke={isFanActive ? "rgba(0, 240, 255, 0.4)" : "rgba(255,255,255,0.15)"} strokeWidth="1.5" />

              {/* Top Touch Panel */}
              <path d="M106 14 L130 14 L128 24 L108 24 Z" fill="#0A0B0E" />
              <circle cx="118" cy="19" r="2.2" fill={isFanActive ? "#00F0FF" : "#64748B"} style={{ filter: isFanActive ? "drop-shadow(0 0 4px #00F0FF)" : undefined }} />

              {/* Outlet Grille with Oscillating Vanes */}
              <rect x="110" y="28" width="16" height="92" rx="3" fill="#07080C" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
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

              {/* Breeze Waves */}
              {isFanActive && (
                <g className="airflow-stream" style={{ opacity: Math.max(0.4, effectiveFanPct / 100) }}>
                  <path d="M98 42 C76 40 58 46 36 42" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.8" strokeLinecap="round" className="breeze-line-1" />
                  <path d="M94 65 C68 62 48 70 24 66" fill="none" stroke="url(#breezeGrad)" strokeWidth="3.4" strokeLinecap="round" className="breeze-line-2" />
                  <path d="M98 88 C74 86 54 92 34 88" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.5" strokeLinecap="round" className="breeze-line-3" />
                </g>
              )}
            </g>
          )}

          {/* ── 7. LÁMPARA DE ESQUINA GOVEE LYRA / AURA (`govee_lyra` o `floor_lamp`) ── */}
          {(visualType === "govee_lyra" || visualType === "floor_lamp") && (
            <g className="art-govee-lyra">
              {/* Corner Wall Light Glow */}
              {isLightOn && (
                <ellipse
                  cx="142"
                  cy="70"
                  rx="30"
                  ry="60"
                  fill={lightHex}
                  opacity={0.35 * lightBrightness}
                  style={{ filter: "blur(12px)" }}
                />
              )}
              {/* Weighted Circular Floor Base */}
              <ellipse cx="142" cy="132" rx="16" ry="4.5" fill="#1F2430" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              {/* Ultra-Slim Minimalist Vertical Light Bar */}
              <rect x="140" y="16" width="4" height="116" rx="2" fill={isLightOn ? lightHex : "#333A48"} style={{ filter: isLightOn ? `drop-shadow(0 0 8px ${lightHex})` : undefined }} />
            </g>
          )}

          {/* ── 8. GOVEE DREAMVIEW TV / BARRAS DE LUZ (`govee_dreamview`) ── */}
          {visualType === "govee_dreamview" && (
            <g className="art-govee-dreamview">
              {/* TV Screen with Camera on top */}
              <rect x="74" y="24" width="76" height="48" rx="4" fill="#0F131A" stroke="#2B3242" strokeWidth="1.5" />
              {/* Top Camera */}
              <rect x="108" y="18" width="8" height="6" rx="2" fill="#1F2430" />
              <circle cx="112" cy="21" r="1.5" fill="#00F0FF" />
              {/* Dual Symmetrical Backlight Lightbars */}
              <rect x="62" y="26" width="4" height="44" rx="2" fill={isLightOn ? lightHex : "#475569"} style={{ filter: isLightOn ? `drop-shadow(0 0 10px ${lightHex})` : undefined }} />
              <rect x="158" y="26" width="4" height="44" rx="2" fill={isLightOn ? lightHex : "#475569"} style={{ filter: isLightOn ? `drop-shadow(0 0 10px ${lightHex})` : undefined }} />
            </g>
          )}

          {/* ── 9. TIMBRE CON VIDEO (DOORBELL e.g. Ring / Nest) ── */}
          {visualType === "doorbell" && (
            <g className="art-doorbell">
              {/* Vertical Slim Doorbell Body */}
              <rect x="98" y="20" width="34" height="96" rx="10" fill="#181D26" stroke="rgba(255,255,255,0.2)" strokeWidth="1.8" />
              {/* Top Fisheye Camera Lens */}
              <circle cx="115" cy="42" r="10" fill="#090B0F" stroke="#38BDF8" strokeWidth="1.5" />
              <circle cx="115" cy="42" r="4.5" fill="#0284C7" />
              <circle cx="117" cy="40" r="1.8" fill="#FFF" opacity="0.9" />

              {/* Center Intercom Mic Grille */}
              <line x1="110" y1="62" x2="120" y2="62" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="112" y1="66" x2="118" y2="66" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round" />

              {/* Illuminated Push Chime Button */}
              <circle
                cx="115"
                cy="88"
                r="11"
                fill="none"
                stroke={isOn ? "#007AFF" : "rgba(255,255,255,0.3)"}
                strokeWidth="2.5"
                style={{ filter: isOn ? "drop-shadow(0 0 8px #007AFF)" : undefined }}
              />
              <circle cx="115" cy="88" r="7" fill={isOn ? "#007AFF" : "#2B3242"} />
            </g>
          )}

          {/* ── 10. CÁMARA DOMO PTZ 360 (`ptz_camera`, e.g. Tapo C200) ── */}
          {visualType === "ptz_camera" && (
            <g className="art-ptz-camera">
              {/* Swivel Mount Base */}
              <rect x="94" y="96" width="40" height="20" rx="6" fill="#1E2430" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
              {/* Spherical Motorized Camera Head */}
              <circle cx="114" cy="62" r="28" fill="#121620" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
              {/* Glass Lens Element */}
              <circle cx="114" cy="62" r="14" fill="#0A0D14" stroke="#007AFF" strokeWidth="1.8" />
              <circle cx="114" cy="62" r="6" fill="#0284C7" />
              <circle cx="116" cy="60" r="2" fill="#FFF" />
              {/* Status Indicator LED */}
              <circle cx="114" cy="42" r="2" fill={isOn ? "#34C759" : "#64748B"} style={{ filter: isOn ? "drop-shadow(0 0 4px #34C759)" : undefined }} />
            </g>
          )}

          {/* ── 11. CERRADURA CON TECLADO TÁCTIL (YALE DEADBOLT) ── */}
          {visualType === "keypad_deadbolt" && (
            <g className="art-keypad-deadbolt">
              {/* Escutcheon Plate */}
              <rect x="96" y="22" width="42" height="96" rx="8" fill="#1A1F2C" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              {/* Backlit Touch Keypad Matrix */}
              <rect x="101" y="28" width="32" height="42" rx="4" fill="#0C0E14" />
              {[
                [107, 36], [117, 36], [127, 36],
                [107, 46], [117, 46], [127, 46],
                [107, 56], [117, 56], [127, 56],
                [117, 65],
              ].map(([kx, ky], idx) => (
                <circle key={idx} cx={kx} cy={ky} r="1.8" fill={state === "locked" ? "#34C759" : "#FFF"} opacity="0.85" />
              ))}
              {/* Keyed Cylinder / Thumbturn */}
              <circle cx="117" cy="88" r="10" fill="#2E3544" stroke={state === "locked" ? "#34C759" : "#EF4444"} strokeWidth="2" />
              <circle cx="117" cy="88" r="2" fill="#FFF" />
            </g>
          )}

          {/* ── 12. CERROJO DE GIRO INTERIOR (AUGUST / SWITCHBOT LOCK) ── */}
          {visualType === "smart_turn_lock" && (
            <g className="art-turn-lock">
              <rect x="92" y="32" width="48" height="76" rx="10" fill="#1C212E" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
              <circle cx="116" cy="70" r="18" fill="#2A3144" stroke={state === "locked" ? "#34C759" : "#EF4444"} strokeWidth="2.5" />
              <line
                x1="116"
                y1="60"
                x2="116"
                y2="80"
                stroke={state === "locked" ? "#34C759" : "#EF4444"}
                strokeWidth="4"
                strokeLinecap="round"
                transform={state === "locked" ? "rotate(0 116 70)" : "rotate(90 116 70)"}
              />
            </g>
          )}

          {/* ── 13. BOMBILLA INTELIGENTE ESTÁNDAR ── */}
          {visualType === "bulb" && (
            <g className="art-smart-bulb">
              <line x1="120" y1="0" x2="120" y2="22" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
              <rect x="113" y="22" width="14" height="12" rx="2" fill="#4B5563" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <line x1="113" y1="26" x2="127" y2="26" stroke="#9CA3AF" strokeWidth="1.2" />
              <line x1="113" y1="30" x2="127" y2="30" stroke="#9CA3AF" strokeWidth="1.2" />

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

              {isLightOn && (
                <path d="M116 54 L120 46 L124 54" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
              )}

              {isLightOn && (
                <polygon
                  points="106,75 134,75 160,140 80,140"
                  fill="url(#lampConeGrad)"
                  style={{ mixBlendMode: "screen" }}
                />
              )}
            </g>
          )}

          {/* ── 14. TIRA LED RGBIC / NEÓN ── */}
          {visualType === "led_strip" && (
            <g className="art-led-strip">
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
              <path
                d="M60 120 C85 85 95 105 125 65 C145 35 125 15 155 12"
                fill="none"
                stroke="url(#neonStripGrad)"
                strokeWidth="6.5"
                strokeLinecap="round"
              />
              {[
                [60, 120], [80, 96], [105, 92], [125, 65], [136, 42], [142, 22], [155, 12],
              ].map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="3.5" fill={isLightOn ? "#FFF" : "#64748B"} opacity={isLightOn ? 0.9 : 0.4} />
              ))}
            </g>
          )}

          {/* ── 15. ASPIRADORA ROBOT ── */}
          {visualType === "vacuum" && (
            <g className="art-robot-vacuum">
              <circle cx="114" cy="70" r="38" fill="#1A1F2C" stroke={isOn ? "#E11D48" : "rgba(255,255,255,0.2)"} strokeWidth="2.2" />
              <path d="M 80 54 A 38 38 0 0 1 148 54" fill="none" stroke={isOn ? "#FB7185" : "rgba(255,255,255,0.15)"} strokeWidth="3" strokeLinecap="round" />
              <circle cx="114" cy="70" r="13" fill="#262D3D" stroke={isOn ? "#E11D48" : "#475569"} strokeWidth="1.6" />
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
              <circle cx="114" cy="70" r="4.5" fill={isOn ? "#E11D48" : "#475569"} />
            </g>
          )}

          {/* ── 16. TERMOSTATO / CLIMA ── */}
          {visualType === "thermostat" && (
            <g className="art-thermostat">
              <circle cx="114" cy="68" r="38" fill="#121620" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
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
              <circle cx="114" cy="68" r="28" fill="#1E2433" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <text x="114" y="74" textAnchor="middle" fill="#F8FAFC" fontSize="18" fontWeight="750" fontFamily="system-ui, sans-serif">
                {typeof attributes.current_temperature === "number" ? `${attributes.current_temperature}°` : "AC"}
              </text>
            </g>
          )}

          {/* ── 17. ENCHUFE INTELIGENTE ── */}
          {visualType === "plug" && (
            <g className="art-smart-plug">
              <rect x="88" y="38" width="52" height="64" rx="14" fill="#1A1F2C" stroke="rgba(255,255,255,0.15)" strokeWidth="1.8" />
              <circle
                cx="114"
                cy="70"
                r="18"
                fill={isOn ? "rgba(48, 209, 88, 0.12)" : "rgba(255,255,255,0.04)"}
                stroke={isOn ? "#30D158" : "rgba(255,255,255,0.2)"}
                strokeWidth="2.2"
                style={{ filter: isOn ? "drop-shadow(0 0 8px rgba(48, 209, 88, 0.5))" : undefined }}
              />
              <circle cx="114" cy="62" r="2.2" fill={isOn ? "#30D158" : "#64748B"} />
              <rect x="106" y="68" width="3" height="8" rx="1.2" fill={isOn ? "#FFFFFF" : "#64748B"} />
              <rect x="119" y="68" width="3" height="8" rx="1.2" fill={isOn ? "#FFFFFF" : "#64748B"} />
            </g>
          )}

          {/* ── 18. PERSIANA / CORTINA ── */}
          {visualType === "cover" && (
            <g className="art-cover-fixture">
              <rect x="85" y="15" width="62" height="110" rx="4" fill="rgba(15, 20, 30, 0.6)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.6" />
              <line x1="88" y1="28" x2="144" y2="28" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="42" x2="144" y2="42" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="56" x2="144" y2="56" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
              <line x1="88" y1="70" x2="144" y2="70" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
