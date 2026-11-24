/**
 * Simple & Choice Reaction Time Task with color-only feedback,
 * key-repeat protection, and anticipatory false-start logging.
 */

import { BaseTest }         from './BaseTest.js';
import { SeededRandom }     from '../utils/Random.js';
import { eventBus, EVENTS } from '../core/EventBus.js';

const DEFAULT_CONFIG = {
    variant:   'simple',
    trials:    20,
    minItiMs:  1000,
    maxItiMs:  2800,
    stimMaxMs: 3000,
    seed:      7,
};

export class ReactionTimeTest extends BaseTest {
    constructor(config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        super(
            'reaction-time',
            `Reaction Time (${cfg.variant === 'choice' ? 'Choice' : 'Simple'})`,
            cfg
        );
        this._rng           = new SeededRandom(this.config.seed);
        this._itiTimer      = null;
        this._stimTimer     = null;
        this._feedbackTimer = null;
        this._phase         = 'idle';
        this._falseStarts   = 0;
        this._itiStartedAt  = 0;
        this._currentTrial  = null;
    }

    unmount() {
        this._phase = 'idle';
        this._clearTimers();
        super.unmount();
    }

    _renderInstructions() {
        const isChoice = this.config.variant === 'choice';
        this._buildInstructionShell({
            title: `Reaction Time — ${isChoice ? 'Choice' : 'Simple'}`,
            subtitle: isChoice
                ? 'An arrow will appear inside the circle. Press <strong>← or →</strong> to match it.'
                : 'The circle will turn blue. Press <strong>Space</strong> as fast as you can.',
            bullets: [
                'Keep your finger(s) resting on the key(s) throughout',
                'Do not press until the circle changes — early presses are recorded',
                'Respond with a single keypress, as quickly as possible',
                `${this.config.trials} trials · approximately 2 minutes`,
            ],
            keysHtml: isChoice ? `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <kbd style="font-family:monospace;font-size:0.82rem;font-weight:600;padding:5px 12px;background:#fff;border:1.5px solid #a8c4ee;border-radius:5px;box-shadow:0 1px 0 #a8c4ee;">←</kbd>
          <span style="font-size:0.82rem;color:#8aa4c0;">left</span>
          <kbd style="font-family:monospace;font-size:0.82rem;font-weight:600;padding:5px 12px;background:#fff;border:1.5px solid #a8c4ee;border-radius:5px;box-shadow:0 1px 0 #a8c4ee;">→</kbd>
          <span style="font-size:0.82rem;color:#8aa4c0;">right</span>
        </div>
      ` : `
        <div style="display:flex;align-items:center;gap:10px;">
          <kbd style="font-family:monospace;font-size:0.82rem;font-weight:600;padding:5px 14px;background:#fff;border:1.5px solid #a8c4ee;border-radius:5px;box-shadow:0 1px 0 #a8c4ee;">Space</kbd>
          <span style="font-size:0.82rem;color:#8aa4c0;">when circle turns blue</span>
        </div>
      `,
        });
    }

    _renderDemo() {
        const isChoice = this.config.variant === 'choice';
        this._buildDemoShell(`Reaction Time ${isChoice ? '(Choice)' : '(Simple)'} — live preview`);
        const stage = document.getElementById('demo-stage');

        stage.innerHTML = `
      <div class="demo-rt">
        <div class="demo-rt__circle" id="demo-rt-circle"></div>
      </div>
    `;

        const sides  = ['left', 'right', 'left', 'right'];
        let cur      = 0;
        const PERIOD = 2000;

        const runFrame = () => {
            const circle = document.getElementById('demo-rt-circle');
            if (!circle) return;

            circle.className = 'demo-rt__circle demo-rt__circle--wait';
            circle.innerHTML = '';

            this._demoTimeout(() => {
                circle.classList.add('demo-rt__circle--active');
                if (isChoice) {
                    circle.innerHTML = `<span style="font-size:2rem;color:#fff;">${sides[cur % sides.length] === 'left' ? '←' : '→'}</span>`;
                }

                this._demoTimeout(() => {
                    circle.classList.add('demo-rt__circle--pressed');
                    circle.innerHTML = '';

                    this._demoTimeout(() => {
                        circle.className = 'demo-rt__circle';
                        circle.innerHTML = '';
                        cur++;
                    }, 350);
                }, 500);
            }, 900);
        };

        runFrame();
        this._demoInterval(runFrame, PERIOD);
    }

    setup() {
        this._falseStarts = 0;
        this._phase       = 'idle';
        this._startNextTrial();
    }

