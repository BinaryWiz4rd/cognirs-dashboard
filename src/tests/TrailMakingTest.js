/**
 * Trail Making Test (Part A & Part B).
 * Measures processing speed, visual scanning, and task-switching flexibility.
 */

import { BaseTest }     from './BaseTest.js';
import { SeededRandom } from '../utils/Random.js';

const DEFAULT_CONFIG = {
    variant: 'A',
    count:   15,
    seed:    99,
};

export class TrailMakingTest extends BaseTest {
    constructor(config = {}) {
        const cfg = { ...DEFAULT_CONFIG, ...config };
        super('trail-making', `Trail Making Test — Part ${cfg.variant}`, cfg);
        this._rng          = new SeededRandom(cfg.seed);
        this._items        = [];
        this._nextExpected = 0;
        this._errors       = 0;
        this._startTime    = null;
        this._points       = [];
        this._errorTimers  = new Set();
    }

    unmount() {
        this._errorTimers.forEach(id => clearTimeout(id));
        this._errorTimers.clear();
        this._startTime    = null;
        this._nextExpected = 0;
        super.unmount();
    }

    _renderInstructions() {
        const isB    = this.config.variant === 'B';
        const target = isB ? '1 → A → 2 → B → 3 → C …' : '1 → 2 → 3 → 4 …';
        this._buildInstructionShell({
            title:    `Trail Making — Part ${this.config.variant}`,
            subtitle: isB
                ? 'Connect circles by <strong>alternating between numbers and letters</strong>.'
                : 'Connect the numbered circles <strong>in ascending order</strong>.',
            bullets: [
                `Tap each circle in sequence: ${target}`,
                'Connect them as quickly as possible',
                isB ? 'Strictly alternate: always number → letter → number → letter' : '',
                'An incorrect tap will flash red — continue without stopping',
                `${this.config.count} circles total`,
            ].filter(Boolean),
        });
    }

    _renderDemo() {
        const isB = this.config.variant === 'B';
        this._buildDemoShell(`Trail Making ${this.config.variant} — live preview`);
        const stage = document.getElementById('demo-stage');

        const demoNodes = isB
            ? [
                { label: '1', x: 15, y: 50 },
                { label: 'A', x: 35, y: 20 },
                { label: '2', x: 55, y: 50 },
                { label: 'B', x: 75, y: 25 },
                { label: '3', x: 88, y: 55 },
            ]
            : [
                { label: '1', x: 12, y: 55 },
                { label: '2', x: 30, y: 22 },
                { label: '3', x: 55, y: 48 },
                { label: '4', x: 75, y: 18 },
                { label: '5', x: 88, y: 60 },
            ];

        stage.innerHTML = `
      <div class="demo-tmt">
        <svg class="demo-tmt__svg" id="demo-tmt-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline id="demo-tmt-line" points="" fill="none"
            stroke="var(--color-primary)" stroke-width="0.8"
            stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
        </svg>
        ${demoNodes.map((n, i) => `
          <div class="demo-tmt__node" id="demo-tmt-node-${i}"
            style="left:${n.x}%;top:${n.y}%;">
            ${n.label}
          </div>
        `).join('')}
      </div>
    `;

        let step   = 0;
        let pts    = [];
        const STEP = 900;

        const advance = () => {
            if (step >= demoNodes.length) {
                this._demoTimeout(() => {
                    pts  = [];
                    step = 0;
                    const line = document.getElementById('demo-tmt-line');
                    if (line) line.setAttribute('points', '');
                    demoNodes.forEach((_, i) => {
                        const nd = document.getElementById(`demo-tmt-node-${i}`);
                        if (nd) nd.className = 'demo-tmt__node';
                    });
                }, 1200);
                return;
            }

            const node = demoNodes[step];
            const nd   = document.getElementById(`demo-tmt-node-${step}`);
            if (nd) nd.classList.add('demo-tmt__node--done');

            pts.push(`${node.x + 1.5},${node.y + 1.5}`);
            const line = document.getElementById('demo-tmt-line');
            if (line) line.setAttribute('points', pts.join(' '));

            step++;
        };

        advance();
        this._demoInterval(advance, STEP);
    }

