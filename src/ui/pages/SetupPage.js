import { eventBus, EVENTS }  from '../../core/EventBus.js';
import { sessionManager }    from '../../session/SessionManager.js';
import { StroopTest }        from '../../tests/StroopTest.js';
import { TrailMakingTest }   from '../../tests/TrailMakingTest.js';
import { ReactionTimeTest }  from '../../tests/ReactionTimeTest.js';
import { NBackTest }         from '../../tests/NBackTest.js';
import { fnirsDevice }       from '../../fnirs/FNIRSDevice.js';
import { stateManager }      from '../../core/StateManager.js';
import { toast }             from '../components/Toast.js';

export function renderSetupPage(mountEl) {
    mountEl.innerHTML = `
    <div class="anim-fade-in">
      <h2 style="margin-bottom: var(--space-sm);">Session Setup</h2>
      <p style="color: var(--color-text-muted); margin-bottom: var(--space-xl);">Configure participant details and select the tests to administer.</p>

      <div class="grid-2" style="align-items: start; gap: var(--space-xl);">
        <div>
          <div class="card" style="margin-bottom: var(--space-lg);">
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
                <label class="form-label" for="p-notes">Notes</label>
                <input class="input" id="p-notes" type="text" placeholder="Medication, comorbidities, session notes…" />
              </div>
            </div>
          </div>

          <div class="card">
            <h3 style="margin-bottom: var(--space-sm);">fNIRS device</h3>
            <p style="font-size:0.85rem; color:var(--color-text-muted); margin-bottom: var(--space-md);">
              Connect your fNIRS headset via USB serial before starting.
            </p>
            <div id="fnirs-badge" style="margin-bottom: var(--space-md);"></div>
            <button class="btn" id="setup-connect">Connect device</button>
          </div>
        </div>

        <div>
          <div class="card">
            <h3 style="margin-bottom: var(--space-md);">Test battery</h3>
            <div class="setup-tests" id="test-list">
              ${[
        { id: 'stroop',     label: 'Stroop Color–Word',       sub: '24 trials · ~3–4 min' },
        { id: 'tmt-a',     label: 'Trail Making — Part A',    sub: 'Numeric sequencing' },
        { id: 'tmt-b',     label: 'Trail Making — Part B',    sub: 'Alternating sequence' },
        { id: 'rt-simple', label: 'Reaction Time (Simple)',    sub: '20 trials · Space bar' },
        { id: 'nback',     label: 'N-Back (2-back)',           sub: '30 stimuli · N=2' },
        { id: 'rt-choice', label: 'Reaction Time (Choice)',    sub: '20 trials · Arrow keys' },
    ].map(t => `
                <label class="setup-test-option">
                  <input type="checkbox" class="test-checkbox" value="${t.id}" checked />
                  <div>
                    <span class="setup-test-name">${t.label}</span>
                    <span class="setup-test-sub">${t.sub}</span>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>

          <div style="margin-top: var(--space-xl); text-align: right;">
            <button class="btn btn--primary btn--lg" id="setup-begin">Begin session</button>
          </div>
        </div>
      </div>
    </div>
  `;

    const updateFnirsUI = () => {
        const s = stateManager.getState().fnirsStatus;
        const el = document.getElementById('fnirs-badge');
        if (!el) return;
        const map = {
            disconnected: ['badge--neutral', 'Not connected'],
            connecting:   ['badge--warning', 'Connecting…'],
            connected:    ['badge--success', fnirsDevice.isSimulated ? 'Simulation mode' : 'Device connected'],
            recording:    ['badge--success', 'Recording active'],
            error:        ['badge--danger',  'Connection error'],
        };
        const [cls, label] = map[s] ?? map.disconnected;
        el.innerHTML = `<span class="badge ${cls}">${label}</span>`;
    };

    updateFnirsUI();
    stateManager.subscribe(updateFnirsUI);

    document.getElementById('setup-connect').addEventListener('click', async () => {
        try {
            await fnirsDevice.connect();
            toast(fnirsDevice.isSimulated ? 'Simulation mode — hardware not detected' : 'fNIRS device connected', fnirsDevice.isSimulated ? 'warning' : 'success');
        } catch {
            toast('Could not connect fNIRS device', 'error');
        }
    });

    document.getElementById('setup-begin').addEventListener('click', () => {
        const id    = document.getElementById('p-id').value.trim();
        const age   = parseInt(document.getElementById('p-age').value, 10);
        const group = document.getElementById('p-group').value;
        const sex   = document.getElementById('p-sex').value;
        const notes = document.getElementById('p-notes').value.trim();

        if (!id)  { toast('Please enter a Participant ID', 'error'); return; }
        if (!age) { toast('Please enter participant age', 'error'); return; }

        const selected = [...document.querySelectorAll('.test-checkbox:checked')].map(c => c.value);
        if (!selected.length) { toast('Select at least one test', 'error'); return; }

        const testMap = {
            'stroop':     () => new StroopTest(),
            'tmt-a':     () => new TrailMakingTest({ variant: 'A' }),
            'tmt-b':     () => new TrailMakingTest({ variant: 'B' }),
            'nback':     () => new NBackTest({ n: 2, trials: 30 }),
            'rt-simple': () => new ReactionTimeTest({ variant: 'simple' }),
            'rt-choice': () => new ReactionTimeTest({ variant: 'choice' }),
        };

        const tests = selected.map(k => testMap[k]?.()).filter(Boolean);

        eventBus.emit(EVENTS.NAVIGATE, 'test');
        setTimeout(() => {
            sessionManager.begin({
                participant: { id, age, group, sex, notes },
                tests,
                container: document.getElementById('page-mount'),
            });
        }, 100);
    });
}