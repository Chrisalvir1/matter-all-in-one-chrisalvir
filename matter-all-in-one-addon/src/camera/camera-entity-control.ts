/** Limit camera controls to supported HA services, never a generic toggle fallback. */
export async function controlCameraEntity(
  ha:
    | {
        connected?: boolean;
        hassStates?: Map<string, { state: string }>;
        callService: (
          domain: string,
          service: string,
          entityId: string,
        ) => Promise<unknown>;
      }
    | undefined,
  entityId: unknown,
  action: unknown,
) {
  if (
    typeof entityId !== "string" ||
    !/^(light|siren|switch|button)\.[a-z0-9_]+$/.test(entityId)
  )
    throw new Error("Entidad de control no admitida");
  const domain = entityId.split(".")[0];
  const allowed =
    domain === "button" ? ["press"] : ["turn_on", "turn_off", "toggle"];
  if (typeof action !== "string" || !allowed.includes(action))
    throw new Error("Acción no admitida para esta entidad");
  const state = ha?.hassStates?.get(entityId)?.state;
  if (
    !ha ||
    ha.connected === false ||
    !state ||
    state === "unavailable" ||
    state === "unknown"
  )
    throw new Error("Entidad no disponible; no se envió el comando");
  await ha.callService(domain, action, entityId);
  return {
    success: true,
    entityId,
    state: ha.hassStates?.get(entityId)?.state === "on",
  };
}
