import type { CameraUiCameraRecord } from "./cameraui-types.js";

/** Resolve a Camera.UI record to a real Home Assistant camera entity. */
export function resolveHaCameraEntityId(
  camera: Pick<
    CameraUiCameraRecord,
    "id" | "name" | "realEntities"
  >,
  hassStates?: Map<string, any>,
): string | undefined {
  if (!hassStates) return undefined;

  const isStreamCameraEntityId = (value: unknown): value is string =>
    typeof value === "string" &&
    /^camera\.[a-z0-9_]+$/.test(value) &&
    !/(?:^|_)(?:snapshot|still|image)(?:_|$)/i.test(value);
  const candidates: string[] = [];
  for (const entity of camera.realEntities || []) {
    if (isStreamCameraEntityId(entity.id)) candidates.push(entity.id);
  }

  const cameraName = (camera.name || "").toLowerCase();
  const stripAccents = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const isC402 = /(?:\bc402\b|tapo[-_ ]?c402|frente[-_ ]?de[-_ ]?calle)/i.test(
    `${camera.id} ${cameraName}`,
  );
  if (isC402) {
    candidates.push("camera.tapo_frente_de_calle", "camera.tapo_c402");
  }
  const isC120 = /(?:\bc120\b|tapo[-_ ]?c120|tapo[-_ ]?spot|\bspot\b)/i.test(
    `${camera.id} ${cameraName}`,
  );
  if (isC120) {
    candidates.push(
      "camera.tapo_c120",
      "camera.tapo_spot",
      "camera.c120",
      "camera.tapo_c120_hd",
      "camera.tapo_c120_sd",
    );
    for (const [id] of hassStates) {
      if (!isStreamCameraEntityId(id)) continue;
      const idLower = id.toLowerCase();
      if (idLower.includes("c120") || idLower.includes("spot")) {
        candidates.push(id);
      }
    }
  }

  const isVimtag = /(?:\bvimtag\b)/i.test(
    `${camera.id} ${cameraName}`,
  );
  if (isVimtag) {
    for (const [id, state] of hassStates) {
      if (!isStreamCameraEntityId(id)) continue;
      const idLower = id.toLowerCase();
      const fnLower = String(state?.attributes?.friendly_name || "").toLowerCase();
      if (idLower.includes("vimtag") || fnLower.includes("vimtag")) {
        candidates.push(id);
      }
    }
  }

  for (const id of candidates) {
    if (isStreamCameraEntityId(id) && hassStates.has(id)) return id;
  }

  // Match an HA camera by its friendly name or entity ID tokens when Camera.UI did not retain the
  // linked entity ID. Never synthesize an entity from Camera.UI's UUID.
  const normalizedName = stripAccents(cameraName).replace(/[^a-z0-9]+/g, " ").trim();
  if (normalizedName) {
    const nameTokens = normalizedName
      .split(/\s+/)
      .filter(
        (token) =>
          token.length > 1 && !["snapshot", "still", "image"].includes(token),
      );
    for (const [id, state] of hassStates) {
      if (!isStreamCameraEntityId(id)) continue;
      const friendlyName = stripAccents(String(state?.attributes?.friendly_name || ""))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      if (/\b(?:snapshot|still image|image)\b/i.test(friendlyName)) continue;
      const idClean = stripAccents(id.toLowerCase()).replace(/[^a-z0-9]+/g, " ");
      if (
        friendlyName &&
        (friendlyName === normalizedName ||
          friendlyName.includes(normalizedName) ||
          normalizedName.includes(friendlyName) ||
          (nameTokens.length > 0 && nameTokens.every((token) => friendlyName.includes(token))))
      ) {
        return id;
      }
      if (
        nameTokens.length > 0 &&
        nameTokens.every((token) => idClean.includes(token))
      ) {
        return id;
      }
    }
  }
  return undefined;
}
