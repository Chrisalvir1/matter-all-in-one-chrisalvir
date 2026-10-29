/** Safely normalizes RTSP credentials, encoding special chars like '@' in user/pass. */
export function normalizeRtspUrlInput(url: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  const protoMatch = trimmed.match(/^([a-zA-Z0-9_+.-]+:\/\/)/);
  if (!protoMatch) return trimmed;

  const proto = protoMatch[1];
  const rest = trimmed.substring(proto.length);
  const slashIdx = rest.indexOf("/");
  const questionIdx = rest.indexOf("?");
  const pathStart =
    slashIdx !== -1 ? slashIdx : questionIdx !== -1 ? questionIdx : rest.length;
  const authority = rest.substring(0, pathStart);
  const pathAndQuery = rest.substring(pathStart);

  const atIdx = authority.lastIndexOf("@");
  if (atIdx === -1) return trimmed;

  const userInfo = authority.substring(0, atIdx);
  const hostPort = authority.substring(atIdx + 1);

  const colonIdx = userInfo.indexOf(":");
  if (colonIdx === -1) {
    const safeUser = encodeURIComponent(decodeURIComponent(userInfo));
    return `${proto}${safeUser}@${hostPort}${pathAndQuery}`;
  }

  const user = userInfo.substring(0, colonIdx);
  const pass = userInfo.substring(colonIdx + 1);
  const safeUser = encodeURIComponent(decodeURIComponent(user));
  const safePass = encodeURIComponent(decodeURIComponent(pass));

  return `${proto}${safeUser}:${safePass}@${hostPort}${pathAndQuery}`;
}
