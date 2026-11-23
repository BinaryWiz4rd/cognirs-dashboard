/**
 * WebSocket client adapter for Cortivision PHOTON Cap / CortiView 2 real-time streams.
 * Captures monotonic arrival timestamps (performance.now()) and preserves exact
 * inter-sample spacing across batched WebSocket frames.
 */

import { createLogger } from '../core/Logger.js';

const log = createLogger('CortivisionAdapter');

const DEFAULT_CONNECT_TIMEOUT_MS = 5000;

export class CortivisionAdapter {
    constructor() {
        this._ws              = null;
        this._onData          = null;
        this._onError         = null;
        this._onClose         = null;
        this._isConnected     = false;
        this._url             = null;
        this._streamOffsetMs  = null;
        this._lastReceivedAt  = -Infinity;
        this._connectTimeout  = null;
    }

    get isConnected() { return this._isConnected; }
    get isSimulated() { return false; }
    get deviceUrl()   { return this._url; }

    async connect({
        url = 'ws://127.0.0.1:5732',
        timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
        onData,
        onError,
        onClose,
    } = {}) {
        if (this._ws) {
            await this.disconnect();
        }

        this._onData         = onData;
        this._onError        = onError;
        this._onClose        = onClose;
        this._url            = url;
        this._streamOffsetMs = null;
        this._lastReceivedAt = -Infinity;

        log.info(`Connecting to Cortivision real-time stream at ${url}...`);

        return new Promise((resolve, reject) => {
            let ws;
            let settled = false;

            const settleReject = (err) => {
                if (settled) return;
                settled = true;
                this._clearConnectTimeout();
                if (this._ws === ws) {
                    this._cleanup();
                }
                reject(err);
            };

            try {
                ws = new WebSocket(url);
                this._ws = ws;
            } catch (err) {
                log.error('Failed to instantiate Cortivision WebSocket client', err);
                this._cleanup();
                reject(err);
                return;
            }

            this._connectTimeout = setTimeout(() => {
                log.error(`Cortivision connection timed out after ${timeoutMs} ms`);
                try { ws.close(); } catch { /* ignore */ }
                settleReject(new Error(`Connection timed out after ${timeoutMs} ms`));
            }, timeoutMs);

            ws.onopen = () => {
                if (this._ws !== ws) return;
                settled = true;
                this._clearConnectTimeout();
                this._isConnected = true;
                log.info('Successfully connected to Cortivision stream channel');
                resolve({ success: true, url, simulated: false });
            };

            ws.onerror = (event) => {
                if (this._ws !== ws) return;
                log.error('Cortivision WebSocket stream error occurred', event);
                const streamErr = new Error('Cortivision data link error');

                if (!this._isConnected) {
                    settleReject(streamErr);
                } else {
                    this._onError?.(streamErr);
                }
            };

            ws.onclose = (event) => {
                if (this._ws !== ws) return;
                const wasConnected = this._isConnected;
                log.info(`Cortivision data connection closed (code=${event.code})`);
                this._clearConnectTimeout();
                this._cleanup();

                if (!wasConnected) {
                    settleReject(new Error(`WebSocket closed before opening (code=${event.code})`));
                } else {
                    this._onClose?.(event);
                }
            };

            ws.onmessage = (event) => {
                if (this._ws !== ws) return;
                this._processIncomingStream(event.data);
            };
        });
    }

    async disconnect() {
        this._clearConnectTimeout();
        const ws = this._ws;
        this._cleanup();

        if (ws) {
            log.info('Disconnecting Cortivision stream active channel...');
            try {
                ws.close(1000, 'User initiated disconnect');
            } catch { /* ignore close errors */ }
        }
    }

    _processIncomingStream(rawData) {
        try {
            const batchReceivedAt = performance.now();
            const data            = JSON.parse(rawData);
            let rawItems          = [];

            if (Array.isArray(data)) {
                rawItems = data;
            } else if (data && typeof data === 'object') {
                rawItems = Array.isArray(data.samples) ? data.samples : [data];
            }

            const validTs = rawItems
                .map(item => (item?.timestamp !== undefined ? Number(item.timestamp) : NaN))
                .filter(ts => Number.isFinite(ts));

            if (validTs.length > 0) {
                const maxDeviceTs     = Math.max(...validTs);
                const candidateOffset = batchReceivedAt - maxDeviceTs;

                if (
                    this._streamOffsetMs === null ||
                    Math.abs(candidateOffset - this._streamOffsetMs) > 1000
                ) {
                    this._streamOffsetMs = candidateOffset;
                } else {
                    // Exponential moving average filters jitter while tracking gradual clock drift
                    this._streamOffsetMs = 0.9 * this._streamOffsetMs + 0.1 * candidateOffset;
                }
            }

            let batchMaxPerf = this._lastReceivedAt;

            const normalizedSamples = rawItems
                .map(item => {
                    const sample = this._normalizeFrame(item, batchReceivedAt);
                    if (sample && sample.receivedAt > batchMaxPerf) {
                        batchMaxPerf = sample.receivedAt;
                    }
                    return sample;
                })
                .filter(Boolean);

            this._lastReceivedAt = batchMaxPerf;

            if (normalizedSamples.length > 0) {
                this._onData?.(normalizedSamples);
            }
        } catch (err) {
            log.debug('Skipping non-fNIRS or malformed metadata message packet', err);
        }
    }

    _normalizeFrame(item, batchReceivedAt = performance.now()) {
        if (!item || typeof item !== 'object') return null;

        const rawTs      = item.timestamp !== undefined ? Number(item.timestamp) : null;
        const hasValidTs = rawTs !== null && Number.isFinite(rawTs);
        const ch         = item.channel ?? item.channelIndex ?? 0;

        const rawHbo = item.hbo !== undefined ? item.hbo : (item.oxy !== undefined ? item.oxy : null);
        const rawHbr = item.hbr !== undefined ? item.hbr : (item.deoxy !== undefined ? item.deoxy : null);

        if (rawHbo === null || rawHbr === null) return null;

        const hbo     = Number(rawHbo);
        const hbr     = Number(rawHbr);
        const channel = parseInt(ch, 10);

        if (!Number.isFinite(hbo) || !Number.isFinite(hbr) || !Number.isInteger(channel)) {
            return null;
        }

        const estimatedPerf = (hasValidTs && this._streamOffsetMs !== null)
            ? rawTs + this._streamOffsetMs
            : batchReceivedAt;

        const receivedAt = Math.max(estimatedPerf, this._lastReceivedAt);

        return {
            timestamp:  hasValidTs ? +rawTs.toFixed(3) : Math.round(batchReceivedAt),
            receivedAt,
            channel,
            hbo,
            hbr,
        };
    }

    _clearConnectTimeout() {
        if (this._connectTimeout) {
            clearTimeout(this._connectTimeout);
            this._connectTimeout = null;
        }
    }

    _cleanup() {
        this._clearConnectTimeout();
        this._ws             = null;
        this._isConnected    = false;
        this._url            = null;
        this._streamOffsetMs = null;
        this._lastReceivedAt = -Infinity;
    }
}