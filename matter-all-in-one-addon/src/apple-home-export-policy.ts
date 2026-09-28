/** Apple Home compatibility policy for the two export transports.
 * Matter remains the default transport. HAP is offered when Apple Home does
 * not expose a useful native category for the Matter device, or when the user
 * explicitly needs the richer HomeKit profile.
 */
export type ExportTransport = "matter" | "hap";
export type AppleHomeExportRecommendation = {
  matter: boolean;
  hap: boolean;
  defaultTransport: ExportTransport;
  reason: string;
};

const NATIVE_MATTER_DOMAINS = new Set([
  "light", "switch", "fan", "vacuum", "lock", "climate", "cover",
  "binary_sensor", "sensor",
]);

const HAP_FALLBACK_DOMAINS = new Set([
  "humidifier", "media_player", "oven", "cooktop", "pet_feeder",
  "camera", "alarm_control_panel", "water_heater", "air_quality",
  "button", "select", "number", "valve", "water_valve", "evse",
]);

export function getAppleHomeExportRecommendation(entityId: string): AppleHomeExportRecommendation {
  const domain = entityId.split(".")[0];
  if (domain === "camera") {
    return { matter: true, hap: true, defaultTransport: "hap", reason: "HomeKit HAP provides the complete camera accessory profile; Matter camera support is limited." };
  }
  if (HAP_FALLBACK_DOMAINS.has(domain)) {
    return { matter: true, hap: true, defaultTransport: "hap", reason: "Matter can expose this entity, but Apple Home may not provide a complete native category or control surface." };
  }
  if (NATIVE_MATTER_DOMAINS.has(domain)) {
    return { matter: true, hap: false, defaultTransport: "matter", reason: "Apple Home has a native Matter category for this entity." };
  }
  return { matter: true, hap: true, defaultTransport: "matter", reason: "Matter is the safe default; HAP is available as a compatibility fallback." };
}

