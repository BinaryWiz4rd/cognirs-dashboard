import { stateManager }    from '../../core/StateManager.js';
import { SessionExporter } from '../../session/SessionExporter.js';
import { DataUtils }       from '../../utils/DataUtils.js';

const TEST_LABELS = {
    'stroop':    'Stroop Color–Word',
    'trail-making': 'Trail Making',
    'reaction-time': 'Reaction Time',
};

export function renderResultsPage(mountEl) {
    const { session } = stateManager.getState();

    if (!session?.summary) {
        mountEl.innerHTML = `
      <div class="anim-fade-in">
        <h2>Results</h2>
        <div class="card" style="margin-top: var(--space-xl); text-align: center; padding: var(--space-2xl);">
          <p style="color: var(--color-text-muted);">No session data available. Complete a session first.</p>
        </div>
      </div>
    `;
        return;
    }

    const { summary, participant, fnirs } = session;

    mountEl.innerHTML = `
    <div class="anim-fade-in">
      <div class="results-header">
        <div>
          <h2>Session Results</h2>
          <div class="results-participant-info" style="margin-top: var(--space-sm);">
            <span class="badge badge--neutral">ID: ${participant.id}</span>
            <span class="badge badge--neutral">Age: ${participant.age}</span>
            <span class="badge ${participant.group === 'adhd' ? 'badge--warning' : 'badge--info'}">
              ${participant.group === 'adhd' ? 'ADHD' : 'Neurotypical control'}
            </span>
          </div>
        </div>
        <div class="results-export">
          <button class="btn btn--sm" id="exp-json">Export JSON</button>
          <button class="btn btn--sm" id="exp-csv">Export CSV</button>
          <button class="btn btn--sm" id="exp-fnirs">Export fNIRS</button>
        </div>
      </div>

      <div class="grid-3" style="margin-bottom: var(--space-xl);">
        <div class="card stat-block">
          <span class="stat-block__value">${Object.values(summary).reduce((s,v) => s + v.totalTrials, 0)}</span>
          <span class="stat-block__label">Total trials</span>
        </div>
        <div class="card stat-block">
          <span class="stat-block__value">${Math.round(Object.values(summary).reduce((s,v) => s + v.accuracy, 0) / Object.keys(summary).length * 100)}%</span>
          <span class="stat-block__label">Mean accuracy</span>
        </div>
        <div class="card stat-block">
          <span class="stat-block__value">${fnirs?.samples?.length?.toLocaleString() ?? 0}</span>
          <span class="stat-block__label">fNIRS samples</span>
        </div>
      </div>

      ${Object.entries(summary).map(([testId, s]) => `
        <div class="card results-test-card anim-slide-up">
          <span class="results-test-label">${TEST_LABELS[testId] ?? testId}</span>
          <div class="grid-auto">
            <div class="stat-block">
              <span class="stat-block__value">${Math.round(s.accuracy * 100)}%</span>
              <span class="stat-block__label">Accuracy</span>
            </div>
            <div class="stat-block">
              <span class="stat-block__value">${DataUtils.formatMs(s.meanRT)}</span>
              <span class="stat-block__label">Mean RT</span>
            </div>
            <div class="stat-block">
              <span class="stat-block__value">${DataUtils.formatMs(s.medianRT)}</span>
              <span class="stat-block__label">Median RT</span>
            </div>
            <div class="stat-block">
              <span class="stat-block__value">${DataUtils.formatMs(s.stdRT)}</span>
              <span class="stat-block__label">RT SD</span>
            </div>
            <div class="stat-block">
              <span class="stat-block__value">${s.correct}/${s.totalTrials}</span>
              <span class="stat-block__label">Correct</span>
            </div>
          </div>
        </div>
      `).join('')}

      <div class="card" style="margin-top: var(--space-md);">
        <h3 style="margin-bottom: var(--space-md);">fNIRS Recording Summary</h3>
        <div class="grid-3">
          <div class="stat-block">
            <span class="stat-block__value">${fnirs?.samples?.length?.toLocaleString() ?? 0}</span>
            <span class="stat-block__label">Samples collected</span>
          </div>
          <div class="stat-block">
            <span class="stat-block__value">${fnirs?.markers?.length ?? 0}</span>
            <span class="stat-block__label">Event markers</span>
          </div>
          <div class="stat-block">
            <span class="stat-block__value">${fnirs?.duration ? (fnirs.duration / 1000).toFixed(1) + 's' : '—'}</span>
            <span class="stat-block__label">Duration</span>
          </div>
        </div>
      </div>
    </div>
  `;

    document.getElementById('exp-json') .addEventListener('click', () => SessionExporter.toJSON(session));
    document.getElementById('exp-csv')  .addEventListener('click', () => SessionExporter.toCSV(session));
    document.getElementById('exp-fnirs').addEventListener('click', () => SessionExporter.toFNIRSCSV(session));
}