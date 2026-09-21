"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CMAFIngest = void 0;
exports.deriveClipKey = deriveClipKey;
exports.sealSegment = sealSegment;
exports.sealSessionValue = sealSessionValue;
exports.buildMultivariantPlaylist = buildMultivariantPlaylist;
exports.buildMediaPlaylist = buildMediaPlaylist;
exports.ntpToDate = ntpToDate;
exports.mapStatus = mapStatus;
const tslib_1 = require("tslib");
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const debug_1 = tslib_1.__importDefault(require("debug"));
const http2_1 = tslib_1.__importDefault(require("http2"));
const debug = (0, debug_1.default)("HAP-NodeJS:SecureVideo:Ingest");
const TRACK_NAME = "video";
const FIRST_SEGMENT_NUMBER = 1001;
const SEGMENT_DURATION_SECONDS = 2;
const PLAYLIST_CONTENT_TYPE = "application/vnd.apple.mpegurl";
// the HomeKit HomeHub derives the clip content key from the camera key with HKDF-SHA256, empty salt, and
// expects every segment as AES-256-GCM with a 16-byte IV in front and the tag behind
const CONTENT_KEY_INFO = "HomeKit 1.0 CMAF Content";
const CONTENT_KEY_LENGTH = 32;
const KEY_TYPE_CMAF = 1n;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const NTP_EPOCH_OFFSET_SECONDS = 2_208_988_800;
function put(client, path, body, contentType) {
    return new Promise((resolve, reject) => {
        const request = client.request({
            ":method": "PUT",
            ":path": path,
            "content-type": contentType,
            "content-length": body.length,
        });
        let status = 0;
        const chunks = [];
        request.on("response", headers => {
            status = Number(headers[":status"]);
        });
        request.on("data", (chunk) => {
            chunks.push(chunk);
        });
        request.on("end", () => {
            const response = Buffer.concat(chunks).toString("utf8").slice(0, 512);
            debug("PUT %s (%d bytes) -> %d %s", path.slice(path.indexOf("session_")), body.length, status, response);
            resolve({ status, body: response });
        });
        request.on("error", reject);
        request.end(body);
    });
}
/**
 * Derives the clip content key and key id from a provisioned camera key.
 *
 * @group Camera Secure Video
 */
function deriveClipKey(keyNumber, cameraKey) {
    const keyId = (keyNumber << 16n) | (KEY_TYPE_CMAF << 14n);
    return {
        keyIdString: keyId.toString(16).padStart(16, "0"),
        contentKey: Buffer.from(crypto_1.default.hkdfSync("sha256", cameraKey, Buffer.alloc(0), CONTENT_KEY_INFO, CONTENT_KEY_LENGTH)),
    };
}
function seal(key, plaintext) {
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv("aes-256-gcm", key.contentKey, iv, { authTagLength: TAG_LENGTH });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { iv, ciphertext, tag: cipher.getAuthTag() };
}
/**
 * Seals an fMP4 segment for upload: 16-byte IV, AES-256-GCM ciphertext, 16-byte tag.
 *
 * @group Camera Secure Video
 */
function sealSegment(key, plaintext) {
    const { iv, ciphertext, tag } = seal(key, plaintext);
    return Buffer.concat([iv, ciphertext, tag]);
}
/**
 * Seals a playlist session data value: JSON with base64 fields, itself base64 inside the VALUE attribute.
 *
 * @group Camera Secure Video
 */
function sealSessionValue(key, plaintext) {
    const { iv, ciphertext, tag } = seal(key, Buffer.from(plaintext, "utf8"));
    const value = {
        method: "AES-256-GCM",
        initializationVector: iv.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
        tag: tag.toString("base64"),
        keyIDString: key.keyIdString,
    };
    return Buffer.from(JSON.stringify(value)).toString("base64");
}
/**
 * Builds the HLS multivariant playlist of a clip.
 *
 * @group Camera Secure Video
 */
function buildMultivariantPlaylist(key, startedAt, sensorUUID, media) {
    const timestamp = startedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
    const { codecs, width, height, bitrate } = media;
    return [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        `#EXT-X-SESSION-KEY:METHOD=AES-256-GCM,URI="${key.keyIdString}"`,
        `#EXT-X-SESSION-DATA:DATA-ID="com.apple.encrypted-datetime.timestamp",VALUE="${sealSessionValue(key, timestamp)}"`,
        `#EXT-X-SESSION-DATA:DATA-ID="com.apple.homekit.sensor-id",VALUE="${sensorUUID}"`,
        `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate},CODECS="${codecs}",RESOLUTION=${width}x${height}`,
        `${TRACK_NAME}/index.m3u8`,
        "",
    ].join("\n");
}
/**
 * Builds the HLS media playlist of a clip from the uploaded segment durations in seconds.
 *
 * @group Camera Secure Video
 */
