/**
 * Names are presentation data in Home Assistant 2026.11 and later. Keep
 * entity_id / device_id as identities, and consider both registry and state
 * names only when searching for a human-readable match (e.g. motion sensors).
 */
export function getHaEntitySearchText(
  ha:
    | {
        hassEntities?: Map<
          string,
          {
            name?: string | null;
            original_name?: string | null;
            device_id?: string | null;
          }
        >;
        hassDevices?: Map<
          string,
          { name?: string | null; name_by_user?: string | null }
        >;
        hassStates?: Map<string, { attributes?: { friendly_name?: string } }>;
      }
    | undefined,
  entityId: string,
): string {
  const registry = ha?.hassEntities?.get(entityId);
  const device = registry?.device_id
    ? ha?.hassDevices?.get(registry.device_id)
    : undefined;
  // Preserve existing matches on stable HA. Registry names are a fallback,
  // not additional fuzzy search terms, when friendly_name is already set.
  const legacyName = ha?.hassStates?.get(entityId)?.attributes?.friendly_name;
  if (legacyName) return `${entityId} ${legacyName}`;
  return [
    entityId,
    registry?.name,
    registry?.original_name,
    device?.name_by_user,
    device?.name,
  ]
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    )
    .join(" ");
}
