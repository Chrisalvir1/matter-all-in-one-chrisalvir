import { DeviceRecord } from "../types";
import { getProductImage } from "../data/productImages";

export interface AppleColorConfig {
  name: string;
  hex: string;
  mesh: string;
  top: string;
}

export const APPLE_HOMEPOD_COLORS: Record<string, Record<string, AppleColorConfig>> = {
  homepod_mini: {
    space_gray: { name: "Gris Espacial", hex: "#3C3D40", mesh: "#2A2B2E", top: "#4A4B4F" },
    white: { name: "Blanco", hex: "#E8E8ED", mesh: "#D5D5DC", top: "#FFFFFF" },
    midnight: { name: "Medianoche", hex: "#1C2026", mesh: "#13161B", top: "#282E37" },
    blue: { name: "Azul", hex: "#25537C", mesh: "#193A57", top: "#356B9C" },
    orange: { name: "Naranja", hex: "#E05A3E", mesh: "#A83C25", top: "#F07357" },
    yellow: { name: "Amarillo", hex: "#E8B13D", mesh: "#B58422", top: "#F5C358" },
  },
  homepod: {
    midnight: { name: "Medianoche", hex: "#181B20", mesh: "#101216", top: "#242931" },
    white: { name: "Blanco", hex: "#EDEDF2", mesh: "#D8D8DE", top: "#FFFFFF" },
    space_gray: { name: "Gris Espacial", hex: "#353639", mesh: "#232426", top: "#45464A" },
  },
};

export interface DeviceVisualConfig {
  visualType?: string;
  appleColor?: string;
  roomLabel?: string;
}

const STORAGE_PREFIX = "matter_visual_override_";

