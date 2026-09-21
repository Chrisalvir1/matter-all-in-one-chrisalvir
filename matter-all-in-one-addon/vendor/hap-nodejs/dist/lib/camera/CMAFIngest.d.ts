import { CMAFError } from "./SecureVideoTypes";
import type { BufferUploadCommandRequest } from "./SecureVideoTypes";
import type { CMAFRecordingDelegate, SecureVideoIngestCredentials } from "../controller/SecureVideoController";
/**
 * Media description the controller advertises in the HLS multivariant playlist.
 *
 * @group Camera Secure Video
 */
export interface CMAFMediaDescription {
    /** HLS codecs attribute, e.g. `hvc1.1.6.L120.B0` */
    codecs: string;
    width: number;
    height: number;
    /** bits per second */
    bitrate: number;
}
/**
 * Everything the ingest needs from the controller: the negotiated credentials, the advertised media description and
 * the event reporters. Keeps the credential and event handling internal to the controller.
 *
 * @group Camera Secure Video
 */
export interface CMAFIngestContext {
    sensorUUID: string;
    media: CMAFMediaDescription;
    credentials(): SecureVideoIngestCredentials;
    reportSessionStart(cmafSessionId: bigint): void;
    /** `detail` summarizes the optional playlist requests, for logging only */
    reportSessionStop(cmafSessionId: bigint, detail?: string): void;
    /** `detail` names the failed request or the transport error, for logging only */
    reportError(cmafSessionId: bigint, error: CMAFError, detail?: string): void;
}
/**
 * Content key of one clip, derived from the camera key the HomeKit HomeHub provisioned.
 *
 * @group Camera Secure Video
 */
export interface ClipKey {
    /** key id as it appears in the HLS key URIs */
    keyIdString: string;
    contentKey: Buffer;
}
/**
 * Derives the clip content key and key id from a provisioned camera key.
 *
 * @group Camera Secure Video
 */
export declare function deriveClipKey(keyNumber: bigint, cameraKey: Buffer): ClipKey;
/**
 * Seals an fMP4 segment for upload: 16-byte IV, AES-256-GCM ciphertext, 16-byte tag.
 *
 * @group Camera Secure Video
 */
export declare function sealSegment(key: ClipKey, plaintext: Buffer): Buffer;
/**
 * Seals a playlist session data value: JSON with base64 fields, itself base64 inside the VALUE attribute.
 *
 * @group Camera Secure Video
 */
export declare function sealSessionValue(key: ClipKey, plaintext: string): string;
/**
 * Builds the HLS multivariant playlist of a clip.
 *
 * @group Camera Secure Video
 */
export declare function buildMultivariantPlaylist(key: ClipKey, startedAt: Date, sensorUUID: string, media: CMAFMediaDescription): string;
/**
 * Builds the HLS media playlist of a clip from the uploaded segment durations in seconds.
 *
 * @group Camera Secure Video
 */
export declare function buildMediaPlaylist(key: ClipKey, durations: number[], ended: boolean): string;
/**
 * Converts an NTP timestamp of the buffer upload command to a date, falling back to now.
 *
 * @group Camera Secure Video
 */
export declare function ntpToDate(ntp: bigint | undefined): Date;
/**
 * Maps a publishing point HTTP status to the CMAF error reported to the HomeKit HomeHub.
 *
 * @group Camera Secure Video
 */
export declare function mapStatus(status: number): CMAFError;
/**
 * Uploads HomeKit Secure Video clips to the CMAF publishing point. The media is supplied by a {@link CMAFRecordingDelegate}
 * as raw fMP4 segments; this seals them, builds the HLS playlists and PUTs everything over HTTP/2 with the client
 * certificate the controller manages.
 *
 * @group Camera Secure Video
 */
export declare class CMAFIngest {
    private readonly delegate;
    private readonly context;
    private readonly sessions;
    constructor(delegate: CMAFRecordingDelegate, context: CMAFIngestContext);
    handleUploadCommand(request: BufferUploadCommandRequest): bigint;
    destroy(): void;
    private upload;
    private putOptional;
    private putChecked;
}
//# sourceMappingURL=CMAFIngest.d.ts.map