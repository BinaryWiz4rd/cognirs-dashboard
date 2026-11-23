/**
 * Session configuration page: participant metadata, fNIRS transport setup
 * (Cortivision LSL WebSocket bridge or 50 Hz simulator), and cognitive test selection.
 */

import { eventBus, EVENTS }            from '../../core/EventBus.js';
import { sessionManager }              from '../../session/SessionManager.js';
import { StroopTest }                  from '../../tests/StroopTest.js';
import { TrailMakingTest }             from '../../tests/TrailMakingTest.js';
import { ReactionTimeTest }            from '../../tests/ReactionTimeTest.js';
import { NBackTest }                   from '../../tests/NBackTest.js';
import { GoNoGoTest }                  from '../../tests/GoNoGoTest.js';
import { ContinuousPerformanceTest }   from '../../tests/ContinuousPerformanceTest.js';
import { DigitSpanTest }               from '../../tests/DigitSpanTest.js';
import { fnirsDevice }                 from '../../fnirs/FNIRSDevice.js';
import { stateManager }                from '../../core/StateManager.js';
import { toast }                       from '../components/Toast.js';

const TEST_REGISTRY = [
    {
        id:      'stroop',
        label:   'Stroop Color–Word',
        sub:     '24 trials · selective attention & inhibition',
        group:   'Attention & Inhibition',
        factory: () => new StroopTest(),
    },
    {
        id:      'go-no-go',
        label:   'Go / No-Go',
        sub:     '60 trials · response inhibition',
        group:   'Attention & Inhibition',
        factory: () => new GoNoGoTest(),
    },
    {
        id:      'cpt',
        label:   'Continuous Performance (CPT-AX)',
        sub:     '100 trials · sustained attention & vigilance',
        group:   'Attention & Inhibition',
        factory: () => new ContinuousPerformanceTest(),
    },
    {
        id:      'nback-0',
        label:   '0-Back Task',
        sub:     '30 trials · control working memory condition',
        group:   'Working Memory',
        factory: () => new NBackTest({ n: 0 }),
    },
    {
        id:      'nback-1',
        label:   '1-Back Task',
        sub:     '30 trials · working memory (easy)',
        group:   'Working Memory',
        factory: () => new NBackTest({ n: 1 }),
    },
    {
        id:      'nback-2',
        label:   '2-Back Task',
        sub:     '30 trials · working memory (standard)',
        group:   'Working Memory',
        factory: () => new NBackTest({ n: 2 }),
    },
    {
        id:      'digit-fwd',
        label:   'Digit Span — Forward',
        sub:     'Adaptive · verbal WM forward recall',
        group:   'Working Memory',
        factory: () => new DigitSpanTest({ variant: 'forward' }),
    },
    {
        id:      'digit-bwd',
        label:   'Digit Span — Backward',
        sub:     'Adaptive · verbal WM reverse recall',
        group:   'Working Memory',
        factory: () => new DigitSpanTest({ variant: 'backward' }),
    },
    {
        id:      'tmt-a',
        label:   'Trail Making — Part A',
        sub:     '15 nodes · processing speed',
        group:   'Executive Function',
        factory: () => new TrailMakingTest({ variant: 'A' }),
    },
    {
        id:      'tmt-b',
        label:   'Trail Making — Part B',
        sub:     '15 nodes · cognitive flexibility',
        group:   'Executive Function',
        factory: () => new TrailMakingTest({ variant: 'B' }),
    },
    {
        id:      'rt-simple',
        label:   'Reaction Time — Simple',
        sub:     '20 trials · psychomotor speed',
        group:   'Executive Function',
        factory: () => new ReactionTimeTest({ variant: 'simple' }),
    },
    {
        id:      'rt-choice',
        label:   'Reaction Time — Choice',
        sub:     '20 trials · response selection speed',
        group:   'Executive Function',
        factory: () => new ReactionTimeTest({ variant: 'choice' }),
    },
];

const GROUPS = ['Attention & Inhibition', 'Working Memory', 'Executive Function'];

