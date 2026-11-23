/***
 * Working memory test from the Wechsler scales.
 * Used alongside N-back in fNIRS+ADHD research
 * (Yanagisawa et al. 2010; Vasic et al. 2019; Gu et al. 2022).
 *
 * Forward span: repeat digits in the same order shown
 * Backward span: repeat digits in reverse order
 *
 * Adaptive staircase: starts at span 3, increases by 1 after
 * two consecutive correct trials, decreases by 1 after one error.
 */

import { BaseTest }     from './BaseTest.js';
import { SeededRandom } from '../utils/Random.js';

const DEFAULT_CONFIG = {
    variant:         'forward', // 'forward' | 'backward'
    maxTrials:       14,
    startSpan:       3,
    digitDurationMs: 800,
    digitIsiMs:      400,
    seed:            61,
};

export class DigitSpanTest extends BaseTest {
    constructor(config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        super('digit-span', `Digit Span (${cfg.variant})`, cfg);
        this._rng           = new SeededRandom(cfg.seed);
        this._span          = cfg.startSpan;
        this._consecutive   = 0;
        this._sequence      = [];
        this._response      = [];
        this._keyFn         = null;
        this._digitTimer    = null;
        this._isiTimer      = null;
        this._feedbackTimer = null;
        this._digitIndex    = 0;
        this._phase         = 'idle';
    }

    unmount() {
        this._phase = 'idle';
        this._clearTimers();
        this._detachKey();
        super.unmount();
    }

    _clearTimers() {
        clearTimeout(this._digitTimer);
        clearTimeout(this._isiTimer);
        clearTimeout(this._feedbackTimer);
        this._digitTimer    = null;
        this._isiTimer      = null;
        this._feedbackTimer = null;
    }

    _renderInstructions() {
        const isBack = this.config.variant === 'backward';
        this._buildInstructionShell({
            title: `Digit Span — ${isBack ? 'Backward' : 'Forward'}`,
            subtitle: isBack
                ? 'Digits appear one at a time. Type them back in <strong>reverse order</strong>, then press Enter.'
                : 'Digits appear one at a time. Type them back in the <strong>same order</strong>, then press Enter.',
            bullets: [
                'Watch each digit carefully — they appear briefly one at a time',
                'After the last digit, type your answer using the number keys',
                isBack
                    ? 'Reverse the order: if you saw 4 – 7 – 2, type 2 7 4'
                    : 'Same order: if you saw 4 – 7 – 2, type 4 7 2',
                'Press Enter or Return to confirm your answer',
                'The sequence gets longer or shorter based on your performance',
            ],
            keysHtml: `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <kbd style="font-family:monospace;font-size:0.82rem;font-weight:600;padding:5px 10px;background:#fff;border:1.5px solid #a8c4ee;border-radius:5px;box-shadow:0 1px 0 #a8c4ee;">0–9</kbd>
          <span style="font-size:0.82rem;color:#8aa4c0;">type digits</span>
          <kbd style="font-family:monospace;font-size:0.82rem;font-weight:600;padding:5px 10px;background:#fff;border:1.5px solid #a8c4ee;border-radius:5px;box-shadow:0 1px 0 #a8c4ee;margin-left:8px;">Enter</kbd>
          <span style="font-size:0.82rem;color:#8aa4c0;">confirm answer</span>
          <kbd style="font-family:monospace;font-size:0.82rem;font-weight:600;padding:5px 10px;background:#fff;border:1.5px solid #a8c4ee;border-radius:5px;box-shadow:0 1px 0 #a8c4ee;margin-left:8px;">⌫</kbd>
          <span style="font-size:0.82rem;color:#8aa4c0;">delete last</span>
        </div>
      `,
        });
    }

