/**
 * COGNIRS — FNIRSParser
 * Parses raw bytes from fNIRS device into structured samples.
 *
 * Expected packet format (16 bytes):
 *   [0]    : 0xAA (sync byte)
 *   [1]    : packet length
 *   [2-5]  : timestamp (uint32 little-endian, ms)
 *   [6-9]  : HbO channel (float32 little-endian)
 *   [10-13]: HbR channel (float32 little-endian)
 *   [14]   : channel index (0-7)
 *   [15]   : checksum
 */

import { createLogger } from '../core/Logger.js';

const SYNC_BYTE = 0xAA;
const PACKET_SIZE = 16;

const log = createLogger('FNIRSParser');

export class FNIRSParser {
    constructor() {
        this._buffer = new Uint8Array(0);
    }

    /**
     * Feed raw bytes into the parser.
     * @param {Uint8Array} bytes
     * @returns {Array<FNIRSSample>} Parsed samples
     */
    feed(bytes) {
        const combined = new Uint8Array(this._buffer.length + bytes.length);
        combined.set(this._buffer);
        combined.set(bytes, this._buffer.length);
        this._buffer = combined;

        return this._extractPackets();
    }

    _extractPackets() {
        const samples = [];

        while (this._buffer.length >= PACKET_SIZE) {
            const syncIdx = this._buffer.indexOf(SYNC_BYTE);

            if (syncIdx === -1) {
                this._buffer = new Uint8Array(0);
                break;
            }

            if (syncIdx > 0) {
                this._buffer = this._buffer.slice(syncIdx);
                continue;
            }

            if (this._buffer.length < PACKET_SIZE) break;

            const packet = this._buffer.slice(0, PACKET_SIZE);

            if (this._validateChecksum(packet)) {
                const sample = this._parsePacket(packet);
                if (sample) samples.push(sample);
            } else {
                log.warn('Checksum mismatch — discarding packet');
            }

            this._buffer = this._buffer.slice(PACKET_SIZE);
        }

        return samples;
    }

    _validateChecksum(packet) {
        const expected = packet[15];
        const computed = packet.slice(0, 15).reduce((acc, b) => (acc + b) & 0xFF, 0);
        return expected === computed;
    }

    _parsePacket(packet) {
        try {
            const view = new DataView(packet.buffer, packet.byteOffset);
            const timestamp = view.getUint32(2, true);
            const hbo       = view.getFloat32(6, true);
            const hbr       = view.getFloat32(10, true);
            const channel   = packet[14];

            return { timestamp, hbo, hbr, channel };
        } catch (e) {
            log.error('Failed to parse packet', e);
            return null;
        }
    }

    reset() {
        this._buffer = new Uint8Array(0);
    }
}

/**
 * @typedef {Object} FNIRSSample
 * @property {number} timestamp  - Device timestamp in ms
 * @property {number} hbo        - Oxygenated hemoglobin (μmol/L)
 * @property {number} hbr        - Deoxygenated hemoglobin (μmol/L)
 * @property {number} channel    - Channel index 0–7
 */