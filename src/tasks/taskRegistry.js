import { StroopTask }                from './StroopTask.js';
import { GoNoGoTask }                from './GoNoGoTask.js';
import { ContinuousPerformanceTask } from './ContinuousPerformanceTask.js';
import { NBackTask }                 from './NBackTask.js';
import { DigitSpanTask }             from './DigitSpanTask.js';
import { ReactionTimeTask }          from './ReactionTimeTask.js';
import { TrailMakingTask }           from './TrailMakingTask.js';
import { DataUtils }                 from '../utils/DataUtils.js';

function pct(arr, predicate) {
    if (!arr.length) return '—';
    return `${Math.round((arr.filter(predicate).length / arr.length) * 100)}%`;
}

function meanRT(arr) {
    const rts = arr
        .filter((r) => r.reactionTime != null && r.reactionTime > 0)
        .map((r) => r.reactionTime);
    return DataUtils.mean(rts);
}

function splitThirds(arr) {
    const t = Math.floor(arr.length / 3);
    return [arr.slice(0, t), arr.slice(t, 2 * t), arr.slice(2 * t)];
}

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

function zScore(p) {
    const a = [2.515517, 0.802853, 0.010328];
    const b = [1.432788, 0.189269, 0.001308];
    const t = Math.sqrt(-2 * Math.log(p <= 0.5 ? p : 1 - p));
    const num = a[0] + a[1] * t + a[2] * t * t;
    const den = 1 + b[0] * t + b[1] * t * t + b[2] * t * t * t;
    const z = t - num / den;
    return p <= 0.5 ? -z : z;
}

export const TASK_REGISTRY = {
    'stroop': {
        label: 'Stroop Color–Word Test',
        create: (cfg) => new StroopTask(cfg),
        buildMetrics: (results) => {
            const hits   = results.filter((r) => !r.timedOut);
            const cong   = hits.filter((r) => r.congruent);
            const incong = hits.filter((r) => !r.congruent);
            return [
                { label: 'Overall accuracy',      value: pct(results, (r) => r.correct) },
                { label: 'Congruent accuracy',    value: pct(cong,    (r) => r.correct) },
                { label: 'Incongruent accuracy',  value: pct(incong,  (r) => r.correct) },
                { label: 'Mean RT (congruent)',   value: DataUtils.formatMs(meanRT(cong)) },
                { label: 'Mean RT (incongruent)', value: DataUtils.formatMs(meanRT(incong)) },
                { label: 'Interference effect',   value: DataUtils.formatMs(meanRT(incong) - meanRT(cong)), note: 'RT incongruent − congruent' },
            ];
        },
    },

    'go-no-go': {
        label: 'Go / No-Go Task',
        create: (cfg) => new GoNoGoTask(cfg),
        buildMetrics: (results) => {
            const go   = results.filter((r) => r.isGo);
            const nogo = results.filter((r) => !r.isGo);
            const comm = nogo.filter((r) => r.commission);
            const omit = go.filter((r) => r.omission);
            const cr   = nogo.filter((r) => r.correctRejection);
            return [
                { label: 'Go accuracy',         value: pct(go, (r) => r.correct) },
                { label: 'Commission errors',   value: `${comm.length} / ${nogo.length}`, note: 'Failed inhibitions (No-Go presses)' },
                { label: 'Omission errors',     value: `${omit.length} / ${go.length}`,   note: 'Missed Go responses' },
                { label: 'Correct rejections',  value: `${cr.length} / ${nogo.length}` },
                { label: 'Mean Go RT',          value: DataUtils.formatMs(meanRT(go.filter((r) => r.correct))) },
                { label: 'RT variability (SD)', value: DataUtils.formatMs(DataUtils.std(go.filter((r) => !r.timedOut && r.reactionTime).map((r) => r.reactionTime))) },
            ];
        },
    },

    'cpt': {
        label: 'Continuous Performance Test',
        create: (cfg) => new ContinuousPerformanceTask(cfg),
        buildMetrics: (results) => {
            const targets    = results.filter((r) => r.isTarget);
            const nontargets = results.filter((r) => !r.isTarget);
            const thirds     = splitThirds(results);
            return [
                { label: 'Hit rate',          value: pct(targets,    (r) => r.correct) },
                { label: 'False alarm rate',  value: pct(nontargets, (r) => r.falseAlarm) },
                { label: 'Mean RT (hits)',    value: DataUtils.formatMs(meanRT(targets.filter((r) => r.correct))) },
                { label: 'Accuracy — early',  value: pct(thirds[0], (r) => r.correct), note: 'First third' },
                { label: 'Accuracy — middle', value: pct(thirds[1], (r) => r.correct), note: 'Middle third' },
                { label: 'Accuracy — late',   value: pct(thirds[2], (r) => r.correct), note: 'Final third — vigilance decrement' },
            ];
        },
    },

    'n-back': {
        label: 'N-Back Task',
        create: (cfg) => new NBackTask(cfg),
        buildMetrics: (results) => {
            const hits   = results.filter((r) => r.hit);
            const misses = results.filter((r) => r.miss);
            const fas    = results.filter((r) => r.falseAlarm);
            const crs    = results.filter((r) => !r.isTarget && !r.falseAlarm);
            const hr     = hits.length / Math.max(1, hits.length + misses.length);
            const far    = fas.length / Math.max(1, fas.length + crs.length);
            const dp     = zScore(clamp(hr, 0.01, 0.99)) - zScore(clamp(far, 0.01, 0.99));
            return [
                { label: 'Hit rate',            value: `${Math.round(hr * 100)}%` },
                { label: 'False alarm rate',    value: `${Math.round(far * 100)}%` },
                { label: 'Misses',              value: misses.length },
                { label: "d′ (sensitivity)",    value: dp.toFixed(2), note: 'Higher = better discrimination' },
                { label: 'Mean RT (hits)',      value: DataUtils.formatMs(meanRT(hits)) },
                { label: 'RT variability (SD)', value: DataUtils.formatMs(DataUtils.std(hits.map((r) => r.reactionTime))) },
            ];
        },
    },

    'digit-span': {
        label: 'Digit Span',
        create: (cfg) => new DigitSpanTask(cfg),
        buildMetrics: (results) => {
            const correct     = results.filter((r) => r.correct);
            const passedSpans = correct.map((r) => r.span).filter((s) => typeof s === 'number');
            const maxSpan     = passedSpans.length ? Math.max(...passedSpans) : 0;
            const meanSpan    = passedSpans.length ? DataUtils.mean(passedSpans).toFixed(1) : '—';
            return [
                { label: 'Max span passed',  value: maxSpan },
                { label: 'Trials correct',   value: `${correct.length} / ${results.length}` },
                { label: 'Mean passed span', value: meanSpan },
            ];
        },
    },

    'reaction-time': {
        label: 'Reaction Time',
        create: (cfg) => new ReactionTimeTask(cfg),
        buildMetrics: (results) => {
            const falseStarts    = results.filter((r) => r.falseStart);
            const stimulusTrials = results.filter((r) => !r.falseStart);
            const hits           = stimulusTrials.filter((r) => r.correct && !r.timedOut);
            return [
                { label: 'Accuracy',            value: pct(stimulusTrials, (r) => r.correct) },
                { label: 'Mean RT',             value: DataUtils.formatMs(meanRT(hits)) },
                { label: 'Median RT',           value: DataUtils.formatMs(DataUtils.median(hits.map((r) => r.reactionTime))) },
                { label: 'RT variability (SD)', value: DataUtils.formatMs(DataUtils.std(hits.map((r) => r.reactionTime))) },
                { label: 'False starts',        value: falseStarts.length, note: 'Anticipatory ITI presses' },
                { label: 'Timeouts',            value: stimulusTrials.filter((r) => r.timedOut).length },
            ];
        },
    },

    'trail-making': {
        label: 'Trail Making Test',
        create: (cfg) => new TrailMakingTask(cfg),
        buildMetrics: (results) => {
            const r = results[0] ?? {};
            return [
                { label: 'Completion time', value: r.totalTime ? `${(r.totalTime / 1000).toFixed(2)} s` : '—' },
                { label: 'Errors',          value: r.errors ?? '—' },
            ];
        },
    },
};