    _startNextTrial() {
        if (this._unmounted) return;
        if (this._trialIndex >= this.config.trials) {
            this._phase = 'idle';
            this._detachKey();
            this._done();
            return;
        }

        this._phase        = 'iti';
        this._itiStartedAt = performance.now();
        this._currentTrial = {
            variant: this.config.variant,
            side:    this.config.variant === 'simple' ? 'center' : this._rng.pick(['left', 'right']),
        };

        this._renderWaitScreen();
        this._attachKey(this._makeFalseStartHandler());

        const delay = this._rng.nextInt(this.config.minItiMs, this.config.maxItiMs);
        this._itiTimer = setTimeout(() => this._showStimulus(), delay);
    }

    _showStimulus() {
        if (this._unmounted || this._phase !== 'iti') return;
        this._phase = 'stimulus';
        this._detachKey();

        const target = document.getElementById('rt-circle');
        if (!target) { this._startNextTrial(); return; }

        target.classList.remove('rt-circle--wait');
        target.classList.add('rt-circle--active');
        if (this.config.variant === 'choice') {
            target.innerHTML = `<span class="rt-arrow">${this._currentTrial.side === 'left' ? '←' : '→'}</span>`;
        }

        this._startTrial(this._currentTrial);
        this._attachKey(this._makeResponseHandler());

        this._stimTimer = setTimeout(() => {
            if (this._unmounted || this._phase !== 'stimulus') return;
            this._detachKey();
            this._recordAndContinue({ key: null, timedOut: true });
        }, this.config.stimMaxMs);
    }

    _makeFalseStartHandler() {
        return (e) => {
            if (e.repeat || !this._isTargetKey(e)) return;
            e.preventDefault();
            if (this._phase !== 'iti') return;

            this._clearTimers();
            this._detachKey();

            this._falseStarts++;
            const itiElapsedMs = Math.round(performance.now() - this._itiStartedAt);
            const pressedKey   = this._keyToSide(e);

            this._startTrial({ ...this._currentTrial, falseStart: true });
            const falseStartRecord = {
                key:              pressedKey,
                correct:          false,
                timedOut:         false,
                falseStart:       true,
                falseStartCount:  this._falseStarts,
                itiElapsedMs,
                side:             this._currentTrial.side,
                reactionTime:     null,
                trialIndex:       null,
                targetTrialIndex: this._trialIndex,
            };
            this._results.push(falseStartRecord);
            eventBus.emit(EVENTS.TEST_TRIAL_END, { testId: this.id, result: falseStartRecord });

            this._phase = 'feedback';
            const circle = document.getElementById('rt-circle');
            if (circle) {
                circle.classList.remove('rt-circle--wait', 'rt-circle--active');
                circle.classList.add('rt-circle--false');
                circle.innerHTML = '';
            }

            this._feedbackTimer = setTimeout(() => this._startNextTrial(), 900);
        };
    }

    _makeResponseHandler() {
        return (e) => {
            if (e.repeat || !this._isTargetKey(e)) return;
            e.preventDefault();
            if (this._phase !== 'stimulus') return;
            this._clearTimers();
            this._detachKey();
            this._recordAndContinue({ key: this._keyToSide(e), timedOut: false });
        };
    }

    _recordAndContinue({ key, timedOut }) {
        this._phase = 'feedback';

        const correct = timedOut
            ? false
            : this.config.variant === 'simple'
                ? key === 'space'
                : key === this._currentTrial.side;

        const trialPayload = {
            key,
            correct,
            timedOut,
            falseStart: false,
            side:       this._currentTrial.side,
        };

        if (timedOut) {
            trialPayload.reactionTime = null;
        }

        this._endTrial(trialPayload);

        const circle = document.getElementById('rt-circle');
        if (circle) {
            circle.classList.remove('rt-circle--active');
            circle.classList.add(correct ? 'rt-circle--correct' : 'rt-circle--wrong');
            circle.innerHTML = '';
        }

        this._feedbackTimer = setTimeout(() => this._startNextTrial(), 700);
    }

    _renderWaitScreen() {
        const pct = (this._trialIndex / this.config.trials) * 100;

        this._container.innerHTML = `
      <div class="test-screen">
        <div class="test-progress">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="test-arena rt-test-arena">
          <div class="rt-circle rt-circle--wait" id="rt-circle"></div>
        </div>
      </div>
    `;
    }

    _isTargetKey(e) {
        if (this.config.variant === 'simple') return e.code === 'Space';
        return e.code === 'ArrowLeft' || e.code === 'ArrowRight';
    }

    _keyToSide(e) {
        if (e.code === 'Space')      return 'space';
        if (e.code === 'ArrowLeft')  return 'left';
        if (e.code === 'ArrowRight') return 'right';
        return null;
    }

    _clearTimers() {
        clearTimeout(this._itiTimer);
        clearTimeout(this._stimTimer);
        clearTimeout(this._feedbackTimer);
        this._itiTimer      = null;
        this._stimTimer     = null;
        this._feedbackTimer = null;
    }
}