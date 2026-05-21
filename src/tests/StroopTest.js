import { BaseTest }    from './BaseTest.js';
import { SeededRandom } from '../utils/Random.js';

const COLORS = [
    { name: 'RED',    css: 'var(--stroop-red)',    bg: '#fdeef0', border: '#f09595' },
    { name: 'BLUE',   css: 'var(--stroop-blue)',   bg: '#e6eef9', border: '#85b7eb' },
    { name: 'GREEN',  css: 'var(--stroop-green)',  bg: '#eaf3de', border: '#97c459' },
    { name: 'YELLOW', css: 'var(--stroop-yellow)', bg: '#faeeda', border: '#ef9f27' },
    { name: 'PURPLE', css: 'var(--stroop-purple)', bg: '#eeedfe', border: '#afa9ec' },
    { name: 'ORANGE', css: 'var(--stroop-orange)', bg: '#faece7', border: '#f0997b' },
];

const DEFAULT_CONFIG = {
    trials:         24,
    congruentRatio: 0.33,
    displayMs:      3000,
    itiMs:          600,
    seed:           42,
};

export class StroopTest extends BaseTest {
    constructor(config = {}) {
        super('stroop', 'Stroop Color–Word Test', { ...DEFAULT_CONFIG, ...config });
        this._rng    = new SeededRandom(this.config.seed);
        this._trials = [];
    }

    setup() {
        this._trials     = this._generateTrials();
        this._trialIndex = 0;
        this._results    = [];
        this._renderInstructions();
    }

    _generateTrials() {
        const total = this.config.trials;
        return this._rng.shuffle(
            Array.from({ length: total }, (_, i) => {
                const inkColor  = this._rng.pick(COLORS);
                const congruent = i < Math.round(total * this.config.congruentRatio);
                const wordColor = congruent
                    ? inkColor
                    : this._rng.pick(COLORS.filter(c => c.name !== inkColor.name));
                return { word: wordColor.name, inkColor, congruent };
            })
        );
    }

    _renderInstructions() {
        this._container.innerHTML = `
      <div class="test-instructions anim-fade-in">
        <h2 class="test-title">Stroop Color–Word Test</h2>
        <p class="test-subtitle">
          A word will appear on screen printed in a colored ink.
          Identify the <strong>ink color</strong> — not what the word says.
        </p>
        <ul class="instruction-list">
          <li>Focus on the color of the letters, not the word itself</li>
          <li>Respond as quickly and accurately as possible</li>
          <li>Use the color buttons to submit your answer</li>
          <li>${this.config.trials} trials total · approx. 3–4 minutes</li>
        </ul>
        <div style="display: flex; gap: var(--space-sm); margin-bottom: var(--space-xl);">
          <div style="flex: 1; background: var(--color-surface-alt); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-md); text-align: center;">
            <p style="font-size: 1.8rem; font-weight: 600; color: var(--stroop-green); margin-bottom: 4px;">RED</p>
            <p style="font-size: 0.75rem; color: var(--color-text-muted);">Correct answer: <strong>Green</strong></p>
          </div>
        </div>
        <button class="btn btn--primary btn--lg" id="stroop-start">Begin test</button>
      </div>
    `;
        document.getElementById('stroop-start')
            .addEventListener('click', () => this._renderCountdown(3, () => this._nextTrial()));
    }

    _nextTrial() {
        if (this._trialIndex >= this._trials.length) { this._done(); return; }
        this.renderTrial(this._trials[this._trialIndex]);
    }

    renderTrial(trial) {
        const pct = (this._trialIndex / this._trials.length) * 100;
        this._container.innerHTML = `
      <div class="stroop-layout anim-fade-fast">
        <div class="stroop-header">
          <div class="progress-bar" style="flex: 1;">
            <div class="progress-bar__fill" style="width: ${pct}%;"></div>
          </div>
          <span class="stroop-trial-count">${this._trialIndex + 1} / ${this._trials.length}</span>
        </div>
        <div class="stroop-display" id="stroop-display">
          <span class="stroop-word" style="color: ${trial.inkColor.css};">${trial.word}</span>
        </div>
        <p class="stroop-question">What color is the ink?</p>
        <div class="stroop-choices">
          ${COLORS.map(c => `
            <button
              class="stroop-choice-btn"
              data-color="${c.name}"
              style="color: ${c.css}; border-color: ${c.border}; background: ${c.bg};"
            >${c.name}</button>
          `).join('')}
        </div>
      </div>
    `;

        this._startTrial(trial);

        this._container.querySelectorAll('.stroop-choice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                clearTimeout(this._trialTimeout);
                this.processResponse({ response: btn.dataset.color, trial });
            });
        });

        this._trialTimeout = setTimeout(
            () => this.processResponse({ response: null, trial, timedOut: true }),
            this.config.displayMs
        );
    }

    processResponse({ response, trial, timedOut = false }) {
        const correct = !timedOut && response === trial.inkColor.name;
        this._endTrial({ response, correct, timedOut, congruent: trial.congruent });

        const display = document.getElementById('stroop-display');
        if (display && !timedOut) {
            display.style.background = correct ? 'var(--color-success-bg)' : 'var(--color-danger-bg)';
            display.style.borderColor = correct ? 'var(--color-success)' : 'var(--color-danger)';
        }
        this._container.querySelectorAll('.stroop-choice-btn').forEach(b => (b.disabled = true));

        setTimeout(() => this._nextTrial(), this.config.itiMs);
    }
}