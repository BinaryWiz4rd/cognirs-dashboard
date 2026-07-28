/**
 * The CPT measures sustained attention over time.
 * The defining ADHD signature is a degradation of accuracy / RT
 * across the test duration (vigilance decrement).
 *
 * CPT-AX variant (Rosvold et al. 1956 (to jest bardziej do brain damage, ale koncepty sa opisane);
 *  Conners CPT-3 2014 (standard dzisiejszych testow uwagi dla osob z ADHD)):
 *   - A continuous stream of letters appears
 *   - Target: press Space when 'X' appears immediately after 'A'
 *   - All other letters: no response
 *
 * Outcome measures split into thirds (early / middle / late) to
 * quantify the vigilance decrement characteristic of ADHD.
 */

import { BaseTest }     from './BaseTest.js';
import { SeededRandom } from '../utils/Random.js';

const LETTERS = ['B','C','D','F','G','H','K','L','M','N',
    'P','Q','R','S','T','V','W','Y','Z'];

const DEFAULT_CONFIG = {
    trials:        100,    // total stimuli
    axRatio:       0.22,   // ~22% AX (target) sequences
    stimMs:        500,    // stimulus visible
    isiMs:         1000,   // blank between stimuli
    seed:          53,
};

export class ContinuousPerformanceTest extends BaseTest {
    constructor(config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        super('cpt', 'Continuous Performance Test', cfg);
        this._rng       = new SeededRandom(cfg.seed);
        this._sequence  = [];
        this._keyFn     = null;
        this._stimTimer = null;
        this._isiTimer  = null;
        this._phase     = 'idle';
        this._responded = false;
        this._prevLetter = null;
    }

    unmount() {
        this._clearTimers();
        this._detachKey();
        super.unmount();
    }

    _renderInstructions() {
        this._buildInstructionShell({
            title:    'Continuous Performance Test',
            subtitle: 'Letters appear one at a time. Press <strong>Space</strong> only when you see <strong>X</strong> immediately after <strong>A</strong>.',
            bullets: [
                'Most letters require no response — do not press',
                'Seeing A alone: do not press',
                'Seeing X without A before it: do not press',
                'Only A followed immediately by X: press Space',
                `${this.config.trials} letters total · approximately 4–5 minutes`,
            ],
            keysHtml: `
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="
            width:48px; height:48px; border-radius:8px;
            border:2px solid var(--color-accent-soft,#b8d4f8);
            background:var(--color-primary-xlt,#e6eef9);
            display:flex; align-items:center; justify-content:center;
            font-size:1.3rem; font-weight:600; font-family:monospace;
            color:var(--color-primary-dark,#2f5faa);
          ">A</div>
          <span style="font-size:1.1rem; color:var(--color-text-muted,#8aa4c0);">→</span>
          <div style="
            width:48px; height:48px; border-radius:8px;
            border:2px solid var(--color-success,#2d9e6b);
            background:var(--color-success-bg,#e8f7f0);
            display:flex; align-items:center; justify-content:center;
            font-size:1.3rem; font-weight:600; font-family:monospace;
            color:var(--color-success,#2d9e6b);
          ">X</div>
          <span style="font-size:0.85rem; color:var(--color-text-secondary,#4a6080); font-weight:500; margin-left:4px;">
            = press Space
          </span>
        </div>
      `,
        });
    }

