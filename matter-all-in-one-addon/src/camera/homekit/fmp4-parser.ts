/**
 * ISO BMFF (Fragmented MP4) Parser and Keyframe Validator
 * Parses streaming fMP4 data from FFmpeg into:
 * 1. Media Initialization Segment (ftyp + moov)
 * 2. Media Fragment Segments (moof + mdat)
 *
 * Validates that each media fragment starts with an IDR / Sync Keyframe.
 */

import { EventEmitter } from "events";

export interface Fmp4Box {
  type: string;
  size: number;
  data: Buffer;
}

export interface Fmp4MediaFragment {
  data: Buffer;
  isKeyframe: boolean;
  sequenceNumber?: number;
  durationMs?: number;
}

export class Fmp4Segmenter extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0);
  private initSegment: Buffer | null = null;
  private pendingMoof: Buffer | null = null;
  private pendingMoofIsKeyframe = false;
  private pendingSequenceNumber?: number;

  /**
   * Pushes incoming raw fMP4 binary data from FFmpeg stdout.
   */
  public push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.parseBoxes();
  }

  /**
   * Resets internal state and buffers.
   */
  public reset(): void {
    this.buffer = Buffer.alloc(0);
    this.initSegment = null;
    this.pendingMoof = null;
    this.pendingMoofIsKeyframe = false;
    this.pendingSequenceNumber = undefined;
  }

  private parseBoxes(): void {
    while (this.buffer.length >= 8) {
      const size = this.buffer.readUInt32BE(0);
      const type = this.buffer.toString("ascii", 4, 8);

      // Handle 64-bit extended size if size === 1
      let boxSize = size;
      if (size === 1) {
        if (this.buffer.length < 16) break;
        const high = this.buffer.readUInt32BE(8);
        const low = this.buffer.readUInt32BE(12);
        boxSize = high * 4294967296 + low;
      } else if (size === 0) {
        // Size to end of file, wait for more data
        break;
      }

      if (boxSize < 8 || boxSize > 64 * 1024 * 1024) {
        // Corrupted box size, discard first byte to resync
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      if (this.buffer.length < boxSize) {
        // Wait for more chunks to arrive
        break;
      }

      const boxData = this.buffer.subarray(0, boxSize);
      this.buffer = this.buffer.subarray(boxSize);

      this.handleBox(type, boxData);
    }
  }

  private handleBox(type: string, data: Buffer): void {
    if (type === "ftyp") {
      this.initSegment = data;
    } else if (type === "moov") {
      if (this.initSegment) {
        this.initSegment = Buffer.concat([this.initSegment, data]);
      } else {
        this.initSegment = data;
      }
      this.emit("initialization", this.initSegment);
    } else if (type === "moof") {
      const { isKeyframe, sequenceNumber } = this.inspectMoof(data);
      this.pendingMoof = data;
      this.pendingMoofIsKeyframe = isKeyframe;
      this.pendingSequenceNumber = sequenceNumber;
    } else if (type === "mdat") {
      if (this.pendingMoof) {
        const fragmentData = Buffer.concat([this.pendingMoof, data]);
        const fragment: Fmp4MediaFragment = {
          data: fragmentData,
          isKeyframe: this.pendingMoofIsKeyframe,
          sequenceNumber: this.pendingSequenceNumber,
        };
        this.emit("fragment", fragment);
        this.pendingMoof = null;
      }
    }
  }

  /**
   * Inspects a moof atom to determine if the first sample is an IDR/Sync Keyframe.
   */
  public inspectMoof(moofBuffer: Buffer): {
    isKeyframe: boolean;
    sequenceNumber?: number;
  } {
    let isKeyframe = false;
    let sequenceNumber: number | undefined;

    let offset = 8;
    while (offset + 8 <= moofBuffer.length) {
      const boxSize = moofBuffer.readUInt32BE(offset);
      const boxType = moofBuffer.toString("ascii", offset + 4, offset + 8);
      if (boxSize < 8 || offset + boxSize > moofBuffer.length) break;

      const subBox = moofBuffer.subarray(offset, offset + boxSize);

      if (boxType === "mfhd" && subBox.length >= 16) {
        sequenceNumber = subBox.readUInt32BE(12);
      } else if (boxType === "traf") {
        const keyframeFound = this.inspectTraf(subBox);
        if (keyframeFound) {
          isKeyframe = true;
        }
      }

      offset += boxSize;
    }

    return { isKeyframe, sequenceNumber };
  }

  /**
   * Inspects traf box for sync sample flags in tfhd / trun.
   */
  private inspectTraf(trafBuffer: Buffer): boolean {
    let offset = 8;
    while (offset + 8 <= trafBuffer.length) {
      const boxSize = trafBuffer.readUInt32BE(offset);
      const boxType = trafBuffer.toString("ascii", offset + 4, offset + 8);
      if (boxSize < 8 || offset + boxSize > trafBuffer.length) break;

      const subBox = trafBuffer.subarray(offset, offset + boxSize);

      if (boxType === "trun" && subBox.length >= 16) {
        const flags = (subBox[9] << 16) | (subBox[10] << 8) | subBox[11];
        const hasFirstSampleFlags = (flags & 0x000004) !== 0;

        let sampleOffset = 16;
        if ((flags & 0x000001) !== 0) sampleOffset += 4; // data_offset
        if (hasFirstSampleFlags && subBox.length >= sampleOffset + 4) {
          const firstSampleFlags = subBox.readUInt32BE(sampleOffset);
          // Bit 16 (0x00010000) is sample_is_non_sync_sample. If 0 -> sync sample (IDR/Keyframe)
          const isNonSync = (firstSampleFlags & 0x00010000) !== 0;
          if (!isNonSync) {
            return true;
          }
        } else {
          return true;
        }
      }

      offset += boxSize;
    }

    return false;
  }
}
