import { BaseTest }     from './BaseTest.js';
import { SeededRandom } from '../utils/Random.js';

const DEFAULT_CONFIG = {
    variant:   'simple',
    trials:    20,
    minItiMs:  1000,
    maxItiMs:  2800,
    stimMaxMs: 3000,
    seed:      7,
};

const ARROWS = { left: '←', right: '→' };

export class ReactionTimeTest extends BaseTest {
    constructor(config = {}) {
        super('reaction-time', 'Reaction Time Test', { ...DEFAULT_CONFIG, ...config });
        this._rng         = new SeededRandom(this.config.seed);
        this._itiTimer    = null;
        this._stimTimer   = null;
        this._keyFn       = null;
        this._phase       = 'idle';
        this._falseStarts = 0;
        this._currentTrial = null;
    }

    setup() {
        this._trialIndex   = 0;
        this._results      = [];
        this._falseStarts  = 0;
        this._phase        = 'idle';
        this._renderInstructions();
    }

    unmount() {
        this._clearTimers();
        this._detachKey();
        super.unmount();
    }

    _renderInstructions() {
        const isChoice = this.config.variant === 'choice';

        this._container.innerHTML = `
      <div class="test-instructions anim-fade-in">
        <h2 class="test-title">Reaction Time — ${isChoice ? 'Choice' : 'Simple'}</h2>
        <p class="test-subtitle">
          ${isChoice
            ? 'When an arrow appears inside the circle, press the <strong>matching arrow key</strong> (← or →) as quickly as possible.'
            : 'When the circle turns blue, press the <strong>Space bar</strong> as quickly as possible.'}
        </p>
        <ul class="instruction-list">
          <li>Keep your fingers resting on the key(s) before each trial begins</li>
          <li>Wait for the circle to change — do not press early</li>
          <li>Respond with a single keypress, as fast as you can</li>
          <li>False starts (pressing before the signal) are recorded</li>
          <li>${this.config.trials} trials · approximately 2–3 minutes</li>
        </ul>

        <div style="display:flex; gap:var(--space-md); margin-bottom:var(--space-xl);">
          ${isChoice ? `
            <div class="card card--flat" style="flex:1;text-align:center;padding:var(--space-md);">
              <p style="font-size:2rem;margin-bottom:6px;color:var(--color-text);">←</p>
              <p style="font-size:0.78rem;color:var(--color-text-muted);">Left arrow key</p>
            </div>
            <div class="card card--flat" style="flex:1;text-align:center;padding:var(--space-md);">
              <p style="font-size:2rem;margin-bottom:6px;color:var(--color-text);">→</p>
              <p style="font-size:0.78rem;color:var(--color-text-muted);">Right arrow key</p>
            </div>
          ` : `
            <div class="card card--flat" style="flex:1;text-align:center;padding:var(--space-md);">
              <p style="font-size:1.1rem;font-weight:500;margin-bottom:6px;">Space bar</p>
              <p style="font-size:0.78rem;color:var(--color-text-muted);">Press when circle turns blue</p>
            </div>
          `}
        </div>

        <button class="btn btn--primary btn--lg" id="rt-start-btn">Begin test</button>
      </div>
    `;

        document.getElementById('rt-start-btn')
            .addEventListener('click', () =>
                this._renderCountdown(3, () => this._startNextTrial())
            );
    }

    _startNextTrial() {
        if (this._trialIndex >= this.config.trials) {
            this._phase = 'idle';
            this._detachKey();
            this._done();
            return;
        }

        this._phase = 'iti';
        this._currentTrial = {
            variant: this.config.variant,
            side: this._rng.pick(['left', 'right']),
            index: this._trialIndex,
        };

        this._renderWaitScreen();
        this._attachKey(this._makeFalseStartHandler());

        const delay = this._rng.nextInt(this.config.minItiMs, this.config.maxItiMs);
        this._itiTimer = setTimeout(() => this._showStimulus(), delay);
    }

    _showStimulus() {
        if (this._phase !== 'iti') return;

        this._phase = 'stimulus';
        this._detachKey();

        const target = document.getElementById('rt-target');
        if (!target) { this._startNextTrial(); return; }

        const isChoice = this.config.variant === 'choice';
        const side = this._currentTrial.side;

        target.classList.remove('rt-target--wait');
        target.classList.add('rt-target--active');
        if (isChoice) {
            target.innerHTML = `<span style="font-size:2rem;color:#fff;line-height:1;">${ARROWS[side]}</span>`;
        }

        if (isChoice) {
            const sideEl = document.querySelector(`.rt-side--${side}`);
            if (sideEl) sideEl.style.opacity = '1';
        }

        const hint = document.getElementById('rt-hint');
        if (hint) {
            hint.textContent = isChoice ? 'Respond now!' : 'Press Space!';
            hint.style.color = 'var(--color-primary)';
            hint.style.fontWeight = '500';
        }

        this._startTrial(this._currentTrial);
        this._attachKey(this._makeResponseHandler());

        this._stimTimer = setTimeout(() => {
            if (this._phase !== 'stimulus') return;
            this._detachKey();
            this._recordAndContinue({ key: null, timedOut: true });
        }, this.config.stimMaxMs);
    }