export function getDeviceVisualOverride(deviceIdOrEntityId: string): DeviceVisualConfig | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${deviceIdOrEntityId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setDeviceVisualOverride(deviceIdOrEntityId: string, config: DeviceVisualConfig): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${deviceIdOrEntityId}`, JSON.stringify(config));
  } catch {}
}

export interface DetectedDeviceInfo {
  brand: string;
  model: string;
  category: string;
  subtype: string;
  displayName: string;
  isTowerFan: boolean;
  isCeilingFan: boolean;
  isLedStrip: boolean;
  isChandelier: boolean;
  hasLight: boolean;
  hasFan: boolean;
  hasMediaPlayer: boolean;
  inferredArea: string;
  appleColor: string;
  brandColor: string;
  accentColor: string;
  productImageUrl?: string;
  productImageAlt?: string;
}


interface BrandConfig {
  name: string;
  pattern: RegExp;
  brandColor: string; // RGB string "r, g, b"
  accentColor: string; // Hex
}

const BRAND_CONFIGS: BrandConfig[] = [
  { name: "Apple", pattern: /\b(apple|homepod|apple\s*tv|airplay)\b/i, brandColor: "255, 255, 255", accentColor: "#F5F5F7" },
  { name: "Amazon", pattern: /\b(amazon|alexa|echo|fire\s*tv|firestick)\b/i, brandColor: "0, 202, 255", accentColor: "#00CAFF" },
  { name: "Govee", pattern: /\bgovee\b/i, brandColor: "0, 240, 255", accentColor: "#00F0FF" },
  { name: "Tapo", pattern: /\btapo\b/i, brandColor: "0, 150, 255", accentColor: "#0096FF" },
  { name: "TP-Link", pattern: /\b(tp-link|tplink|kasa)\b/i, brandColor: "0, 168, 150", accentColor: "#00A896" },
  { name: "Philips Hue", pattern: /\b(philips\s*hue|hue)\b/i, brandColor: "175, 82, 222", accentColor: "#AF52DE" },
  { name: "SwitchBot", pattern: /\bswitch\s*bot\b/i, brandColor: "239, 68, 68", accentColor: "#EF4444" },
  { name: "Aqara", pattern: /\baqara\b/i, brandColor: "14, 165, 233", accentColor: "#0EA5E9" },
  { name: "Tuya", pattern: /\b(tuya|smart\s*life|_ty_|ty_[a-z]|tuya_local)\b/i, brandColor: "255, 107, 0", accentColor: "#FF6B00" },
  { name: "Sonoff", pattern: /\b(sonoff|ewelink)\b/i, brandColor: "2, 132, 199", accentColor: "#0284C7" },
  { name: "Roborock", pattern: /\broborock\b/i, brandColor: "225, 29, 72", accentColor: "#E11D48" },
  { name: "Roomba", pattern: /\b(roomba|irobot)\b/i, brandColor: "16, 185, 129", accentColor: "#10B981" },
  { name: "Ecovacs", pattern: /\b(ecovacs|deebot)\b/i, brandColor: "2, 132, 199", accentColor: "#38BDF8" },
  { name: "Dreame", pattern: /\bdreame\b/i, brandColor: "217, 119, 6", accentColor: "#F59E0B" },
  { name: "Shelly", pattern: /\bshelly\b/i, brandColor: "2, 132, 199", accentColor: "#38BDF8" },
  { name: "Nanoleaf", pattern: /\bnanoleaf\b/i, brandColor: "34, 197, 94", accentColor: "#22C55E" },
  { name: "WiZ", pattern: /\bwiz\b/i, brandColor: "99, 102, 241", accentColor: "#818CF8" },
  { name: "IKEA", pattern: /\b(ikea|tradfri|trådfri)\b/i, brandColor: "245, 158, 11", accentColor: "#F59E0B" },
  { name: "Broadlink", pattern: /\b(broadlink|rm4|rm\s*mini|rm\s*pro|rm\s*4)\b/i, brandColor: "234, 88, 12", accentColor: "#EA580C" },
  { name: "Ecobee", pattern: /\b(ecobee|ecobee3|ecobee4|smartsensor)\b/i, brandColor: "16, 185, 129", accentColor: "#10B981" },
  { name: "Nest", pattern: /\b(nest|google\s*nest|nest_thermostat)\b/i, brandColor: "66, 133, 244", accentColor: "#4285F4" },
  { name: "Honeywell", pattern: /\bhoneywell\b/i, brandColor: "220, 38, 38", accentColor: "#DC2626" },
  { name: "Ring", pattern: /\b(ring|ringvideo|ring_cam|ring_doorbell|floodlight_cam)\b/i, brandColor: "0, 162, 255", accentColor: "#00A2FF" },
  { name: "Blink", pattern: /\bblink\b/i, brandColor: "59, 130, 246", accentColor: "#3B82F6" },
  { name: "Eufy", pattern: /\beufy\b/i, brandColor: "6, 182, 212", accentColor: "#06B6D4" },
  { name: "Reolink", pattern: /\breolink\b/i, brandColor: "37, 99, 235", accentColor: "#2563EB" },
  { name: "EZVIZ", pattern: /\b(ezviz|cs-[a-z])\b/i, brandColor: "147, 51, 234", accentColor: "#9333EA" },
  { name: "LIFX", pattern: /\blifx\b/i, brandColor: "168, 85, 247", accentColor: "#A855F7" },
  { name: "Yale", pattern: /\byale\b/i, brandColor: "234, 179, 8", accentColor: "#EAB308" },
  { name: "August", pattern: /\baugust\b/i, brandColor: "239, 68, 68", accentColor: "#EF4444" },
  { name: "Hunter", pattern: /\bhunter\b/i, brandColor: "13, 148, 136", accentColor: "#0D9488" },
  { name: "Dyson", pattern: /\bdyson\b/i, brandColor: "139, 92, 246", accentColor: "#8B5CF6" },
  { name: "Dreo", pattern: /\bdreo\b/i, brandColor: "14, 165, 233", accentColor: "#38BDF8" },
  { name: "Xiaomi", pattern: /\b(xiaomi|mijia|mi\s*home|miio)\b/i, brandColor: "255, 105, 0", accentColor: "#FF6900" },
  { name: "Meross", pattern: /\bmeross\b/i, brandColor: "16, 185, 129", accentColor: "#10B981" },
  { name: "Samsung", pattern: /\b(samsung|smartthings|galaxy)\b/i, brandColor: "0, 100, 220", accentColor: "#1428A0" },
  { name: "Sony", pattern: /\b(sony|bravia|xperia)\b/i, brandColor: "0, 70, 175", accentColor: "#0046AF" },
  { name: "Hisense", pattern: /\bhisense\b/i, brandColor: "2, 132, 199", accentColor: "#0EA5E9" },
  { name: "Vimtag", pattern: /\bvimtag\b/i, brandColor: "34, 197, 94", accentColor: "#22C55E" },
  { name: "Wyze", pattern: /\bwyze\b/i, brandColor: "0, 191, 164", accentColor: "#00BFA4" },
];

export function detectDevice(device: DeviceRecord): DetectedDeviceInfo {
  const mfr = (device.manufacturer || "").trim();
  const rawModel = (device.model || "").trim();
  const devName = (device.name || "").trim();

  // Inspect all entity IDs, names, and friendly names
  const entityTexts = device.entities
    .map((e) => `${e.entityId} ${e.name || ""} ${(e.attributes?.friendly_name as string) || ""}`)
    .join(" ");

  const searchPool = `${devName} ${mfr} ${rawModel} ${entityTexts}`;
  const poolLower = searchPool.toLowerCase();

  // 1. Detect Brand & Theme Colors
  let detectedBrand = mfr && !mfr.toLowerCase().includes("desconocido") ? mfr : "";
  let brandColor = "0, 122, 255"; // Default Apple blue
  let accentColor = "#007AFF";

  let matchedConfig: BrandConfig | undefined;
  for (const cfg of BRAND_CONFIGS) {
    if (cfg.pattern.test(searchPool)) {
      matchedConfig = cfg;
      break;
    }
  }

  if (matchedConfig) {
    detectedBrand = matchedConfig.name;
    brandColor = matchedConfig.brandColor;
    accentColor = matchedConfig.accentColor;
  } else if (!detectedBrand || detectedBrand.toLowerCase() === "home assistant") {
    detectedBrand = "Home Assistant";
    brandColor = "56, 189, 248";
    accentColor = "#38BDF8";
  }

  // 2. Detect Model
  let detectedModel = rawModel;
  const modelSearchPool = `${rawModel} ${devName} ${entityTexts}`;

  // Apple TV models
  if (poolLower.includes("apple tv") || poolLower.includes("appletv")) {
    detectedBrand = "Apple";
    brandColor = "255, 255, 255";
    accentColor = "#FFFFFF";
    if (poolLower.includes("4k")) {
      if (poolLower.includes("3rd") || poolLower.includes("3ra") || poolLower.includes("gen 3") || poolLower.includes("a2843")) {
        detectedModel = "Apple TV 4K (3.ª gen)";
      } else if (poolLower.includes("2nd") || poolLower.includes("2da") || poolLower.includes("gen 2") || poolLower.includes("a2169")) {
        detectedModel = "Apple TV 4K (2.ª gen)";
      } else {
        detectedModel = "Apple TV 4K";
      }
    } else if (poolLower.includes("hd") || poolLower.includes("4th gen") || poolLower.includes("a1625")) {
      detectedModel = "Apple TV HD";
    } else {
      detectedModel = "Apple TV 4K";
    }
  }

  // Apple HomePod models
  if (poolLower.includes("homepod")) {
    detectedBrand = "Apple";
    brandColor = "255, 255, 255";
    accentColor = "#FFFFFF";
    if (poolLower.includes("mini") || poolLower.includes("a2374")) {
      detectedModel = "HomePod Mini";
    } else {
      detectedModel = "HomePod (2.ª gen)";
    }
  }

  // Govee models (H7133, H7130, H618A, H6199, H6072, H5080, etc.)
  const goveeModelMatch = modelSearchPool.match(/\b(H[0-9]{4}[A-Z0-9]?)\b/i);
  if (goveeModelMatch) {
    detectedModel = goveeModelMatch[1].toUpperCase();
    if (detectedBrand === "Home Assistant") {
      detectedBrand = "Govee";
      brandColor = "0, 240, 255";
      accentColor = "#00F0FF";
    }
  }

  // Tapo models (L530, L510, L630, P100, P110, P115, C200, C210, C310, etc.)
  const tapoModelMatch = modelSearchPool.match(/\b([LPSC][0-9]{3}[A-Z]?)\b/i);
  if (tapoModelMatch && (detectedBrand.toLowerCase().includes("tapo") || poolLower.includes("tapo"))) {
    detectedModel = tapoModelMatch[1].toUpperCase();
    detectedBrand = "Tapo";
    brandColor = "0, 150, 255";
    accentColor = "#0096FF";
  }

  // Roborock models
  const roborockMatch = modelSearchPool.match(/\b(S[5-8]|Q[5-8]|Dyad|Curv)\s*(MaxV|Max|Pro|Ultra|Plus)?\b/i);
  if (roborockMatch && (detectedBrand.toLowerCase().includes("roborock") || poolLower.includes("roborock"))) {
    detectedModel = roborockMatch[0];
    detectedBrand = "Roborock";
    brandColor = "225, 29, 72";
    accentColor = "#E11D48";
  }

  // SwitchBot models
  const switchBotMatch = modelSearchPool.match(/\b(Curtain\s*3?|Blind\s*Tilt|Lock\s*Pro|Lock|Hub\s*2|Hub\s*Mini|Bot|Meter\s*Plus|Meter)\b/i);
  if (switchBotMatch && (detectedBrand.toLowerCase().includes("switchbot") || poolLower.includes("switchbot"))) {
    detectedModel = switchBotMatch[0];
    detectedBrand = "SwitchBot";
    brandColor = "239, 68, 68";
    accentColor = "#EF4444";
  }

  // Shelly models
  const shellyMatch = modelSearchPool.match(/\b(Plus\s*(?:1PM|1|2PM|i4)|Pro\s*(?:1|2|4PM)|(?:1PM|1|2\.5|EM|3EM))\b/i);
  if (shellyMatch && (detectedBrand.toLowerCase().includes("shelly") || poolLower.includes("shelly"))) {
    detectedModel = shellyMatch[0];
    detectedBrand = "Shelly";
    brandColor = "2, 132, 199";
    accentColor = "#38BDF8";
  }

  // Sonoff models
  const sonoffMatch = modelSearchPool.match(/\b(Basic(?:R[23])?|Mini(?:R[23])?|S26(?:R2)?|Dual(?:R[23])?|NSPanel)\b/i);
  if (sonoffMatch && (detectedBrand.toLowerCase().includes("sonoff") || poolLower.includes("sonoff"))) {
    detectedModel = sonoffMatch[0];
    detectedBrand = "Sonoff";
    brandColor = "2, 132, 199";
    accentColor = "#0284C7";
  }

  // Philips Hue models
  const hueMatch = modelSearchPool.match(/\b(Play|Go|Signe|Iris|Lightstrip|Bloom|Ambiance)\b/i);
  if (hueMatch && (detectedBrand.toLowerCase().includes("hue") || poolLower.includes("hue"))) {
    detectedModel = `Hue ${hueMatch[0]}`;
    detectedBrand = "Philips Hue";
    brandColor = "175, 82, 222";
    accentColor = "#AF52DE";
  }

  // 3. Functional Subtype Classification
  const hasMediaPlayer = device.entities.some((e) => e.domain === "media_player");
  const hasFan = device.entities.some((e) => e.domain === "fan");
  const hasLight = device.entities.some((e) => e.domain === "light");
  const hasClimate = device.entities.some((e) => e.domain === "climate");
  const hasCover = device.entities.some((e) => e.domain === "cover");
  const hasLock = device.entities.some((e) => e.domain === "lock");
  const hasVacuum = device.entities.some((e) => e.domain === "vacuum");
  const hasCamera = device.entities.some((e) => e.domain === "camera");
  const hasSensor = device.entities.some((e) => e.domain === "sensor" || e.domain === "binary_sensor");
  const hasSwitch = device.entities.some((e) => e.domain === "switch");

  // Fan Subtyping
  const isTowerFan =
    hasFan &&
    (poolLower.includes("h7133") ||
      poolLower.includes("h7130") ||
      poolLower.includes("h7131") ||
      poolLower.includes("h7132") ||
      poolLower.includes("tower") ||
      poolLower.includes("torre") ||
      poolLower.includes("columna") ||
      poolLower.includes("dreo") ||
      poolLower.includes("purifier"));

  const isCeilingFan =
    hasFan &&
    (hasLight ||
      poolLower.includes("techo") ||
      poolLower.includes("ceiling") ||
      poolLower.includes("ventilador de sala") ||
      poolLower.includes("abanico") ||
      poolLower.includes("hunter"));

  // Light Subtyping
  const isChandelier =
    hasLight &&
    (poolLower.includes("candelabro") ||
      poolLower.includes("chandelier") ||
      poolLower.includes("araña") ||
      poolLower.includes("arana") ||
      poolLower.includes("colgante cristal"));

  const isLedStrip =
    hasLight &&
    (poolLower.includes("strip") ||
      poolLower.includes("tira") ||
      poolLower.includes("rgbic") ||
      poolLower.includes("neon") ||
      poolLower.includes("neón") ||
      poolLower.includes("cinta") ||
      poolLower.startsWith("h61"));

  const isGoveeLyra =
    hasLight &&
    (poolLower.includes("h6072") ||
      poolLower.includes("h6076") ||
      poolLower.includes("lyra") ||
      poolLower.includes("aura") ||
      poolLower.includes("esquina") ||
      poolLower.includes("corner"));

  const isGoveeDreamview =
    hasLight &&
    (poolLower.includes("h6199") ||
      poolLower.includes("h6054") ||
      poolLower.includes("dreamview") ||
      poolLower.includes("immersion") ||
      poolLower.includes("tv backlight"));

  const isGoveeGlide =
    hasLight &&
    (poolLower.includes("h6061") ||
      poolLower.includes("h6062") ||
      poolLower.includes("glide") ||
      poolLower.includes("hexa") ||
      poolLower.includes("wall light"));

  const isFloorLamp =
    hasLight &&
    (isGoveeLyra || poolLower.includes("lámpara de pie") || poolLower.includes("lampara de pie") || poolLower.includes("piso"));

  const isTableLamp =
    hasLight &&
    (poolLower.includes("mesa") || poolLower.includes("noche") || poolLower.includes("velador") || poolLower.includes("desk"));

  const isCeilingSpot =
    hasLight &&
    (poolLower.includes("spot") ||
      poolLower.includes("empotrado") ||
      poolLower.includes("plafón") ||
      poolLower.includes("plafon") ||
      poolLower.includes("downlight"));

  let subtype = "generic";
  let category = "Dispositivo Inteligente";

  // Priority classification based on real technical domain first
  if (hasMediaPlayer || poolLower.includes("apple tv") || poolLower.includes("homepod") || poolLower.includes("alexa") || poolLower.includes("echo") || poolLower.includes("fire tv")) {
    if (poolLower.includes("echo show") || (poolLower.includes("echo") && poolLower.includes("show"))) {
      subtype = "echo_show";
      category = "Pantalla Inteligente Echo Show";
    } else if (poolLower.includes("echo studio")) {
      subtype = "echo_studio";
      category = "Altavoz Echo Studio";
    } else if (poolLower.includes("echo pop")) {
      subtype = "echo_pop";
      category = "Altavoz Echo Pop";
    } else if (poolLower.includes("echo dot") || poolLower.includes("dot")) {
      subtype = "echo_dot";
      category = "Altavoz Echo Dot";
    } else if (poolLower.includes("fire tv") || poolLower.includes("firestick") || poolLower.includes("fire_tv")) {
      subtype = "fire_tv";
      category = "Amazon Fire TV";
    } else if (poolLower.includes("echo") || poolLower.includes("alexa")) {
      subtype = "echo_dot";
      category = "Altavoz Amazon Echo";
    } else if (poolLower.includes("apple tv") || poolLower.includes("appletv") || poolLower.includes("tv")) {
      subtype = "apple_tv";
      category = "Apple TV 4K";
    } else if (poolLower.includes("mini")) {
      subtype = "homepod_mini";
      category = "Apple HomePod Mini";
    } else {
      subtype = "homepod";
      category = "Apple HomePod";
    }
  } else if (
    poolLower.includes("apagador") ||
    poolLower.includes("wall switch") ||
    poolLower.includes("cb03") ||
    poolLower.includes("3 gang") ||
    poolLower.includes("2 gang") ||
    poolLower.includes("triple") ||
    (hasSwitch && device.entities.filter((e) => e.domain === "switch").length >= 2)
  ) {
    const swCount = device.entities.filter((e) => e.domain === "switch" || e.domain === "light").length;
    subtype = "multi_gang_switch";
    category = swCount >= 3 ? "Apagador Táctil Triple" : swCount === 2 ? "Apagador Táctil Doble" : "Apagador Inteligente de Pared";
  } else if (hasFan) {
    if (isTowerFan) {
      subtype = "tower_fan";
      category = "Ventilador de Torre";
    } else if (isCeilingFan) {
      subtype = "ceiling_fan";
      category = hasLight ? "Ventilador de Techo con Luz" : "Ventilador de Techo";
    } else {
      subtype = "pedestal_fan";
      category = "Ventilador de Pie / Pedestal";
    }
  } else if (hasLight) {
    if (isChandelier) {
      subtype = "chandelier";
      category = "Candelabro de Techo";
    } else if (isGoveeLyra) {
      subtype = "govee_lyra";
      category = "Lámpara de Esquina Lyra";
    } else if (isGoveeDreamview) {
      subtype = "govee_dreamview";
      category = "Govee DreamView TV";
    } else if (isGoveeGlide) {
      subtype = "govee_glide";
      category = "Paneles de Pared Glide";
    } else if (isLedStrip) {
      subtype = "led_strip";
      category = "Tira LED RGBIC / Neón";
    } else if (isFloorLamp) {
      subtype = "floor_lamp";
      category = "Lámpara de Pie";
    } else if (isTableLamp) {
      subtype = "table_lamp";
      category = "Lámpara de Mesa";
    } else if (isCeilingSpot) {
      subtype = "ceiling_spot";
      category = "Foco Empotrado en Techo";
    } else if (
      poolLower.includes("dimmer") ||
      poolLower.includes("filament") ||
      poolLower.includes("filamento") ||
      poolLower.includes("vintage") ||
      poolLower.includes("colgante") ||
      poolLower.includes("pendant")
    ) {
      subtype = "hanging_bulbs";
      category = "Bombillos de Filamento Colgantes";
    } else {
      subtype = "bulb";
      category = "Bombilla Inteligente";
    }
  } else if (hasVacuum) {
    subtype = "vacuum";
    category = "Aspiradora Robot";
  } else if (hasClimate) {
    // Specific thermostat brands
    if (poolLower.includes("ecobee") || poolLower.includes("smartsensor")) {
      if (poolLower.includes("sensor") || poolLower.includes("smartsensor")) {
        subtype = "ecobee_sensor";
        category = "Sensor de Habitación Ecobee";
      } else {
        subtype = "ecobee_thermostat";
        category = "Termostato Ecobee Premium";
      }
    } else if (poolLower.includes("nest") || poolLower.includes("google_nest")) {
      subtype = "nest_thermostat";
      category = "Termostato Nest";
    } else {
      subtype = "thermostat";
      category = "Termostato / Clima";
    }
  } else if (device.entities.some((e) => e.domain === "humidifier")) {
    subtype = "humidifier";
    category = "Humidificador Inteligente";
  } else if (hasCover) {
    subtype = "cover";
    category = "Persiana / Cortina Motorizada";
  } else if (hasLock) {
    if (poolLower.includes("yale") || poolLower.includes("schlage") || poolLower.includes("keypad") || poolLower.includes("teclado")) {
      subtype = "keypad_deadbolt";
      category = "Cerradura con Teclado Táctil";
    } else {
      subtype = "smart_turn_lock";
      category = "Cerrojo Inteligente de Giro";
    }
  } else if (hasCamera) {
    if (poolLower.includes("doorbell") || poolLower.includes("timbre") || poolLower.includes("ring") || poolLower.includes("hello")) {
      subtype = "doorbell";
      category = "Timbre con Video";
    } else if (poolLower.includes("c200") || poolLower.includes("c210") || poolLower.includes("ptz") || poolLower.includes("360") || poolLower.includes("domo") || poolLower.includes("pan")) {
      subtype = "ptz_camera";
      category = "Cámara Domo PTZ 360°";
    } else {
      subtype = "bullet_camera";
      category = "Cámara Exterior Bala";
    }
  } else if (hasSwitch && (poolLower.includes("plug") || poolLower.includes("enchufe") || poolLower.includes("toma") || poolLower.includes("socket"))) {
    subtype = "plug";
    category = "Enchufe Inteligente";
  } else if (poolLower.includes("broadlink") || poolLower.includes("rm4") || poolLower.includes("rm mini") || poolLower.includes("rm pro") || poolLower.includes("ir blaster") || poolLower.includes("control remoto")) {
    subtype = "ir_blaster";
    category = "Control Remoto IR Universal";
  } else if (hasSwitch) {
    subtype = "switch";
    category = "Interruptor Inteligente";
  } else if (poolLower.includes("ecobee") && hasSensor) {
    subtype = "ecobee_sensor";
    category = "Sensor de Habitación Ecobee";
  } else if (hasSensor) {
    subtype = "sensor";
    category = "Sensor Inteligente";
  }

  // 4. Inferred Area (Room Fallback when device.area is empty)
  let inferredArea = device.area || "";
  if (!inferredArea) {
    if (poolLower.includes("cocina") || poolLower.includes("kitchen")) inferredArea = "Cocina";
    else if (poolLower.includes("playroom") || poolLower.includes("juegos") || poolLower.includes("game")) inferredArea = "Playroom";
    else if (poolLower.includes("sala") || poolLower.includes("living") || poolLower.includes("salon")) inferredArea = "Sala";
    else if (poolLower.includes("comedor") || poolLower.includes("dining")) inferredArea = "Comedor";
    else if (poolLower.includes("recámara") || poolLower.includes("recamara") || poolLower.includes("dormitorio") || poolLower.includes("habitación") || poolLower.includes("habitacion") || poolLower.includes("cuarto") || poolLower.includes("bedroom")) inferredArea = "Recámara";
    else if (poolLower.includes("baño") || poolLower.includes("bano") || poolLower.includes("toilet") || poolLower.includes("bathroom")) inferredArea = "Baño";
    else if (poolLower.includes("patio") || poolLower.includes("jardín") || poolLower.includes("jardin") || poolLower.includes("terraza") || poolLower.includes("outdoor")) inferredArea = "Patio / Jardín";
    else if (poolLower.includes("oficina") || poolLower.includes("estudio") || poolLower.includes("office")) inferredArea = "Estudio / Oficina";
    else if (poolLower.includes("pasillo") || poolLower.includes("entrada") || poolLower.includes("foyer") || poolLower.includes("hall")) inferredArea = "Entrada / Pasillo";
    else if (poolLower.includes("cochera") || poolLower.includes("garaje") || poolLower.includes("garage")) inferredArea = "Garaje";
  }

  // 5. Check User Manual Overrides (Persistent User Preference)
  let appleColor = "space_gray";
  const override = getDeviceVisualOverride(device.id) || (device.entities[0] ? getDeviceVisualOverride(device.entities[0].entityId) : null);
  if (override) {
    if (override.visualType && override.visualType !== "auto") {
      subtype = override.visualType;
      // Re-adjust category label
      if (subtype === "chandelier") category = "Candelabro de Techo";
      else if (subtype === "bulb") category = "Bombilla Inteligente";
      else if (subtype === "led_strip") category = "Tira LED RGBIC / Neón";
      else if (subtype === "floor_lamp" || subtype === "govee_lyra") category = "Lámpara de Pie";
      else if (subtype === "ceiling_spot") category = "Foco Empotrado en Techo";
      else if (subtype === "apple_tv") category = "Apple TV 4K";
      else if (subtype === "homepod_mini") category = "Apple HomePod Mini";
      else if (subtype === "homepod") category = "Apple HomePod";
      else if (subtype === "echo_dot") category = "Amazon Echo Dot";
      else if (subtype === "echo_show") category = "Pantalla Echo Show";
      else if (subtype === "echo_studio") category = "Altavoz Echo Studio";
      else if (subtype === "echo_pop") category = "Altavoz Echo Pop";
      else if (subtype === "fire_tv") category = "Amazon Fire TV";
      else if (subtype === "multi_gang_switch") category = "Apagador Táctil de Pared";
      else if (subtype === "ceiling_fan") category = "Ventilador de Techo con Luz";
      else if (subtype === "tower_fan") category = "Ventilador de Torre";
      else if (subtype === "doorbell") category = "Timbre con Video";
      else if (subtype === "ptz_camera") category = "Cámara Domo PTZ 360°";
      else if (subtype === "bullet_camera") category = "Cámara Exterior Bala";
      else if (subtype === "keypad_deadbolt") category = "Cerradura con Teclado Táctil";
      else if (subtype === "smart_turn_lock") category = "Cerrojo Inteligente de Giro";
    }
    if (override.appleColor) appleColor = override.appleColor;
    if (override.roomLabel) inferredArea = override.roomLabel;
  }

  // 6. Resolve real product image (CDN photo)
  const productImgResult = getProductImage(detectedBrand, subtype, detectedModel, appleColor);

  return {
    brand: detectedBrand,
    model: detectedModel,
    category,
    subtype,
    displayName: devName || category,
    isTowerFan,
    isCeilingFan,
    isLedStrip,
    isChandelier,
    hasLight,
    hasFan,
    hasMediaPlayer,
    inferredArea,
    appleColor,
    brandColor,
    accentColor,
    productImageUrl: productImgResult?.url,
    productImageAlt: productImgResult?.alt,
  };
}
