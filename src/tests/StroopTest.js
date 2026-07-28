/**
 *
 */

import { BaseTest }     from './BaseTest.js';
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
    itiMs:          500,
    seed:           42,
};

export class StroopTest extends BaseTest {
    constructor(config = {}) {
        super('stroop', 'Stroop Color–Word Test', { ...DEFAULT_CONFIG, ...config });
        this._rng    = new SeededRandom(this.config.seed);
        this._trials = [];
        this._trialTimeout = null;
    }

    unmount() {
        clearTimeout(this._trialTimeout);
        super.unmount();
    }


    _renderInstructions() {
        this._buildInstructionShell({
            title:    'Stroop Color–Word Test',
            subtitle: 'A word will appear in coloured ink. Select the <strong>ink colour</strong> — ignore what the word says.',
            bullets: [
                'Focus on the colour of the letters, not the meaning of the word',
                'Use the colour buttons to respond',
                'Respond as quickly and accurately as possible',
                `${this.config.trials} trials · approximately 3–4 minutes`,
            ],
        });
    }


    _renderDemo() {
        this._buildDemoShell('Stroop — live preview');
        const stage = document.getElementById('demo-stage');

        const demoTrials = [
            { word: 'BLUE',   inkColor: COLORS[1], congruent: true  },
            { word: 'RED',    inkColor: COLORS[2], congruent: false }, // word=RED, ink=GREEN
            { word: 'GREEN',  inkColor: COLORS[3], congruent: false }, // word=GREEN, ink=YELLOW
            { word: 'PURPLE', inkColor: COLORS[4], congruent: true  },
        ];

        stage.innerHTML = `
      <div class="demo-stroop">
        <div class="demo-stroop__display" id="demo-stroop-display">
          <span class="demo-stroop__word" id="demo-stroop-word"></span>
        </div>
        <div class="demo-stroop__buttons">
          ${COLORS.map(c => `
            <button class="demo-stroop__btn" id="demo-stroop-${c.name}"
              style="color:${c.css};border-color:${c.border};background:${c.bg};">
              ${c.name}
            </button>
          `).join('')}
        </div>
      </div>
    `;

        let cur = 0;
        const PERIOD = 2200;

        const runFrame = () => {
            const display = document.getElementById('demo-stroop-display');
            const wordEl  = document.getElementById('demo-stroop-word');
            if (!display || !wordEl) return;

            const trial = demoTrials[cur % demoTrials.length];
            wordEl.textContent  = trial.word;
            wordEl.style.color  = trial.inkColor.css;
            display.style.background   = 'var(--color-surface)';
            display.style.borderColor  = 'var(--color-border)';

            this._demoTimeout(() => {
                const correctBtn = document.getElementById(`demo-stroop-${trial.inkColor.name}`);
                if (correctBtn) correctBtn.classList.add('demo-stroop__btn--selected');
                display.style.background  = trial.inkColor.bg;
                display.style.borderColor = trial.inkColor.border;

                this._demoTimeout(() => {
                    if (correctBtn) correctBtn.classList.remove('demo-stroop__btn--selected');
                    wordEl.textContent = '';
                    display.style.background  = 'var(--color-surface)';
                    display.style.borderColor = 'var(--color-border)';
                    cur++;
                }, 500);
            }, 1600);
        };

        runFrame();
        this._demoInterval(runFrame, PERIOD);
    }


    setup() {
        this._trials = this._generateTrials();
        this._nextTrial();
    }

    _generateTrials() {
        const total     = this.config.trials;
        const nCongruent = Math.round(total * this.config.congruentRatio);
        return this._rng.shuffle(
            Array.from({ length: total }, (_, i) => {
                const inkColor  = this._rng.pick(COLORS);
                const congruent = i < nCongruent;
                const wordColor = congruent
                    ? inkColor
                    : this._rng.pick(COLORS.filter(c => c.name !== inkColor.name));
                return { word: wordColor.name, inkColor, congruent };
            })
        );
    }

    _nextTrial() {
        if (this._trialIndex >= this._trials.length) {
            this._done();
            return;
        }
        this.renderTrial(this._trials[this._trialIndex]);
    }

    renderTrial(trial) {
        const pct = (this._trialIndex / this._trials.length) * 100;

        this._container.innerHTML = `
      <div class="test-screen">
        <div class="test-progress">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="test-arena stroop-test-arena">
          <div class="stroop-word-display" id="stroop-display">
            <span class="stroop-word-text" style="color:${trial.inkColor.css};">${trial.word}</span>
          </div>
          <div class="stroop-btn-grid">
            ${COLORS.map(c => `
              <button class="stroop-choice-btn" data-color="${c.name}"
                style="color:${c.css};border-color:${c.border};background:${c.bg};">
                ${c.name}
              </button>
            `).join('')}
          </div>
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
            display.style.borderColor = correct ? 'var(--color-success)' : 'var(--color-danger)';
            display.style.background  = correct ? 'var(--color-success-bg)' : 'var(--color-danger-bg)';
        }
        this._container.querySelectorAll('.stroop-choice-btn').forEach(b => (b.disabled = true));

        setTimeout(() => this._nextTrial(), this.config.itiMs);
    }
}