export const SETUP_BATTERY = [
    { id: 'stroop',    taskId: 'stroop',        config: {},                       label: 'Stroop Color–Word',               sub: '24 trials · selective attention & inhibition',   group: 'Attention & Inhibition' },
    { id: 'go-no-go',  taskId: 'go-no-go',      config: {},                       label: 'Go / No-Go',                      sub: '60 trials · response inhibition',                group: 'Attention & Inhibition' },
    { id: 'cpt',       taskId: 'cpt',           config: {},                       label: 'Continuous Performance (CPT-AX)', sub: '100 trials · sustained attention & vigilance',   group: 'Attention & Inhibition' },
    { id: 'nback-0',   taskId: 'n-back',        config: { n: 0 },                 label: '0-Back Task',                     sub: '30 trials · control working memory condition',   group: 'Working Memory' },
    { id: 'nback-1',   taskId: 'n-back',        config: { n: 1 },                 label: '1-Back Task',                     sub: '30 trials · working memory (easy)',              group: 'Working Memory' },
    { id: 'nback-2',   taskId: 'n-back',        config: { n: 2 },                 label: '2-Back Task',                     sub: '30 trials · working memory (standard)',          group: 'Working Memory' },
    { id: 'digit-fwd', taskId: 'digit-span',    config: { variant: 'forward' },   label: 'Digit Span — Forward',            sub: 'Adaptive · verbal WM forward recall',            group: 'Working Memory' },
    { id: 'digit-bwd', taskId: 'digit-span',    config: { variant: 'backward' },  label: 'Digit Span — Backward',           sub: 'Adaptive · verbal WM reverse recall',            group: 'Working Memory' },
    { id: 'tmt-a',     taskId: 'trail-making',  config: { variant: 'A' },         label: 'Trail Making — Part A',           sub: '15 nodes · processing speed',                    group: 'Executive Function' },
    { id: 'tmt-b',     taskId: 'trail-making',  config: { variant: 'B' },         label: 'Trail Making — Part B',           sub: '15 nodes · cognitive flexibility',               group: 'Executive Function' },
    { id: 'rt-simple', taskId: 'reaction-time', config: { variant: 'simple' },    label: 'Reaction Time — Simple',          sub: '20 trials · psychomotor speed',                  group: 'Executive Function' },
    { id: 'rt-choice', taskId: 'reaction-time', config: { variant: 'choice' },    label: 'Reaction Time — Choice',          sub: '20 trials · response selection speed',           group: 'Executive Function' },
];

export function createTask(taskId, config = {}) {
    const entry = TASK_REGISTRY[taskId];
    if (!entry) throw new Error(`Unknown cognitive task: "${taskId}"`);
    return entry.create(config);
}