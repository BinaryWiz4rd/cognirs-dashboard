import { BaseTest }    from './BaseTest.js';
import { SeededRandom } from '../utils/Random.js';

const LETTERS = ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M',
    'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y'];

const DEFAULT_CONFIG = {
    n:             2,       // n-back level (0, 1, or 2)
    trials:        30,      // total stimuli (excl. first n primes)
    targetRatio:   0.33,    // proportion of target trials
    stimDurationMs:1500,    // time stimulus is visible
    isiMs:         500,     // blank inter-stimulus interval
    seed:          17,
};

export class NBackTest extends BaseTest {
    constructor(config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        super('n-back', `${cfg.n}-Back Task`, cfg);
        this._rng        = new SeededRandom(cfg.seed);
        this._sequence   = [];
        this._responded  = false;
        this._stimTimer  = null;
        this._isiTimer   = null;
        this._keyFn      = null;
        this._phase      = 'idle';
    }

    setup() {
        this._sequence   = this._generateSequence();
        this._trialIndex = 0;
        this._results    = [];
        this._phase      = 'idle';
        this._renderInstructions();
    }

    unmount() {
        this._clearTimers();
        this._detachKey();
        super.unmount();
    }

    _generateSequence() {
        const n        = this.config.n;
        const total    = this.config.trials;
        const nTargets = Math.round(total * this.config.targetRatio);

        const sequence = [];
        for (let i = 0; i < n; i++) {
            sequence.push({ letter: this._rng.pick(LETTERS), isTarget: false, isPrime: true });
        }

        const targetSlots = new Set();
        while (targetSlots.size < nTargets) {
            targetSlots.add(this._rng.nextInt(0, total - 1));
        }

        for (let i = 0; i < total; i++) {
            let letter;
            if (this.config.n === 0) {
                letter = targetSlots.has(i) ? 'X' : this._rng.pick(LETTERS.filter(l => l !== 'X'));
            } else {
                const nBack = sequence[sequence.length - n];
                if (targetSlots.has(i)) {
                    letter = nBack.letter;
                } else {
                    const pool = LETTERS.filter(l => l !== nBack.letter);
                    letter = this._rng.pick(pool);
                }
            }
            sequence.push({ letter, isTarget: targetSlots.has(i), isPrime: false });
        }

        return sequence;
    }

    _renderInstructions() {
        const n = this.config.n;
        const descriptions = {
            0: 'Press <strong>Space</strong> every time you see the letter <strong>X</strong>.',
            1: 'Press <strong>Space</strong> when the current letter matches the <strong>previous</strong> letter.',
            2: 'Press <strong>Space</strong> when the current letter matches the letter from <strong>two steps ago</strong>.',
        };

        const exampleSeq = n === 0
            ? ['B', 'X', 'M', 'X', 'K', 'X']
            : n === 1
                ? ['B', 'B', 'M', 'K', 'K', 'P']
                : ['B', 'M', 'B', 'K', 'P', 'K'];

        const targets = n === 0
            ? [1, 3, 5]
            : n === 1
                ? [1, 4]
                : [2, 5];

        this._container.innerHTML = `
      <div class="test-instructions anim-fade-in">
        <h2 class="test-title">${this.config.n}-Back Task</h2>
        <p class="test-subtitle">
          A letter will appear briefly on screen, one at a time in a continuous stream.
          ${descriptions[n]}
        </p>

        <ul class="instruction-list">
          <li>Respond with <strong>Space</strong> on target trials; do not press on non-targets</li>
          <li>You have ${this.config.stimDurationMs / 1000}s to respond — the letter disappears after that</li>
          <li>Stay focused — the pace is continuous with no breaks</li>
          <li>${this.config.trials} stimuli · approximately 3–4 minutes</li>
        </ul>

        <div style="margin-bottom: var(--space-xl);">
          <p style="font-size:0.78rem; font-weight:500; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:var(--space-sm);">
            Example sequence — press Space on highlighted letters
          </p>
          <div style="display:flex; gap:var(--space-sm); align-items:center; flex-wrap:wrap;">
            ${exampleSeq.map((l, i) => `
              <div style="
                width: 52px; height: 52px;
                border-radius: var(--radius-md);
                border: 2px solid ${targets.includes(i) ? 'var(--color-primary)' : 'var(--color-border)'};
                background: ${targets.includes(i) ? 'var(--color-primary-xlt)' : 'var(--color-surface-alt)'};
                display: flex; align-items: center; justify-content: center;
                font-size: 1.3rem; font-weight: 600;
                color: ${targets.includes(i) ? 'var(--color-primary-dark)' : 'var(--color-text-muted)'};
                font-family: var(--font-mono);
              ">
                ${l}
              </div>
            `).join('')}
          </div>
          <p style="font-size:0.75rem; color:var(--color-text-muted); margin-top:var(--space-sm);">
            Blue border = press Space &nbsp;·&nbsp; Gray = do nothing
          </p>
        </div>

        <button class="btn btn--primary btn--lg" id="nback-start">Begin task</button>
      </div>
    `;

        document.getElementById('nback-start')
            .addEventListener('click', () => this._renderCountdown(3, () => this._nextStimulus()));
    }

