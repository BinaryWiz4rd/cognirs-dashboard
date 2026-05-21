import { eventBus, EVENTS } from '../core/EventBus.js';
import { stateManager }     from '../core/StateManager.js';
import { fnirsDevice }      from '../fnirs/FNIRSDevice.js';
import { createLogger }     from '../core/Logger.js';
import { DataUtils }        from '../utils/DataUtils.js';

const log = createLogger('SessionManager');

export class SessionManager {
    constructor() {
        this._session  = null;
        this._testQueue = [];
        this._currentTest = null;
    }

    begin({ participant, tests, container }) {
        this._session = {
            id:          crypto.randomUUID(),
            startTime:   new Date().toISOString(),
            participant,
            tests:       [],
            fnirs:       null,
        };

        this._testQueue   = [...tests];
        this._container   = container;

        stateManager.setState({ participant, session: this._session });
        fnirsDevice.startRecording();
        eventBus.emit(EVENTS.SESSION_STARTED, this._session);
        log.info('Session started', this._session.id);

        this._runNextTest();
    }

    _runNextTest() {
        if (!this._testQueue.length) {
            this._end();
            return;
        }

        this._currentTest = this._testQueue.shift();

        eventBus.once(EVENTS.TEST_ENDED, ({ testId, results }) => {
            if (testId !== this._currentTest.id) return;
            this._session.tests.push({ testId, results });
            setTimeout(() => this._runNextTest(), 1500);
        });

        this._currentTest.mount(this._container);
        eventBus.emit(EVENTS.TEST_STARTED, { testId: this._currentTest.id });
        log.info(`Running test: ${this._currentTest.id}`);
    }

    _end() {
        const recording = fnirsDevice.stopRecording();
        this._session.fnirs      = recording;
        this._session.endTime    = new Date().toISOString();
        this._session.summary    = this._buildSummary();

        stateManager.setState({ session: this._session });
        eventBus.emit(EVENTS.SESSION_ENDED, this._session);
        log.info('Session ended', this._session.id);
    }

    _buildSummary() {
        const summary = {};
        this._session.tests.forEach(({ testId, results }) => {
            const rts = results.filter(r => !r.timedOut && r.reactionTime).map(r => r.reactionTime);
            summary[testId] = {
                totalTrials:  results.length,
                correct:      results.filter(r => r.correct).length,
                meanRT:       DataUtils.mean(rts),
                stdRT:        DataUtils.std(rts),
                medianRT:     DataUtils.median(rts),
                accuracy:     results.length ? results.filter(r => r.correct).length / results.length : 0,
            };
        });
        return summary;
    }

    getSession() { return this._session; }
}

export const sessionManager = new SessionManager();