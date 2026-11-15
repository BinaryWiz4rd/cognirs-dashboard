/**
 * WebSocket client adapter for Cortivision PHOTON Cap / CortiView 2 real-time streams.
 * Captures monotonic arrival timestamps (performance.now()) for exact event synchronization.
 */

import { createLogger } from '../core/Logger.js';

const log = createLogger('CortivisionAdapter');

export class CortivisionAdapter {
    constructor() {
        this._ws          = null;
        this._onData      = null;
        this._onError     = null;
        this._onClose     = null;
        this._isConnected = false;
        this._url         = null;
    }

    get isConnected() { return this._isConnected; }
    get isSimulated() { return false; }
    get deviceUrl()   { return this._url; }

    async connect({ url = 'ws://127.0.0.1:5732', onData, onError, onClose } = {}) {
        this._onData  = onData;
        this._onError = onError;
        this._onClose = onClose;
        this._url     = url;

        log.info(`Connecting to Cortivision real-time stream at ${url}...`);

        return new Promise((resolve, reject) => {
            try {
                this._ws = new WebSocket(url);
            } catch (err) {
                log.error('Failed to instantiate Cortivision WebSocket client', err);
                this._cleanup();
                reject(err);
                return;
            }

            this._ws.onopen = () => {
                this._isConnected = true;
                log.info('Successfully connected to Cortivision stream channel');
                resolve({ success: true, url, simulated: false });
            };

            this._ws.onerror = (event) => {
                log.error('Cortivision WebSocket stream error occurred', event);
                const streamErr = new Error('Cortivision data link error');

                if (!this._isConnected) {
                    this._cleanup();
                    reject(streamErr);
                } else {
                    this._onError?.(streamErr);
                }
            };

            this._ws.onclose = (event) => {
                const wasConnected = this._isConnected;
                log.info(`Cortivision data connection closed (code=${event.code})`);
                this._cleanup();
                if (wasConnected) {
                    this._onClose?.(event);
                }
            };

            this._ws.onmessage = (event) => {
                this._processIncomingStream(event.data);
            };
        });
    }

    async disconnect() {
        if (this._ws) {
            log.info('Disconnecting Cortivision stream active channel...');
            this._ws.close(1000, 'User initiated disconnect');
        }
        this._cleanup();
    }

    _processIncomingStream(rawData) {
        try {
            const receivedAt = performance.now();
            const data       = JSON.parse(rawData);
            let normalizedSamples = [];

            if (Array.isArray(data)) {
                normalizedSamples = data.map(s => this._normalizeFrame(s, receivedAt)).filter(Boolean);
            } else if (data && typeof data === 'object') {
                if (Array.isArray(data.samples)) {
                    normalizedSamples = data.samples.map(s => this._normalizeFrame(s, receivedAt)).filter(Boolean);
                } else {
                    const sample = this._normalizeFrame(data, receivedAt);
                    if (sample) normalizedSamples.push(sample);
                }
            }

            if (normalizedSamples.length > 0) {
                this._onData?.(normalizedSamples);
            }
        } catch (err) {
            log.debug('Skipping non-fNIRS or malformed metadata message packet', err);
        }
    }

    _normalizeFrame(item, receivedAt = performance.now()) {
        const rawTs = item.timestamp !== undefined ? Number(item.timestamp) : null;
        const ch    = item.channel ?? item.channelIndex ?? 0;

        const hbo = item.hbo !== undefined ? item.hbo : (item.oxy !== undefined ? item.oxy : null);
        const hbr = item.hbr !== undefined ? item.hbr : (item.deoxy !== undefined ? item.deoxy : null);

        if (hbo === null || hbr === null) return null;

        return {
            timestamp:  rawTs !== null && !Number.isNaN(rawTs) ? Math.round(rawTs) : Math.round(receivedAt),
            receivedAt,
            channel:    parseInt(ch, 10),
            hbo:        parseFloat(hbo),
            hbr:        parseFloat(hbr),
        };
    }

    _cleanup() {
        this._ws          = null;
        this._isConnected = false;
        this._url         = null;
    }
}