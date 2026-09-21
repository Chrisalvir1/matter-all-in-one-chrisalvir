"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSSnapshotTransport = void 0;
const tslib_1 = require("tslib");
const debug_1 = tslib_1.__importDefault(require("debug"));
const datastream_1 = require("../datastream");
const debug = (0, debug_1.default)("HAP-NodeJS:SecureVideo:Snapshot");
const CHUNK_SIZE = 0x40000;
const TIMEOUT_MS = 25000;
/**
 * Serves camera snapshots over the HDS `ipcamera.snapshot` data stream. iOS 27 fetches snapshots for the
 * secure video camera services through this relay instead of the legacy image resource request, so the
 * controller installs it on the recording data stream. The actual image is produced by the supplied handler.
 *
 * @group Camera Secure Video
 */
class HDSSnapshotTransport {
    dataStreamManagement;
    snapshot;
    isActive;
    transfers = new Set();
    captureInFlight;
    constructor(dataStreamManagement, snapshot, isActive) {
        this.dataStreamManagement = dataStreamManagement;
        this.snapshot = snapshot;
        this.isActive = isActive;
        dataStreamManagement.onRequestMessage("dataSend" /* Protocols.DATA_SEND */, "open" /* Topics.OPEN */, this.onOpen);
        dataStreamManagement.onEventMessage("dataSend" /* Protocols.DATA_SEND */, "ack" /* Topics.ACK */, this.onAck);
        dataStreamManagement.onEventMessage("dataSend" /* Protocols.DATA_SEND */, "close" /* Topics.CLOSE */, this.onCloseEvent);
    }
    /** Removes the data stream handlers and cancels any in-flight transfers. Call when the controller is removed. */
    destroy() {
        this.dataStreamManagement.removeRequestHandler("dataSend" /* Protocols.DATA_SEND */, "open" /* Topics.OPEN */, this.onOpen);
        this.dataStreamManagement.removeEventHandler("dataSend" /* Protocols.DATA_SEND */, "ack" /* Topics.ACK */, this.onAck);
        this.dataStreamManagement.removeEventHandler("dataSend" /* Protocols.DATA_SEND */, "close" /* Topics.CLOSE */, this.onCloseEvent);
        this.closeAll();
    }
    closeAll() {
        for (const transfer of [...this.transfers]) {
            this.finish(transfer, 3 /* HDSProtocolSpecificErrorReason.CANCELLED */);
        }
    }
    onOpen = (connection, id, message) => {
        if (message?.type === "ipcamera.snapshot") {
            this.open(connection, id, message);
        }
    };
    onAck = (connection, message) => {
        const transfer = this.find(connection, message?.streamId);
        if (transfer && transfer.sent && message?.endOfStream === true) {
            this.finish(transfer);
        }
    };
    onCloseEvent = (connection, message) => {
        const transfer = this.find(connection, message?.streamId);
        if (transfer) {
            this.finish(transfer);
        }
    };
    find(connection, streamId) {
        return [...this.transfers].find(transfer => transfer.connection === connection && (streamId === undefined || transfer.streamId === streamId));
    }
    reject(connection, id, reason) {
        connection.sendResponse("dataSend" /* Protocols.DATA_SEND */, "open" /* Topics.OPEN */, id, datastream_1.HDSStatus.PROTOCOL_SPECIFIC_ERROR, { status: reason });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    open(connection, id, message) {
        if (message.target !== "controller" || !Number.isSafeInteger(message.streamId) || message.streamId < 0) {
            this.reject(connection, id, 5 /* HDSProtocolSpecificErrorReason.UNEXPECTED_FAILURE */);
            return;
        }
        if (!this.isActive()) {
            this.reject(connection, id, 1 /* HDSProtocolSpecificErrorReason.NOT_ALLOWED */);
            return;
        }
        if (this.find(connection, message.streamId)) {
            this.reject(connection, id, 2 /* HDSProtocolSpecificErrorReason.BUSY */);
            return;
        }
        const transfer = { connection, streamId: message.streamId, sent: false, onClose: () => this.finish(transfer) };
        this.transfers.add(transfer);
        connection.once("closed", transfer.onClose);
        this.armTimeout(transfer);
        try {
            connection.sendResponse("dataSend" /* Protocols.DATA_SEND */, "open" /* Topics.OPEN */, id, datastream_1.HDSStatus.SUCCESS, { status: 0 });
        }
        catch {
            this.finish(transfer);
            return;
        }
        this.sendImage(transfer);
    }
    captureSnapshot() {
        if (!this.captureInFlight) {
            this.captureInFlight = this.snapshot().finally(() => {
                this.captureInFlight = undefined;
            });
        }
        return this.captureInFlight;
    }
    async sendImage(transfer) {
        try {
            const jpeg = await this.captureSnapshot();
            if (!this.transfers.has(transfer)) {
                return;
            }
            if (!this.isActive()) {
                this.finish(transfer, 1 /* HDSProtocolSpecificErrorReason.NOT_ALLOWED */);
                return;
            }
            if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
                throw new Error("snapshot is empty or not JPEG");
            }
            for (let offset = 0, sequence = 1; offset < jpeg.length; offset += CHUNK_SIZE, sequence++) {
                if (!this.transfers.has(transfer)) {
                    return;
                }
                const data = jpeg.subarray(offset, offset + CHUNK_SIZE);
                const last = offset + data.length === jpeg.length;
                transfer.sent = last;
                transfer.connection.sendEvent("dataSend" /* Protocols.DATA_SEND */, "data" /* Topics.DATA */, {
                    streamId: transfer.streamId,
                    packets: [{
                            data,
                            metadata: {
                                dataType: "image",
                                dataSequenceNumber: 1,
                                dataChunkSequenceNumber: sequence,
                                isLastDataChunk: last,
                                ...(sequence === 1 ? { dataTotalSize: jpeg.length } : {}),
                            },
                        }],
                    endOfStream: last,
                });
                if (!last) {
                    await new Promise(resolve => setImmediate(resolve));
                }
            }
            debug("sent %d bytes (stream %d)", jpeg.length, transfer.streamId);
            if (this.transfers.has(transfer)) {
                this.armTimeout(transfer);
            }
        }
        catch (error) {
            if (!this.transfers.has(transfer)) {
                return;
            }
            debug("snapshot failed: %s", error instanceof Error ? error.message : error);
            this.finish(transfer, 5 /* HDSProtocolSpecificErrorReason.UNEXPECTED_FAILURE */);
        }
    }
    armTimeout(transfer) {
        clearTimeout(transfer.timer);
        transfer.timer = setTimeout(() => this.finish(transfer, 6 /* HDSProtocolSpecificErrorReason.TIMEOUT */), TIMEOUT_MS);
        transfer.timer.unref?.();
    }
    finish(transfer, reason) {
        if (!this.transfers.delete(transfer)) {
            return;
        }
        clearTimeout(transfer.timer);
        transfer.connection.removeListener("closed", transfer.onClose);
        if (reason !== undefined) {
            try {
                transfer.connection.sendEvent("dataSend" /* Protocols.DATA_SEND */, "close" /* Topics.CLOSE */, { streamId: transfer.streamId, reason });
            }
            catch {
                // connection already gone
            }
        }
    }
}
exports.HDSSnapshotTransport = HDSSnapshotTransport;
//# sourceMappingURL=HDSSnapshotTransport.js.map