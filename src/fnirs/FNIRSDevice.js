/**
 * High-level controller managing fNIRS hardware adapters (Cortivision WebSocket,
 * offline 50 Hz simulator, and WebSerial), connection state, and synchronized recording.
 */

import { FNIRSAdapter }       from './FNIRSAdapter.js';
import { CortivisionAdapter } from './CortivisionAdapter.js';
import { FNIRSRecorder }      from './FNIRSRecorder.js';
import { eventBus, EVENTS }   from '../core/EventBus.js';
import { stateManager }       from '../core/StateManager.js';
import { createLogger }       from '../core/Logger.js';

const log = createLogger('FNIRSDevice');

export class FNIRSDevice {
    constructor() {
        this._serialAdapter      = new FNIRSAdapter();
        this._cortivisionAdapter = new CortivisionAdapter();
        this._activeAdapter      = this._cortivisionAdapter;
        this._mode               = 'cortivision';

        this._recorder           = new FNIRSRecorder();
        this._connected          = false;
    }

    get recorder()    { return this._recorder; }
    get isConnected() { return this._connected; }
    get isSimulated() { return this._activeAdapter.isSimulated; }
    get activeMode()  { return this._mode; }
    get deviceUrl()   { return this._activeAdapter.deviceUrl ?? null; }

    setMode(mode) {
        if (this._connected) {
            throw new Error('Cannot switch fNIRS protocol while a connection is active.');
        }

        if (mode === 'cortivision') {
            this._mode          = 'cortivision';
            this._activeAdapter = this._cortivisionAdapter;
            stateManager.setState({ fnirsMode: 'cortivision' });
            log.info('Configured fNIRS transport for Cortivision WebSocket stream');
        } else if (mode === 'simulator') {
            this._mode          = 'simulator';
            this._activeAdapter = this._serialAdapter;
            stateManager.setState({ fnirsMode: 'simulator' });
            log.info('Configured fNIRS transport for offline 50 Hz simulator');
        } else {
            this._mode          = 'serial';
            this._activeAdapter = this._serialAdapter;
            stateManager.setState({ fnirsMode: 'serial' });
            log.info('Configured fNIRS transport for WebSerial interface');
        }
    }

    async connect(options = {}) {
        const state    = stateManager.getState();
        const url      = options.url ?? state.fnirsUrl ?? 'ws://127.0.0.1:5732';
        const simulate = options.simulate ?? (this._mode === 'simulator');

        if (this._mode === 'cortivision') {
            stateManager.setState({ fnirsUrl: url });
        }

        stateManager.setState({ fnirsStatus: 'connecting' });
        log.info(`Connecting via [${this._mode}] protocol...`);

        try {
            const result = await this._activeAdapter.connect({
                ...options,
                url,
                simulate,
                onData:  (samples) => this._onData(samples),
                onError: (err)     => this._onError(err),
                onClose: (event)   => this._onClose(event),
            });

            this._connected = true;

            if (this._recorder.isActive) {
                this._recorder.addManualMarker('STREAM_RECONNECTED');
                stateManager.setState({ fnirsStatus: 'recording' });
            } else {
                stateManager.setState({ fnirsStatus: 'connected' });
            }

            eventBus.emit(EVENTS.FNIRS_CONNECTED, {
                simulated: result.simulated,
                mode:      this._mode,
                url:       this.deviceUrl,
            });

            log.info(`fNIRS device connected (${this._mode})`, result);
            return result;
        } catch (err) {
            this._connected = false;
            stateManager.setState({ fnirsStatus: 'error' });
            eventBus.emit(EVENTS.FNIRS_ERROR, err);
            log.error(`fNIRS connection failed (${this._mode})`, err);
            throw err;
        }
    }

    async disconnect() {
        await this._activeAdapter.disconnect();
        this._connected = false;
        stateManager.setState({ fnirsStatus: 'disconnected' });
        eventBus.emit(EVENTS.FNIRS_DISCONNECTED, { unexpected: false });
        log.info('fNIRS device disconnected');
    }

    startRecording() {
        this._recorder.start();
        stateManager.setState({ fnirsStatus: 'recording' });
        eventBus.emit(EVENTS.FNIRS_RECORDING_START);
    }

    stopRecording() {
        this._recorder.stop();
        stateManager.setState({ fnirsStatus: this._connected ? 'connected' : 'disconnected' });
        eventBus.emit(EVENTS.FNIRS_RECORDING_STOP);
        return this._recorder.getRecording();
    }

    _onData(samples) {
        this._recorder.ingest(samples);
        eventBus.emit(EVENTS.FNIRS_DATA, samples);
    }

    _onError(err) {
        log.error('fNIRS stream error', err);
        eventBus.emit(EVENTS.FNIRS_ERROR, err);
    }

    _onClose(event) {
        if (!this._connected) return;

        this._connected  = false;
        const unexpected = Boolean(event && event.code !== 1000);

        if (this._recorder.isActive) {
            this._recorder.addManualMarker('STREAM_INTERRUPTED');
            eventBus.emit(EVENTS.FNIRS_STREAM_INTERRUPTED, { code: event?.code });
            log.warn('fNIRS stream interrupted during active recording; recorder remains armed');
        }

        stateManager.setState({ fnirsStatus: unexpected ? 'error' : 'disconnected' });
        eventBus.emit(EVENTS.FNIRS_DISCONNECTED, { unexpected, code: event?.code });
        log.warn('fNIRS connection closed', { unexpected, code: event?.code });
    }
}

export const fnirsDevice = new FNIRSDevice();