export function renderSetupPage(mountEl) {
    const initialState = stateManager.getState();
    const initialMode  = initialState.fnirsMode ?? 'cortivision';
    const initialUrl   = initialState.fnirsUrl ?? 'ws://127.0.0.1:5732';

    const groupedHtml = GROUPS.map(group => {
        const tests = TEST_REGISTRY.filter(t => t.group === group);
        return `
      <div class="setup-test-group">
        <p class="setup-group-label">${group}</p>
        ${tests.map(t => `
          <label class="setup-test-option">
            <input type="checkbox" class="test-checkbox" value="${t.id}" />
            <div>
              <span class="setup-test-name">${t.label}</span>
              <span class="setup-test-sub">${t.sub}</span>
            </div>
          </label>
        `).join('')}
      </div>
    `;
    }).join('');

    mountEl.innerHTML = `
    <div class="anim-fade-in">
      <h2 style="margin-bottom: var(--space-sm);">Session Setup</h2>
      <p style="color: var(--color-text-muted); margin-bottom: var(--space-xl);">
        Configure participant details and select the test battery to administer.
      </p>

      <div class="grid-2" style="align-items: start; gap: var(--space-xl);">

        <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
          <div class="card">
            <h3 style="margin-bottom: var(--space-lg);">Participant information</h3>
            <div class="setup-form">
              <div class="form-group">
                <label class="form-label" for="p-id">Participant ID</label>
                <input class="input" id="p-id" type="text" placeholder="e.g. P001" autocomplete="off" />
              </div>
              <div class="form-group">
                <label class="form-label" for="p-age">Age</label>
                <input class="input" id="p-age" type="number" min="6" max="99" placeholder="Years" />
              </div>
              <div class="form-group">
                <label class="form-label" for="p-group">Group</label>
                <select class="select" id="p-group">
                  <option value="control">Neurotypical control</option>
                  <option value="adhd">ADHD</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="p-sex">Sex assigned at birth</label>
                <select class="select" id="p-sex">
                  <option value="">Not specified</option>
                  <option value="F">Female</option>
                  <option value="M">Male</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="p-notes">Session notes</label>
                <input class="input" id="p-notes" type="text"
                  placeholder="Medication, comorbidities, observations…" />
              </div>
            </div>
          </div>

          <div class="card">
            <h3 style="margin-bottom: var(--space-sm);">fNIRS device</h3>
            <p style="font-size:0.85rem; color:var(--color-text-muted); margin-bottom:var(--space-md);">
              Connect to the Cortivision PHOTON Cap via the local LSL WebSocket bridge, or use the 50 Hz simulator for offline testing.
            </p>

            <div class="setup-form" style="margin-bottom: var(--space-md);">
              <div class="form-group">
                <label class="form-label" for="fnirs-mode">Acquisition source</label>
                <select class="select" id="fnirs-mode">
                  <option value="cortivision" ${initialMode === 'cortivision' ? 'selected' : ''}>
                    Cortivision / LSL Bridge (WebSocket)
                  </option>
                  <option value="serial" ${initialMode === 'serial' ? 'selected' : ''}>
                    50 Hz Simulator / WebSerial
                  </option>
                </select>
              </div>

              <div class="form-group" id="fnirs-url-group" style="${initialMode === 'cortivision' ? '' : 'display:none;'}">
                <label class="form-label" for="fnirs-url">LSL WebSocket bridge URL</label>
                <input class="input" id="fnirs-url" type="text" value="${initialUrl}"
                  placeholder="ws://127.0.0.1:5732" autocomplete="off" />
              </div>
            </div>

            <div id="fnirs-badge" style="margin-bottom: var(--space-md);"></div>
            <button class="btn" id="setup-connect">Connect stream</button>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:var(--space-lg);">
          <div class="card">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-lg);">
              <h3>Test battery</h3>
              <div style="display:flex; gap:var(--space-xs);">
                <button class="btn btn--sm btn--ghost" id="select-all">Select all</button>
                <button class="btn btn--sm btn--ghost" id="select-none">Clear</button>
              </div>
            </div>
            <div class="setup-tests" id="test-list">
              ${groupedHtml}
            </div>
          </div>

          <div style="text-align:right;">
            <button class="btn btn--primary btn--lg" id="setup-begin">Begin session</button>
          </div>
        </div>

      </div>
    </div>
  `;

    const modeSelect = document.getElementById('fnirs-mode');
    const urlGroup   = document.getElementById('fnirs-url-group');
    const urlInput   = document.getElementById('fnirs-url');
    const connectBtn = document.getElementById('setup-connect');

    let unsubState = null;

    const updateFnirsUI = () => {
        const badgeEl = document.getElementById('fnirs-badge');
        if (!badgeEl) {
            unsubState?.();
            return;
        }

        const { fnirsStatus, fnirsMode } = stateManager.getState();
        const isActive = fnirsStatus === 'connected' || fnirsStatus === 'recording';

        const map = {
            disconnected: ['badge--neutral', 'Not connected'],
            connecting:   ['badge--warning', 'Connecting…'],
            connected:    ['badge--success', fnirsDevice.isSimulated ? 'Simulation mode (50 Hz)' : 'Cortivision LSL connected'],
            recording:    ['badge--success', 'Recording active'],
            error:        ['badge--danger',  'Bridge unreachable'],
        };

        const [cls, label] = map[fnirsStatus] ?? map.disconnected;
        badgeEl.innerHTML = `<span class="badge ${cls}">${label}</span>`;

        if (modeSelect) {
            modeSelect.value    = fnirsMode ?? 'cortivision';
            modeSelect.disabled = isActive || fnirsStatus === 'connecting';
        }
        if (urlGroup) {
            urlGroup.style.display = (fnirsMode ?? 'cortivision') === 'cortivision' ? '' : 'none';
        }
        if (urlInput) {
            urlInput.disabled = isActive || fnirsStatus === 'connecting';
        }
        if (connectBtn) {
            connectBtn.disabled    = fnirsStatus === 'connecting';
            connectBtn.textContent = isActive ? 'Disconnect' : 'Connect stream';
        }
    };

    updateFnirsUI();
    unsubState = stateManager.subscribe(updateFnirsUI);

    modeSelect.addEventListener('change', () => {
        const selectedMode = modeSelect.value;
        urlGroup.style.display = selectedMode === 'cortivision' ? '' : 'none';
        if (!fnirsDevice.isConnected) {
            fnirsDevice.setMode(selectedMode);
        }
    });

    connectBtn.addEventListener('click', async () => {
        const { fnirsStatus } = stateManager.getState();
        const isActive = fnirsStatus === 'connected' || fnirsStatus === 'recording';

        if (isActive) {
            await fnirsDevice.disconnect();
            toast('fNIRS stream disconnected', 'info');
            return;
        }

        const selectedMode = modeSelect.value;
        const url          = urlInput.value.trim() || 'ws://127.0.0.1:5732';

        try {
            fnirsDevice.setMode(selectedMode);
            await fnirsDevice.connect({ url });
            toast(
                fnirsDevice.isSimulated
                    ? '50 Hz simulation stream active'
                    : `Connected to Cortivision LSL bridge (${url})`,
                fnirsDevice.isSimulated ? 'warning' : 'success'
            );
        } catch {
            toast(
                selectedMode === 'cortivision'
                    ? `Could not connect to LSL bridge at ${url}`
                    : 'Could not start fNIRS stream',
                'error'
            );
        }
    });

    document.getElementById('select-all').addEventListener('click', () => {
        document.querySelectorAll('.test-checkbox').forEach(c => (c.checked = true));
    });

    document.getElementById('select-none').addEventListener('click', () => {
        document.querySelectorAll('.test-checkbox').forEach(c => (c.checked = false));
    });

    document.getElementById('setup-begin').addEventListener('click', () => {
        const id    = document.getElementById('p-id').value.trim();
        const age   = parseInt(document.getElementById('p-age').value, 10);
        const group = document.getElementById('p-group').value;
        const sex   = document.getElementById('p-sex').value;
        const notes = document.getElementById('p-notes').value.trim();

        if (!id)  { toast('Please enter a Participant ID', 'error'); return; }
        if (!age) { toast('Please enter participant age',  'error'); return; }

        const selected = [...document.querySelectorAll('.test-checkbox:checked')].map(c => c.value);
        if (!selected.length) { toast('Select at least one test', 'error'); return; }

        const tests = TEST_REGISTRY
            .filter(t => selected.includes(t.id))
            .map(t => t.factory());

unsubState?.();
        eventBus.emit(EVENTS.NAVIGATE, 'test');

        const runnerContainer = mountEl.querySelector('.test-runner') ?? document.querySelector('.test-runner');
        if (!runnerContainer) {
            toast('Unable to initialize test runner container', 'error');
            return;
        }

        sessionManager.begin({
            participant: { id, age, group, sex, notes },
            tests,
            container: runnerContainer,
        });
    });
}