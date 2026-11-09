/** Home Assistant temperatures follow the entity's configured unit; Matter/HAP use Celsius. */
export function toCelsius(value: number, unit?: unknown): number {
  return String(unit ?? "").includes("F") ? ((value - 32) * 5) / 9 : value;
}
export function fromCelsius(value: number, unit?: unknown): number {
  return String(unit ?? "").includes("F") ? (value * 9) / 5 + 32 : value;
}
export function illuminance(lux: number): number {
  return lux <= 0
    ? 0
    : Math.max(1, Math.min(65534, Math.round(10000 * Math.log10(lux) + 1)));
}
export function sensorMeasurement(
  state: any,
): { cluster: number; value: number } | undefined {
  const n = Number(state.state);
  if (!Number.isFinite(n) || String(state.state).trim() === "") return;
  const unit = String(state.attributes?.unit_of_measurement ?? "");
  switch (state.attributes?.device_class) {
    case "temperature":
      return { cluster: 0x0402, value: Math.round(toCelsius(n, unit) * 100) };
    case "humidity":
    case "moisture":
      return {
        cluster: 0x0405,
        value: Math.round(Math.max(0, Math.min(100, n)) * 100),
      };
    case "illuminance":
      return { cluster: 0x0400, value: illuminance(n) };
    case "pressure":
    case "atmospheric_pressure":
      return {
        cluster: 0x0403,
        value: Math.round(
          unit === "Pa" ? n / 100 : unit === "kPa" ? n * 10 : n,
        ),
      };
    case "volume_flow_rate":
      return {
        cluster: 0x0404,
        value: Math.round(
          n * (unit === "L/min" ? 0.6 : unit === "L/h" ? 0.01 : 10),
        ),
      };
  }
}