    _renderDemo() {
        this._buildDemoShell('CPT — live preview');
        const stage = document.getElementById('demo-stage');

        const demoSeq = [
            { letter: 'B', isTarget: false, isA: false },
            { letter: 'K', isTarget: false, isA: false },
            { letter: 'A', isTarget: false, isA: true  },
            { letter: 'X', isTarget: true,  isA: false },
            { letter: 'M', isTarget: false, isA: false },
            { letter: 'A', isTarget: false, isA: true  },
            { letter: 'B', isTarget: false, isA: false },
        ];

        stage.innerHTML = `
      <div class="demo-cpt">
        <div class="demo-cpt__card" id="demo-cpt-card">
          <span class="demo-cpt__letter" id="demo-cpt-letter"></span>
        </div>
        <div class="demo-cpt__trail">
          ${demoSeq.map((s, i) => `
            <div class="demo-trail-dot ${s.isA ? 'demo-trail-dot--a' : ''}" id="demo-cpt-dot-${i}"></div>
          `).join('')}
        </div>
      </div>
    `;

        let cur = 0;
        const PERIOD = this.config.stimMs + this.config.isiMs;

        const showFrame = () => {
            const card   = document.getElementById('demo-cpt-card');
            const letter = document.getElementById('demo-cpt-letter');
            if (!card || !letter) return;

            const item = demoSeq[cur];

            document.querySelectorAll('[id^="demo-cpt-dot-"]').forEach((d, i) => {
                d.classList.toggle('demo-trail-dot--active', i === cur);
                d.classList.toggle('demo-trail-dot--past',   i < cur);
            });

            letter.textContent = item.letter;
            card.className = `demo-cpt__card demo-cpt__card--show ${item.isA ? 'demo-cpt__card--a' : ''}`;

            this._demoTimeout(() => {
                if (item.isTarget) card.classList.add('demo-cpt__card--hit');
                this._demoTimeout(() => {
                    card.classList.remove('demo-cpt__card--show', 'demo-cpt__card--hit', 'demo-cpt__card--a');
                    letter.textContent = '';
                    cur = (cur + 1) % demoSeq.length;
                }, 300);
            }, this.config.stimMs - 200);
        };

        showFrame();
        this._demoInterval(showFrame, PERIOD);
    }

    setup() {
        this._sequence   = this._generateSequence();
        this._prevLetter = null;
        this._phase      = 'idle';
        this._nextStimulus();
    }

    _generateSequence() {
        const total    = this.config.trials;
        const nTargets = Math.round(total * this.config.axRatio);
        const seq      = [];

        for (let i = 0; i < nTargets; i++) {
            seq.push({ letter: 'A', isTarget: false });
            seq.push({ letter: 'X', isTarget: true  });
        }

        const filler = LETTERS.filter(l => l !== 'A' && l !== 'X');
        const nFill  = total - seq.length;
        for (let i = 0; i < nFill; i++) {
            seq.push({ letter: this._rng.pick(filler), isTarget: false });
        }

        const shuffled = this._rng.shuffle(seq);

        for (let i = 1; i < shuffled.length; i++) {
            if (shuffled[i].letter === 'X' && shuffled[i - 1].letter === 'A' && !shuffled[i].isTarget) {
                for (let j = i + 1; j < shuffled.length; j++) {
                    if (!['A','X'].includes(shuffled[j].letter)) {
                        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                        break;
                    }
                }
            }
        }

        return shuffled;
    }

    _nextStimulus() {
        if (this._trialIndex >= this._sequence.length) {
            this._phase = 'idle';
            this._detachKey();
            this._done();
            return;
        }

        const stimulus  = this._sequence[this._trialIndex];
        this._responded = false;
        this._phase     = 'stim';

        this._renderStimulusScreen(stimulus);
        this._startTrial(stimulus);
        this._attachKey(this._makeResponseHandler(stimulus));

        this._stimTimer = setTimeout(() => this._onStimulusEnd(stimulus), this.config.stimMs);
    }

    _onStimulusEnd(stimulus) {
        if (this._phase !== 'stim') return;
        this._phase = 'isi';
        this._detachKey();

        if (!this._responded) {
            this._endTrial({
                correct:      !stimulus.isTarget,
                isTarget:     stimulus.isTarget,
                miss:         stimulus.isTarget,
                falseAlarm:   false,
                letter:       stimulus.letter,
            });
        }

        this._prevLetter = stimulus.letter;
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
            this._endTrial({
                correct,
                isTarget:   stimulus.isTarget,
                miss:       false,
                falseAlarm: !stimulus.isTarget,
                letter:     stimulus.letter,
            });

            const card = document.getElementById('cpt-card');
            if (card) card.classList.add(correct ? 'cpt-card--hit' : 'cpt-card--miss');
        };
    }

    _renderStimulusScreen(stimulus) {
        const pct = (this._trialIndex / this._sequence.length) * 100;
        this._container.innerHTML = `
      <div class="test-screen">
        <div class="test-progress">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="test-arena cpt-arena">
          <div class="cpt-card cpt-card--show ${stimulus.letter === 'A' ? 'cpt-card--a' : ''}" id="cpt-card">
            <span class="cpt-letter">${stimulus.letter}</span>
          </div>
        </div>
      </div>
    `;
    }

    _renderISI() {
        const card = document.getElementById('cpt-card');
        if (card) {
            card.className = 'cpt-card';
            const l = card.querySelector('.cpt-letter');
            if (l) l.textContent = '';
        }
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
    }
}