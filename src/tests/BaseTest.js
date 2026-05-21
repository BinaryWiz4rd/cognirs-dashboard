/**
 * abstract base class for all cognitive tests
 */

import { eventBus, EVENTS } from '../core/EventBus.js';
import { Timer }             from '../utils/Timer.js';
import { createLogger }      from '../core/Logger.js';

export class BaseTest {
    constructor(id, name, config = {}) {
        this.id     = id;
        this.name   = name;
        this.config = config;

        this._timer   = new Timer();
        this._results = [];
        this._trialIndex = 0;
        this._container  = null;
        this._log        = createLogger(`Test:${id}`);
    }

    get results() { return [...this._results]; }

    mount(container) {
        this._container = container;
        this._container.innerHTML = '';
        this._container.className = 'test-container anim-fade-in';
        this.setup();
    }

    unmount() {
        if (this._container) this._container.innerHTML = '';
    }

    setup() { throw new Error(`${this.id}.setup() not implemented`); }

    renderTrial(_trial) { throw new Error(`${this.id}.renderTrial() not implemented`); }

    processResponse(_response) { throw new Error(`${this.id}.processResponse() not implemented`); }

    _startTrial(trial) {
        this._timer.start();
        eventBus.emit(EVENTS.TEST_TRIAL_START, { testId: this.id, trial });
        this._log.debug(`Trial ${this._trialIndex} start`, trial);
    }

    _endTrial(result) {
        const rt = this._timer.elapsed();
        const full = { ...result, reactionTime: rt, trialIndex: this._trialIndex };
        this._results.push(full);
        this._trialIndex++;
        eventBus.emit(EVENTS.TEST_TRIAL_END, { testId: this.id, result: full });
        this._log.debug(`Trial ${this._trialIndex - 1} end`, full);
        return full;
    }

    _done() {
        eventBus.emit(EVENTS.TEST_ENDED, { testId: this.id, results: this._results });
        this._log.info(`Test complete — ${this._results.length} trials`);
    }

    _renderCountdown(seconds, callback) {
        let remaining = seconds;
        const el = document.createElement('div');
        el.className = 'countdown-display';
        el.innerHTML = `
      <div class="countdown-number">${remaining}</div>
      <div class="countdown-label">GET READY</div>
    `;
        this._container.innerHTML = '';
        this._container.appendChild(el);

        const interval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(interval);
                callback();
            } else {
                el.querySelector('.countdown-number').textContent = remaining;
                el.querySelector('.countdown-number').style.animation = 'none';
                void el.querySelector('.countdown-number').offsetWidth;
                el.querySelector('.countdown-number').style.animation = 'countdownPulse 0.9s ease forwards';
            }
        }, 1000);
    }
}