function buildMediaPlaylist(key, durations, ended) {
    const targetDuration = Math.ceil(Math.max(SEGMENT_DURATION_SECONDS, ...durations));
    const lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:7",
        `#EXT-X-TARGETDURATION:${targetDuration}`,
        `#EXT-X-MEDIA-SEQUENCE:${FIRST_SEGMENT_NUMBER}`,
        "#EXT-X-PLAYLIST-TYPE:EVENT",
        "#EXT-X-INDEPENDENT-SEGMENTS",
        `#EXT-X-KEY:METHOD=AES-256-GCM,URI="${key.keyIdString}"`,
        `#EXT-X-MAP:URI="${TRACK_NAME}.init"`,
    ];
    durations.forEach((duration, index) => {
        lines.push(`#EXTINF:${duration.toFixed(3)},`, `segment_${FIRST_SEGMENT_NUMBER + index}.m4s`);
    });
    if (ended) {
        lines.push("#EXT-X-ENDLIST");
    }
    lines.push("");
    return lines.join("\n");
}
/**
 * Converts an NTP timestamp of the buffer upload command to a date, falling back to now.
 *
 * @group Camera Secure Video
 */
function ntpToDate(ntp) {
    if (ntp === undefined || ntp < 1n << 32n) {
        return new Date();
    }
    const seconds = Number(ntp >> 32n) - NTP_EPOCH_OFFSET_SECONDS;
    const fraction = Number(ntp & 0xffffffffn) / 0x100000000;
    return new Date((seconds + fraction) * 1000);
}
function trailingSlash(pathname) {
    return pathname.endsWith("/") ? pathname : `${pathname}/`;
}
function toPem(der) {
    const lines = der.toString("base64").match(/.{1,64}/g) ?? [];
    return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}
/**
 * Maps a publishing point HTTP status to the CMAF error reported to the HomeKit HomeHub.
 *
 * @group Camera Secure Video
 */
function mapStatus(status) {
    switch (status) {
        case 400:
            return 15 /* CMAFError.HTTP_BAD_REQUEST */;
        case 401:
        case 403:
            return 16 /* CMAFError.HTTP_INVALID_TOKEN */;
        case 404:
            return 19 /* CMAFError.HTTP_NOT_FOUND */;
        case 412:
            return 20 /* CMAFError.HTTP_INIT_MISSING */;
        case 415:
            return 21 /* CMAFError.HTTP_UNSUPPORTED_MEDIA_TYPE */;
        case 503:
            return 25 /* CMAFError.HTTP_SERVICE_UNAVAILABLE */;
        default:
            return status >= 500 ? 24 /* CMAFError.HTTP_INTERNAL_SERVER_ERROR */ : 1 /* CMAFError.UNKNOWN */;
    }
}
/**
 * Uploads HomeKit Secure Video clips to the CMAF publishing point. The media is supplied by a {@link CMAFRecordingDelegate}
 * as raw fMP4 segments; this seals them, builds the HLS playlists and PUTs everything over HTTP/2 with the client
 * certificate the controller manages.
 *
 * @group Camera Secure Video
 */
