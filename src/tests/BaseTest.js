/**
 * Three-phase architecture:
 *   1. INSTRUCTIONS  — card with title, subtitle, bullet list, key legend
 *   2. DEMO          — animated looping preview inside a stage box
 *   3. TEST          — countdown → live trials (zero text on screen)
 */

import { eventBus, EVENTS } from '../core/EventBus.js';
import { Timer }            from '../utils/Timer.js';
import { createLogger }     from '../core/Logger.js';

export class BaseTest {
    constructor(id, name, config = {}) {
        this.id                   = id;
        this.name                 = name;
        this.config               = config;
        this._timer               = new Timer();
        this._results             = [];
        this._trialIndex          = 0;
        this._container           = null;
        this._log                 = createLogger(`Test:${id}`);
        this._demoTimers          = [];
        this._countdownTimer      = null;
        this._countdownAnimTimer  = null;
        this._keyFn               = null;
        this._unmounted           = false;
    }

    get results() { return [...this._results]; }

    mount(container) {
        this._unmounted           = false;
        this._container           = container;
        this._container.innerHTML = '';
        this._container.className = 'test-container anim-fade-in';
        this._renderInstructions();
    }

    unmount() {
        this._unmounted = true;
        this._detachKey();
        this._stopDemoLoop();
        this._clearCountdown();
        if (this._container) this._container.innerHTML = '';
    }

    _renderInstructions() { throw new Error(`${this.id}._renderInstructions() not implemented`); }
    _renderDemo()         { throw new Error(`${this.id}._renderDemo() not implemented`); }
    setup()               { throw new Error(`${this.id}.setup() not implemented`); }
    renderTrial()         {}
    processResponse()     {}

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

    _goToDemo() {
        this._stopDemoLoop();
        this._clearCountdown();
        this._container.innerHTML = '';
        this._renderDemo();
    }

    _goToTest() {
        this._stopDemoLoop();
        this._clearCountdown();
        this._renderCountdown(3, () => {
            if (this._unmounted) return;
            this._trialIndex = 0;
            this._results    = [];
            this.setup();
        });
    }