    _nextStimulus() {
        if (this._trialIndex >= this._sequence.length) {
            this._phase = 'idle';
            this._detachKey();
            this._done();
            return;
        }

        const stimulus = this._sequence[this._trialIndex];
        this._responded = false;
        this._phase = 'stim';

        this._renderStimulus(stimulus);

        if (!stimulus.isPrime) {
            this._startTrial(stimulus);
            this._attachKey(this._makeResponseHandler(stimulus));
        }

        this._stimTimer = setTimeout(() => {
            this._onStimulusEnd(stimulus);
        }, this.config.stimDurationMs);
    }

    _onStimulusEnd(stimulus) {
        if (this._phase !== 'stim') return;
        this._phase = 'isi';
        this._detachKey();

        if (!stimulus.isPrime && stimulus.isTarget && !this._responded) {
            this._endTrial({ correct: false, hit: false, miss: true, falseAlarm: false, isTarget: true });
        } else if (!stimulus.isPrime && !stimulus.isTarget && !this._responded) {
            this._endTrial({ correct: true, hit: false, miss: false, falseAlarm: false, isTarget: false });
        }

        this._renderISI();
        this._isiTimer = setTimeout(() => {
            this._trialIndex++;
            this._nextStimulus();
        }, this.config.isiMs);
    }

    _makeResponseHandler(stimulus) {
        return (e) => {
            if (e.code !== 'Space') return;
            e.preventDefault();
            if (this._phase !== 'stim' || this._responded) return;

            this._responded = true;
            this._detachKey();

            const correct = stimulus.isTarget;

            if (!stimulus.isPrime) {
                this._endTrial({
                    correct,
                    hit:        stimulus.isTarget && correct,
                    miss:       false,
                    falseAlarm: !stimulus.isTarget,
                    isTarget:   stimulus.isTarget,
                });
            }

            const card = document.getElementById('nback-stim-card');
            if (card) {
                card.style.borderColor = correct ? 'var(--color-success)' : 'var(--color-danger)';
                card.style.background  = correct ? 'var(--color-success-bg)' : 'var(--color-danger-bg)';
            }
        };
    }

    _renderStimulus(stimulus) {
        const nonPrimeIndex = this._trialIndex - this.config.n;
        const pct = Math.max(0, (nonPrimeIndex / this.config.trials) * 100);

        const primeLabel = stimulus.isPrime
            ? `<span class="badge badge--neutral" style="margin-left:auto; font-weight:600;">Memorise</span>`
            : '';

        this._container.innerHTML = `
      <div class="nback-layout anim-fade-fast">

        <div class="nback-header">
          <div class="progress-bar" style="flex:1;">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
          <span class="nback-count">
            ${Math.max(0, nonPrimeIndex + 1)} / ${this.config.trials}
          </span>
          ${primeLabel}
        </div>

        <div class="nback-arena">
          <div class="nback-stim-card" id="nback-stim-card">
            <span class="nback-letter">${stimulus.letter}</span>
          </div>
        </div>

        <div class="nback-footer">
          <div class="nback-key-hint">
            <kbd class="nback-kbd">Space</kbd>
            <span>= target match</span>
          </div>
          ${this.config.n > 0 ? `
            <div class="nback-history" id="nback-history">
              ${this._getRecentLetters(3).map((l, i) => `
                <div class="nback-hist-item ${i === 3 - this.config.n ? 'nback-hist-item--nback' : ''}">
                  <span class="nback-hist-letter">${l}</span>
                  <span class="nback-hist-label">${i === 3 - this.config.n ? `${this.config.n}-back` : `${3 - i} ago`}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

      </div>
    `;
    }

    _renderISI() {
        const card = document.getElementById('nback-stim-card');
        if (card) {
            card.innerHTML = '';
            card.style.borderColor = 'var(--color-border)';
            card.style.background  = 'var(--color-surface-alt)';
        }
    }

    _getRecentLetters(count) {
        const history = this._sequence.slice(0, this._trialIndex).map(s => s.letter);
        const recent  = history.slice(-count);
        while (recent.length < count) recent.unshift('–');
        return recent;
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
        clearTimeout(this._stimTimer);
        clearTimeout(this._isiTimer);
        this._stimTimer = null;
        this._isiTimer  = null;
    }

    renderTrial()    {}
    processResponse() {}
}