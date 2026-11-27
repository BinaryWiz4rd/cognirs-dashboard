/**
 * Renders per-test result cards with all relevant outcome metrics.
 * Each test type has a specialised metric set matching what appears
 * in the fNIRS + ADHD literature.
 */

import { stateManager }    from '../../core/StateManager.js';
import { SessionExporter } from '../../session/SessionExporter.js';
import { DataUtils }       from '../../utils/DataUtils.js';

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

const METRIC_BUILDERS = {

    'stroop': (results) => {
        const hits     = results.filter(r => !r.timedOut);
        const cong     = hits.filter(r => r.congruent);
        const incong   = hits.filter(r => !r.congruent);
        return [
            { label: 'Overall accuracy',      value: pct(results, r => r.correct) },
            { label: 'Congruent accuracy',    value: pct(cong,    r => r.correct) },
            { label: 'Incongruent accuracy',  value: pct(incong,  r => r.correct) },
            { label: 'Mean RT (congruent)',   value: DataUtils.formatMs(meanRT(cong))   },
            { label: 'Mean RT (incongruent)', value: DataUtils.formatMs(meanRT(incong)) },
            { label: 'Interference effect',   value: DataUtils.formatMs(meanRT(incong) - meanRT(cong)), note: 'RT incongruent − congruent' },
        ];
    },

    'go-no-go': (results) => {
        const go    = results.filter(r => r.isGo);
        const nogo  = results.filter(r => !r.isGo);
        const comm  = nogo.filter(r => r.commission);  // pressed on No-Go
        const omit  = go.filter(r => r.omission);       // missed Go
        const cr    = nogo.filter(r => r.correctRejection);
        return [
            { label: 'Go accuracy',         value: pct(go,   r => r.correct) },
            { label: 'Commission errors',   value: `${comm.length} / ${nogo.length}`, note: 'Failed inhibitions (No-Go presses)' },
            { label: 'Omission errors',     value: `${omit.length} / ${go.length}`,   note: 'Missed Go responses' },
            { label: 'Correct rejections',  value: `${cr.length} / ${nogo.length}` },
            { label: 'Mean Go RT',          value: DataUtils.formatMs(meanRT(go.filter(r => r.correct))) },
            { label: 'RT variability (SD)', value: DataUtils.formatMs(DataUtils.std(go.filter(r => !r.timedOut && r.reactionTime).map(r => r.reactionTime))) },
        ];
    },

    'cpt': (results) => {
        const targets    = results.filter(r => r.isTarget);
        const nontargets = results.filter(r => !r.isTarget);
        const thirds     = splitThirds(results);
        return [
            { label: 'Hit rate',          value: pct(targets,    r => r.correct) },
            { label: 'False alarm rate',  value: pct(nontargets, r => r.falseAlarm) },
            { label: 'Mean RT (hits)',    value: DataUtils.formatMs(meanRT(targets.filter(r => r.correct))) },
            { label: 'Accuracy — early',  value: pct(thirds[0], r => r.correct), note: 'First third' },
            { label: 'Accuracy — middle', value: pct(thirds[1], r => r.correct), note: 'Middle third' },
            { label: 'Accuracy — late',   value: pct(thirds[2], r => r.correct), note: 'Final third — vigilance decrement' },
        ];
    },

    'n-back': (results) => {
        const hits   = results.filter(r => r.hit);
        const misses = results.filter(r => r.miss);
        const fas    = results.filter(r => r.falseAlarm);
        const crs    = results.filter(r => !r.isTarget && !r.falseAlarm);
        // d-prime (sensitivity): z(HR) - z(FAR)
        const hr  = hits.length / Math.max(1, hits.length + misses.length);
        const far = fas.length  / Math.max(1, fas.length + crs.length);
        const dp  = zScore(clamp(hr, 0.01, 0.99)) - zScore(clamp(far, 0.01, 0.99));
        return [
            { label: 'Hit rate',            value: `${Math.round(hr * 100)}%` },
            { label: 'False alarm rate',    value: `${Math.round(far * 100)}%` },
            { label: 'Misses',              value: misses.length },
            { label: "d′ (sensitivity)",    value: dp.toFixed(2), note: 'Higher = better discrimination' },
            { label: 'Mean RT (hits)',      value: DataUtils.formatMs(meanRT(hits)) },
            { label: 'RT variability (SD)', value: DataUtils.formatMs(DataUtils.std(hits.map(r => r.reactionTime))) },
        ];
    },

    'digit-span': (results) => {
        const correct     = results.filter(r => r.correct);
        const passedSpans = correct.map(r => r.span).filter(s => typeof s === 'number');
        const maxSpan     = passedSpans.length ? Math.max(...passedSpans) : 0;
        const meanSpan    = passedSpans.length ? DataUtils.mean(passedSpans).toFixed(1) : '—';
        return [
            { label: 'Max span passed',     value: maxSpan },
            { label: 'Trials correct',      value: `${correct.length} / ${results.length}` },
            { label: 'Mean passed span',    value: meanSpan },
        ];
    },

    'reaction-time': (results) => {
        const falseStarts    = results.filter(r => r.falseStart);
        const stimulusTrials = results.filter(r => !r.falseStart);
        const hits           = stimulusTrials.filter(r => r.correct && !r.timedOut);
        return [
            { label: 'Accuracy',            value: pct(stimulusTrials, r => r.correct) },
            { label: 'Mean RT',             value: DataUtils.formatMs(meanRT(hits)) },
            { label: 'Median RT',           value: DataUtils.formatMs(DataUtils.median(hits.map(r => r.reactionTime))) },
            { label: 'RT variability (SD)', value: DataUtils.formatMs(DataUtils.std(hits.map(r => r.reactionTime))) },
            { label: 'False starts',        value: falseStarts.length, note: 'Anticipatory ITI presses' },
            { label: 'Timeouts',            value: stimulusTrials.filter(r => r.timedOut).length },
        ];
    },

    'trail-making': (results) => {
        const r = results[0] ?? {};
        return [
            { label: 'Completion time', value: r.totalTime ? `${(r.totalTime / 1000).toFixed(2)} s` : '—' },
            { label: 'Errors',          value: r.errors ?? '—' },
        ];
    },
};

