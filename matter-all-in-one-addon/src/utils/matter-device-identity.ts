/** Identity shown by the virtual Matter accessory. */
export const MATTER_BRIDGE_VENDOR_ID = 0xfff1;
export const MATTER_BRIDGE_VENDOR_NAME = 'Matter All-in-One Chrisalvir';

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Matter Basic Information serialNumber is limited to 32 characters. */
function toMatterSerial(value: string): string {
  return value.slice(0, 32);
}

/**
 * Prefer the physical serial stored in Home Assistant's device registry.
 * If an integration omits it, use another physical registry identifier before
 * falling back to a stable HA identifier.
 */
export function getMatterSerialNumber(platform: any, entityId: string): string {
  const entityRegistry = platform?.ha?.hassEntities?.get?.(entityId);
  const deviceRegistry = entityRegistry?.device_id
    ? platform?.ha?.hassDevices?.get?.(entityRegistry.device_id)
    : undefined;

  const serial = nonEmptyString(deviceRegistry?.serial_number);
  if (serial) return toMatterSerial(serial);

  const identifier = Array.isArray(deviceRegistry?.identifiers)
    ? deviceRegistry.identifiers.map((entry: unknown) => Array.isArray(entry) ? nonEmptyString(entry[1]) : undefined).find(Boolean)
    : undefined;
  if (identifier) return toMatterSerial(identifier);

  return toMatterSerial(`ha-${entityRegistry?.id ?? entityId.replaceAll('.', '_')}`);
}
