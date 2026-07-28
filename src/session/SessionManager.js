/**
 * Handles the full session lifecycle.
 * Stores raw results per test (not pre-summarised),
 * so ResultsPage can compute any metrics it needs.
 */

import { eventBus, EVENTS } from '../core/EventBus.js';
import { stateManager }     from '../core/StateManager.js';
import { fnirsDevice }      from '../fnirs/FNIRSDevice.js';
import { createLogger }     from '../core/Logger.js';

const log = createLogger('SessionManager');

class SessionManager {
    constructor() {
        this._session   = null;
        this._testQueue = [];
        this._currentTest = null;
        this._container   = null;
        this._unsubTest   = null;
    }

    /**
     * Begin a session.
     * @param {Object} opts
     * @param {Object}   opts.participant  — participant metadata
     * @param {BaseTest[]} opts.tests      — ordered array of test instances
     * @param {HTMLElement} opts.container — DOM element to mount tests into
     */
    begin({ participant, tests, container }) {
        this._session = {
            id:          crypto.randomUUID(),
            startTime:   new Date().toISOString(),
            endTime:     null,
            participant,
            tests:       [],   // { testId, name, results }[]
            fnirs:       null,
        };

        this._testQueue = [...tests];
        this._container = container;

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

        this._unsubTest = eventBus.on(EVENTS.TEST_ENDED, ({ testId, results }) => {
            if (testId !== this._currentTest.id) return;

            if (this._unsubTest) { this._unsubTest(); this._unsubTest = null; }

            this._session.tests.push({
                testId,
                name:    this._currentTest.name,
                results: results ?? [],
            });

            stateManager.setState({ session: { ...this._session } });
            log.info(`Test "${testId}" complete — ${results?.length ?? 0} trials`);

            setTimeout(() => this._runNextTest(), 1200);
        });

        this._container.innerHTML = '';
        this._currentTest.mount(this._container);
        eventBus.emit(EVENTS.TEST_STARTED, { testId: this._currentTest.id, name: this._currentTest.name });
        log.info(`Mounting test: ${this._currentTest.id}`);
    }

    _end() {
        if (this._unsubTest) { this._unsubTest(); this._unsubTest = null; }

        const recording = fnirsDevice.stopRecording();
        this._session.fnirs    = recording;
        this._session.endTime  = new Date().toISOString();

        stateManager.setState({ session: { ...this._session } });
        eventBus.emit(EVENTS.SESSION_ENDED, this._session);
        log.info('Session ended', this._session.id);
    }

    getSession() { return this._session; }
}

export const sessionManager = new SessionManager();