const TEST_LABELS = {
    'stroop':        'Stroop Color–Word Test',
    'go-no-go':      'Go / No-Go Task',
    'cpt':           'Continuous Performance Test',
    'n-back':        'N-Back Task',
    'digit-span':    'Digit Span',
    'reaction-time': 'Reaction Time',
    'trail-making':  'Trail Making Test',
};

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
        const label        = name || TEST_LABELS[testId] || testId;
        const builder      = METRIC_BUILDERS[testId];
        const metrics      = builder ? builder(results) : [];
        const trialCount   = results.filter(r => !r.falseStart).length;

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

function pct(arr, predicate) {
    if (!arr.length) return '—';
    return `${Math.round(arr.filter(predicate).length / arr.length * 100)}%`;
}

function meanRT(arr) {
    const rts = arr.filter(r => r.reactionTime != null && r.reactionTime > 0).map(r => r.reactionTime);
    return DataUtils.mean(rts);
}

function splitThirds(arr) {
    const n = arr.length;
    const t = Math.floor(n / 3);
    return [arr.slice(0, t), arr.slice(t, 2 * t), arr.slice(2 * t)];
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// rational approximation of the inverse normal CDF (Abramowitz & Stegun)
function zScore(p) {
    const a = [2.515517, 0.802853, 0.010328];
    const b = [1.432788, 0.189269, 0.001308];
    const t = Math.sqrt(-2 * Math.log(p <= 0.5 ? p : 1 - p));
    const num = a[0] + a[1] * t + a[2] * t * t;
    const den = 1 + b[0] * t + b[1] * t * t + b[2] * t * t * t;
    const z   = t - num / den;
    return p <= 0.5 ? -z : z;
}