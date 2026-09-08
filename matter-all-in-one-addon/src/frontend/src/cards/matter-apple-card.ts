/**
 * Matter Apple Liquid Glass Card
 * Advanced Lovelace Custom Card for Home Assistant Dashboards.
 *
 * Capabilities:
 * - Ultra-Smooth 120 FPS ProMotion & 60 FPS GPU-accelerated rendering
 * - Wide Color Gamut (Display P3) with sRGB fallback
 * - High Dynamic Range (HDR / XDR) specular highlights & luminescence
 * - OLED True Black (#000000) optimization for infinite contrast and zero battery drain
 * - Automatic Day / Night Synchronization via Home Assistant `sun.sun` entity
 * - Interactive Liquid Glass Dimmer slider for lights (brightness) and fans (speed %)
 * - Intelligent Device Detection: Govee H7133 tower fan, RGBIC strips, Lyra lamps, etc.
 * - 100% Local WebSocket control via native Home Assistant API
 */

export interface HassState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

export interface HomeAssistant {
  states: Record<string, HassState>;
  devices?: Record<string, any>;
  entities?: Record<string, any>;
  callService: (domain: string, service: string, serviceData?: Record<string, any>) => Promise<any>;
}

export interface MatterAppleCardConfig {
  type: string;
  entity: string;
  name?: string;
  brand?: string;
  model?: string;
  device_type?: string;
  theme?: "auto" | "day" | "night";
  show_matter_badge?: boolean;
  show_slider?: boolean;
}

export interface DeviceProfile {
  type: string;
  brand: string;
  model: string;
  matterExport: string;
}

const CARD_VERSION = "1.5.18";