    _buildInstructionShell({ title, subtitle, bullets, keysHtml = '' }) {
        this._container.innerHTML = `
      <div style="
        max-width: 580px;
        margin: 40px auto 0;
        font-family: var(--font-sans, 'DM Sans', sans-serif);
      " class="anim-fade-in">

        <div style="
          background: #ffffff;
          border: 1px solid var(--color-border, #ccdaf5);
          border-radius: 12px;
          padding: 32px 36px;
          box-shadow: 0 1px 3px rgba(74,127,212,0.08);
          margin-bottom: 24px;
        ">
          <h2 style="
            font-size: 1.45rem;
            font-weight: 600;
            color: var(--color-text, #1e2d4a);
            letter-spacing: -0.02em;
            margin: 0 0 10px;
          ">${title}</h2>

          <p style="
            font-size: 0.95rem;
            color: var(--color-text-secondary, #4a6080);
            line-height: 1.7;
            margin: 0 0 20px;
          ">${subtitle}</p>

          <div style="
            background: var(--color-surface-alt, #f5f8fe);
            border: 1px solid var(--color-border, #ccdaf5);
            border-radius: 8px;
            padding: 14px 18px;
            margin-bottom: ${keysHtml ? '20px' : '0'};
          ">
            ${bullets.map((b, idx) => `
              <div style="
                display: flex;
                align-items: flex-start;
                gap: 10px;
                padding: 6px 0;
                font-size: 0.875rem;
                color: var(--color-text-secondary, #4a6080);
                line-height: 1.55;
                border-bottom: ${idx < bullets.length - 1 ? '1px solid var(--color-border, #ccdaf5)' : 'none'};
              ">
                <span style="
                  width: 6px;
                  height: 6px;
                  border-radius: 50%;
                  background: var(--color-primary, #4a7fd4);
                  flex-shrink: 0;
                  margin-top: 7px;
                  opacity: 0.7;
                "></span>
                <span>${b}</span>
              </div>
            `).join('')}
          </div>

          ${keysHtml ? `
            <div style="padding-top: 4px;">
              ${keysHtml}
            </div>
          ` : ''}
        </div>

        <button id="instr-demo-btn" style="
          font-family: var(--font-sans, 'DM Sans', sans-serif);
          font-size: 0.95rem;
          font-weight: 500;
          padding: 13px 28px;
          background: var(--color-primary, #4a7fd4);
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(74,127,212,0.25);
          transition: background 0.15s;
        ">See how it works →</button>
      </div>
    `;

        document.getElementById('instr-demo-btn')
            .addEventListener('click', () => this._goToDemo());
    }

    _buildDemoShell(title) {
        this._container.innerHTML = `
      <div style="
        max-width: 680px;
        margin: 32px auto 0;
        font-family: var(--font-sans, 'DM Sans', sans-serif);
        display: flex;
        flex-direction: column;
        gap: 16px;
      " class="anim-fade-in">

        <div style="display:flex; align-items:center; gap:12px;">
          <span style="
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--color-text-muted, #8aa4c0);
            background: var(--color-bg-secondary, #e8f0fa);
            padding: 3px 10px;
            border-radius: 99px;
            border: 1px solid var(--color-border, #ccdaf5);
          ">Preview</span>
          <span style="
            font-size: 0.9rem;
            font-weight: 500;
            color: var(--color-text-secondary, #4a6080);
          ">${title}</span>
        </div>

        <div id="demo-stage" style="
          background: #ffffff;
          border: 1px solid var(--color-border, #ccdaf5);
          border-radius: 16px;
          min-height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: relative;
        "></div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button id="demo-back-btn" style="
            font-family: var(--font-sans, 'DM Sans', sans-serif);
            font-size: 0.875rem;
            font-weight: 500;
            padding: 9px 20px;
            background: transparent;
            color: var(--color-text-secondary, #4a6080);
            border: 1.5px solid var(--color-border, #ccdaf5);
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.15s;
          ">← Back</button>

          <button id="demo-begin-btn" style="
            font-family: var(--font-sans, 'DM Sans', sans-serif);
            font-size: 0.95rem;
            font-weight: 500;
            padding: 13px 28px;
            background: var(--color-primary, #4a7fd4);
            color: #fff;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(74,127,212,0.25);
          ">Begin test</button>
        </div>
      </div>
    `;

        document.getElementById('demo-back-btn').addEventListener('click', () => {
            this._stopDemoLoop();
            this._container.innerHTML = '';
            this._renderInstructions();
        });
        document.getElementById('demo-begin-btn')
            .addEventListener('click', () => this._goToTest());
    }

    _demoTimeout(fn, ms) {
        const id = setTimeout(fn, ms);
        this._demoTimers.push(id);
        return id;
    }

    _demoInterval(fn, ms) {
        const id = setInterval(fn, ms);
        this._demoTimers.push(id);
        return id;
    }

    _stopDemoLoop() {
        this._demoTimers.forEach(id => { clearTimeout(id); clearInterval(id); });
        this._demoTimers = [];
    }

    _clearCountdown() {
        clearInterval(this._countdownTimer);
        clearTimeout(this._countdownAnimTimer);
        this._countdownTimer     = null;
        this._countdownAnimTimer = null;
    }

    _startTrial(trial) {
        this._timer.start();
        eventBus.emit(EVENTS.TEST_TRIAL_START, { testId: this.id, trial });
        this._log.debug(`Trial ${this._trialIndex} start`, trial);
    }

    _endTrial(result) {
        const rt   = result.reactionTime !== undefined ? result.reactionTime : this._timer.elapsed();
        const full = { ...result, reactionTime: rt, trialIndex: this._trialIndex };
        this._results.push(full);
        this._trialIndex++;
        eventBus.emit(EVENTS.TEST_TRIAL_END, { testId: this.id, result: full });
        return full;
    }

    _done() {
        eventBus.emit(EVENTS.TEST_ENDED, { testId: this.id, results: this._results });
        this._log.info(`Test complete — ${this._results.length} trials`);
    }

    _renderCountdown(seconds, callback) {
        this._clearCountdown();
        let remaining = seconds;
        this._container.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 480px;
        gap: 16px;
        font-family: var(--font-sans, 'DM Sans', sans-serif);
      ">
        <div id="cd-num" style="
          font-size: 6rem;
          font-weight: 300;
          color: var(--color-primary, #4a7fd4);
          line-height: 1;
          transition: transform 0.15s ease, opacity 0.15s ease;
        ">${remaining}</div>
        <div style="
          font-size: 0.78rem;
          font-weight: 500;
          color: var(--color-text-muted, #8aa4c0);
          text-transform: uppercase;
          letter-spacing: 0.14em;
        ">Get ready</div>
      </div>
    `;

        this._countdownTimer = setInterval(() => {
            if (this._unmounted) {
                this._clearCountdown();
                return;
            }
            remaining--;
            const el = document.getElementById('cd-num');
            if (!el) {
                this._clearCountdown();
                return;
            }
            if (remaining <= 0) {
                this._clearCountdown();
                callback();
            } else {
                el.style.transform = 'scale(1.25)';
                el.style.opacity   = '0.5';
                el.textContent     = remaining;
                clearTimeout(this._countdownAnimTimer);
                this._countdownAnimTimer = setTimeout(() => {
                    if (this._unmounted) return;
                    el.style.transform = 'scale(1)';
                    el.style.opacity   = '1';
                }, 80);
            }
        }, 1000);
    }
}