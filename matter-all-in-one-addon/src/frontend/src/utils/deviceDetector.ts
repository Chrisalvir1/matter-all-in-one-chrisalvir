import { DeviceRecord } from "../types";

export interface DetectedDeviceInfo {
  brand: string;
  model: string;
  category: string;
  subtype: string;
  displayName: string;
  isTowerFan: boolean;
  isCeilingFan: boolean;
  isLedStrip: boolean;
  hasLight: boolean;
  hasFan: boolean;
  brandColor: string;
  accentColor: string;
}

interface BrandConfig {
  name: string;
  pattern: RegExp;
  brandColor: string; // RGB string "r, g, b"
  accentColor: string; // Hex
}

const BRAND_CONFIGS: BrandConfig[] = [
  { name: "Govee", pattern: /\bgovee\b/i, brandColor: "0, 240, 255", accentColor: "#00F0FF" },
  { name: "Tapo", pattern: /\btapo\b/i, brandColor: "0, 150, 255", accentColor: "#0096FF" },
  { name: "TP-Link", pattern: /\b(tp-link|tplink|kasa)\b/i, brandColor: "0, 168, 150", accentColor: "#00A896" },
  { name: "Philips Hue", pattern: /\b(philips\s*hue|hue)\b/i, brandColor: "175, 82, 222", accentColor: "#AF52DE" },
  { name: "SwitchBot", pattern: /\bswitch\s*bot\b/i, brandColor: "239, 68, 68", accentColor: "#EF4444" },
  { name: "Aqara", pattern: /\baqara\b/i, brandColor: "14, 165, 233", accentColor: "#0EA5E9" },
  { name: "Tuya", pattern: /\b(tuya|smart\s*life)\b/i, brandColor: "255, 107, 0", accentColor: "#FF6B00" },
  { name: "Sonoff", pattern: /\b(sonoff|ewelink)\b/i, brandColor: "2, 132, 199", accentColor: "#0284C7" },
  { name: "Roborock", pattern: /\broborock\b/i, brandColor: "225, 29, 72", accentColor: "#E11D48" },
  { name: "Roomba", pattern: /\b(roomba|irobot)\b/i, brandColor: "16, 185, 129", accentColor: "#10B981" },
  { name: "Ecovacs", pattern: /\b(ecovacs|deebot)\b/i, brandColor: "2, 132, 199", accentColor: "#38BDF8" },
  { name: "Dreame", pattern: /\bdreame\b/i, brandColor: "217, 119, 6", accentColor: "#F59E0B" },
  { name: "Shelly", pattern: /\bshelly\b/i, brandColor: "2, 132, 199", accentColor: "#38BDF8" },
  { name: "Nanoleaf", pattern: /\bnanoleaf\b/i, brandColor: "34, 197, 94", accentColor: "#22C55E" },
  { name: "WiZ", pattern: /\bwiz\b/i, brandColor: "99, 102, 241", accentColor: "#818CF8" },
  { name: "IKEA", pattern: /\b(ikea|tradfri|trådfri)\b/i, brandColor: "245, 158, 11", accentColor: "#F59E0B" },
  { name: "Broadlink", pattern: /\bbroadlink\b/i, brandColor: "234, 88, 12", accentColor: "#EA580C" },
  { name: "Ecobee", pattern: /\becobee\b/i, brandColor: "16, 185, 129", accentColor: "#10B981" },
  { name: "Nest", pattern: /\b(nest|google\s*nest)\b/i, brandColor: "66, 133, 244", accentColor: "#4285F4" },
  { name: "Honeywell", pattern: /\bhoneywell\b/i, brandColor: "220, 38, 38", accentColor: "#DC2626" },
  { name: "Ring", pattern: /\bring\b/i, brandColor: "2, 132, 199", accentColor: "#0284C7" },
  { name: "Blink", pattern: /\bblink\b/i, brandColor: "59, 130, 246", accentColor: "#3B82F6" },
  { name: "Eufy", pattern: /\beufy\b/i, brandColor: "6, 182, 212", accentColor: "#06B6D4" },
  { name: "Reolink", pattern: /\breolink\b/i, brandColor: "37, 99, 235", accentColor: "#2563EB" },
  { name: "EZVIZ", pattern: /\bezviz\b/i, brandColor: "147, 51, 234", accentColor: "#9333EA" },
  { name: "LIFX", pattern: /\blifx\b/i, brandColor: "168, 85, 247", accentColor: "#A855F7" },
  { name: "Yale", pattern: /\byale\b/i, brandColor: "234, 179, 8", accentColor: "#EAB308" },
  { name: "August", pattern: /\baugust\b/i, brandColor: "239, 68, 68", accentColor: "#EF4444" },
  { name: "Hunter", pattern: /\bhunter\b/i, brandColor: "13, 148, 136", accentColor: "#0D9488" },
  { name: "Dyson", pattern: /\bdyson\b/i, brandColor: "139, 92, 246", accentColor: "#8B5CF6" },
  { name: "Dreo", pattern: /\bdreo\b/i, brandColor: "14, 165, 233", accentColor: "#38BDF8" },
  { name: "Xiaomi", pattern: /\b(xiaomi|mijia)\b/i, brandColor: "255, 105, 0", accentColor: "#FF6900" },
  { name: "Meross", pattern: /\bmeross\b/i, brandColor: "16, 185, 129", accentColor: "#10B981" },
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

  // Check matching brand config
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

  // Search rawModel first for specific model identifiers, then devName and entities
  const modelSearchPool = `${rawModel} ${devName} ${entityTexts}`;

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

  // Roborock models (S8 Pro Ultra, S8 MaxV, S7 MaxV, S7, Q8 Max, Q7 Max, Q Revo, Dyad, Curv)
  const roborockMatch = modelSearchPool.match(/\b(S[5-8]|Q[5-8]|Dyad|Curv)\s*(MaxV|Max|Pro|Ultra|Plus)?\b/i);
  if (roborockMatch && (detectedBrand.toLowerCase().includes("roborock") || poolLower.includes("roborock"))) {
    detectedModel = roborockMatch[0];
    detectedBrand = "Roborock";
    brandColor = "225, 29, 72";
    accentColor = "#E11D48";
  }

  // SwitchBot models (Curtain 3, Curtain, Bot, Lock Pro, Lock, Hub 2, Meter Plus)
  const switchBotMatch = modelSearchPool.match(/\b(Curtain\s*3?|Blind\s*Tilt|Lock\s*Pro|Lock|Hub\s*2|Hub\s*Mini|Bot|Meter\s*Plus|Meter)\b/i);
  if (switchBotMatch && (detectedBrand.toLowerCase().includes("switchbot") || poolLower.includes("switchbot"))) {
    detectedModel = switchBotMatch[0];
    detectedBrand = "SwitchBot";
    brandColor = "239, 68, 68";
    accentColor = "#EF4444";
  }

  // Shelly models (Plus 1PM, Plus 1, Plus 2PM, 2.5, 1PM, Pro 4PM, EM, 3EM)
  const shellyMatch = modelSearchPool.match(/\b(Plus\s*(?:1PM|1|2PM|i4)|Pro\s*(?:1|2|4PM)|(?:1PM|1|2\.5|EM|3EM))\b/i);
  if (shellyMatch && (detectedBrand.toLowerCase().includes("shelly") || poolLower.includes("shelly"))) {
    detectedModel = shellyMatch[0];
    detectedBrand = "Shelly";
    brandColor = "2, 132, 199";
    accentColor = "#38BDF8";
  }

  // Sonoff models (BasicR2, Basic, MiniR2, Mini, S26, DualR3, NSPanel)
  const sonoffMatch = modelSearchPool.match(/\b(Basic(?:R[23])?|Mini(?:R[23])?|S26(?:R2)?|Dual(?:R[23])?|NSPanel)\b/i);
  if (sonoffMatch && (detectedBrand.toLowerCase().includes("sonoff") || poolLower.includes("sonoff"))) {
    detectedModel = sonoffMatch[0];
    detectedBrand = "Sonoff";
    brandColor = "2, 132, 199";
    accentColor = "#0284C7";
  }

  // Philips Hue models (Play, Go, Signe, Iris, Lightstrip, Bloom)
  const hueMatch = modelSearchPool.match(/\b(Play|Go|Signe|Iris|Lightstrip|Bloom|Ambiance)\b/i);
  if (hueMatch && (detectedBrand.toLowerCase().includes("hue") || poolLower.includes("hue"))) {
    detectedModel = `Hue ${hueMatch[0]}`;
    detectedBrand = "Philips Hue";
    brandColor = "175, 82, 222";
    accentColor = "#AF52DE";
  }

  // 3. Functional Subtype Classification
  const hasFan = device.entities.some((e) => e.domain === "fan");
  const hasLight = device.entities.some((e) => e.domain === "light");
  const hasClimate = device.entities.some((e) => e.domain === "climate");
  const hasCover = device.entities.some((e) => e.domain === "cover");
  const hasLock = device.entities.some((e) => e.domain === "lock");
  const hasVacuum = device.entities.some((e) => e.domain === "vacuum");
  const hasCamera = device.entities.some((e) => e.domain === "camera");
  const hasSensor = device.entities.some((e) => e.domain === "sensor" || e.domain === "binary_sensor");
  const hasSwitch = device.entities.some((e) => e.domain === "switch");

  // Detailed Fan Subtyping
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

  // Detailed Light Subtyping
  const isLedStrip =
    hasLight &&
    (poolLower.includes("strip") ||
      poolLower.includes("tira") ||
      poolLower.includes("rgbic") ||
      poolLower.includes("neon") ||
      poolLower.includes("neón") ||
      poolLower.includes("cinta") ||
      poolLower.startsWith("h61"));

  const isLamp =
    hasLight &&
    (poolLower.includes("lamp") ||
      poolLower.includes("lámpara") ||
      poolLower.includes("lampara") ||
      poolLower.includes("lyra") ||
      poolLower.includes("signe") ||
      poolLower.includes("iris") ||
      poolLower.includes("h607"));

  let subtype = "generic";
  if (isTowerFan) subtype = "tower_fan";
  else if (isCeilingFan) subtype = "ceiling_fan";
  else if (hasFan) subtype = "pedestal_fan";
  else if (isLedStrip) subtype = "led_strip";
  else if (isLamp) subtype = "lamp";
  else if (hasLight) subtype = "bulb";
  else if (hasVacuum) subtype = "vacuum";
  else if (hasClimate) subtype = "thermostat";
  else if (hasCover) subtype = "cover";
  else if (hasLock) subtype = "lock";
  else if (hasCamera) subtype = "camera";
  else if (hasSwitch && (poolLower.includes("plug") || poolLower.includes("enchufe") || poolLower.includes("toma") || poolLower.includes("socket"))) subtype = "plug";
  else if (hasSwitch) subtype = "switch";
  else if (hasSensor) subtype = "sensor";

  // Human-Friendly Categorization (Spanish)
  let category = "Dispositivo Inteligente";
  if (subtype === "tower_fan") category = "Ventilador de Torre";
  else if (subtype === "ceiling_fan") category = hasLight ? "Ventilador de Techo con Luz" : "Ventilador de Techo";
  else if (subtype === "pedestal_fan") category = "Ventilador de Pie / Pedestal";
  else if (subtype === "led_strip") category = "Tira LED RGBIC / Neón";
  else if (subtype === "lamp") category = "Lámpara Inteligente";
  else if (subtype === "bulb") category = "Bombilla Inteligente";
  else if (subtype === "vacuum") category = "Aspiradora Robot";
  else if (subtype === "thermostat") category = "Termostato / Clima";
  else if (subtype === "cover") category = "Persiana / Cortina Motorizada";
  else if (subtype === "lock") category = "Cerradura Electrónica";
  else if (subtype === "camera") category = "Cámara de Seguridad";
  else if (subtype === "plug") category = "Enchufe Inteligente";
  else if (subtype === "switch") category = "Interruptor Inteligente";
  else if (subtype === "sensor") category = "Sensor Inteligente";

  return {
    brand: detectedBrand,
    model: detectedModel,
    category,
    subtype,
    displayName: devName || category,
    isTowerFan,
    isCeilingFan,
    isLedStrip,
    hasLight,
    hasFan,
    brandColor,
    accentColor,
  };
}