// ── Color Utilities ───────────────────────────────────────────────────────────
function kelvinToRgb(kelvin: number): [number, number, number] {
  const temp = Math.max(1000, Math.min(40000, kelvin || 3000)) / 100;
  let red: number;
  let green: number;
  let blue: number;

  if (temp <= 66) {
    red = 255;
    green = Math.min(255, Math.max(0, 99.4708025861 * Math.log(temp) - 161.1195681661));
    blue = temp <= 19 ? 0 : Math.min(255, Math.max(0, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
  } else {
    red = Math.min(255, Math.max(0, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
    green = Math.min(255, Math.max(0, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)));
    blue = 255;
  }
  return [Math.round(red), Math.round(green), Math.round(blue)];
}

function rgbArrayToHex(rgb: number[]): string {
  if (!Array.isArray(rgb) || rgb.length < 3) return "#FFE082";
  return (
    "#" +
    rgb
      .slice(0, 3)
      .map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0"))
      .join("")
  );
}

// ── Device & Model Intelligence ───────────────────────────────────────────────
function detectDeviceProfile(
  entityId: string,
  stateObj: HassState,
  hass: HomeAssistant | null,
  config: MatterAppleCardConfig
): DeviceProfile {
  if (config.device_type && config.device_type !== "auto") {
    return {
      type: config.device_type,
      brand: config.brand || "Custom",
      model: config.model || "",
      matterExport: "Matter 1.6",
    };
  }

  const domain = entityId.split(".")[0];
  const friendlyName = (stateObj?.attributes?.friendly_name || "").toLowerCase();
  const entLower = entityId.toLowerCase();
  const attrs = stateObj?.attributes || {};

  let regManufacturer = "";
  let regModel = "";
  if (hass?.entities && hass?.devices) {
    const regEnt = hass.entities[entityId];
    if (regEnt?.device_id) {
      const regDev = hass.devices[regEnt.device_id];
      if (regDev) {
        regManufacturer = regDev.manufacturer || "";
        regModel = regDev.model || "";
      }
    }
  }

  const brand = config.brand || regManufacturer || (entLower.includes("govee") ? "Govee" : "");
  const model = config.model || regModel || "";
  const isGovee =
    brand.toLowerCase().includes("govee") ||
    entLower.includes("govee") ||
    friendlyName.includes("govee");

  // 1. Govee Tower Fan (H7133, H7130, H7131, H7132)
  const isH7133 =
    isGovee &&
    (model.toLowerCase().includes("h7133") ||
      entLower.includes("h7133") ||
      friendlyName.includes("h7133") ||
      entLower.includes("tower") ||
      friendlyName.includes("torre"));

  if (domain === "fan" && isH7133) {
    return {
      type: "govee_tower_fan",
      brand: "Govee",
      model: model || "H7133",
      matterExport: "Matter 1.6 · FanControl + Thermostat",
    };
  }

  // 2. Generic Ceiling / Desk Fan
  if (domain === "fan") {
    return {
      type: "fan",
      brand: brand || "Home Assistant",
      model: model,
      matterExport: "Matter 1.6 · FanControl",
    };
  }

  // 3. Govee RGBIC Light Strips / Neon
  const isRgbicStrip =
    isGovee &&
    (model.toLowerCase().startsWith("h61") ||
      entLower.includes("rgbic") ||
      friendlyName.includes("rgbic") ||
      entLower.includes("strip") ||
      friendlyName.includes("tira"));

  if (domain === "light" && isRgbicStrip) {
    return {
      type: "govee_rgbic_strip",
      brand: "Govee",
      model: model || "RGBIC",
      matterExport: "Matter 1.6 · Extended Color Light",
    };
  }

  // 4. Govee Lyra / Aura Lamp
  const isGoveeLamp =
    isGovee &&
    (model.toLowerCase().includes("h607") ||
      entLower.includes("lyra") ||
      friendlyName.includes("lyra") ||
      entLower.includes("lamp") ||
      friendlyName.includes("lámpara"));

  if (domain === "light" && isGoveeLamp) {
    return {
      type: "govee_lamp",
      brand: "Govee",
      model: model || "Lyra",
      matterExport: "Matter 1.6 · Color Temperature Light",
    };
  }

  // 5. Standard Light
  if (domain === "light") {
    return {
      type: "light",
      brand: brand || "Home Assistant",
      model: model,
      matterExport: attrs.supported_color_modes?.some((m: string) => m.includes("color"))
        ? "Matter 1.6 · Color Light"
        : "Matter 1.6 · Dimmable Light",
    };
  }

  // 6. Climate / AC
  if (domain === "climate") {
    return {
      type: "climate",
      brand: brand || "Home Assistant",
      model: model,
      matterExport: "Matter 1.6 · Thermostat",
    };
  }

  // 7. Cover
  if (domain === "cover") {
    return {
      type: "cover",
      brand: brand || "Home Assistant",
      model: model,
      matterExport: "Matter 1.6 · Window Covering",
    };
  }

  // 8. Lock
  if (domain === "lock") {
    return {
      type: "lock",
      brand: brand || "Home Assistant",
      model: model,
      matterExport: "Matter 1.6 · Door Lock",
    };
  }

  // 9. Switch / Socket
  if (domain === "switch") {
    return {
      type: "switch",
      brand: brand || "Home Assistant",
      model: model,
      matterExport: "Matter 1.6 · On/Off Plugin Unit",
    };
  }

  return {
    type: domain,
    brand: brand || "Home Assistant",
    model: model,
    matterExport: "Matter 1.6 Bridge",
  };
}

// ── Ultra High Performance CSS Styles (P3, HDR, 120 FPS, OLED) ───────────────
const CARD_STYLES = `
  :host {
    display: block;
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro", "Segoe UI", Roboto, sans-serif;

    /* Base Standard Colors (sRGB Fallback) */
    --apple-green: #34C759;
    --apple-blue: #007AFF;
    --apple-cyan: #38BDF8;
    --apple-amber: #FF9500;
    --apple-orange: #FF6B00;
    --apple-purple: #AF52DE;
    --apple-yellow: #FFCC00;
  }

  /* Display P3 Wide Color Gamut Support (iPhone, iPad, Mac, OLED, Studio Display) */
  @supports (color: color(display-p3 1 1 1)) {
    @media (color-gamut: p3) {
      :host {
        --apple-green: color(display-p3 0.15 0.79 0.35);
        --apple-blue: color(display-p3 0.04 0.48 1.0);
        --apple-cyan: color(display-p3 0.22 0.74 0.97);
        --apple-amber: color(display-p3 1.0 0.58 0.0);
        --apple-orange: color(display-p3 1.0 0.42 0.0);
        --apple-purple: color(display-p3 0.69 0.32 0.87);
        --apple-yellow: color(display-p3 1.0 0.80 0.0);
      }
    }
  }

  /* ProMotion 120 FPS / 60 FPS Hardware Layering */
  .liquid-card,
  .fan-rotor,
  .fan-spinning,
  .ios-toggle,
  .toggle-thumb,
  .icon-puck,
  .dimmer-track-fill,
  .dimmer-slider {
    will-change: transform, opacity;
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
    perspective: 1000px;
  }

  .liquid-card {
    position: relative;
    border-radius: 24px;
    overflow: hidden;
    padding: 20px 22px;
    color: #F8FAFC;
    box-sizing: border-box;
    background: linear-gradient(135deg, rgba(28, 32, 45, 0.78) 0%, rgba(12, 15, 22, 0.92) 100%);
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.48), inset 0 1px 1px rgba(255, 255, 255, 0.22), inset 0 -1px 1px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(28px) saturate(190%);
    -webkit-backdrop-filter: blur(28px) saturate(190%);
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease;
    user-select: none;
    cursor: pointer;
  }

  /* OLED True Black Enhancement */
  @media (prefers-color-scheme: dark) {
    .liquid-card {
      background: linear-gradient(135deg, rgba(18, 22, 32, 0.85) 0%, #030406 100%);
    }
    .card-gradient-shield {
      background: radial-gradient(circle at 18% 25%, rgba(12, 16, 24, 0.15) 0%, #000000 88%) !important;
    }
  }

  .liquid-card:hover {
    border-color: rgba(255, 255, 255, 0.28);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.58), inset 0 1px 1.5px rgba(255, 255, 255, 0.35);
  }

  .liquid-card:active {
    transform: scale(0.985);
  }

  .liquid-card.is-active {
    border-color: rgba(255, 255, 255, 0.32);
    box-shadow: 0 20px 48px rgba(0, 0, 0, 0.55), 0 0 32px var(--card-glow, rgba(56, 189, 248, 0.18)), inset 0 1px 1.5px rgba(255, 255, 255, 0.4);
  }

  /* High Dynamic Range (HDR / XDR) Specular Luminescence */
  @media (dynamic-range: high) {
    .liquid-card.is-active {
      box-shadow: 0 24px 56px rgba(0, 0, 0, 0.65), 0 0 45px var(--card-glow, rgba(56, 189, 248, 0.28)), inset 0 1px 2px rgba(255, 255, 255, 0.65);
    }
    .liquid-card.is-active .icon-puck {
      box-shadow: 0 0 28px var(--puck-glow, rgba(56, 189, 248, 0.5)), inset 0 1px 1.5px rgba(255, 255, 255, 0.65);
    }
    .ios-toggle.is-on {
      box-shadow: 0 0 22px var(--apple-green);
    }
    .dimmer-track-fill {
      filter: drop-shadow(0 0 8px var(--dimmer-glow, rgba(255, 224, 130, 0.6)));
    }
  }

  .card-art-backdrop {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    opacity: 0.25;
    overflow: hidden;
    transition: opacity 0.5s ease;
  }

  .liquid-card.is-active .card-art-backdrop {
    opacity: 0.40;
  }

  .card-art-svg {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-gradient-shield {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: radial-gradient(circle at 18% 25%, rgba(15, 23, 42, 0.2) 0%, rgba(10, 12, 18, 0.88) 85%);
    pointer-events: none;
  }

  .card-content {
    position: relative;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .card-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .icon-puck {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2);
    transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
    flex-shrink: 0;
  }

  .liquid-card.is-active .icon-puck {
    background: var(--puck-bg, rgba(56, 189, 248, 0.20));
    border-color: var(--puck-border, rgba(56, 189, 248, 0.45));
    box-shadow: 0 0 20px var(--puck-glow, rgba(56, 189, 248, 0.35)), inset 0 1px 1px rgba(255, 255, 255, 0.35);
  }

  .ios-toggle {
    width: 50px;
    height: 30px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.22);
    position: relative;
    cursor: pointer;
    padding: 0;
    box-sizing: border-box;
    transition: background 0.25s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.25s ease, box-shadow 0.25s ease;
    outline: none;
    flex-shrink: 0;
  }

  .ios-toggle.is-on {
    background: var(--apple-green);
    border-color: rgba(255, 255, 255, 0.3);
    box-shadow: 0 0 16px rgba(52, 199, 89, 0.5);
  }

  .toggle-thumb {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #FFFFFF;
    position: absolute;
    top: 2px;
    left: 2px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ios-toggle.is-on .toggle-thumb {
    transform: translateX(20px);
  }

  .card-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .device-name {
    font-size: 1.08rem;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: #FFFFFF;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .device-status {
    font-size: 0.90rem;
    font-weight: 500;
    color: var(--status-color, #94A3B8);
    margin: 0;
    letter-spacing: -0.01em;
    transition: color 0.25s ease;
  }

  .liquid-card.is-active .device-status {
    color: var(--status-active-color, #E2E8F0);
    font-weight: 600;
  }

  /* ── Interactive Dimmer Slider Bar (Brightness & Fan Speed) ─────────────── */
  .dimmer-container {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    box-sizing: border-box;
    cursor: default;
  }

  .dimmer-track {
    position: relative;
    flex: 1;
    height: 10px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    overflow: hidden;
  }

  .dimmer-track-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--dimmer-color, var(--apple-yellow));
    transition: width 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .dimmer-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.78rem;
    font-weight: 600;
    color: #CBD5E1;
    min-width: 44px;
    justify-content: flex-end;
  }

  .dimmer-slider {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    margin: 0;
    z-index: 5;
  }

  .device-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 0.76rem;
    color: #64748B;
    letter-spacing: 0.02em;
  }

  .device-tags {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tag-pill {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 0.72rem;
    color: #CBD5E1;
    font-weight: 500;
  }

  .tag-brand {
    background: rgba(56, 189, 248, 0.15);
    border-color: rgba(56, 189, 248, 0.35);
    color: var(--apple-cyan);
  }

  .matter-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: #94A3B8;
    font-weight: 500;
  }

  .matter-badge .matter-symbol {
    color: var(--apple-cyan);
  }

  @keyframes fan-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes fan-vertical-wave {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-4px); }
    100% { transform: translateY(0px); }
  }

  .fan-rotor {
    transform-origin: 24px 24px;
  }

  .fan-spinning {
    animation: fan-spin var(--fan-speed-duration, 0.8s) linear infinite;
  }

  .fan-tower-vane {
    animation: fan-vertical-wave var(--fan-speed-duration, 0.8s) ease-in-out infinite;
  }

  .pulse-glow {
    animation: pulse-glow-anim 2.5s ease-in-out infinite alternate;
  }

  @keyframes pulse-glow-anim {
    from { opacity: 0.55; }
    to { opacity: 0.95; }
  }
`;

// ── SVG Kinetic Icons Renderer ────────────────────────────────────────────────
function renderKineticSvg(profile: DeviceProfile, stateObj: HassState, isOn: boolean): string {
  const domain = stateObj?.entity_id?.split(".")[0] || "switch";
  const attrs = stateObj?.attributes || {};

  // 1. Govee H7133 Smart Tower Fan
  if (profile.type === "govee_tower_fan") {
    const pct = typeof attrs.percentage === "number" ? attrs.percentage : (isOn ? 50 : 0);
    const isOscillating = attrs.oscillating === true;
    const speedDuration = pct > 0 ? (Math.max(0.35, 2.5 - (pct / 100) * 2.1)).toFixed(2) + "s" : "0s";

    return `
      <svg viewBox="0 0 48 48" width="34" height="34" style="--fan-speed-duration: ${speedDuration};" aria-hidden="true">
        <rect x="14" y="5" width="20" height="35" rx="5" fill="${isOn ? "#1E293B" : "#0F172A"}" stroke="${isOn ? "var(--apple-cyan)" : "rgba(255,255,255,0.2)"}" stroke-width="1.8"/>
        <rect x="16" y="7" width="16" height="5" rx="2.5" fill="${isOn ? "var(--apple-cyan)" : "#334155"}"/>
        <circle cx="24" cy="9.5" r="1.5" fill="${isOn ? "#FFFFFF" : "#64748B"}"/>
        <g opacity="${isOn ? "0.95" : "0.35"}">
          <line x1="17" y1="16" x2="31" y2="16" stroke="${isOn ? "#7DD3FC" : "#64748B"}" stroke-width="1.5" stroke-linecap="round" class="${isOn ? "fan-tower-vane" : ""}"/>
          <line x1="17" y1="20" x2="31" y2="20" stroke="${isOn ? "var(--apple-cyan)" : "#64748B"}" stroke-width="1.5" stroke-linecap="round" class="${isOn ? "fan-tower-vane" : ""}" style="animation-delay: 0.15s;"/>
          <line x1="17" y1="24" x2="31" y2="24" stroke="${isOn ? "var(--apple-blue)" : "#64748B"}" stroke-width="1.5" stroke-linecap="round" class="${isOn ? "fan-tower-vane" : ""}" style="animation-delay: 0.3s;"/>
          <line x1="17" y1="28" x2="31" y2="28" stroke="${isOn ? "var(--apple-cyan)" : "#64748B"}" stroke-width="1.5" stroke-linecap="round" class="${isOn ? "fan-tower-vane" : ""}" style="animation-delay: 0.45s;"/>
          <line x1="17" y1="32" x2="31" y2="32" stroke="${isOn ? "#7DD3FC" : "#64748B"}" stroke-width="1.5" stroke-linecap="round" class="${isOn ? "fan-tower-vane" : ""}" style="animation-delay: 0.6s;"/>
        </g>
        <ellipse cx="24" cy="42" rx="13" ry="2.5" fill="${isOn ? "var(--apple-cyan)" : "#334155"}" opacity="${isOn ? "0.8" : "0.4"}"/>
        ${
          isOscillating && isOn
            ? `<path d="M 8 24 A 18 18 0 0 1 11 17 M 40 24 A 18 18 0 0 0 37 17" fill="none" stroke="var(--apple-cyan)" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2 3"/>`
            : ""
        }
      </svg>
    `;
  }

  // 2. Standard Fan (Ceiling / Desk with 3 aerodynamic rotating blades)
  if (domain === "fan" || profile.type === "fan") {
    const pct = typeof attrs.percentage === "number" ? attrs.percentage : (isOn ? 50 : 0);
    const speedDuration = pct > 0 ? (Math.max(0.35, 2.5 - (pct / 100) * 2.1)).toFixed(2) + "s" : "0s";

    return `
      <svg viewBox="0 0 48 48" width="34" height="34" style="--fan-speed-duration: ${speedDuration};" aria-hidden="true">
        ${isOn ? `<circle cx="24" cy="24" r="18" fill="rgba(56, 189, 248, 0.18)" class="pulse-glow"/>` : ""}
        <g class="fan-rotor ${isOn ? "fan-spinning" : ""}">
          <path d="M 24 24 C 23 15 28 8 33 9 C 37 10 34 18 24 24 Z" fill="${isOn ? "var(--apple-cyan)" : "#94A3B8"}"/>
          <path d="M 24 24 C 15 25 8 20 9 15 C 10 11 18 14 24 24 Z" transform="rotate(120 24 24)" fill="${isOn ? "var(--apple-blue)" : "#64748B"}"/>
          <path d="M 24 24 C 15 25 8 20 9 15 C 10 11 18 14 24 24 Z" transform="rotate(240 24 24)" fill="${isOn ? "#7DD3FC" : "#94A3B8"}"/>
          <circle cx="24" cy="24" r="5" fill="${isOn ? "#0F172A" : "#334155"}" stroke="${isOn ? "var(--apple-cyan)" : "#94A3B8"}" stroke-width="1.8"/>
          <circle cx="24" cy="24" r="2" fill="${isOn ? "#FFFFFF" : "#64748B"}"/>
        </g>
      </svg>
    `;
  }

  // 3. Govee RGBIC Strip / Neon Light Bar
  if (profile.type === "govee_rgbic_strip") {
    const rgb = attrs.rgb_color || (attrs.color_temp_kelvin ? kelvinToRgb(attrs.color_temp_kelvin) : [56, 189, 248]);
    const hexColor = rgbArrayToHex(rgb);
    const bri = typeof attrs.brightness === "number" ? Math.max(0.3, attrs.brightness / 255) : 1;

    return `
      <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
        <defs>
          <linearGradient id="rgbic-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${isOn ? "#FF007A" : "#334155"}"/>
            <stop offset="35%" stop-color="${isOn ? hexColor : "#475569"}"/>
            <stop offset="70%" stop-color="${isOn ? "#00F0FF" : "#334155"}"/>
            <stop offset="100%" stop-color="${isOn ? "#7000FF" : "#1E293B"}"/>
          </linearGradient>
          <filter id="rgbic-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur"/>
          </filter>
        </defs>
        ${isOn ? `<path d="M 8 36 C 14 20 34 28 40 12" fill="none" stroke="${hexColor}" stroke-width="8" filter="url(#rgbic-glow)" opacity="${bri * 0.65}"/>` : ""}
        <path d="M 8 36 C 14 20 34 28 40 12" fill="none" stroke="url(#rgbic-grad)" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="8" cy="36" r="3.5" fill="${isOn ? "#FF007A" : "#64748B"}"/>
        <circle cx="40" cy="12" r="3.5" fill="${isOn ? "#7000FF" : "#64748B"}"/>
      </svg>
    `;
  }

  // 4. Govee Lyra / Aura Lamp
  if (profile.type === "govee_lamp") {
    const rgb = attrs.rgb_color || (attrs.color_temp_kelvin ? kelvinToRgb(attrs.color_temp_kelvin) : [255, 215, 120]);
    const hexColor = rgbArrayToHex(rgb);
    const bri = typeof attrs.brightness === "number" ? Math.max(0.3, attrs.brightness / 255) : 1;

    return `
      <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
        ${isOn ? `<rect x="18" y="4" width="12" height="32" rx="6" fill="${hexColor}" opacity="${bri * 0.45}" filter="blur(4px)"/>` : ""}
        <rect x="22" y="6" width="4" height="30" rx="2" fill="${isOn ? hexColor : "#64748B"}"/>
        <line x1="14" y1="42" x2="34" y2="42" stroke="${isOn ? hexColor : "#475569"}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="24" y1="36" x2="24" y2="42" stroke="${isOn ? hexColor : "#475569"}" stroke-width="2.5"/>
      </svg>
    `;
  }

  // 5. Standard Light Bulb
  if (domain === "light") {
    const rgb = attrs.rgb_color || (attrs.color_temp_kelvin ? kelvinToRgb(attrs.color_temp_kelvin) : [255, 224, 130]);
    const hexColor = rgbArrayToHex(rgb);
    const bri = typeof attrs.brightness === "number" ? Math.max(0.3, attrs.brightness / 255) : 1;

    return `
      <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
        ${isOn ? `<circle cx="24" cy="20" r="15" fill="${hexColor}" opacity="${bri * 0.4}" filter="blur(4px)"/>` : ""}
        <path d="M 24 8 C 16.5 8 11.5 13.5 11.5 19.5 C 11.5 24 14.5 27 17.5 29.5 L 17.5 33 C 17.5 34 18.5 35 19.5 35 L 28.5 35 C 29.5 35 30.5 34 30.5 33 L 30.5 29.5 C 33.5 27 36.5 24 36.5 19.5 C 36.5 13.5 31.5 8 24 8 Z" fill="${isOn ? hexColor : "#334155"}" stroke="${isOn ? "#FFFFFF" : "#64748B"}" stroke-width="1.8"/>
        ${isOn ? `<path d="M 21 21 L 24 15 L 27 21" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>` : ""}
        <line x1="19" y1="38" x2="29" y2="38" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/>
        <line x1="21" y1="41" x2="27" y2="41" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  // 6. Climate / Thermostat
  if (domain === "climate") {
    const curTemp = typeof attrs.current_temperature === "number" ? attrs.current_temperature : "--";
    const isHeating = stateObj?.state === "heat";
    const isCooling = stateObj?.state === "cool";
    const dialColor = isHeating ? "var(--apple-orange)" : isCooling ? "var(--apple-cyan)" : "var(--apple-green)";

    return `
      <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
        <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="3"/>
        <circle cx="24" cy="24" r="18" fill="none" stroke="${isOn ? dialColor : "#64748B"}" stroke-width="3" stroke-dasharray="85 115" stroke-linecap="round" transform="rotate(-90 24 24)"/>
        <text x="24" y="27" font-size="11" font-weight="700" fill="#FFFFFF" text-anchor="middle" font-family="system-ui">${curTemp}°</text>
      </svg>
    `;
  }

  // 7. Cover
  if (domain === "cover") {
    const pos = typeof attrs.current_position === "number" ? attrs.current_position : (isOn ? 100 : 0);
    const blindHeight = Math.round((1 - pos / 100) * 22);

    return `
      <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
        <rect x="10" y="8" width="28" height="32" rx="4" fill="none" stroke="${isOn ? "var(--apple-cyan)" : "#64748B"}" stroke-width="2"/>
        <rect x="12" y="10" width="24" height="${Math.max(4, blindHeight)}" rx="2" fill="${isOn ? "var(--apple-blue)" : "#334155"}"/>
        <line x1="8" y1="41" x2="40" y2="41" stroke="${isOn ? "var(--apple-cyan)" : "#64748B"}" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `;
  }

  // 8. Lock
  if (domain === "lock") {
    const isLocked = stateObj?.state === "locked";
    const lockColor = isLocked ? "var(--apple-green)" : "#EF4444";

    return `
      <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
        <path d="M 16 ${isLocked ? "20" : "15"} V 14 A 8 8 0 0 1 32 14 V 20" fill="none" stroke="${lockColor}" stroke-width="3" stroke-linecap="round"/>
        <rect x="12" y="20" width="24" height="19" rx="4" fill="${isLocked ? "#1E293B" : "#334155"}" stroke="${lockColor}" stroke-width="2"/>
        <circle cx="24" cy="28" r="2.5" fill="${lockColor}"/>
        <line x1="24" y1="30.5" x2="24" y2="34" stroke="${lockColor}" stroke-width="2.5"/>
      </svg>
    `;
  }

  // 9. Switch / Socket
  return `
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
      <rect x="10" y="8" width="28" height="32" rx="8" fill="${isOn ? "#1E293B" : "#0F172A"}" stroke="${isOn ? "var(--apple-green)" : "#64748B"}" stroke-width="2"/>
      <circle cx="24" cy="24" r="9" fill="${isOn ? "rgba(52, 199, 89, 0.18)" : "rgba(255,255,255,0.05)"}" stroke="${isOn ? "var(--apple-green)" : "#475569"}" stroke-width="1.8"/>
      <circle cx="24" cy="14" r="1.8" fill="${isOn ? "var(--apple-green)" : "#64748B"}"/>
      <line x1="20" y1="23" x2="20" y2="26" stroke="${isOn ? "#FFFFFF" : "#64748B"}" stroke-width="2" stroke-linecap="round"/>
      <line x1="28" y1="23" x2="28" y2="26" stroke="${isOn ? "#FFFFFF" : "#64748B"}" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;
}

// ── Sun.sun Synchronized Day/Night Ambient Art ────────────────────────────────
function renderAmbientArt(theme: string | undefined, hass: HomeAssistant | null): string {
  // Check Home Assistant's real-time solar tracking
  const sunState = hass?.states?.["sun.sun"]?.state;
  let isDaytime = true;

  if (theme === "day") {
    isDaytime = true;
  } else if (theme === "night") {
    isDaytime = false;
  } else if (sunState === "above_horizon") {
    isDaytime = true;
  } else if (sunState === "below_horizon") {
    isDaytime = false;
  } else {
    // Fallback based on local hour
    const hour = new Date().getHours();
    isDaytime = hour >= 6 && hour < 19;
  }

  if (isDaytime) {
    return `
      <svg class="card-art-svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="sun-rad" cx="82%" cy="15%" r="68%">
            <stop offset="0%" stop-color="#FDE047" stop-opacity="0.65"/>
            <stop offset="35%" stop-color="#38BDF8" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="320" height="180" fill="url(#sun-rad)"/>
        <circle cx="260" cy="35" r="28" fill="#FEF08A" opacity="0.45" filter="blur(8px)"/>
        <polygon points="180,0 280,0 320,180 140,180" fill="rgba(255,255,255,0.06)"/>
      </svg>
    `;
  }

  return `
    <svg class="card-art-svg" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="night-rad" cx="80%" cy="15%" r="65%">
          <stop offset="0%" stop-color="#818CF8" stop-opacity="0.5"/>
          <stop offset="40%" stop-color="#1E1B4B" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill="url(#night-rad)"/>
      <circle cx="255" cy="35" r="22" fill="#E0E7FF" opacity="0.38" filter="blur(6px)"/>
      <circle cx="262" cy="30" r="18" fill="#000000"/>
      <circle cx="60" cy="30" r="1" fill="#FFFFFF" opacity="0.4"/>
      <circle cx="120" cy="50" r="1.2" fill="#FFFFFF" opacity="0.6"/>
      <circle cx="190" cy="20" r="0.8" fill="#FFFFFF" opacity="0.5"/>
    </svg>
  `;
}

// ── Web Component in Pure TypeScript ──────────────────────────────────────────
export class MatterAppleCard extends HTMLElement {
  private _config!: MatterAppleCardConfig;
  private _hass: HomeAssistant | null = null;
  private _lastRenderedState: string | null = null;
  private _sliderDebounceTimer: any = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  public static getConfigElement() {
    return document.createElement("matter-apple-card-editor");
  }

  public static getStubConfig() {
    return {
      entity: "fan.govee_h7133",
      name: "Ventilador Govee",
      show_matter_badge: true,
      show_slider: true,
    };
  }

  public setConfig(config: MatterAppleCardConfig) {
    if (!config || !config.entity) {
      throw new Error("Por favor especifica una entidad ('entity') de Home Assistant");
    }
    this._config = {
      show_matter_badge: true,
      show_slider: true,
      theme: "auto",
      ...config,
    };
    this.render();
  }

  public set hass(hass: HomeAssistant) {
    this._hass = hass;
    const entityId = this._config?.entity;
    if (!entityId) return;

    const stateObj = hass.states[entityId];
    if (!stateObj) {
      this.renderNotFound(entityId);
      return;
    }

    const sunState = hass.states["sun.sun"]?.state || "";
    const stateKey = `${stateObj.state}_${stateObj.attributes?.percentage}_${stateObj.attributes?.brightness}_${stateObj.attributes?.temperature}_${stateObj.attributes?.oscillating}_${stateObj.attributes?.current_temperature}_${sunState}`;
    if (this._lastRenderedState !== stateKey) {
      this._lastRenderedState = stateKey;
      this.render();
    }
  }

  public getCardSize() {
    return 3;
  }

  private renderNotFound(entityId: string) {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>${CARD_STYLES}</style>
      <div class="liquid-card" style="border-color: rgba(239, 68, 68, 0.4);">
        <div class="card-content">
          <h3 class="device-name" style="color: #F87171;">Entidad no encontrada</h3>
          <p class="device-status">${entityId}</p>
          <p style="font-size: 0.8rem; color: #94A3B8; margin: 0;">Comprueba que la entidad exista en Home Assistant.</p>
        </div>
      </div>
    `;
  }

  public async handleToggle(e: Event) {
    e.stopPropagation();
    if (!this._hass || !this._config.entity) return;

    const entityId = this._config.entity;
    const stateObj = this._hass.states[entityId];
    if (!stateObj) return;

    const domain = entityId.split(".")[0];
    const isOn =
      stateObj.state === "on" ||
      stateObj.state === "heat" ||
      stateObj.state === "cool" ||
      stateObj.state === "open" ||
      stateObj.state === "unlocked";

    try {
      if (domain === "lock") {
        const s = stateObj.state === "locked" ? "unlock" : "lock";
        await this._hass.callService("lock", s, { entity_id: entityId });
      } else if (domain === "cover") {
        const s = isOn ? "close_cover" : "open_cover";
        await this._hass.callService("cover", s, { entity_id: entityId });
      } else if (domain === "fan") {
        if (isOn) {
          await this._hass.callService("fan", "turn_off", { entity_id: entityId });
        } else {
          const rememberedPct = stateObj.attributes?.percentage;
          const pct = typeof rememberedPct === "number" && rememberedPct > 0 ? rememberedPct : 50;
          await this._hass.callService("fan", "turn_on", { entity_id: entityId, percentage: pct });
        }
      } else {
        await this._hass.callService(domain, "toggle", { entity_id: entityId });
      }
    } catch (err) {
      console.error("Error al conmutar entidad en Home Assistant:", err);
    }
  }

  public handleSliderChange(e: any) {
    const value = Number(e.target.value);
    if (!this._hass || !this._config.entity || isNaN(value)) return;

    const entityId = this._config.entity;
    const domain = entityId.split(".")[0];

    // Immediate 120 FPS visual feedback
    const fillEl = this.shadowRoot?.querySelector(".dimmer-track-fill") as HTMLElement;
    const pctEl = this.shadowRoot?.querySelector(".dimmer-pct") as HTMLElement;
    if (fillEl) fillEl.style.width = `${value}%`;
    if (pctEl) pctEl.textContent = `${value}%`;

    // Debounce service call by 40ms to keep dragging silky smooth without spamming HA WebSocket
    if (this._sliderDebounceTimer) clearTimeout(this._sliderDebounceTimer);
    this._sliderDebounceTimer = setTimeout(async () => {
      try {
        if (domain === "light") {
          await this._hass?.callService("light", "turn_on", {
            entity_id: entityId,
            brightness_pct: value,
          });
        } else if (domain === "fan") {
          await this._hass?.callService("fan", "turn_on", {
            entity_id: entityId,
            percentage: value,
          });
        }
      } catch (err) {
        console.error("Error al ajustar dimmer/slider:", err);
      }
    }, 40);
  }

  public handleMoreInfo() {
    const event = new CustomEvent("hass-more-info", {
      bubbles: true,
      composed: true,
      detail: { entityId: this._config.entity },
    });
    this.dispatchEvent(event);
  }

  private render() {
    if (!this.shadowRoot || !this._hass || !this._config?.entity) return;
    const entityId = this._config.entity;
    const stateObj = this._hass.states[entityId];
    if (!stateObj) return;

    const profile = detectDeviceProfile(entityId, stateObj, this._hass, this._config);
    const domain = entityId.split(".")[0];
    const attrs = stateObj.attributes || {};

    const isOn =
      stateObj.state === "on" ||
      stateObj.state === "heat" ||
      stateObj.state === "cool" ||
      stateObj.state === "open" ||
      stateObj.state === "unlocked";

    const displayName = this._config.name || attrs.friendly_name || entityId;

    // Check if dimmer / speed slider is supported
    const hasBrightness = domain === "light" && attrs.supported_color_modes && !attrs.supported_color_modes.includes("onoff");
    const hasSpeed = domain === "fan" && (typeof attrs.percentage === "number" || typeof attrs.supported_features === "number");
    const showSlider = this._config.show_slider !== false && (hasBrightness || hasSpeed);

    let sliderValue = 0;
    let sliderColor = "var(--apple-yellow)";
    let sliderIcon = "☼";

    if (domain === "light") {
      const bri = attrs.brightness;
      sliderValue = bri ? Math.round((bri / 255) * 100) : (isOn ? 100 : 0);
      const rgb = attrs.rgb_color || (attrs.color_temp_kelvin ? kelvinToRgb(attrs.color_temp_kelvin) : [255, 224, 130]);
      sliderColor = rgbArrayToHex(rgb);
      sliderIcon = "☼";
    } else if (domain === "fan") {
      sliderValue = typeof attrs.percentage === "number" ? attrs.percentage : (isOn ? 50 : 0);
      sliderColor = "var(--apple-cyan)";
      sliderIcon = "󰈐";
    }

    let statusText = isOn ? "Activo" : "Apagado";
    if (domain === "fan") {
      const pct = attrs.percentage;
      const osc = attrs.oscillating;
      statusText = isOn
        ? `${pct !== undefined ? `${pct}%` : "Encendido"}${osc ? " · Oscilando" : ""}`
        : "Apagado";
    } else if (domain === "light") {
      const bri = attrs.brightness;
      const pct = bri ? Math.round((bri / 255) * 100) : null;
      statusText = isOn ? `Encendida${pct ? ` · ${pct}%` : ""}` : "Apagada";
    } else if (domain === "climate") {
      const curTemp = attrs.current_temperature;
      statusText = `${isOn ? stateObj.state.toUpperCase() : "APAGADO"}${curTemp ? ` · ${curTemp}°C` : ""}`;
    } else if (domain === "cover") {
      statusText = isOn ? "Abierto" : "Cerrado";
    } else if (domain === "lock") {
      statusText = stateObj.state === "locked" ? "Bloqueada" : "Desbloqueada";
    }

    let puckGlow = "rgba(56, 189, 248, 0.35)";
    let cardGlow = "rgba(56, 189, 248, 0.15)";
    if (domain === "light" && isOn) {
      const rgb = attrs.rgb_color || (attrs.color_temp_kelvin ? kelvinToRgb(attrs.color_temp_kelvin) : [255, 224, 130]);
      const hex = rgbArrayToHex(rgb);
      puckGlow = `${hex}66`;
      cardGlow = `${hex}33`;
    } else if (domain === "switch" && isOn) {
      puckGlow = "rgba(52, 199, 89, 0.35)";
      cardGlow = "rgba(52, 199, 89, 0.15)";
    }

    this.shadowRoot.innerHTML = `
      <style>${CARD_STYLES}</style>
      <div
        class="liquid-card ${isOn ? "is-active" : ""}"
        style="--puck-glow: ${puckGlow}; --card-glow: ${cardGlow}; --dimmer-color: ${sliderColor};"
        role="region"
        aria-label="${displayName}"
      >
        <div class="card-art-backdrop">
          ${renderAmbientArt(this._config.theme, this._hass)}
        </div>
        <div class="card-gradient-shield"></div>

        <div class="card-content">
          <div class="card-top-row">
            <div class="icon-puck" title="Mantén pulsado para detalles">
              ${renderKineticSvg(profile, stateObj, isOn)}
            </div>
            <button
              class="ios-toggle ${isOn ? "is-on" : ""}"
              type="button"
              aria-pressed="${isOn}"
              title="${isOn ? "Apagar" : "Encender"}"
            >
              <span class="toggle-thumb"></span>
            </button>
          </div>

          <div class="card-body">
            <h3 class="device-name" title="${displayName}">${displayName}</h3>
            <p class="device-status">${statusText}</p>
          </div>

          ${
            showSlider
              ? `
              <div class="dimmer-container" title="Desliza para regular nivel">
                <div class="dimmer-track">
                  <div class="dimmer-track-fill" style="width: ${sliderValue}%;"></div>
                </div>
                <div class="dimmer-label">
                  <span>${sliderIcon}</span>
                  <span class="dimmer-pct">${sliderValue}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value="${sliderValue}"
                  class="dimmer-slider"
                  aria-label="Regulador de nivel"
                />
              </div>
            `
              : ""
          }

          <div class="device-meta">
            <div class="device-tags">
              ${profile.brand ? `<span class="tag-pill tag-brand">${profile.brand}</span>` : ""}
              ${profile.model ? `<span class="tag-pill">${profile.model}</span>` : ""}
            </div>
            ${
              this._config.show_matter_badge !== false
                ? `<div class="matter-badge" title="Publicado en Matter">
                    <span class="matter-symbol">✦</span> ${profile.matterExport}
                  </div>`
                : ""
            }
          </div>
        </div>
      </div>
    `;

    const cardEl = this.shadowRoot.querySelector(".liquid-card");
    const toggleBtn = this.shadowRoot.querySelector(".ios-toggle");
    const sliderInput = this.shadowRoot.querySelector(".dimmer-slider");

    if (toggleBtn) {
      toggleBtn.addEventListener("click", (e) => this.handleToggle(e));
    }

    if (sliderInput) {
      sliderInput.addEventListener("input", (e) => this.handleSliderChange(e));
      sliderInput.addEventListener("click", (e) => e.stopPropagation());
    }

    if (cardEl) {
      cardEl.addEventListener("click", (e: Event) => {
        const path = e.composedPath();
        if (!path.includes(toggleBtn as EventTarget) && !path.includes(sliderInput as EventTarget)) {
          this.handleMoreInfo();
        }
      });
    }
  }
}

// ── Card Visual Editor in Pure TypeScript ─────────────────────────────────────
export class MatterAppleCardEditor extends HTMLElement {
  private _config: Partial<MatterAppleCardConfig> = {};
  private _hass: HomeAssistant | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  public setConfig(config: MatterAppleCardConfig) {
    this._config = config || {};
    this.render();
  }

  public set hass(hass: HomeAssistant) {
    this._hass = hass;
    this.render();
  }

  private valueChanged(field: string, value: any) {
    if (!this._config) return;
    const newConfig = { ...this._config, [field]: value };
    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  private render() {
    if (!this.shadowRoot || !this._hass) return;

    const entityList = Object.keys(this._hass.states)
      .filter((id) =>
        ["fan", "light", "climate", "switch", "cover", "lock", "humidifier"].includes(id.split(".")[0])
      )
      .sort();

    this.shadowRoot.innerHTML = `
      <style>
        .editor-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 14px;
          font-family: var(--paper-font-body1_-_font-family, sans-serif);
        }
        label {
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--primary-text-color, #E2E8F0);
        }
        input, select {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid var(--divider-color, rgba(255,255,255,0.18));
          background: var(--card-background-color, rgba(30,41,59,0.7));
          color: var(--primary-text-color, #FFFFFF);
          font-size: 0.9rem;
        }
        .hint {
          font-size: 0.78rem;
          color: var(--secondary-text-color, #94A3B8);
        }
      </style>
      <div class="editor-row">
        <label>Entidad de Home Assistant *</label>
        <select id="entity-select">
          <option value="">-- Selecciona una entidad --</option>
          ${entityList
            .map(
              (id) =>
                `<option value="${id}" ${this._config.entity === id ? "selected" : ""}>${id} (${this._hass?.states[id]?.attributes?.friendly_name || ""})</option>`
            )
            .join("")}
        </select>
        <span class="hint">Admite ventiladores (fan), luces (light), clima (climate), enchufes (switch), persianas (cover) y cerraduras (lock).</span>
      </div>

      <div class="editor-row">
        <label>Nombre Personalizado (Opcional)</label>
        <input id="name-input" type="text" value="${this._config.name || ""}" placeholder="Ej. Ventilador de Torre Sala" />
      </div>

      <div class="editor-row">
        <label>Tipo de Dispositivo / Silueta</label>
        <select id="device-type-select">
          <option value="auto" ${(!this._config.device_type || this._config.device_type === "auto") ? "selected" : ""}>✦ Detección Automática Inteligente (Govee, Aqara, etc.)</option>
          <option value="govee_tower_fan" ${this._config.device_type === "govee_tower_fan" ? "selected" : ""}>Ventilador de Torre Inteligente (Govee H7133 / H7130)</option>
          <option value="fan" ${this._config.device_type === "fan" ? "selected" : ""}>Ventilador de Techo / Sobremesa Estándar</option>
          <option value="govee_rgbic_strip" ${this._config.device_type === "govee_rgbic_strip" ? "selected" : ""}>Tira de Luz LED RGBIC (Govee H61xx / Neón)</option>
          <option value="govee_lamp" ${this._config.device_type === "govee_lamp" ? "selected" : ""}>Lámpara de Pie / Cilindro (Govee Lyra / Aura)</option>
          <option value="light" ${this._config.device_type === "light" ? "selected" : ""}>Bombilla o Luminaria Estándar</option>
          <option value="climate" ${this._config.device_type === "climate" ? "selected" : ""}>Clima / Termostato / Aire Acondicionado</option>
          <option value="switch" ${this._config.device_type === "switch" ? "selected" : ""}>Enchufe Inteligente / Relé</option>
          <option value="cover" ${this._config.device_type === "cover" ? "selected" : ""}>Persiana Motorizada / Cortina</option>
          <option value="lock" ${this._config.device_type === "lock" ? "selected" : ""}>Cerradura Inteligente</option>
        </select>
      </div>

      <div class="editor-row">
        <label>Fondo Ambiental Día/Noche</label>
        <select id="theme-select">
          <option value="auto" ${(!this._config.theme || this._config.theme === "auto") ? "selected" : ""}>Automático según Sol de Home Assistant (sun.sun)</option>
          <option value="night" ${this._config.theme === "night" ? "selected" : ""}>Siempre Oscuro / Crepúsculo Lunar (OLED Black)</option>
          <option value="day" ${this._config.theme === "day" ? "selected" : ""}>Siempre Diurno / Resplandor Solar</option>
        </select>
      </div>

      <div class="editor-row" style="flex-direction: row; align-items: center; gap: 8px;">
        <input id="slider-check" type="checkbox" ${this._config.show_slider !== false ? "checked" : ""} />
        <label for="slider-check" style="margin: 0; cursor: pointer;">Mostrar regulador interactivo (dimmer / velocidad)</label>
      </div>

      <div class="editor-row" style="flex-direction: row; align-items: center; gap: 8px;">
        <input id="badge-check" type="checkbox" ${this._config.show_matter_badge !== false ? "checked" : ""} />
        <label for="badge-check" style="margin: 0; cursor: pointer;">Mostrar distintivo Matter 1.6 en la tarjeta</label>
      </div>
    `;

    const entitySel = this.shadowRoot.querySelector("#entity-select");
    const nameInp = this.shadowRoot.querySelector("#name-input") as HTMLInputElement;
    const devTypeSel = this.shadowRoot.querySelector("#device-type-select") as HTMLSelectElement;
    const themeSel = this.shadowRoot.querySelector("#theme-select") as HTMLSelectElement;
    const sliderCheck = this.shadowRoot.querySelector("#slider-check") as HTMLInputElement;
    const badgeCheck = this.shadowRoot.querySelector("#badge-check") as HTMLInputElement;

    entitySel?.addEventListener("change", (e: any) => this.valueChanged("entity", e.target.value));
    nameInp?.addEventListener("input", (e: any) => this.valueChanged("name", e.target.value));
    devTypeSel?.addEventListener("change", (e: any) => this.valueChanged("device_type", e.target.value));
    themeSel?.addEventListener("change", (e: any) => this.valueChanged("theme", e.target.value));
    sliderCheck?.addEventListener("change", (e: any) => this.valueChanged("show_slider", e.target.checked));
    badgeCheck?.addEventListener("change", (e: any) => this.valueChanged("show_matter_badge", e.target.checked));
  }
}

// ── Registration in Window Custom Cards ───────────────────────────────────────
if (!customElements.get("matter-apple-card")) {
  customElements.define("matter-apple-card", MatterAppleCard);
}
if (!customElements.get("matter-apple-card-editor")) {
  customElements.define("matter-apple-card-editor", MatterAppleCardEditor);
}

declare global {
  interface Window {
    customCards?: Array<{
      type: string;
      name: string;
      description: string;
      preview: boolean;
      documentationURL: string;
    }>;
  }
}

window.customCards = window.customCards || [];
const existingCard = window.customCards.find((c) => c.type === "matter-apple-card");
if (!existingCard) {
  window.customCards.push({
    type: "matter-apple-card",
    name: "Matter Apple Liquid Glass",
    description: "Tarjeta interactiva Apple Home con cristal Liquid Glass, Display P3, HDR/XDR, 120 FPS ProMotion, OLED True Black y control nativo.",
    preview: true,
    documentationURL: "https://github.com/chrisalvir1/matter-all-in-one-chrisalvir",
  });
}

console.info(
  `%c MATTER-APPLE-CARD %c v${CARD_VERSION} (TypeScript 120Hz ProMotion + Display P3 + HDR + OLED) `,
  "color: white; background: #0284c7; font-weight: bold; border-radius: 4px 0 0 4px; padding: 2px 6px;",
  "color: #0284c7; background: #e0f2fe; font-weight: bold; border-radius: 0 4px 4px 0; padding: 2px 6px;"
);
