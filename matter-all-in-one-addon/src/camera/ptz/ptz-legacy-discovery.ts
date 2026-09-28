/**
 * Legacy PTZ discovery records used numeric placeholders ("0 PTZ", "1 PTZ")
 * instead of real camera entity IDs. Remove only those records; valid camera
 * IDs are namespaced (for example camera_front_door) and remain untouched.
 */
export function isLegacyNumberedPtzDiscovery(config: any): boolean {
  const uniqueId = typeof config?.unique_id === "string" ? config.unique_id : "";
  const suffix = [
    "_ptz_zone_sensor",
    "_ptz_zone_selector",
    "_dptz_mode_switch",
  ].find((candidate) => uniqueId.endsWith(candidate));
  if (!suffix) return false;

  const safeId = uniqueId.slice(0, -suffix.length);
  if (!/^\d+$/.test(safeId)) return false;

  const device = config?.device || {};
  const identifiers = Array.isArray(device.identifiers)
    ? device.identifiers.map(String)
    : [String(device.identifiers || "")];
  return (
    identifiers.includes(`matter_aio_${safeId}`) &&
    new RegExp(`^${safeId}\\s+PTZ$`, "i").test(String(device.name || config.name || ""))
  );
}