class CMAFIngest {
    delegate;
    context;
    sessions = new Map();
    constructor(delegate, context) {
        this.delegate = delegate;
        this.context = context;
    }
    handleUploadCommand(request) {
        const existing = this.sessions.get(request.sessionId);
        if (request.command === 3 /* BufferUploadCommandType.STOP */) {
            if (existing) {
                existing.finalize = true;
                existing.stopRequested = true;
                if (existing.finished) {
                    this.sessions.delete(request.sessionId);
                }
                return existing.clipId;
            }
            debug("stop for unknown session %s", request.sessionId);
            return 0n;
        }
        if (existing) {
            return existing.clipId;
        }
        const session = {
            clipId: crypto_1.default.randomBytes(8).readBigUInt64LE(),
            startedAt: ntpToDate(request.start),
            abort: new AbortController(),
            finalize: request.command === 2 /* BufferUploadCommandType.START_AND_STOP */,
            stopRequested: false,
            finished: false,
        };
        this.sessions.set(request.sessionId, session);
        // the session ends with the hub's stop command, which may arrive after the upload itself ended
        this.upload(request, session).finally(() => {
            session.finished = true;
            if (session.finalize) {
                this.sessions.delete(request.sessionId);
            }
        });
        return session.clipId;
    }
    destroy() {
        for (const session of this.sessions.values()) {
            session.abort.abort();
        }
        this.sessions.clear();
    }
    async upload(request, session) {
        const cmafSessionId = request.sessionId;
        const credentials = this.context.credentials();
        const { publishingPoint, privateKey, clientCertificate, ca } = credentials;
        const cameraKey = credentials.keys.find(entry => entry.keyNumber === credentials.currentKeyNumber) ?? credentials.keys.at(-1);
        if (!publishingPoint || !privateKey || !clientCertificate || !cameraKey) {
            debug("upload ignored, ingest is not provisioned");
            this.context.reportError(cmafSessionId, 5 /* CMAFError.INVALID_STATE */);
            return;
        }
        const clipKey = deriveClipKey(cameraKey.keyNumber, cameraKey.key);
        const url = new URL(publishingPoint.url);
        const client = http2_1.default.connect(url.origin, {
            key: privateKey,
            cert: [toPem(clientCertificate), ...(ca ? [toPem(ca)] : [])].join(""),
            ca: publishingPoint.serverCACertificates.map(toPem),
        });
        client.on("error", error => debug("http2 session error: %s", error.message));
        // the ingest edge routes exactly session_<N>/index.m3u8, session_<N>/<track>/index.m3u8,
        // session_<N>/<track>/<track>.init and session_<N>/<track>/segment_<n>.m4s
        const base = trailingSlash(url.pathname) + `session_${cmafSessionId}/`;
        const multivariantPath = `${base}index.m3u8`;
        const mediaPlaylistPath = `${base}${TRACK_NAME}/index.m3u8`;
        const initPath = `${base}${TRACK_NAME}/${TRACK_NAME}.init`;
        this.context.reportSessionStart(cmafSessionId);
        debug("session %s starting (clip %s, key %s)", cmafSessionId, session.clipId, cameraKey.keyNumber);
        const clip = this.delegate.streamClip({ cmafSessionId, command: request, signal: session.abort.signal });
        let index = 0;
        try {
            const first = await clip.next();
            if (first.done || first.value.type !== "init") {
                throw new Error("delegate did not yield an init segment first");
            }
            const media = first.value.media ?? this.context.media;
            const startedAt = first.value.startedAt ?? session.startedAt;
            const durations = [];
            const notes = [];
            if (!(await this.putChecked(cmafSessionId, client, initPath, sealSegment(clipKey, first.value.data), "video/mp4"))) {
                return;
            }
            // DASH-IF ingest interface 1 takes the init and media segments only, the playlists are interface 2 extras the
            // publishing point may reject, so their outcome is reported but does not end the upload
            await this.putOptional(client, mediaPlaylistPath, Buffer.from(buildMediaPlaylist(clipKey, durations, false)), PLAYLIST_CONTENT_TYPE, notes);
            const multivariant = Buffer.from(buildMultivariantPlaylist(clipKey, startedAt, this.context.sensorUUID, media));
            await this.putOptional(client, multivariantPath, multivariant, PLAYLIST_CONTENT_TYPE, notes);
            let finished = false;
            for await (const segment of clip) {
                if (segment.type !== "media") {
                    continue;
                }
                const segmentPath = `${base}${TRACK_NAME}/segment_${FIRST_SEGMENT_NUMBER + index}.m4s`;
                if (!(await this.putChecked(cmafSessionId, client, segmentPath, sealSegment(clipKey, segment.data), "video/iso.segment"))) {
                    return;
                }
                index++;
                durations.push(segment.duration ?? SEGMENT_DURATION_SECONDS);
                finished = session.stopRequested || !!segment.last;
                await this.putOptional(client, mediaPlaylistPath, Buffer.from(buildMediaPlaylist(clipKey, durations, finished)), PLAYLIST_CONTENT_TYPE, notes);
                if (finished) {
                    break;
                }
            }
            // the generator ended on its own (source stopped or reached the stop timestamp) without a final fragment flag
            if (!finished) {
                await this.putOptional(client, mediaPlaylistPath, Buffer.from(buildMediaPlaylist(clipKey, durations, true)), PLAYLIST_CONTENT_TYPE, notes);
            }
            this.context.reportSessionStop(cmafSessionId, notes.length ? notes.join(" | ") : undefined);
            debug("session %s finished after %d segments", cmafSessionId, index);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            debug("session %s failed: %s", cmafSessionId, message);
            this.context.reportError(cmafSessionId, 11 /* CMAFError.CONNECTION_FAILED */, message);
        }
        finally {
            await clip.return?.(undefined).catch(() => undefined);
            client.close();
        }
    }
    async putOptional(client, path, body, contentType, notes) {
        const result = await put(client, path, body, contentType);
        const note = `PUT ${path.slice(path.indexOf("session_"))} -> ${result.status}${result.body ? ` ${result.body}` : ""}`;
        if (!notes.includes(note)) {
            notes.push(note);
        }
    }
    async putChecked(cmafSessionId, client, path, body, contentType) {
        const result = await put(client, path, body, contentType);
        if (result.status >= 200 && result.status < 300) {
            return true;
        }
        const detail = `PUT ${path.slice(path.indexOf("session_"))} (${body.length} bytes) -> ${result.status} ${result.body}`.trim();
        this.context.reportError(cmafSessionId, mapStatus(result.status), detail);
        return false;
    }
}
exports.CMAFIngest = CMAFIngest;
//# sourceMappingURL=CMAFIngest.js.map