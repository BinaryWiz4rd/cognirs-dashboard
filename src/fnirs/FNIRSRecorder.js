/**
 * COGNIRS — FNIRSRecorder
 * Buffers fNIRS samples during a recording session,
 * associates them with event markers (test start/end, trials).
 */

import { createLogger } from '../core/Logger.js';
import { eventBus, EVENTS } from '../core/EventBus.js';

const log = createLogger('FNIRSRecorder');

export class FNIRSRecorder {
    constructor() {
        this._samples  = [];
        this._markers  = [];
        this._isActive = false;
        this._startWallTime = null;

        this._unsub = [];
    }

    start() {
        if (this._isActive) return;
        this._samples        = [];
        this._markers        = [];
        this._isActive       = true;
        this._startWallTime  = Date.now();

        this._unsub.push(
            eventBus.on(EVENTS.TEST_STARTED,     p => this._addMarker('TEST_START', p)),
            eventBus.on(EVENTS.TEST_ENDED,       p => this._addMarker('TEST_END',   p)),
            eventBus.on(EVENTS.TEST_TRIAL_START, p => this._addMarker('TRIAL_START',p)),
            eventBus.on(EVENTS.TEST_TRIAL_END,   p => this._addMarker('TRIAL_END',  p)),
        );

        log.info('Recording started');
    }

    stop() {
        if (!this._isActive) return;
        this._isActive = false;
        this._unsub.forEach(fn => fn());
        this._unsub = [];
        log.info(`Recording stopped — ${this._samples.length} samples, ${this._markers.length} markers`);
    }

    /**
     * Push incoming samples into buffer.
     * @param {FNIRSSample[]} samples
     */
    ingest(samples) {
        if (!this._isActive) return;
        this._samples.push(...samples);
    }

    /**
     * Add a named event marker at the current time.
     * @param {string} type
     * @param {*} payload
     */
    _addMarker(type, payload) {
        this._markers.push({
            type,
            relativeTime: Date.now() - this._startWallTime,
            payload,
        });
        log.debug(`Marker: ${type}`, payload);
    }

    addManualMarker(label) {
        this._addMarker('MANUAL', { label });
    }

    getRecording() {
        return {
            startWallTime: this._startWallTime,
            samples:  [...this._samples],
            markers:  [...this._markers],
            duration: this._samples.at(-1)?.timestamp ?? 0,
        };
    }

    get sampleCount() { return this._samples.length; }
    get isActive()    { return this._isActive; }
}