    _makeFalseStartHandler() {
        return (e) => {
            if (!this._isTargetKey(e)) return;
            e.preventDefault();
            if (this._phase !== 'iti') return;

            this._clearTimers();
            this._detachKey();
            this._falseStarts++;
            this._phase = 'feedback';

            // Flash the circle red briefly, then restart
            const target = document.getElementById('rt-target');
            if (target) {
                target.classList.add('rt-target--wrong');
                const badge = document.getElementById('rt-false-badge');
                if (badge) badge.textContent = `${this._falseStarts} false start${this._falseStarts !== 1 ? 's' : ''}`;
            }

            setTimeout(() => this._startNextTrial(), 900);
        };
    }

    _makeResponseHandler() {
        return (e) => {
            if (!this._isTargetKey(e)) return;
            e.preventDefault();
            if (this._phase !== 'stimulus') return;

            this._clearTimers();
            this._detachKey();

            const pressed = this._keyToSide(e);
            this._recordAndContinue({ key: pressed, timedOut: false });
        };
    }

    _recordAndContinue({ key, timedOut }) {
        this._phase = 'feedback';

        const isCorrect = timedOut
            ? false
            : this.config.variant === 'simple'
                ? key === 'space'
                : key === this._currentTrial.side;

        this._endTrial({
            key,
            correct: isCorrect,
            timedOut,
            side: this._currentTrial.side,
            falseStarts: this._falseStarts,
        });

        const target = document.getElementById('rt-target');
        if (target) {
            target.classList.remove('rt-target--active');
            if (timedOut) {
                target.classList.add('rt-target--wrong');
                target.innerHTML = `<span style="font-size:1.2rem;color:#fff;">⏱</span>`;
            } else if (isCorrect) {
                target.classList.add('rt-target--correct');
                target.innerHTML = `<span style="font-size:1.4rem;color:#fff;">✓</span>`;
            } else {
                target.classList.add('rt-target--wrong');
                target.innerHTML = `<span style="font-size:1.4rem;color:#fff;">✗</span>`;
            }
        }

        this._trialIndex++;
        setTimeout(() => this._startNextTrial(), 750);
    }

    _renderWaitScreen() {
        const pct      = (this._trialIndex / this.config.trials) * 100;
        const isChoice = this.config.variant === 'choice';

        this._container.innerHTML = `
      <div class="rt-layout anim-fade-fast">

        <div class="rt-header" style="max-width:500px;width:100%;">
          <div class="progress-bar" style="flex:1;">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
          <span style="font-size:0.8rem;color:var(--color-text-muted);white-space:nowrap;font-variant-numeric:tabular-nums;">
            ${this._trialIndex + 1} / ${this.config.trials}
          </span>
        </div>

        <div class="rt-arena" id="rt-arena">
          ${isChoice ? `
            <div class="rt-choice-left rt-side--left" style="opacity:0.3;">
              <div style="font-size:2rem;color:var(--color-text-secondary);">←</div>
              <p class="rt-key-hint">Left key</p>
            </div>
          ` : ''}

          <div class="rt-target rt-target--wait" id="rt-target"></div>

          ${isChoice ? `
            <div class="rt-choice-right rt-side--right" style="opacity:0.3;">
              <div style="font-size:2rem;color:var(--color-text-secondary);">→</div>
              <p class="rt-key-hint">Right key</p>
            </div>
          ` : ''}
        </div>

        <p id="rt-hint" style="font-size:0.8rem;color:var(--color-text-muted);text-align:center;letter-spacing:0.06em;text-transform:uppercase;">
          Wait for the signal…
        </p>

        <p id="rt-false-badge" style="font-size:0.78rem;color:var(--color-danger);text-align:center;margin-top:var(--space-sm);min-height:1.2em;">
          ${this._falseStarts > 0 ? `${this._falseStarts} false start${this._falseStarts !== 1 ? 's' : ''}` : ''}
        </p>

      </div>
    `;
    }

    _attachKey(fn) {
        this._detachKey();
        this._keyFn = fn;
        document.addEventListener('keydown', this._keyFn);
    }

    _detachKey() {
        if (this._keyFn) {
            document.removeEventListener('keydown', this._keyFn);
            this._keyFn = null;
        }
    }

    _clearTimers() {
        clearTimeout(this._itiTimer);
        clearTimeout(this._stimTimer);
        this._itiTimer  = null;
        this._stimTimer = null;
    }

    _isTargetKey(e) {
        if (this.config.variant === 'simple') {
            return e.code === 'Space';
        }
        return e.code === 'ArrowLeft' || e.code === 'ArrowRight';
    }

    _keyToSide(e) {
        if (e.code === 'Space')      return 'space';
        if (e.code === 'ArrowLeft')  return 'left';
        if (e.code === 'ArrowRight') return 'right';
        return null;
    }

    renderTrial()    {}
    processResponse() {}
}