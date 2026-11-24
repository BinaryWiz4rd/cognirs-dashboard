/***
 * Working memory paradigm in fNIRS + ADHD research.
 * (Monden et al. 2012, Gu et al. 2022, Yanagisawa et al. 2010)
 *
 * Feedback: silent border color change on the card (green/red, 300 ms).
 */

import { BaseTest }     from './BaseTest.js';
import { SeededRandom } from '../utils/Random.js';

const LETTERS = ['B','C','D','F','G','H','J','K','L','M',
    'N','P','Q','R','S','T','V','W','Y'];

const DEFAULT_CONFIG = {
    n:              2,
    trials:         30,
    targetRatio:    0.33,
    stimDurationMs: 1500,
    isiMs:          500,
    seed:           17,
};

export class NBackTest extends BaseTest {
    constructor(config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        super('n-back', `${cfg.n}-Back Task`, cfg);
        this._rng       = new SeededRandom(cfg.seed);
        this._sequence  = [];
        this._responded = false;
        this._stimTimer = null;
        this._isiTimer  = null;
        this._phase     = 'idle';
    }

    unmount() {
        this._phase = 'idle';
        this._clearTimers();
        super.unmount();
    }

    _renderInstructions() {
        const n = this.config.n;
        const rule = {
            0: 'Press <strong>Space</strong> every time you see the letter <strong>X</strong>.',
            1: 'Press <strong>Space</strong> when the current letter is the same as the <strong>previous</strong> one.',
            2: 'Press <strong>Space</strong> when the current letter matches the one shown <strong>two letters ago</strong>.',
        }[n] ?? `Press <strong>Space</strong> when the current letter matches the one shown <strong>${n} letters ago</strong>.`;

        this._buildInstructionShell({
            title:    `${n}-Back Task`,
            subtitle: rule,
            bullets: [
                `A single letter appears on screen for ${this.config.stimDurationMs / 1000} s, then a brief blank`,
                'Press Space if it matches — do nothing if it does not',
                'Accuracy matters more than speed; do not guess',
                `${this.config.trials} letters total`,
            ],
            keysHtml: `
        <div style="display:flex; align-items:center; gap:10px;">
          <kbd style="
            font-family:monospace; font-size:0.78rem; font-weight:600;
            padding:4px 12px; background:#fff;
            border:1.5px solid var(--color-border-strong,#a8c4ee);
            border-radius:5px; color:var(--color-text,#1e2d4a);
            box-shadow:0 1px 0 var(--color-border-strong,#a8c4ee);
          ">Space</kbd>
          <span style="font-size:0.85rem; color:var(--color-text-muted,#8aa4c0);">= target match</span>
        </div>
      `,
        });
    }

    _renderDemo() {
        const n = this.config.n;
        this._buildDemoShell(`${n}-Back — live preview`);

        const seq = n === 0
            ? ['M', 'X', 'K', 'X', 'B']
            : n === 1
                ? ['K', 'K', 'B', 'T', 'T']
                : ['G', 'M', 'G', 'B', 'M', 'B'];

        const isTarget = n === 0
            ? seq.map(l => l === 'X')
            : seq.map((l, i) => i >= n && l === seq[i - n]);

        const stage = document.getElementById('demo-stage');
        stage.innerHTML = `
      <div class="demo-nback">
        <div class="demo-nback__card" id="demo-nback-card">
          <span class="demo-nback__letter" id="demo-nback-letter"></span>
        </div>
        <div class="demo-nback__trail" id="demo-nback-trail">
          ${seq.map((_, i) => `<div class="demo-trail-dot" id="demo-dot-${i}"></div>`).join('')}
        </div>
      </div>
    `;

        let cur = 0;
        const CYCLE = this.config.stimDurationMs + this.config.isiMs;

        const showFrame = () => {
            const card   = document.getElementById('demo-nback-card');
            const letter = document.getElementById('demo-nback-letter');
            if (!card || !letter) return;

            document.querySelectorAll('.demo-trail-dot').forEach((d, i) => {
                d.classList.toggle('demo-trail-dot--active', i === cur);
                d.classList.toggle('demo-trail-dot--past',   i < cur);
            });

            letter.textContent = seq[cur];
            card.className = 'demo-nback__card';
            void card.offsetWidth;
            card.classList.add('demo-nback__card--show');
            this._demoTimeout(() => {
                if (isTarget[cur]) {
                    card.classList.add('demo-nback__card--hit');
                }
                this._demoTimeout(() => {
                    card.classList.remove('demo-nback__card--show', 'demo-nback__card--hit');
                    letter.textContent = '';
                    cur = (cur + 1) % seq.length;
                }, 300);
            }, this.config.stimDurationMs - 300);
        };

        showFrame();
        this._demoInterval(showFrame, CYCLE);
    }

