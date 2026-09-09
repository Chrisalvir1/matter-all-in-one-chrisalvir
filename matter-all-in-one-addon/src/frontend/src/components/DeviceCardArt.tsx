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
  isHeating?: boolean;
  orientation?: "vertical" | "horizontal";
  /** When true, real product CDN image is displayed — skip SVG art to avoid double rendering */
  hasProductImage?: boolean;
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
  isHeating = false,
  orientation = "vertical",
  hasProductImage = false,
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

  const isRusticWoodFan =
    model.toLowerCase().includes("fanlamp") ||
    brand.toLowerCase().includes("fanlamp") ||
    model.toLowerCase().includes("pro_v3") ||
    subtype === "wood_fan" ||
    subtype === "rustic_fan";

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

      {/* 3. Chandelier (Suspended directly from card ceiling at top: 0, y = 0) */}
      {visualType === "chandelier" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "125px",
            overflow: "hidden",
            pointerEvents: "none",
            zIndex: 1,
            opacity: isOn ? 0.98 : 0.45,
            transition: "opacity 0.5s ease",
            maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 75%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 75%, transparent 100%)",
          }}
        >
          <svg
            viewBox="0 0 280 125"
            width="100%"
            height="125"
            preserveAspectRatio="xMidYMin meet"
          >
            <defs>
              <radialGradient id="chandelierLightCone" cx="50%" cy="0%" r="90%">
                <stop offset="0%" stopColor={`rgb(${lr}, ${lg}, ${lb})`} stopOpacity={isLightOn ? 0.65 * lightBrightness : 0.05} />
                <stop offset="60%" stopColor={`rgb(${lr}, ${lg}, ${lb})`} stopOpacity={isLightOn ? 0.22 * lightBrightness : 0} />
                <stop offset="100%" stopColor="#0B0D13" stopOpacity="0" />
              </radialGradient>
            </defs>
            <g className="art-chandelier">
              {/* Ceiling Rose Canopy at y = 0 */}
              <rect x="131" y="0" width="18" height="6" rx="2" fill="#D97706" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              {/* Interlinked Chain */}
              <ellipse cx="140" cy="9" rx="2.5" ry="4" fill="none" stroke="#F59E0B" strokeWidth="1.8" />
              <ellipse cx="140" cy="16" rx="2.5" ry="4" fill="none" stroke="#F59E0B" strokeWidth="1.8" />
              <ellipse cx="140" cy="23" rx="2.5" ry="4" fill="none" stroke="#F59E0B" strokeWidth="1.8" />
              {/* Central Baroque Spindle Body */}
              <path d="M136 28 L144 28 L142 46 L138 46 Z" fill="#B45309" stroke="#F59E0B" strokeWidth="1" />
              <circle cx="140" cy="46" r="6.5" fill="#D97706" stroke="#FEF3C7" strokeWidth="1.2" />

              {/* Symmetrical Curved Ornate Arms */}
              <path d="M140 46 C120 46 104 36 104 30" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M140 46 C160 46 176 36 176 30" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M140 46 C116 50 82 40 82 32" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M140 46 C164 50 198 40 198 32" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" />

              {/* Candle Sleeves, Flames & Crystal Drops */}
              {[82, 104, 140, 176, 198].map((x, i) => (
                <g key={i}>
                  <ellipse cx={x} cy={i === 2 ? 22 : 30} rx="6" ry="2.2" fill="#D97706" />
                  <rect x={x - 2} y={i === 2 ? 12 : 20} width="4" height="10" rx="1" fill="#FEF3C7" />
                  <ellipse
                    cx={x}
                    cy={i === 2 ? 8 : 16}
                    rx="2.5"
                    ry="4.5"
                    fill={isLightOn ? lightHex : "#D97706"}
                    style={{ filter: isLightOn ? `drop-shadow(0 0 6px ${lightHex})` : undefined }}
                  />
                  <line x1={x} y1={i === 2 ? 24 : 32} x2={x} y2={i === 2 ? 34 : 42} stroke="rgba(255,255,255,0.6)" strokeWidth="1" strokeDasharray="1.5 1.5" />
                  <polygon
                    points={`${x},${i === 2 ? 34 : 42} ${x - 3},${i === 2 ? 40 : 48} ${x},${i === 2 ? 46 : 54} ${x + 3},${i === 2 ? 40 : 48}`}
                    fill="rgba(255,255,255,0.85)"
                    stroke="#BAE6FD"
                    strokeWidth="0.8"
                  />
                </g>
              ))}

              {/* Bottom Crystal Finial Drop */}
              <circle cx="140" cy="56" r="4" fill="rgba(255,255,255,0.9)" stroke="#F59E0B" strokeWidth="1" />

              {/* Downward radiance cone */}
              {isLightOn && (
                <polygon
                  points="110,40 170,40 240,125 40,125"
                  fill="url(#chandelierLightCone)"
                  style={{ mixBlendMode: "screen" }}
                />
              )}
            </g>
          </svg>
        </div>
      )}

      {/* 4. Main Right-Aligned Vector Artwork Canvas — skipped when real product image present */}
      {visualType !== "chandelier" && !hasProductImage && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "220px",
            height: "190px",
            opacity: isOn ? 0.96 : 0.45,
            transition: "opacity 0.6s ease",
            pointerEvents: "none",
            maskImage:
              visualType === "apple_tv"
                ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 65%, transparent 100%)"
                : "linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 60%, transparent 98%)",
            WebkitMaskImage:
              visualType === "apple_tv"
                ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 65%, transparent 100%)"
                : "linear-gradient(to left, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 60%, transparent 98%)",
          }}
        >
          <svg
            viewBox="0 0 160 140"
            width="100%"
            height="100%"
            preserveAspectRatio="xMaxYMin meet"
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

              {/* Dynamic Breeze Wave Gradient (Modo Ambiente: Cyan / Azul) */}
              <linearGradient id="breezeGrad" x1="100%" y1="0%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#007AFF" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#00F0FF" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
              </linearGradient>

              {/* Dynamic Heat Wave Gradient (Modo Calentador: Naranja Fuego + Azul Térmico) */}
              <linearGradient id="heatBreezeGrad" x1="100%" y1="0%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#FF3B00" stopOpacity="0.9" />
                <stop offset="35%" stopColor="#FF8C00" stopOpacity="0.8" />
                <stop offset="70%" stopColor="#38BDF8" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#FF4500" stopOpacity="0" />
              </linearGradient>

              {/* Upward Airflow Gradients (Horizontal Laying-Down Mode) */}
              <linearGradient id="breezeUpGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#007AFF" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#00F0FF" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
              </linearGradient>

              <linearGradient id="heatBreezeUpGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#FF3B00" stopOpacity="0.9" />
                <stop offset="35%" stopColor="#FF8C00" stopOpacity="0.8" />
                <stop offset="70%" stopColor="#38BDF8" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#FF4500" stopOpacity="0" />
              </linearGradient>

              {/* Ceramic Heating Grille Vanes Gradient */}
              <linearGradient id="heatVaneGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FF4500" />
                <stop offset="50%" stopColor="#FFA500" />
                <stop offset="100%" stopColor="#FF3B00" />
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

              {/* Apple HomePod Mini 3D Diamond-Woven Acoustic Fabric Mesh */}
              <pattern id="homepodAcousticMesh" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="4" height="4" fill={miniColorConfig.mesh} />
                <path d="M 0 2 L 2 0 L 4 2 L 2 4 Z" fill={miniColorConfig.hex} opacity="0.65" />
                <line x1="0" y1="0" x2="4" y2="4" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
                <line x1="4" y1="0" x2="0" y2="4" stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />
              </pattern>

              {/* Spherical PBR Volumetric Light Falloff for HomePod */}
              <radialGradient id="homepodSpherePBR" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.45" />
                <stop offset="45%" stopColor={miniColorConfig.hex} stopOpacity="0.15" />
                <stop offset="80%" stopColor="#000000" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
              </radialGradient>

              {/* HomePod Ground Contact Shadow */}
              <radialGradient id="homepodGroundShadow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#000000" stopOpacity="0.75" />
                <stop offset="60%" stopColor="#000000" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0" />
              </radialGradient>

              {/* Dark Rustic Walnut Wood Grain Gradient for Recámara 5-Blade Fan */}
              <linearGradient id="walnutWoodGrad" x1="0%" y1="0%" x2="100%" y2="20%">
                <stop offset="0%" stopColor="#2A170C" />
                <stop offset="15%" stopColor="#3E2313" />
                <stop offset="35%" stopColor="#4F2E1A" />
                <stop offset="55%" stopColor="#381E10" />
                <stop offset="75%" stopColor="#4A2B18" />
                <stop offset="90%" stopColor="#2E190E" />
                <stop offset="100%" stopColor="#22120A" />
              </linearGradient>

              {/* Matte Carbon / Black Metal Gradient for Sala Modern Fan */}
              <linearGradient id="matteObsidianGrad" x1="0%" y1="0%" x2="100%" y2="25%">
                <stop offset="0%" stopColor="#1E232B" />
                <stop offset="30%" stopColor="#14171E" />
                <stop offset="70%" stopColor="#252A34" />
                <stop offset="100%" stopColor="#0E1015" />
              </linearGradient>

              {/* Vertical Ribbed Engine Cooling Fins Pattern */}
              <pattern id="finnedMotorPattern" width="4" height="14" patternUnits="userSpaceOnUse">
                <rect width="2.2" height="14" fill="#252A34" />
                <rect x="2.2" width="1.8" height="14" fill="#0E1117" />
              </pattern>
            </defs>

            {/* ── 1. APPLE TV 4K REAL HARDWARE (PUCK + REMOTE + 16:9 SCREEN) ── */}
            {visualType === "apple_tv" && (
              <g className="art-apple-tv">
                {/* 16:9 Screen in background */}
                <rect x="25" y="10" width="125" height="70" rx="5" fill="#0A0D14" stroke="#2D3748" strokeWidth="1.5" />
                <rect x="27" y="12" width="121" height="66" rx="3.5" fill="#04060A" />

                {/* Screen Content: Poster / Video or Apple TV Aerial Gradient */}
                {entityPicture ? (
                  <image
                    href={entityPicture}
                    x="27"
                    y="12"
                    width="121"
                    height="66"
                    preserveAspectRatio="xMidYMid slice"
                    opacity={isMediaActive ? 0.95 : 0.4}
                  />
                ) : (
                  <g opacity={isMediaActive ? 0.9 : 0.35}>
                    <rect x="27" y="12" width="121" height="66" fill="url(#siriWaveGrad)" opacity="0.15" />
                    {/* Apple Logo in Screen Center */}
                    <path
                      d="M138 52 C138 48 141 45 143 43 C141 40 137 38 133 38 C128 38 126 40 123 40 C120 40 117 38 113 38 C107 38 102 43 102 51 C102 61 113 75 119 75 C122 75 124 73 127 73 C130 73 132 75 136 75 C142 75 147 67 149 63 C143 60 138 56 138 52 Z M130 36 C132 33 134 29 133 26 C130 26 126 28 124 31 C122 34 121 37 122 40 C126 40 129 38 130 36 Z"
                      fill="#FFFFFF"
                      transform="scale(0.35) translate(195, 75)"
                      opacity="0.85"
                    />
                  </g>
                )}

                {/* Glass specular screen reflection */}
                <polygon points="27,12 85,12 45,78 27,78" fill="rgba(255,255,255,0.06)" />

                {/* Real Apple TV 4K Hardware Unit (Obsidian Puck) */}
                <rect x="52" y="86" width="46" height="20" rx="6" fill="#10131A" stroke="#252A36" strokeWidth="1.4" />
                <rect x="54" y="87.5" width="42" height="17" rx="4.5" fill="#181D26" />
                {/* Apple TV logo on puck */}
                <path
                  d="M138 52 C138 48 141 45 143 43 C141 40 137 38 133 38 C128 38 126 40 123 40 C120 40 117 38 113 38 C107 38 102 43 102 51 C102 61 113 75 119 75 C122 75 124 73 127 73 C130 73 132 75 136 75 C142 75 147 67 149 63 C143 60 138 56 138 52 Z M130 36 C132 33 134 29 133 26 C130 26 126 28 124 31 C122 34 121 37 122 40 C126 40 129 38 130 36 Z"
                  fill="#374151"
                  transform="scale(0.18) translate(370, 480)"
                />
                <text x="82" y="99" fill="#4B5563" fontSize="5" fontWeight="700">tv</text>
                {/* Pinpoint White Status Power LED */}
                <circle cx="75" cy="103" r="1.3" fill={isMediaActive ? "#FFFFFF" : "#64748B"} style={{ filter: isMediaActive ? "drop-shadow(0 0 3px #FFF)" : undefined }} />

                {/* Siri Remote in Silver Aluminum */}
                <rect x="110" y="80" width="16" height="42" rx="4" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1" />
                <circle cx="118" cy="90" r="5" fill="#1E293B" />
                <circle cx="118" cy="90" r="2.2" fill="#0F172A" />
                <rect x="114" y="98" width="3" height="3" rx="0.8" fill="#475569" />
                <rect x="119" y="98" width="3" height="3" rx="0.8" fill="#475569" />
                <rect x="114" y="103" width="3" height="3" rx="0.8" fill="#475569" />
                <rect x="119" y="103" width="3" height="6" rx="0.8" fill="#475569" />
              </g>
            )}

          {/* ── 2. APPLE HOMEPOD MINI (HIPERREALISTA MULTICAPA 2.5D DE ESTUDIO) ── */}
          {visualType === "homepod_mini" && (
            <g className="art-homepod-mini">
              {/* Capa 1: Sombra de contacto suave en base de estudio */}
              <ellipse cx="114" cy="115" rx="36" ry="8" fill="url(#homepodGroundShadow)" />

              {/* Capa 2: Cuerpo Esférico con Malla Acústica Tejida Apple en 3D */}
              <circle cx="114" cy="74" r="41" fill={miniColorConfig.mesh} />
              <circle cx="114" cy="74" r="41" fill="url(#homepodAcousticMesh)" />

              {/* Capa 3: Sombreado Esférico PBR y Volumen Lumínico */}
              <circle cx="114" cy="74" r="41" fill="url(#homepodSpherePBR)" style={{ mixBlendMode: "multiply" }} />
              <circle cx="114" cy="74" r="41" fill="url(#homepodSpherePBR)" opacity="0.35" />

              {/* Capa 4: Disco Táctil Superior de Cristal Apple con Bisel Pulido */}
              <ellipse cx="114" cy="38" rx="22" ry="7.5" fill="#0A0B0E" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              <ellipse cx="114" cy="38" rx="20.5" ry="6.5" fill={miniColorConfig.top} />
              {/* Reflejo especular en el cristal superior */}
              <path d="M102 36 C106 34 122 34 126 36 C122 37 106 37 102 36 Z" fill="rgba(255,255,255,0.4)" />

              {/* Capa 5: Siri Dynamic Rainbow Waveform (Brilla e irradia cuando reproduce) */}
              {isMediaActive && (
                <g>
                  <ellipse
                    cx="114"
                    cy="38"
                    rx="16"
                    ry="5.5"
                    fill="url(#siriWaveGrad)"
                    style={{ filter: "drop-shadow(0 0 8px rgba(0, 240, 255, 0.9))" }}
                  />
                  <ellipse cx="114" cy="38" rx="9" ry="3" fill="#FFFFFF" opacity="0.6" style={{ filter: "blur(1px)" }} />
                </g>
              )}

              {/* Ondas acústicas pulsantes */}
              {isMediaActive && (
                <g opacity="0.8">
                  <path d="M60 74 C54 62 54 86 60 74" stroke={miniColorConfig.hex} strokeWidth="2.5" strokeLinecap="round" />
                  <path d="M50 74 C42 56 42 92 50 74" stroke={miniColorConfig.hex} strokeWidth="3" strokeLinecap="round" />
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

          {/* ── 4. AMAZON ECHO DOT (ESFERA CON ANILLO CYAN ILUMINADO) ── */}
          {(visualType === "echo_dot" || visualType === "echo") && (
            <g className="art-echo-dot">
              {/* 3D Spherical Acoustic Fabric Body */}
              <circle cx="95" cy="70" r="38" fill="#1E2430" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
              <ellipse cx="95" cy="70" rx="36" ry="35" fill="#29303D" opacity="0.4" />

              {/* Signature Alexa Cyan/Blue Illuminated LED Ring at the base */}
              <ellipse
                cx="95"
                cy="104"
                rx="32"
                ry="6"
                fill="none"
                stroke={isMediaActive || isOn ? "#00CAFF" : "rgba(0, 202, 255, 0.3)"}
                strokeWidth="2.5"
                style={{
                  filter: isMediaActive || isOn ? "drop-shadow(0 0 8px #00CAFF) drop-shadow(0 2px 12px #007AFF)" : "none",
                }}
              />
              {/* Table reflection glow */}
              {(isMediaActive || isOn) && (
                <ellipse cx="95" cy="110" rx="38" ry="7" fill="#00CAFF" opacity="0.25" style={{ filter: "blur(4px)" }} />
              )}

              {/* Top 4 Hardware Buttons (+, -, mute, action) */}
              <circle cx="85" cy="40" r="3" fill="#334155" />
              <text x="85" y="42" textAnchor="middle" fill="#CBD5E1" fontSize="5" fontWeight="700">+</text>
              <circle cx="105" cy="40" r="3" fill="#334155" />
              <text x="105" y="41.5" textAnchor="middle" fill="#CBD5E1" fontSize="6" fontWeight="700">-</text>
              <circle cx="95" cy="35" r="2.8" fill="#334155" />
              <circle cx="95" cy="45" r="2.8" fill="#334155" />
            </g>
          )}

          {/* ── 5. AMAZON ECHO SHOW (PANTALLA INTELIGENTE 16:9) ── */}
          {visualType === "echo_show" && (
            <g className="art-echo-show">
              {/* Fabric Wedge Body */}
              <polygon points="35,108 135,108 128,32 42,32" fill="#1E2430" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
              {/* Front 16:9 Display Frame */}
              <rect x="42" y="36" width="88" height="64" rx="4" fill="#0A0D14" stroke="#334155" strokeWidth="1.2" />
              <rect x="45" y="39" width="82" height="58" rx="2.5" fill="#04060A" />

              {/* Screen Content: Poster or Alexa Ambient UI */}
              {entityPicture ? (
                <image href={entityPicture} x="45" y="39" width="82" height="58" preserveAspectRatio="xMidYMid slice" opacity={isMediaActive ? 0.95 : 0.4} />
              ) : (
                <g opacity={isMediaActive ? 0.9 : 0.4}>
                  <rect x="45" y="39" width="82" height="58" fill="url(#siriWaveGrad)" opacity="0.12" />
                  <text x="86" y="66" textAnchor="middle" fill="#00CAFF" fontSize="11" fontWeight="700" fontFamily="sans-serif">
                    12:45
                  </text>
                  <text x="86" y="78" textAnchor="middle" fill="#94A3B8" fontSize="5.5" fontWeight="600">
                    {attributes?.app_name || "Alexa"}
                  </text>
                </g>
              )}

              {/* Camera Shutter on top */}
              <circle cx="86" cy="34" r="1.5" fill="#000" stroke="#64748B" strokeWidth="0.6" />
            </g>
          )}

          {/* ── 6. AMAZON ECHO STUDIO (ALTAVOZ ALTA FIDELIDAD) ── */}
          {visualType === "echo_studio" && (
            <g className="art-echo-studio">
              {/* Cylindrical Acoustic Mesh */}
              <rect x="68" y="24" width="56" height="88" rx="14" fill="#181D26" stroke="rgba(255,255,255,0.15)" strokeWidth="1.4" />
              {/* Horizontal Aperture Slot for Bass Reflex */}
              <rect x="74" y="82" width="44" height="12" rx="6" fill="#0A0D14" />
              <ellipse
                cx="96"
                cy="88"
                rx="20"
                ry="4"
                fill="none"
                stroke={isMediaActive ? "#00CAFF" : "#334155"}
                strokeWidth="1.5"
                style={{ filter: isMediaActive ? "drop-shadow(0 0 6px #00CAFF)" : "none" }}
              />
              {/* Top Light Ring */}
              <ellipse
                cx="96"
                cy="28"
                rx="22"
                ry="5"
                fill="none"
                stroke={isMediaActive ? "#00CAFF" : "rgba(255,255,255,0.2)"}
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* ── 7. AMAZON FIRE TV ── */}
          {visualType === "fire_tv" && (
            <g className="art-fire-tv">
              {/* Fire TV Streaming Stick */}
              <rect x="50" y="42" width="40" height="65" rx="5" fill="#14171F" stroke="#2D3748" strokeWidth="1.2" />
              <rect x="62" y="32" width="16" height="10" rx="1" fill="#94A3B8" />
              <path d="M60 74 Q70 80 80 74" fill="none" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" />
              {/* Alexa Voice Remote */}
              <rect x="100" y="34" width="18" height="76" rx="5" fill="#1E2430" stroke="#334155" strokeWidth="1.2" />
              <circle cx="109" cy="46" r="5" fill="#00CAFF" style={{ filter: "drop-shadow(0 0 4px #00CAFF)" }} />
              <circle cx="109" cy="62" r="5" fill="#0F172A" />
            </g>
          )}

          {/* ── 8. APAGADOR INTELIGENTE DE PARED (MULTI-GANG GLASS SWITCH) ── */}
          {visualType === "multi_gang_switch" && (
            <g className="art-multi-gang-switch">
              {/* Tempered Glass Wall Plate */}
              <rect x="52" y="22" width="68" height="96" rx="6" fill="#0E121A" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              {/* Glass Bevel Chamfer */}
              <rect x="55" y="25" width="62" height="90" rx="4" fill="#161B26" />
              {/* Specular Diagonal Glass Glare */}
              <polygon points="55,25 90,25 65,115 55,115" fill="rgba(255,255,255,0.05)" />

              {/* 3 Capacitive Touch Sensor Rings */}
              {[42, 70, 98].map((y, idx) => (
                <g key={idx}>
                  <circle
                    cx="86"
                    cy={y}
                    r="9"
                    fill="#0F141E"
                    stroke={isOn ? "#007AFF" : "rgba(255,255,255,0.25)"}
                    strokeWidth="1.6"
                    style={{ filter: isOn ? "drop-shadow(0 0 6px #007AFF)" : "none" }}
                  />
                  <circle
                    cx="86"
                    cy={y}
                    r="3"
                    fill={isOn ? "#38BDF8" : "#475569"}
                  />
                </g>
              ))}
            </g>
          )}

          {/* ── 5. VENTILADOR DE TECHO MULTICAPA DE ESTUDIO (5 ASPAS: SALA Y RECÁMARA) ── */}
          {visualType === "ceiling_fan" && (
            <g className="art-ceiling-fan">
              {/* Capa 1: Soporte Superior a Techo y Tija (Canopy & Downrod) */}
              <path d="M104 0 L124 0 L120 10 L108 10 Z" fill="#14171E" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <line x1="114" y1="10" x2="114" y2="30" stroke="#181D26" strokeWidth="4.5" strokeLinecap="square" />

              {/* Embellecedor y Carcasa Motor Cilíndrico de Estudio */}
              <rect x="98" y="28" width="32" height="18" rx="4" fill="#11141A" stroke="#252A34" strokeWidth="1.2" />
              {!isRusticWoodFan && (
                /* Aletas verticales acanaladas de refrigeración del motor de Sala (Foto 4) */
                <rect x="100" y="30" width="28" height="14" fill="url(#finnedMotorPattern)" />
              )}

              {/* Capa 2: Rotor de 5 Aspas Aerodinámicas con Rotación GPU 3D */}
              <g
                className={`art-fan-blades ${isFanActive ? "spinning" : ""}`}
                style={{
                  transformOrigin: "114px 44px",
                  animation: isFanActive ? `fan-spin ${fanDurationSec}s linear infinite` : "none",
                  filter: isFanActive && effectiveFanPct > 50 ? "blur(0.35px)" : "none",
                }}
              >
                {/* 5 Aspas distribuidas simétricamente a 72° (0°, 72°, 144°, 216°, 288°) */}
                {[0, 72, 144, 216, 288].map((angle, idx) => (
                  <g key={idx} transform={`rotate(${angle} 114 44)`}>
                    {isRusticWoodFan ? (
                      /* Aspa de Madera Nogal Oscuro con herraje negro (Foto 5 Recámara) */
                      <g>
                        {/* Herraje metálico negro curvado de fijación al motor (Blade Iron) */}
                        <path d="M112 44 L116 44 L117 56 L111 56 Z" fill="#0A0D12" stroke="#2A303C" strokeWidth="0.8" />
                        <circle cx="114" cy="54" r="1.2" fill="#4B5563" />
                        {/* Aspa de Nogal Veteado con punta redondeada y borde satinado */}
                        <path
                          d="M109 56 C107 58 102 104 105 108 C108 111 120 111 123 108 C126 104 121 58 119 56 Z"
                          fill="url(#walnutWoodGrad)"
                          stroke="#1A0F07"
                          strokeWidth="1"
                        />
                        {/* Veta sutil de madera nogal */}
                        <path d="M112 62 C110 75 111 95 113 105" stroke="rgba(0,0,0,0.35)" strokeWidth="1" fill="none" />
                        <path d="M116 64 C117 78 115 94 117 104" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" fill="none" />
                      </g>
                    ) : (
                      /* Aspa Aerodinámica Negro Mate Obsidiana (Foto 4 Sala) */
                      <g>
                        {/* Soporte de unión al motor */}
                        <rect x="112" y="44" width="4" height="10" fill="#0A0B0E" />
                        {/* Aspa curva aerodinámica con bisel */}
                        <path
                          d="M109 54 C106 58 103 104 107 108 C110 111 118 111 121 108 C125 104 122 58 119 54 Z"
                          fill="url(#matteObsidianGrad)"
                          stroke="#2D3545"
                          strokeWidth="1"
                        />
                        <path d="M111 56 L111 106" stroke="rgba(255,255,255,0.14)" strokeWidth="0.8" />
                      </g>
                    )}
                  </g>
                ))}

                {/* Núcleo central del rotor (Tapa de motor que gira) */}
                <circle cx="114" cy="44" r="10" fill="#181D26" stroke="#2D3545" strokeWidth="1.2" />
              </g>

              {/* Capa 3: Domo Difusor de Cristal Esmerilado Central (Iluminación Kelvin en tiempo real) */}
              <ellipse
                cx="114"
                cy="46"
                rx="16"
                ry="11"
                fill={isLightOn ? lightHex : "#222733"}
                stroke={isLightOn ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.22)"}
                strokeWidth="1.6"
                style={{
                  filter: isLightOn ? `drop-shadow(0 0 20px ${lightHex}) drop-shadow(0 0 8px #FFF)` : undefined,
                  transition: "fill 0.4s ease, filter 0.4s ease",
                }}
              />

              {/* Resplandor volumétrico y cono de luz descendente hacia la habitación */}
              {isLightOn && (
                <polygon
                  points="98,48 130,48 175,140 53,140"
                  fill="url(#lampConeGrad)"
                  style={{ mixBlendMode: "screen", opacity: Math.min(1, 0.5 + 0.5 * lightBrightness) }}
                />
              )}

              {/* Ráfagas de flujo de aire descendente cuando está encendido */}
              {isFanActive && (
                <g className="airflow-stream" style={{ opacity: Math.max(0.4, effectiveFanPct / 100) }}>
                  <path d="M82 66 C72 78 66 98 60 118" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.2" strokeLinecap="round" className="breeze-line-1" />
                  <path d="M114 66 C114 84 114 104 114 126" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.8" strokeLinecap="round" className="breeze-line-2" />
                  <path d="M146 66 C156 78 162 98 168 118" fill="none" stroke="url(#breezeGrad)" strokeWidth="2.2" strokeLinecap="round" className="breeze-line-3" />
                </g>
              )}
            </g>
          )}

          {/* ── 6. VENTILADOR DE TORRE EN NEGRO MATE (e.g. Govee H7133) ── */}
          {visualType === "tower_fan" && (
            <g className={`art-tower-fan ${orientation === "horizontal" ? "art-tower-horizontal" : "art-tower-vertical"}`}>
              {orientation === "horizontal" ? (
                /* ── MODO ACOSTADO / HORIZONTAL ── */
                <g className="tower-horizontal-body">
                  {/* Rubber Feet Supports */}
                  <rect x="54" y="48" width="16" height="4" rx="1.5" fill="#0A0B0E" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                  <rect x="108" y="48" width="16" height="4" rx="1.5" fill="#0A0B0E" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

                  {/* Horizontal Chassis Body */}
                  <rect
                    x="36"
                    y="20"
                    width="108"
                    height="28"
                    rx="6"
                    fill="url(#towerChassisGrad)"
                    stroke={
                      isHeating
                        ? "rgba(255, 69, 0, 0.55)"
                        : isFanActive
                        ? "rgba(0, 240, 255, 0.4)"
                        : "rgba(255, 255, 255, 0.15)"
                    }
                    strokeWidth="1.5"
                  />

                  {/* Left Touch Cap / Controls */}
                  <path d="M36 24 L46 24 L46 44 L36 44 Z" fill="#07080C" />
                  <circle
                    cx="41"
                    cy="34"
                    r="2.2"
                    fill={isHeating ? "#FF4500" : isFanActive ? "#00F0FF" : "#64748B"}
                    style={{
                      filter: isHeating
                        ? "drop-shadow(0 0 5px #FF4500)"
                        : isFanActive
                        ? "drop-shadow(0 0 5px #00F0FF)"
                        : undefined,
                    }}
                  />

                  {/* Right Base Cap & Night Light Ring */}
                  <rect x="134" y="18" width="10" height="32" rx="3" fill="#0E1015" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  {isLightOn && (
                    <>
                      {/* Luminous Night Light Ring along right end cap */}
                      <rect
                        x="135"
                        y="20"
                        width="3"
                        height="28"
                        rx="1.5"
                        fill={lightHex}
                        opacity={Math.max(0.7, lightBrightness)}
                        style={{ filter: `drop-shadow(0 0 10px ${lightHex})` }}
                      />
                      <ellipse
                        cx="139"
                        cy="34"
                        rx="12"
                        ry="16"
                        fill={lightHex}
                        opacity={0.25 * Math.max(0.4, lightBrightness)}
                        style={{ filter: "blur(6px)" }}
                      />
                    </>
                  )}

                  {/* Horizontal Grille */}
                  <rect x="48" y="24" width="84" height="20" rx="3" fill="#07080C" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

                  {/* Internal PTC Heating Glow when heating */}
                  {isHeating && (
                    <rect
                      x="49"
                      y="25"
                      width="82"
                      height="18"
                      rx="2"
                      fill="url(#heatVaneGrad)"
                      opacity="0.3"
                      className="heat-ceramic-glow"
                    />
                  )}

                  {/* Grille Vanes (Vertical lines across horizontal slot) */}
                  {Array.from({ length: 10 }).map((_, i) => {
                    const xPos = 53 + i * 8.2;
                    return (
                      <line
                        key={i}
                        x1={xPos}
                        y1="25"
                        x2={xPos}
                        y2="43"
                        stroke={
                          isHeating
                            ? "url(#heatVaneGrad)"
                            : isFanActive
                            ? "#38BDF8"
                            : "rgba(255, 255, 255, 0.2)"
                        }
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        className={
                          isHeating
                            ? "heat-tower-vane"
                            : isFanActive
                            ? "fan-tower-vane"
                            : ""
                        }
                        style={{ animationDelay: `${i * 0.1}s` }}
                      />
                    );
                  })}

                  {/* Dynamic Airflow Gusts blowing UPWARDS & OUT */}
                  {isHeating ? (
                    <g className="airflow-stream heat-stream" style={{ opacity: 0.95 }}>
                      <path
                        d="M60 20 C58 14 50 8 36 3"
                        fill="none"
                        stroke="url(#heatBreezeUpGrad)"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        className="heat-line-1"
                      />
                      <path
                        d="M90 20 C90 13 80 7 62 2"
                        fill="none"
                        stroke="url(#heatBreezeUpGrad)"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        className="heat-line-2"
                      />
                      <path
                        d="M120 20 C122 13 112 7 92 2"
                        fill="none"
                        stroke="url(#heatBreezeUpGrad)"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        className="heat-line-3"
                      />
                    </g>
                  ) : isFanActive ? (
                    <g className="airflow-stream breeze-stream" style={{ opacity: Math.max(0.45, effectiveFanPct / 100) }}>
                      <path
                        d="M60 20 C58 14 50 8 36 3"
                        fill="none"
                        stroke="url(#breezeUpGrad)"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        className="breeze-line-1"
                      />
                      <path
                        d="M90 20 C90 13 80 7 62 2"
                        fill="none"
                        stroke="url(#breezeUpGrad)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="breeze-line-2"
                      />
                      <path
                        d="M120 20 C122 13 112 7 92 2"
                        fill="none"
                        stroke="url(#breezeUpGrad)"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        className="breeze-line-3"
                      />
                    </g>
                  ) : null}
                </g>
              ) : (
                /* ── MODO DE PIE / VERTICAL ── */
                <g className="tower-vertical-body">
                  {/* Stand Base */}
                  <ellipse cx="118" cy="132" rx="26" ry="6" fill="#0E1015" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />

                  {/* Night Light Base Ring */}
                  {isLightOn && (
                    <>
                      <ellipse
                        cx="118"
                        cy="130"
                        rx="24"
                        ry="5.5"
                        fill="none"
                        stroke={lightHex}
                        strokeWidth="3"
                        opacity={Math.max(0.7, lightBrightness)}
                        style={{ filter: `drop-shadow(0 0 8px ${lightHex})` }}
                      />
                      <ellipse
                        cx="118"
                        cy="133"
                        rx="32"
                        ry="7.5"
                        fill={lightHex}
                        opacity={0.25 * Math.max(0.4, lightBrightness)}
                        style={{ filter: "blur(6px)" }}
                      />
                    </>
                  )}

                  {/* Upright Tower Chassis */}
                  <rect
                    x="104"
                    y="14"
                    width="28"
                    height="116"
                    rx="6"
                    fill="url(#towerChassisGrad)"
                    stroke={
                      isHeating
                        ? "rgba(255, 69, 0, 0.55)"
                        : isFanActive
                        ? "rgba(0, 240, 255, 0.4)"
                        : "rgba(255, 255, 255, 0.15)"
                    }
                    strokeWidth="1.5"
                  />

                  {/* Top Touch Panel */}
                  <path d="M106 14 L130 14 L128 24 L108 24 Z" fill="#0A0B0E" />
                  <circle
                    cx="118"
                    cy="19"
                    r="2.2"
                    fill={isHeating ? "#FF4500" : isFanActive ? "#00F0FF" : "#64748B"}
                    style={{
                      filter: isHeating
                        ? "drop-shadow(0 0 5px #FF4500)"
                        : isFanActive
                        ? "drop-shadow(0 0 5px #00F0FF)"
                        : undefined,
                    }}
                  />

                  {/* Outlet Grille with Ceramic Heating Layer & Vanes */}
                  <rect x="110" y="28" width="16" height="92" rx="3" fill="#07080C" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

                  {isHeating && (
                    <rect
                      x="111"
                      y="29"
                      width="14"
                      height="90"
                      rx="2"
                      fill="url(#heatVaneGrad)"
                      opacity="0.32"
                      className="heat-ceramic-glow"
                    />
                  )}

                  {Array.from({ length: 9 }).map((_, i) => {
                    const yPos = 35 + i * 9.5;
                    return (
                      <line
                        key={i}
                        x1="112"
                        y1={yPos}
                        x2="124"
                        y2={yPos}
                        stroke={
                          isHeating
                            ? "url(#heatVaneGrad)"
                            : isFanActive
                            ? "#38BDF8"
                            : "rgba(255, 255, 255, 0.2)"
                        }
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        className={
                          isHeating
                            ? "heat-tower-vane"
                            : isFanActive
                            ? "fan-tower-vane"
                            : ""
                        }
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    );
                  })}

                  {/* Dynamic Airflow Gusts (Heat: Ráfagas Naranjas y Azules | Fan: Ráfagas Azules) */}
                  {isHeating ? (
                    <g className="airflow-stream heat-stream" style={{ opacity: 0.95 }}>
                      <path
                        d="M98 42 C72 38 52 46 24 40"
                        fill="none"
                        stroke="url(#heatBreezeGrad)"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        className="heat-line-1"
                      />
                      <path
                        d="M94 65 C64 58 42 68 18 64"
                        fill="none"
                        stroke="url(#heatBreezeGrad)"
                        strokeWidth="3.8"
                        strokeLinecap="round"
                        className="heat-line-2"
                      />
                      <path
                        d="M98 88 C70 84 48 94 22 88"
                        fill="none"
                        stroke="url(#heatBreezeGrad)"
                        strokeWidth="3.0"
                        strokeLinecap="round"
                        className="heat-line-3"
                      />
                    </g>
                  ) : isFanActive ? (
                    <g className="airflow-stream breeze-stream" style={{ opacity: Math.max(0.4, effectiveFanPct / 100) }}>
                      <path
                        d="M98 42 C76 40 58 46 36 42"
                        fill="none"
                        stroke="url(#breezeGrad)"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        className="breeze-line-1"
                      />
                      <path
                        d="M94 65 C68 62 48 70 24 66"
                        fill="none"
                        stroke="url(#breezeGrad)"
                        strokeWidth="3.4"
                        strokeLinecap="round"
                        className="breeze-line-2"
                      />
                      <path
                        d="M98 88 C74 86 54 92 34 88"
                        fill="none"
                        stroke="url(#breezeGrad)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        className="breeze-line-3"
                      />
                    </g>
                  ) : null}
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

          {/* ── 8b. BARRAS DE LUZ GOVEE FLOW / TORRES SALA (`govee_light_bars`) ── */}
          {visualType === "govee_light_bars" && (
            <g className="art-govee-light-bars">
              {/* Dual vertical RGBIC light towers with angled desk bases */}
              {[85, 130].map((cx, i) => (
                <g key={i}>
                  {/* Angled base */}
                  <ellipse cx={cx} cy="128" rx="14" ry="4.5" fill="#181D26" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
                  <rect x={cx - 3} y="120" width="6" height="8" fill="#242B38" />
                  {/* Tower shell */}
                  <rect x={cx - 5} y="22" width="10" height="100" rx="4" fill="#11141B" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  {/* Diffuser face with active light color */}
                  <rect
                    x={cx - 3}
                    y="25"
                    width="6"
                    height="94"
                    rx="2.5"
                    fill={isLightOn ? lightHex : "#2A3342"}
                    style={{
                      filter: isLightOn ? `drop-shadow(0 0 12px ${lightHex})` : undefined,
                      transition: "fill 0.4s ease",
                    }}
                  />
                  {/* Glow dispersion on sides */}
                  {isLightOn && (
                    <ellipse
                      cx={cx}
                      cy="72"
                      rx="20"
                      ry="40"
                      fill={lightHex}
                      opacity={0.18 * lightBrightness}
                      style={{ filter: "blur(8px)" }}
                    />
                  )}
                </g>
              ))}
            </g>
          )}

          {/* ── 8c. LUCES EXTERIORES PERMANENTES GOVEE (`govee_permanent_outdoor`) ── */}
          {visualType === "govee_permanent_outdoor" && (
            <g className="art-govee-permanent-outdoor">
              {/* Architectural roofline / fascia board */}
              <rect x="20" y="24" width="140" height="7" rx="1.5" fill="#2D3748" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              {/* Downward puck lights under the soffit */}
              {[45, 75, 105, 135].map((cx, i) => (
                <g key={i}>
                  {/* Puck mount */}
                  <rect x={cx - 5} y="31" width="10" height="4" rx="1" fill="#1A202C" />
                  <ellipse cx={cx} cy="35" rx="4" ry="1.5" fill={isLightOn ? lightHex : "#4A5568"} />
                  {/* Architectural triangular wash on wall */}
                  {isLightOn && (
                    <polygon
                      points={`${cx - 3},35 ${cx + 3},35 ${cx + 18},120 ${cx - 18},120`}
                      fill={lightHex}
                      opacity={0.22 * lightBrightness}
                      style={{ mixBlendMode: "screen", filter: "blur(2px)" }}
                    />
                  )}
                </g>
              ))}
            </g>
          )}

          {/* ── 8d. LUCES DE SUELO / SENDERO EXTERIOR GOVEE (`govee_ground_lights`) ── */}
          {visualType === "govee_ground_lights" && (
            <g className="art-govee-ground-lights">
              {/* Ground line */}
              <line x1="20" y1="126" x2="160" y2="126" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2" strokeDasharray="3 3" />
              {/* Landscape puck / stake lights */}
              {[55, 95, 135].map((cx, i) => (
                <g key={i}>
                  {/* Stake rod */}
                  <line x1={cx} y1="90" x2={cx} y2="126" stroke="#4A5568" strokeWidth="2" />
                  {/* Light head housing */}
                  <ellipse cx={cx} cy="86" rx="9" ry="3" fill="#1F2937" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
                  {/* Glowing dome */}
                  <ellipse
                    cx={cx}
                    cy="82"
                    rx="7"
                    ry="5"
                    fill={isLightOn ? lightHex : "#374151"}
                    style={{
                      filter: isLightOn ? `drop-shadow(0 0 10px ${lightHex})` : undefined,
                      transition: "fill 0.4s ease",
                    }}
                  />
                  {/* Ground wash */}
                  {isLightOn && (
                    <ellipse
                      cx={cx}
                      cy="126"
                      rx="16"
                      ry="5"
                      fill={lightHex}
                      opacity={0.28 * lightBrightness}
                      style={{ mixBlendMode: "screen" }}
                    />
                  )}
                </g>
              ))}
            </g>
          )}

          {/* ── 8e. FOCO EMPOTRADO EN TECHO (`ceiling_spot`) ── */}
          {visualType === "ceiling_spot" && (
            <g className="art-ceiling-spot">
              {/* Recessed bezel ring flush with ceiling */}
              <ellipse cx="115" cy="24" rx="28" ry="7" fill="#1E293B" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <ellipse cx="115" cy="24" rx="20" ry="5" fill="#0F172A" />
              {/* Center lens */}
              <ellipse
                cx="115"
                cy="24"
                rx="14"
                ry="3.5"
                fill={isLightOn ? lightHex : "#334155"}
                style={{
                  filter: isLightOn ? `drop-shadow(0 0 14px ${lightHex})` : undefined,
                  transition: "fill 0.4s ease",
                }}
              />
              {/* Downward conical spotlight beam */}
              {isLightOn && (
                <polygon
                  points="101,26 129,26 156,136 74,136"
                  fill="url(#lampConeGrad)"
                  style={{ mixBlendMode: "screen" }}
                />
              )}
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

          {/* ── 13b. BOMBILLOS DE FILAMENTO COLGANTES + DIMMER ── */}
          {visualType === "hanging_bulbs" && (
            <g className="art-hanging-bulbs">
              {/* Dimmer switch on left wall */}
              <rect x="10" y="30" width="24" height="38" rx="4" fill="#2D3748" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" />
              <rect x="14" y="36" width="16" height="26" rx="2" fill="#1A202C" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              {/* Slider thumb */}
              <rect
                x="14"
                y={isLightOn ? "48" : "52"}
                width="16"
                height="8"
                rx="2"
                fill={isLightOn ? lightHex : "#4A5568"}
                style={{ transition: "y 0.4s ease, fill 0.4s ease" }}
              />

              {/* Three hanging cords from ceiling */}
              {[72, 105, 138].map((cx, i) => (
                <g key={i}>
                  <line x1={cx} y1="0" x2={cx} y2={20 + i * 8} stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
                  {/* Socket */}
                  <rect x={cx - 5} y={20 + i * 8} width="10" height="7" rx="2" fill="#374151" />
                  {/* Bulb glass globe */}
                  <ellipse
                    cx={cx}
                    cy={36 + i * 8 + 18}
                    rx="11"
                    ry="15"
                    fill={isLightOn ? lightHex : "#1E2430"}
                    stroke={isLightOn ? "#FFFFFF" : "rgba(255,255,255,0.2)"}
                    strokeWidth="1.5"
                    style={{ filter: isLightOn ? `drop-shadow(0 0 12px ${lightHex})` : undefined, transition: "fill 0.4s ease" }}
                  />
                  {/* Visible filament */}
                  {isLightOn && (
                    <path
                      d={`M${cx - 5} ${36 + i * 8 + 14} Q${cx} ${36 + i * 8 + 10} ${cx + 5} ${36 + i * 8 + 14}`}
                      fill="none" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round"
                    />
                  )}
                  {/* Bottom light cone */}
                  {isLightOn && (
                    <polygon
                      points={`${cx - 10},${60 + i * 8} ${cx + 10},${60 + i * 8} ${cx + 22},${120} ${cx - 22},${120}`}
                      fill={lightHex}
                      opacity={0.12 * lightBrightness}
                      style={{ mixBlendMode: "screen" }}
                    />
                  )}
                </g>
              ))}
            </g>
          )}

          {/* ── 13c. HUMIDIFICADOR INTELIGENTE ── */}
          {visualType === "humidifier" && (
            <g className="art-humidifier">
              {/* Tank body */}
              <rect x="88" y="40" width="54" height="75" rx="16" fill="#1E2E3A" stroke={isOn ? "#38BDF8" : "rgba(255,255,255,0.2)"} strokeWidth="2" />
              {/* Water level indicator */}
              <rect
                x="94"
                y={isOn ? "80" : "100"}
                width="42"
                height={isOn ? "30" : "10"}
                rx="8"
                fill={isOn ? "rgba(56, 189, 248, 0.35)" : "rgba(255,255,255,0.05)"}
                style={{ transition: "all 0.8s ease" }}
              />
              {/* Mist nozzle */}
              <ellipse cx="115" cy="40" rx="12" ry="5" fill="#2D4A5A" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              {/* Mist particles */}
              {isOn && [0, 1, 2].map((i) => (
                <ellipse key={i}
                  cx={107 + i * 8}
                  cy={25 - i * 5}
                  rx="4"
                  ry="7"
                  fill="rgba(186, 230, 253, 0.55)"
                  style={{ filter: "blur(3px)", animation: `pulse ${1.2 + i * 0.3}s ease-in-out infinite` }}
                />
              ))}
              {/* Control button */}
              <circle cx="115" cy="100" r="8" fill={isOn ? "#0EA5E9" : "#374151"} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
            </g>
          )}

          {/* ── 13d. CONTROL IR (BROADLINK) ── */}
          {visualType === "ir_blaster" && (
            <g className="art-ir-blaster">
              {/* Compact disc-shaped IR blaster */}
              <circle cx="115" cy="70" r="32" fill="#1A1A2E" stroke={isOn ? "#EA580C" : "rgba(255,255,255,0.15)"} strokeWidth="2" />
              <circle cx="115" cy="70" r="22" fill="#16213E" stroke={isOn ? "#F97316" : "rgba(255,255,255,0.08)"} strokeWidth="1.2" />
              {/* IR emission arcs */}
              {isOn && [14, 20, 26].map((r, i) => (
                <path key={i}
                  d={`M ${115 - r} 44 A ${r} ${r} 0 0 1 ${115 + r} 44`}
                  fill="none" stroke="#F97316"
                  strokeWidth={1.5 - i * 0.3}
                  strokeLinecap="round"
                  opacity={0.7 - i * 0.2}
                />
              ))}
              {/* Center LED */}
              <circle cx="115" cy="70" r="6" fill={isOn ? "#F97316" : "#374151"} style={{ filter: isOn ? "drop-shadow(0 0 6px #F97316)" : undefined }} />
              {/* Status LED */}
              <circle cx="140" cy="48" r="3" fill={isOn ? "#22C55E" : "#374151"} />
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
    )}
  </div>
);
};
