import { eventBus, EVENTS } from '../../core/EventBus.js';
import { fnirsDevice }      from '../../fnirs/FNIRSDevice.js';
import { stateManager }     from '../../core/StateManager.js';
import { toast }            from '../components/Toast.js';

const TESTS_INFO = [
    {
        name: 'Stroop Color-Word',
        desc: 'Measures selective attention and inhibitory control by creating interference between ink color and word meaning.',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`,
    },
    {
        name: 'Trail Making',
        desc: 'Assesses processing speed, cognitive flexibility, and visual scanning through two sequencing variants.',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    },
    {
        name: 'Reaction Time',
        desc: 'Quantifies simple and choice response latency as a measure of psychomotor speed and attention.',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    },
];

const PROTOCOL = [
    { num: '01', label: 'Setup',     desc: 'Participant info, group assignment, test selection' },
    { num: '02', label: 'Connect',   desc: 'fNIRS device pairing via WebSerial' },
    { num: '03', label: 'Execute',   desc: 'Synchronized cognitive tests with fNIRS recording' },
    { num: '04', label: 'Export',    desc: 'Behavioral & hemodynamic data as CSV / JSON' },
];

export function renderHomePage(mountEl) {
    mountEl.innerHTML = `
    <div class="home-page anim-fade-in">
      <div class="home-hero">
        <h1 class="home-title">COGNIRS.</h1>
        <p class="home-lead">Cognitive tests for ADHD & fNIRS research</p>
        <p class="home-desc">
          A standardized protocol platform for studying prefrontal blood oxygenation
          during executive function tasks in individuals with ADHD and neurotypical controls.
        </p>
        <div class="home-cta">
          <button class="btn btn--primary btn--lg" id="home-start">Start new session</button>
          <button class="btn btn--lg" id="home-fnirs">Connect fNIRS device</button>
        </div>
      </div>

      <div class="home-tests-grid">
        ${TESTS_INFO.map((t, i) => `
          <div class="card home-test-card anim-slide-up anim-d${i + 1}">
            <div class="home-test-icon">${t.icon}</div>
            <h3>${t.name}</h3>
            <p>${t.desc}</p>
          </div>
        `).join('')}
      </div>

      <div class="home-protocol">
        <h4>Protocol overview</h4>
        <div class="protocol-steps">
          ${PROTOCOL.map(s => `
            <div class="card card--flat protocol-step">
              <span class="protocol-step__num">${s.num}</span>
              <span class="protocol-step__label">${s.label}</span>
              <span class="protocol-step__desc">${s.desc}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

    document.getElementById('home-start')
        .addEventListener('click', () => eventBus.emit(EVENTS.NAVIGATE, 'setup'));

    document.getElementById('home-fnirs')
        .addEventListener('click', async () => {
            const { fnirsStatus } = stateManager.getState();
            if (fnirsStatus === 'connected' || fnirsStatus === 'recording') {
                toast('fNIRS device already connected', 'info');
                return;
            }
            try {
                await fnirsDevice.connect();
                toast(
                    fnirsDevice.isSimulated ? 'Simulation mode active — no hardware detected' : 'fNIRS device connected',
                    fnirsDevice.isSimulated ? 'warning' : 'success'
                );
            } catch {
                toast('Failed to connect fNIRS device', 'error');
            }
        });
}