    _renderDemo() {
        const isBack     = this.config.variant === 'backward';
        const demoDigits = [4, 7, 2];
        const demoAnswer = isBack ? [2, 7, 4] : [4, 7, 2];

        this._buildDemoShell(`Digit Span ${isBack ? 'Backward' : 'Forward'} — preview`);
        const stage = document.getElementById('demo-stage');

        stage.innerHTML = `
      <div style="
        display:flex; flex-direction:column; align-items:center;
        gap:24px; padding:32px; width:100%;
      ">
        <div id="demo-ds-card" style="
          width:120px; height:120px; border-radius:12px;
          border:2px solid #ccdaf5; background:#f5f8fe;
          display:flex; align-items:center; justify-content:center;
          transition:border-color 0.2s, background 0.2s;
        ">
          <span id="demo-ds-num" style="
            font-size:3.5rem; font-weight:300;
            color:#4a7fd4; font-family:'DM Sans',sans-serif; line-height:1;
          "></span>
        </div>

        <div id="demo-ds-resp" style="display:none; gap:8px;">
          ${demoAnswer.map(d => `
            <div style="
              width:52px; height:64px; border-radius:8px;
              border:2px solid #4a7fd4; background:#e6eef9;
              display:flex; align-items:center; justify-content:center;
              font-size:2rem; font-weight:300; color:#2f5faa;
              font-family:'DM Sans',sans-serif;
              opacity:0; transition:opacity 0.3s;
            " class="demo-ds-box">${d}</div>
          `).join('')}
        </div>

        <div id="demo-ds-phase" style="
          font-size:0.75rem; font-weight:600; text-transform:uppercase;
          letter-spacing:0.1em; color:#8aa4c0;
        ">Watch</div>
      </div>
    `;

        let step = 0;
        const DIGIT_TOTAL = demoDigits.length;
        const STEP_MS     = this.config.digitDurationMs + this.config.digitIsiMs + 60;

        const runStep = () => {
            const card  = document.getElementById('demo-ds-card');
            const num   = document.getElementById('demo-ds-num');
            const resp  = document.getElementById('demo-ds-resp');
            const phase = document.getElementById('demo-ds-phase');
            if (!card) return;

            if (step < DIGIT_TOTAL) {
                resp.style.display     = 'none';
                num.textContent        = demoDigits[step];
                card.style.borderColor = '#4a7fd4';
                card.style.background  = '#ffffff';
                card.style.visibility  = 'visible';
                phase.textContent      = 'Watch';

                this._demoTimeout(() => {
                    num.textContent        = '';
                    card.style.borderColor = '#ccdaf5';
                    card.style.background  = '#f5f8fe';
                    step++;
                }, this.config.digitDurationMs);

            } else if (step === DIGIT_TOTAL) {
                card.style.visibility  = 'hidden';
                resp.style.display     = 'flex';
                phase.textContent      = isBack ? 'Type in reverse' : 'Type in order';

                resp.querySelectorAll('.demo-ds-box').forEach((box, i) => {
                    box.style.opacity = '0';
                    this._demoTimeout(() => { box.style.opacity = '1'; }, i * 220);
                });

                this._demoTimeout(() => {
                    card.style.visibility  = 'visible';
                    resp.style.display     = 'none';
                    resp.querySelectorAll('.demo-ds-box').forEach(b => b.style.opacity = '0');
                    num.textContent        = '';
                    card.style.borderColor = '#ccdaf5';
                    card.style.background  = '#f5f8fe';
                    step = 0;
                }, 2000);

                step++;
            }
        };

        runStep();
        this._demoInterval(runStep, STEP_MS);
    }

    setup() {
        this._span        = this.config.startSpan;
        this._consecutive = 0;
        this._phase       = 'idle';
        this._nextTrial();
    }

    _nextTrial() {
        if (this._trialIndex >= this.config.maxTrials) {
            this._phase = 'idle';
            this._done();
            return;
        }

        this._sequence   = this._generateDigits(this._span);
        this._response   = [];
        this._digitIndex = 0;
        this._phase      = 'presentation';

        this._presentNextDigit();
    }

    _generateDigits(span) {
        const digits = [];
        let last = -1;
        for (let i = 0; i < span; i++) {
            let d;
            do { d = this._rng.nextInt(1, 9); } while (d === last);
            digits.push(d);
            last = d;
        }
        return digits;
    }

