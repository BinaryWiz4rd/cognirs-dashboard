/***
 * Response-inhibition paradigm in ADHD research.
 * (Aron & Poldrack 2006; Rubia et al. 2005; Tsujii et al. 2013 fNIRS)
 *
 * Go trials  (80%): press Space when filled circle appears then fast response
 * No-Go trials (20%): withhold press when outline circle appears then inhibition
 *
 * The key ADHD measure is commission errors on No-Go trials
 * (failing to inhibit) and mean RT on Go trials.
 *
 * ISI is jittered (800–1400 ms) to prevent temporal prediction
 */

import { BaseTest }     from './BaseTest.js';
import { SeededRandom } from '../utils/Random.js';

const DEFAULT_CONFIG = {
    trials:     60,
    goRatio:    0.80,
    stimMs:     250,    // stimulus display time (Rubia 2005)
    minIsiMs:   800,
    maxIsiMs:   1400,
    seed:       31,
};

export class GoNoGoTest extends BaseTest {
    constructor(config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        super('go-no-go', 'Go / No-Go Task', cfg);
        this._rng       = new SeededRandom(cfg.seed);
        this._sequence  = [];
        this._keyFn     = null;
        this._stimTimer = null;
        this._isiTimer  = null;
        this._phase     = 'idle';
        this._responded = false;
    }

    unmount() {
        this._clearTimers();
        this._detachKey();
        super.unmount();
    }

    _renderInstructions() {
        this._buildInstructionShell({
            title:    'Go / No-Go Task',
            subtitle: 'A circle will appear briefly. Press <strong>Space</strong> for a filled circle. Do <strong>nothing</strong> for an outline circle.',
            bullets: [
                'Respond as quickly as possible on Go trials (filled circle)',
                'Withhold completely on No-Go trials (outline circle) — do not press',
                'Most circles require a response; stay alert for the rare outline',
                `${this.config.trials} trials · approximately 3 minutes`,
            ],
            keysHtml: `
        <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="
              width:32px; height:32px; border-radius:50%;
              background:var(--color-primary,#4a7fd4);
              flex-shrink:0;
            "></div>
            <span style="font-size:0.85rem; color:var(--color-text-secondary,#4a6080); font-weight:500;">
              Filled → Press Space
            </span>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="
              width:32px; height:32px; border-radius:50%;
              background:transparent;
              border:2.5px solid var(--color-primary,#4a7fd4);
              flex-shrink:0;
            "></div>
            <span style="font-size:0.85rem; color:var(--color-text-secondary,#4a6080); font-weight:500;">
              Outline → Do nothing
            </span>
          </div>
        </div>
      `,
        });
    }

    _renderDemo() {
        this._buildDemoShell('Go / No-Go — live preview');
        const stage = document.getElementById('demo-stage');

        stage.innerHTML = `
      <div class="demo-gng">
        <div class="demo-gng__circle" id="demo-gng-circle"></div>
        <div class="demo-gng__label" id="demo-gng-label"></div>
      </div>
    `;

        const pattern  = [true, true, false, true, true, false, true, false];
        let cur        = 0;
        const PERIOD   = 1200;

        const runFrame = () => {
            const circle = document.getElementById('demo-gng-circle');
            const label  = document.getElementById('demo-gng-label');
            if (!circle || !label) return;

            const isGo = pattern[cur % pattern.length];
            circle.className = `demo-gng__circle demo-gng__circle--${isGo ? 'go' : 'nogo'} demo-gng__circle--appear`;
            label.textContent = '';

            this._demoTimeout(() => {
                if (!isGo) {
                    label.textContent = '';
                    circle.classList.add('demo-gng__circle--fade');
                } else {
                    circle.classList.add('demo-gng__circle--pressed');
                }
                this._demoTimeout(() => {
                    circle.className = 'demo-gng__circle';
                    cur++;
                }, 350);
            }, this.config.stimMs + 150);
        };

        runFrame();
        this._demoInterval(runFrame, PERIOD);
    }

    setup() {
        this._sequence = this._generateSequence();
        this._phase    = 'idle';
        this._startITI();
    }

    _generateSequence() {
        const total  = this.config.trials;
        const nGo    = Math.round(total * this.config.goRatio);
        const arr    = [
            ...Array(nGo).fill(true),
            ...Array(total - nGo).fill(false),
        ];
        return this._rng.shuffle(arr).map(isGo => ({ isGo }));
    }

    _startITI() {
        if (this._trialIndex >= this._sequence.length) {
            this._done();
            return;
        }
        this._phase    = 'iti';
        this._responded = false;
        this._renderFixation();

        const delay = this._rng.nextInt(this.config.minIsiMs, this.config.maxIsiMs);
        this._isiTimer = setTimeout(() => this._showStimulus(), delay);
    }

    _showStimulus() {
        if (this._phase !== 'iti') return;
        this._phase = 'stim';

        const trial = this._sequence[this._trialIndex];
        this._renderStimulus(trial);
        this._startTrial(trial);

        if (trial.isGo) {
            this._attachKey(this._makeGoHandler(trial));
        }

        this._stimTimer = setTimeout(() => this._onStimulusEnd(trial), this.config.stimMs + 800);
    }

    _onStimulusEnd(trial) {
        if (this._phase !== 'stim') return;
        this._detachKey();
        this._phase = 'iti';

        if (!this._responded) {
            this._endTrial({
                correct:         !trial.isGo,
                isGo:            trial.isGo,
                commission:      false,
                omission:        trial.isGo,
                correctRejection: !trial.isGo,
            });
        }

        this._trialIndex++;
        this._startITI();
    }

    _makeGoHandler(trial) {
        return (e) => {
            if (e.code !== 'Space') return;
            e.preventDefault();
            if (this._phase !== 'stim' || this._responded) return;

            this._responded = true;
            clearTimeout(this._stimTimer);
            this._detachKey();

            this._endTrial({
                correct:         true,
                isGo:            true,
                commission:      false,
                omission:        false,
                correctRejection: false,
            });

            const circle = document.getElementById('gng-circle');
            if (circle) circle.classList.add('gng-circle--pressed');

            setTimeout(() => {
                this._trialIndex++;
                this._startITI();
            }, 300);
        };
    }

    _renderFixation() {
        const pct = (this._trialIndex / this._sequence.length) * 100;
        this._container.innerHTML = `
      <div class="test-screen">
        <div class="test-progress">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="test-arena">
          <div class="gng-fixation">+</div>
        </div>
      </div>
    `;
    }

    _renderStimulus(trial) {
        const pct = (this._trialIndex / this._sequence.length) * 100;
        this._container.innerHTML = `
      <div class="test-screen">
        <div class="test-progress">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="test-arena">
          <div class="gng-circle ${trial.isGo ? 'gng-circle--go' : 'gng-circle--nogo'}" id="gng-circle"></div>
        </div>
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
        clearTimeout(this._stimTimer);
        clearTimeout(this._isiTimer);
        this._stimTimer = null;
        this._isiTimer  = null;
    }
}