    setup() {
        this._sequence  = this._generateSequence();
        this._phase     = 'idle';
        this._nextStimulus();
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
            if (n === 0) {
                letter = targetSlots.has(i) ? 'X' : this._rng.pick(LETTERS);
            } else {
                const nBackLetter = sequence[sequence.length - n].letter;
                letter = targetSlots.has(i)
                    ? nBackLetter
                    : this._rng.pick(LETTERS.filter(l => l !== nBackLetter));
            }
            sequence.push({ letter, isTarget: targetSlots.has(i), isPrime: false });
        }

        return sequence;
    }

    _nextStimulus() {
        if (this._unmounted) return;
        if (this._trialIndex >= this._sequence.length) {
            this._phase = 'idle';
            this._detachKey();
            this._done();
            return;
        }

        const stimulus   = this._sequence[this._trialIndex];
        this._responded  = false;
        this._phase      = 'stim';

        this._renderStimulusScreen(stimulus);

        if (!stimulus.isPrime) {
            this._startTrial(stimulus);
            this._attachKey(this._makeResponseHandler(stimulus));
        }

        this._stimTimer = setTimeout(() => this._onStimulusEnd(stimulus), this.config.stimDurationMs);
    }

    _onStimulusEnd(stimulus) {
        if (this._unmounted || this._phase !== 'stim') return;
        this._phase = 'isi';
        this._detachKey();

        if (!stimulus.isPrime) {
            if (stimulus.isTarget && !this._responded) {
                this._endTrial({ correct: false, hit: false, miss: true, falseAlarm: false, isTarget: true });
            } else if (!stimulus.isTarget && !this._responded) {
                this._endTrial({ correct: true,  hit: false, miss: false, falseAlarm: false, isTarget: false });
            }
        }

        const card = document.getElementById('nback-card');
        if (card) {
            card.classList.remove('nback-card--show', 'nback-card--hit', 'nback-card--miss');
            const letter = card.querySelector('.nback-letter');
            if (letter) letter.textContent = '';
        }

        this._isiTimer = setTimeout(() => {
            if (this._unmounted) return;
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
                    hit:        correct,
                    miss:       false,
                    falseAlarm: !stimulus.isTarget,
                    isTarget:   stimulus.isTarget,
                });
            }

            const card = document.getElementById('nback-card');
            if (card) {
                card.classList.add(correct ? 'nback-card--hit' : 'nback-card--miss');
            }
        };
    }

    _renderStimulusScreen(stimulus) {
        const nonPrimeIdx = this._trialIndex - this.config.n;
        const pct         = Math.max(0, (nonPrimeIdx / this.config.trials) * 100);

        this._container.innerHTML = `
      <div class="test-screen">
        <div class="test-progress">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="test-arena nback-arena">
          <div class="nback-card nback-card--show" id="nback-card">
            <span class="nback-letter">${stimulus.letter}</span>
          </div>
        </div>
      </div>
    `;
    }

    _clearTimers() {
        clearTimeout(this._stimTimer);
        clearTimeout(this._isiTimer);
        this._stimTimer = null;
        this._isiTimer  = null;
    }
}