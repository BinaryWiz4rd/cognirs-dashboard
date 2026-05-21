import { BaseTest }    from './BaseTest.js';
import { SeededRandom } from '../utils/Random.js';

const DEFAULT_CONFIG = {
    variant: 'A',
    count:   15,
    seed:    99,
};

export class TrailMakingTest extends BaseTest {
    constructor(config = {}) {
        super('trail-making', 'Trail Making Test', { ...DEFAULT_CONFIG, ...config });
        this._rng          = new SeededRandom(this.config.seed);
        this._items        = [];
        this._path         = [];
        this._errors       = 0;
        this._startTime    = null;
        this._points       = [];
    }

    setup() {
        this._items     = this._generateItems();
        this._path      = [];
        this._errors    = 0;
        this._results   = [];
        this._renderInstructions();
    }

    _generateItems() {
        const n = this.config.count;
        const labels = this.config.variant === 'A'
            ? Array.from({ length: n }, (_, i) => String(i + 1))
            : Array.from({ length: n }, (_, i) =>
                i % 2 === 0
                    ? String(Math.floor(i / 2) + 1)
                    : String.fromCharCode(65 + Math.floor(i / 2))
            );

        const positions = [];
        labels.forEach(() => {
            let x, y, ok;
            let attempts = 0;
            do {
                x = this._rng.nextInt(7, 90);
                y = this._rng.nextInt(7, 90);
                ok = positions.every(p => Math.hypot(p.x - x, p.y - y) > 14);
                attempts++;
            } while (!ok && attempts < 100);
            positions.push({ x, y });
        });

        return labels.map((label, i) => ({ id: i, label, x: positions[i].x, y: positions[i].y, order: i }));
    }

    _renderInstructions() {
        const desc = this.config.variant === 'A'
            ? `Connect the numbered circles in order: <strong>1 → 2 → 3 … → ${this.config.count}</strong>`
            : `Alternate between numbers and letters: <strong>1 → A → 2 → B → 3 → C …</strong>`;

        this._container.innerHTML = `
      <div class="test-instructions anim-fade-in">
        <h2 class="test-title">Trail Making Test — ${this.config.variant === 'A' ? 'Part A' : 'Part B'}</h2>
        <p class="test-subtitle">${desc}</p>
        <ul class="instruction-list">
          <li>Tap or click each circle in the correct sequence</li>
          <li>Connect them as quickly as possible without errors</li>
          ${this.config.variant === 'B' ? '<li>Strictly alternate: number → letter → number → letter</li>' : ''}
          <li>If you make an error, you will see feedback — simply continue correctly</li>
        </ul>
        <button class="btn btn--primary btn--lg" id="tmt-start">Begin test</button>
      </div>
    `;
        document.getElementById('tmt-start')
            .addEventListener('click', () => this._renderCountdown(3, () => this._renderTrial()));
    }

    _renderTrial() {
        this._startTime = performance.now();
        this._nextExpected = 0;
        this._startTrial({ variant: this.config.variant });

        this._container.innerHTML = `
      <div class="tmt-layout anim-fade-fast">
        <div class="tmt-info-row">
          <span class="tmt-next-label">Next:</span>
          <span class="tmt-next-value" id="tmt-next">${this._items[0].label}</span>
          <div style="display: flex; gap: var(--space-sm); align-items: center; margin-left: auto;">
            <span class="badge badge--neutral" id="tmt-error-badge">0 errors</span>
          </div>
        </div>
        <div class="tmt-canvas-wrap">
          <svg class="tmt-svg" id="tmt-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline id="tmt-polyline" points="" fill="none" stroke="var(--color-primary)" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
          </svg>
          ${this._items.map(item => `
            <button class="tmt-node" id="tmt-node-${item.id}"
              style="left:${item.x}%;top:${item.y}%;"
              data-order="${item.order}"
              aria-label="Node ${item.label}"
            >${item.label}</button>
          `).join('')}
        </div>
      </div>
    `;

        this._items.forEach(item => {
            document.getElementById(`tmt-node-${item.id}`)
                .addEventListener('click', () => this._handleClick(item));
        });
    }

    _handleClick(item) {
        if (item.order === this._nextExpected) {
            const node = document.getElementById(`tmt-node-${item.id}`);
            node.classList.add('tmt-node--done');
            node.disabled = true;

            this._points.push(`${item.x + 1.5},${item.y + 1.5}`);
            document.getElementById('tmt-polyline').setAttribute('points', this._points.join(' '));

            this._nextExpected++;
            if (this._nextExpected < this._items.length) {
                document.getElementById('tmt-next').textContent = this._items[this._nextExpected].label;
            } else {
                this._finishTrial();
            }
        } else {
            this._errors++;
            document.getElementById('tmt-error-badge').textContent = `${this._errors} error${this._errors !== 1 ? 's' : ''}`;
            const node = document.getElementById(`tmt-node-${item.id}`);
            node.classList.add('tmt-node--wrong', 'anim-shake');
            setTimeout(() => node.classList.remove('tmt-node--wrong', 'anim-shake'), 400);
        }
    }

    _finishTrial() {
        const totalTime = performance.now() - this._startTime;
        const result    = this._endTrial({ totalTime, errors: this._errors, variant: this.config.variant });
        setTimeout(() => { this.renderTrial(result); this._done(); }, 300);
    }

    renderTrial(result) {
        this._container.innerHTML = `
      <div class="test-instructions anim-scale-in">
        <h2 class="test-title" style="color: var(--color-success);">Trail complete</h2>
        <div class="grid-2" style="margin-top: var(--space-xl);">
          <div class="card stat-block">
            <span class="stat-block__value">${(result.totalTime / 1000).toFixed(2)}s</span>
            <span class="stat-block__label">Completion time</span>
          </div>
          <div class="card stat-block">
            <span class="stat-block__value">${result.errors}</span>
            <span class="stat-block__label">Errors</span>
          </div>
        </div>
      </div>
    `;
    }

    processResponse() {}
}