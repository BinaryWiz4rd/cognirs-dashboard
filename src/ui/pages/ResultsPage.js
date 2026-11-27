/**
 * Renders per-test result cards with all relevant outcome metrics.
 * Delegates per-task labels and metric calculations to TASK_REGISTRY.
 */

import { stateManager }    from '../../core/StateManager.js';
import { SessionExporter } from '../../session/SessionExporter.js';
import { TASK_REGISTRY }   from '../../tasks/taskRegistry.js';

const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

export function renderResultsPage(mountEl) {
    const { session } = stateManager.getState();

    if (!session?.tests?.length) {
        mountEl.innerHTML = `
      <div class="anim-fade-in">
        <h2>Results</h2>
        <div class="card" style="margin-top:var(--space-xl);text-align:center;padding:var(--space-2xl);">
          <p style="color:var(--color-text-muted);">No session data available. Complete a session first.</p>
        </div>
      </div>
    `;
        return;
    }

    const { participant, fnirs, tests } = session;

    const scoredResults = tests.flatMap(t => t.results).filter(r => r.correct !== undefined && !r.falseStart);
    const overallAcc = scoredResults.length
        ? Math.round(scoredResults.filter(r => r.correct).length / scoredResults.length * 100)
        : '—';

    mountEl.innerHTML = `
    <div class="anim-fade-in">

      <div class="results-header">
        <div>
          <h2>Session Results</h2>
          <div class="results-participant-info" style="margin-top:var(--space-sm);">
            <span class="badge badge--neutral">ID: ${escapeHtml(participant.id)}</span>
            <span class="badge badge--neutral">Age: ${escapeHtml(participant.age)}</span>
            ${participant.sex ? `<span class="badge badge--neutral">${participant.sex === 'F' ? 'Female' : 'Male'}</span>` : ''}
            <span class="badge ${participant.group === 'adhd' ? 'badge--warning' : 'badge--info'}">
              ${participant.group === 'adhd' ? 'ADHD' : 'Neurotypical control'}
            </span>
          </div>
        </div>
        <div class="results-export">
          <button class="btn btn--sm" id="exp-json">Export JSON</button>
          <button class="btn btn--sm btn--success" id="exp-csv">Export CSV</button>
          <button class="btn btn--sm" id="exp-fnirs">Export fNIRS CSV</button>
        </div>
      </div>

      <div class="grid-3" style="margin:var(--space-xl) 0 var(--space-lg);">
        <div class="card stat-block">
          <span class="stat-block__value">${tests.length}</span>
          <span class="stat-block__label">Tests completed</span>
        </div>
        <div class="card stat-block">
          <span class="stat-block__value">${overallAcc}${typeof overallAcc === 'number' ? '%' : ''}</span>
          <span class="stat-block__label">Overall accuracy</span>
        </div>
        <div class="card stat-block">
          <span class="stat-block__value">${fnirs?.samples?.length?.toLocaleString() ?? 0}</span>
          <span class="stat-block__label">fNIRS samples</span>
        </div>
      </div>

      ${tests.map(({ testId, name, results }, i) => {
        const entry      = TASK_REGISTRY[testId];
        const label      = name || entry?.label || testId;
        const metrics    = entry ? entry.buildMetrics(results) : [];
        const trialCount = results.filter(r => !r.falseStart).length;

        return `
          <div class="card results-test-card anim-slide-up anim-d${Math.min(i + 1, 5)}" style="margin-bottom:var(--space-md);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-lg);">
              <div>
                <span class="results-test-label">${escapeHtml(label)}</span>
                <span class="badge badge--neutral" style="margin-left:var(--space-sm);">${trialCount} trials</span>
              </div>
            </div>
            <div class="results-metrics-grid">
              ${metrics.map(m => `
                <div class="results-metric">
                  <span class="results-metric__value">${escapeHtml(m.value)}</span>
                  <span class="results-metric__label">${escapeHtml(m.label)}</span>
                  ${m.note ? `<span class="results-metric__note">${escapeHtml(m.note)}</span>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
    }).join('')}

      <div class="card" style="margin-top:var(--space-md);">
        <h3 style="margin-bottom:var(--space-lg);">fNIRS Recording</h3>
        <div class="grid-3">
          <div class="stat-block">
            <span class="stat-block__value">${fnirs?.samples?.length?.toLocaleString() ?? 0}</span>
            <span class="stat-block__label">Samples</span>
          </div>
          <div class="stat-block">
            <span class="stat-block__value">${fnirs?.markers?.length ?? 0}</span>
            <span class="stat-block__label">Event markers</span>
          </div>
          <div class="stat-block">
            <span class="stat-block__value">${fnirs?.duration ? (fnirs.duration / 1000).toFixed(1) + ' s' : '—'}</span>
            <span class="stat-block__label">Duration</span>
          </div>
        </div>
      </div>

    </div>
  `;

    mountEl.querySelector('#exp-json')?.addEventListener('click', () => SessionExporter.toJSON(session));
    mountEl.querySelector('#exp-csv')?.addEventListener('click', () => SessionExporter.toCSV(session));
    mountEl.querySelector('#exp-fnirs')?.addEventListener('click', () => SessionExporter.toFNIRSCSV(session));
}