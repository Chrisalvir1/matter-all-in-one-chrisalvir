import { timingSafeEqual } from "node:crypto";

/** Disabled unless an operator explicitly sets a sufficiently long secret. */
export function isCameraDiagnosticsAuthorized(
  configuredSecret: string | undefined,
  authorizationHeader: string | undefined,
): boolean {
  if (!configuredSecret || configuredSecret.length < 24) return false;
  const match = /^Bearer ([^\s]+)$/i.exec(authorizationHeader || "");
  if (!match) return false;
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(configuredSecret);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
