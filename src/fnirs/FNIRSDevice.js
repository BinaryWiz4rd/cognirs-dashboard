import { FNIRSAdapter }        from './FNIRSAdapter.js';
import { CortivisionAdapter }  from './CortivisionAdapter.js';
import { FNIRSRecorder }       from './FNIRSRecorder.js';
import { eventBus, EVENTS }    from '../core/EventBus.js';
import { stateManager }        from '../core/StateManager.js';
import { createLogger }        from '../core/Logger.js';

const log = createLogger('FNIRSDevice');

export class FNIRSDevice {
    constructor() {
        this._serialAdapter      = new FNIRSAdapter();
        this._cortivisionAdapter = new CortivisionAdapter();
        this._activeAdapter      = this._serialAdapter;

        this._recorder           = new FNIRSRecorder();
        this._connected          = false;
    }

    get recorder()    { return this._recorder; }
    get isConnected() { return this._connected; }
    get isSimulated() { return this._activeAdapter.isSimulated; }
    get activeMode()  { return this._activeAdapter instanceof CortivisionAdapter ? 'cortivision' : 'serial'; }

    setMode(mode) {
        if (this._connected) {
            throw new Error('Cannot swap device configurations while streaming pipeline is active.');
        }
        if (mode === 'cortivision') {
            this._activeAdapter = this._cortivisionAdapter;
            log.info('System connection engine configured for Cortivision LSL stream');
        } else {
            this._activeAdapter = this._serialAdapter;
            log.info('System connection engine configured for Native WebSerial interface');
        }
    }

    async connect(options = {}) {
        stateManager.setState({ fnirsStatus: 'connecting' });
        log.info(`Connecting using configuration profiles [${this.activeMode}]...`);

        try {
            const result = await this._activeAdapter.connect({
                ...options,
                onData:  (samples) => this._onData(samples),
                onError: (err)     => this._onError(err),
            });

            this._connected = true;
            stateManager.setState({ fnirsStatus: 'connected' });
            eventBus.emit(EVENTS.FNIRS_CONNECTED, { simulated: result.simulated, mode: this.activeMode });
            log.info(`fNIRS device connection verified via protocol: ${this.activeMode}`, result);
        } catch (err) {
            stateManager.setState({ fnirsStatus: 'error' });
            eventBus.emit(EVENTS.FNIRS_ERROR, err);
            log.error(`Device activation failed under protocol schema: ${this.activeMode}`, err);
            throw err;
        }
    }

    async disconnect() {
        await this._activeAdapter.disconnect();
        this._connected = false;
        stateManager.setState({ fnirsStatus: 'disconnected' });
        eventBus.emit(EVENTS.FNIRS_DISCONNECTED);
        log.info('fNIRS communication layout safely unmounted');
    }

    startRecording() {
        this._recorder.start();
        stateManager.setState({ fnirsStatus: 'recording' });
        eventBus.emit(EVENTS.FNIRS_RECORDING_START);
    }

    stopRecording() {
        this._recorder.stop();
        stateManager.setState({ fnirsStatus: 'connected' });
        eventBus.emit(EVENTS.FNIRS_RECORDING_STOP);
        return this._recorder.getRecording();
    }

    _onData(samples) {
        this._recorder.ingest(samples);
        eventBus.emit(EVENTS.FNIRS_DATA, samples);
    }

    _onError(err) {
        log.error('Real-time pipeline exception downstream', err);
        eventBus.emit(EVENTS.FNIRS_ERROR, err);
    }
}

export const fnirsDevice = new FNIRSDevice();