    setup() {
        this._items        = this._generateItems();
        this._nextExpected = 0;
        this._errors       = 0;
        this._points       = [];
        this._startTime    = null;
        this._renderTrail();
    }

    _generateItems() {
        const n      = this.config.count;
        const labels = this.config.variant === 'A'
            ? Array.from({ length: n }, (_, i) => String(i + 1))
            : Array.from({ length: n }, (_, i) =>
                i % 2 === 0
                    ? String(Math.floor(i / 2) + 1)
                    : String.fromCharCode(65 + Math.floor(i / 2))
            );

        const positions = [];
        labels.forEach(() => {
            let x, y, ok, attempts = 0;
            do {
                x  = this._rng.nextInt(7, 90);
                y  = this._rng.nextInt(8, 88);
                ok = positions.every(p => Math.hypot(p.x - x, p.y - y) > 13);
                attempts++;
            } while (!ok && attempts < 200);
            positions.push({ x, y });
        });

        return labels.map((label, i) => ({
            id: i, label, x: positions[i].x, y: positions[i].y, order: i,
        }));
    }

    _renderTrail() {
        this._startTime = performance.now();
        this._startTrial({ variant: this.config.variant });

        this._container.innerHTML = `
      <div class="test-screen test-screen--fill">
        <div class="test-progress">
          <div class="progress-bar">
            <div class="progress-bar__fill" style="width:0%;"></div>
          </div>
        </div>
        <div class="tmt-canvas-wrap">
          <svg class="tmt-svg" id="tmt-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline id="tmt-polyline" points="" fill="none"
              stroke="var(--color-primary)" stroke-width="0.5"
              stroke-linecap="round" stroke-linejoin="round" opacity="0.65"/>
          </svg>
          ${this._items.map(item => `
            <button class="tmt-node" id="tmt-node-${item.id}"
              style="left:${item.x}%;top:${item.y}%;"
              data-order="${item.order}">${item.label}</button>
          `).join('')}
        </div>
      </div>
    `;

        this._items.forEach(item => {
            document.getElementById(`tmt-node-${item.id}`)
                ?.addEventListener('click', () => this._handleClick(item));
        });
    }

    _handleClick(item) {
        if (this._unmounted) return;

        if (item.order === this._nextExpected) {
            const node = document.getElementById(`tmt-node-${item.id}`);
            if (node) {
                node.classList.add('tmt-node--done');
                node.disabled = true;
            }

            this._points.push(`${item.x + 1.5},${item.y + 1.5}`);
            document.getElementById('tmt-polyline')?.setAttribute('points', this._points.join(' '));

            this._nextExpected++;

            const pct  = Math.min(100, (this._nextExpected / Math.max(1, this._items.length)) * 100);
            const fill = this._container.querySelector('.progress-bar__fill');
            if (fill) fill.style.width = `${pct}%`;

            if (this._nextExpected >= this._items.length) {
                this._finish();
            }
        } else {
            this._errors++;
            const node = document.getElementById(`tmt-node-${item.id}`);
            if (node) {
                node.classList.add('tmt-node--wrong', 'anim-shake');
                const timerId = setTimeout(() => {
                    this._errorTimers.delete(timerId);
                    if (!this._unmounted) {
                        node.classList.remove('tmt-node--wrong', 'anim-shake');
                    }
                }, 400);
                this._errorTimers.add(timerId);
            }
        }
    }

    _finish() {
        const totalTime = performance.now() - this._startTime;
        this._endTrial({ totalTime, errors: this._errors, variant: this.config.variant });
        this._done();
    }

    renderTrial()     {}
    processResponse() {}
}