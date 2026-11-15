/**
 * Records incoming fNIRS samples alongside cognitive paradigm event markers
 * on a unified monotonic timeline (relativeTime in ms from recording start).
 */

import { createLogger }     from '../core/Logger.js';
import { eventBus, EVENTS } from '../core/EventBus.js';

const log = createLogger('FNIRSRecorder');

export class FNIRSRecorder {
    constructor() {
        this._samples       = [];
        this._markers       = [];
        this._isActive      = false;
        this._startWallTime = null;
        this._startPerfTime = null;
        this._stopPerfTime  = null;
        this._unsub         = [];
    }

    start() {
        if (this._isActive) return;

        this._samples       = [];
        this._markers       = [];
        this._isActive      = true;
        this._startWallTime = Date.now();
        this._startPerfTime = performance.now();
        this._stopPerfTime  = null;

        this._unsub.push(
            eventBus.on(EVENTS.TEST_STARTED,     p => this._addMarker('TEST_START',  p)),
            eventBus.on(EVENTS.TEST_ENDED,       p => this._addMarker('TEST_END',    p)),
            eventBus.on(EVENTS.TEST_TRIAL_START, p => this._addMarker('TRIAL_START', p)),
            eventBus.on(EVENTS.TEST_TRIAL_END,   p => this._addMarker('TRIAL_END',   p)),
        );

        log.info('Recording started');
    }

    stop() {
        if (!this._isActive) return;

        this._isActive     = false;
        this._stopPerfTime = performance.now();
        this._unsub.forEach(fn => fn());
        this._unsub = [];

        log.info(`Recording stopped — ${this._samples.length} samples, ${this._markers.length} markers`);
    }

    ingest(samples) {
        if (!this._isActive) return;

        const fallbackNow = performance.now();
        const anchored = samples.map(sample => {
            const samplePerf = sample.receivedAt ?? fallbackNow;
            return {
                ...sample,
                deviceTimestamp: sample.timestamp ?? null,
                relativeTime:    +(samplePerf - this._startPerfTime).toFixed(3),
            };
        });

        this._samples.push(...anchored);
    }

    _addMarker(type, payload) {
        if (!this._isActive) return;

        this._markers.push({
            type,
            relativeTime: +(performance.now() - this._startPerfTime).toFixed(3),
            payload,
        });

        log.debug(`Marker: ${type}`, payload);
    }

    addManualMarker(label) {
        this._addMarker('MANUAL', { label });
    }

    getRecording() {
        const endPerf  = this._stopPerfTime ?? performance.now();
        const duration = this._startPerfTime !== null
            ? +(endPerf - this._startPerfTime).toFixed(3)
            : 0;

        return {
            startWallTime: this._startWallTime,
            startPerfTime: this._startPerfTime,
            samples:       [...this._samples],
            markers:       [...this._markers],
            duration,
        };
    }

    get sampleCount() { return this._samples.length; }
    get isActive()    { return this._isActive; }
}