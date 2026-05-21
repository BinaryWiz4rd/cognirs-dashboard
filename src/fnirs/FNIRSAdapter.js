/**
 * COGNIRS — FNIRSAdapter
 * Low-level WebSerial connection to the fNIRS device.
 * Falls back to simulation mode if no device is available.
 */

import { createLogger } from '../core/Logger.js';
import { FNIRSParser } from './FNIRSParser.js';

const log = createLogger('FNIRSAdapter');

const SIMULATE_INTERVAL_MS = 20; // 50 Hz

export class FNIRSAdapter {
    constructor() {
        this._port        = null;
        this._reader      = null;
        this._parser      = new FNIRSParser();
        this._onData      = null;
        this._onError     = null;
        this._simInterval = null;
        this._simTime     = 0;
        this._isSimulated = false;
    }

    get isSimulated() { return this._isSimulated; }

    /**
     * Request and open a serial port.
     * @param {Object} options
     * @param {Function} options.onData  (samples: FNIRSSample[]) => void
     * @param {Function} options.onError (error: Error) => void
     */
    async connect({ onData, onError }) {
        this._onData  = onData;
        this._onError = onError;

        if (!('serial' in navigator)) {
            log.warn('WebSerial not supported — entering simulation mode');
            this._startSimulation();
            return { simulated: true };
        }

        try {
            this._port = await navigator.serial.requestPort();
            await this._port.open({ baudRate: 115200 });
            log.info('Serial port opened');
            this._readLoop();
            return { simulated: false };
        } catch (err) {
            log.warn('Serial port failed, falling back to simulation', err);
            this._startSimulation();
            return { simulated: true };
        }
    }

    async disconnect() {
        if (this._isSimulated) {
            this._stopSimulation();
            return;
        }

        try {
            this._reader?.cancel();
            this._reader = null;
            await this._port?.close();
            this._port = null;
            log.info('Serial port closed');
        } catch (err) {
            log.error('Error closing port', err);
        }
    }

    async _readLoop() {
        try {
            this._reader = this._port.readable.getReader();
            while (true) {
                const { value, done } = await this._reader.read();
                if (done) break;
                const samples = this._parser.feed(value);
                if (samples.length) this._onData?.(samples);
            }
        } catch (err) {
            if (err.name !== 'CancelError') {
                log.error('Read loop error', err);
                this._onError?.(err);
            }
        } finally {
            this._reader?.releaseLock();
        }
    }

    _startSimulation() {
        this._isSimulated = true;
        this._simTime     = 0;

        this._simInterval = setInterval(() => {
            this._simTime += SIMULATE_INTERVAL_MS;
            const samples = this._generateSimSamples();
            this._onData?.(samples);
        }, SIMULATE_INTERVAL_MS);

        log.info('Simulation mode active at 50 Hz');
    }

    _stopSimulation() {
        clearInterval(this._simInterval);
        this._simInterval = null;
        this._isSimulated = false;
        log.info('Simulation stopped');
    }

    _generateSimSamples() {
        const t = this._simTime / 1000;
        return Array.from({ length: 8 }, (_, ch) => ({
            timestamp: this._simTime,
            hbo: 0.5 + 0.15 * Math.sin(2 * Math.PI * 0.1 * t + ch * 0.4) + (Math.random() - 0.5) * 0.05,
            hbr: 0.3 - 0.1  * Math.sin(2 * Math.PI * 0.1 * t + ch * 0.4) + (Math.random() - 0.5) * 0.03,
            channel: ch,
        }));
    }
}