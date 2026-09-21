import { DataStreamManagement } from "../datastream";
import type { SnapshotRequest } from "./RTPStreamManagement";
/**
 * Produces a JPEG snapshot for the secure video camera. The HAP image resource request passes the requested
 * size and reason, the HDS `ipcamera.snapshot` relay carries no such information and calls without a request.
 *
 * @group Camera Secure Video
 */
export type SecureVideoSnapshotHandler = (request?: SnapshotRequest) => Promise<Buffer>;
/**
 * Serves camera snapshots over the HDS `ipcamera.snapshot` data stream. iOS 27 fetches snapshots for the
 * secure video camera services through this relay instead of the legacy image resource request, so the
 * controller installs it on the recording data stream. The actual image is produced by the supplied handler.
 *
 * @group Camera Secure Video
 */
export declare class HDSSnapshotTransport {
    private readonly dataStreamManagement;
    private readonly snapshot;
    private readonly isActive;
    private readonly transfers;
    private captureInFlight?;
    constructor(dataStreamManagement: DataStreamManagement, snapshot: SecureVideoSnapshotHandler, isActive: () => boolean);
    /** Removes the data stream handlers and cancels any in-flight transfers. Call when the controller is removed. */
    destroy(): void;
    closeAll(): void;
    private readonly onOpen;
    private readonly onAck;
    private readonly onCloseEvent;
    private find;
    private reject;
    private open;
    private captureSnapshot;
    private sendImage;
    private armTimeout;
    private finish;
}
//# sourceMappingURL=HDSSnapshotTransport.d.ts.map