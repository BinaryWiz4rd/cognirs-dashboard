/**
 * Hardware abstraction for WebSerial fNIRS devices with a built-in 50 Hz simulator fallback.
 * Anchors incoming sample frames to the monotonic performance.now() clock.
 */

import { FNIRSParser }  from './FNIRSParser.js';
import { createLogger } from '../core/Logger.js';

const log = createLogger('FNIRSAdapter');

const SIM_SAMPLE_RATE_HZ = 50;
const SIM_INTERVAL_MS    = 1000 / SIM_SAMPLE_RATE_HZ;
const NUM_CHANNELS       = 8;

export class FNIRSAdapter {
    constructor() {
        this._port        = null;
        this._reader      = null;
        this._parser      = new FNIRSParser();
        this._onData      = null;
        this._onError     = null;
        this._onClose     = null;
        this._isConnected = false;
        this._isSimulated = false;
        this._simTimer    = null;
        this._simTime     = 0;
    }

    get isConnected() { return this._isConnected; }
    get isSimulated() { return this._isSimulated; }

    async connect({ baudRate = 115200, onData, onError, onClose } = {}) {
        this._onData  = onData;
        this._onError = onError;
        this._onClose = onClose;
        this._parser  = new FNIRSParser();

        if (!('serial' in navigator)) {
            log.warn('WebSerial API not supported in this browser — starting 50 Hz simulator');
            return this._startSimulation();
        }

        try {
            this._port = await navigator.serial.requestPort();
            await this._port.open({ baudRate });

            this._isConnected = true;
            this._isSimulated = false;
            this._readLoop();

            log.info(`Connected to fNIRS device via WebSerial (baudRate=${baudRate})`);
            return { success: true, simulated: false };
        } catch (err) {
            log.warn('WebSerial connection unavailable or cancelled — falling back to 50 Hz simulator', err);
            this._port = null;
            return this._startSimulation();
        }
    }

    async disconnect() {
        const wasConnected = this._isConnected;
        this._isConnected  = false;
        this._isSimulated  = false;

        if (this._simTimer) {
            clearInterval(this._simTimer);
            this._simTimer = null;
        }

        if (this._reader) {
            try { await this._reader.cancel(); } catch { /* ignore cancellation errors */ }
            try { this._reader.releaseLock(); } catch { /* ignore lock release errors */ }
            this._reader = null;
        }

        if (this._port) {
            try { await this._port.close(); } catch { /* ignore port close errors */ }
            this._port = null;
        }

        this._simTime = 0;
        this._parser  = new FNIRSParser();

        if (wasConnected) {
            log.info('fNIRS adapter disconnected');
        }
    }

    async _readLoop() {
        if (!this._port?.readable) return;

        const decoder = new TextDecoder();
        this._reader  = this._port.readable.getReader();

        try {
            while (this._isConnected) {
                const { value, done } = await this._reader.read();
                if (done) break;

                const receivedAt = performance.now();
                const textChunk  = decoder.decode(value, { stream: true });
                const samples    = this._parser.feed(textChunk).map(sample => ({
                    ...sample,
                    receivedAt,
                }));

                if (samples.length > 0) {
                    this._onData?.(samples);
                }
            }
        } catch (err) {
            if (this._isConnected) {
                log.error('WebSerial stream read error', err);
                this._onError?.(err);
            }
        } finally {
            try { this._reader?.releaseLock(); } catch { /* ignore */ }
            this._reader = null;

            if (this._isConnected) {
                this._isConnected = false;
                this._onClose?.({ code: 1006, reason: 'WebSerial stream closed unexpectedly' });
            }
        }
    }

    _startSimulation() {
        this._isConnected = true;
        this._isSimulated = true;
        this._simTime     = 0;

        this._simTimer = setInterval(() => {
            if (!this._isConnected) return;
            const samples = this._generateSimSamples();
            this._onData?.(samples);
        }, SIM_INTERVAL_MS);

        log.info('fNIRS 50 Hz simulation stream started');
        return { success: true, simulated: true };
    }

    _generateSimSamples() {
        const t          = this._simTime / 1000;
        const receivedAt = performance.now();

        const samples = Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
            timestamp:  this._simTime,
            receivedAt,
            channel:    ch,
            hbo:        0.5 + 0.15 * Math.sin(2 * Math.PI * 0.1 * t + ch * 0.4) + (Math.random() - 0.5) * 0.05,
            hbr:        0.3 - 0.10 * Math.sin(2 * Math.PI * 0.1 * t + ch * 0.4) + (Math.random() - 0.5) * 0.03,
        }));

        this._simTime += SIM_INTERVAL_MS;
        return samples;
    }
}