    _presentNextDigit() {
        if (this._phase !== 'presentation') return;

        if (this._digitIndex >= this._sequence.length) {
            this._isiTimer = setTimeout(() => this._startResponsePhase(), this.config.digitIsiMs);
            return;
        }

        const digit = this._sequence[this._digitIndex];
        const pct   = (this._trialIndex / this.config.maxTrials) * 100;

        this._container.innerHTML = `
      <div class="test-screen">
        <div class="test-progress">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="test-arena">
          <div class="digit-card digit-card--show" id="digit-card">
            <span class="digit-num">${digit}</span>
          </div>
        </div>
      </div>
    `;

        this._digitTimer = setTimeout(() => {
            if (this._phase !== 'presentation') return;
            const card = document.getElementById('digit-card');
            if (card) {
                card.classList.remove('digit-card--show');
                const numEl = card.querySelector('.digit-num');
                if (numEl) numEl.textContent = '';
            }
            this._digitIndex++;
            this._isiTimer = setTimeout(() => this._presentNextDigit(), this.config.digitIsiMs);
        }, this.config.digitDurationMs);
    }

    _startResponsePhase() {
        if (this._phase !== 'presentation') return;
        this._phase    = 'response';
        this._response = [];
        const span     = this._sequence.length;
        const pct      = (this._trialIndex / this.config.maxTrials) * 100;
        const isBack   = this.config.variant === 'backward';

        this._startTrial({ span, isBackward: isBack });

        this._container.innerHTML = `
      <div class="test-screen">
        <div class="test-progress">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="test-arena">
          <div class="digit-response-area">
            <div class="digit-response-boxes" id="digit-boxes">
              ${Array.from({ length: span }, (_, i) => `
                <div class="digit-resp-box" id="drb-${i}">_</div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

        this._attachKey(this._makeResponseKeyHandler());
    }

    _makeResponseKeyHandler() {
        return (e) => {
            if (this._phase !== 'response' || e.repeat) return;

            if (e.key >= '0' && e.key <= '9') {
                e.preventDefault();
                if (this._response.length < this._sequence.length) {
                    this._response.push(parseInt(e.key, 10));
                    this._updateResponseBoxes();
                }
                return;
            }

            if (e.code === 'Backspace') {
                e.preventDefault();
                this._response.pop();
                this._updateResponseBoxes();
                return;
            }

            if (
                (e.code === 'Enter' || e.code === 'NumpadEnter') &&
                this._response.length === this._sequence.length
            ) {
                e.preventDefault();
                this._detachKey();
                this._scoreResponse();
            }
        };
    }

    _updateResponseBoxes() {
        this._sequence.forEach((_, i) => {
            const box = document.getElementById(`drb-${i}`);
            if (!box) return;
            box.textContent = this._response[i] !== undefined ? this._response[i] : '_';
            box.classList.toggle('digit-resp-box--filled', this._response[i] !== undefined);
        });
    }

    _scoreResponse() {
        this._phase   = 'feedback';
        const isBack  = this.config.variant === 'backward';
        const target  = isBack ? [...this._sequence].reverse() : [...this._sequence];
        const correct = target.every((d, i) => d === this._response[i]);

        this._endTrial({
            correct,
            span:     this._sequence.length,
            sequence: [...this._sequence],
            response: [...this._response],
            isBack,
        });

        if (correct) {
            this._consecutive++;
            if (this._consecutive >= 2 && this._span < 9) {
                this._span++;
                this._consecutive = 0;
            }
        } else {
            this._consecutive = 0;
            if (this._span > 2) this._span--;
        }

        const boxes = document.querySelectorAll('.digit-resp-box');
        boxes.forEach(b => {
            b.style.borderColor = correct ? '#2d9e6b' : '#c4394a';
            b.style.background  = correct ? '#e8f7f0' : '#fdeef0';
            b.style.color       = correct ? '#2d9e6b' : '#c4394a';
        });

        this._feedbackTimer = setTimeout(() => this._nextTrial(), 700);
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
}