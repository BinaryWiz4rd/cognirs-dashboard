/**
 * Serializes completed cognitive sessions and synchronized fNIRS streams
 * into downloadable JSON and CSV files.
 */

import { toast } from '../ui/components/Toast.js';

export const SessionExporter = {

    toJSON(session) {
        const json = JSON.stringify(session, null, 2);
        _download(`cognirs_session_${session.id.slice(0, 8)}.json`, json, 'application/json');
    },

    toCSV(session) {
        const rows = [[
            'sessionId', 'participantId', 'group', 'sex', 'age',
            'testId', 'testName', 'variant', 'nLevel', 'trialIndex',
            'correct', 'reactionTime_ms', 'timedOut',
            'falseStart', 'itiElapsedMs', 'errors',
            'isTarget', 'isGo', 'congruent',
            'span', 'hit', 'miss', 'falseAlarm',
            'commission', 'omission', 'correctRejection',
            'key', 'side', 'letter', 'response',
        ]];

        session.tests.forEach((testEntry) => {
            const { testId, name, results } = testEntry;
            results.forEach((r) => {
                const nLevel  = _resolveNLevel(testEntry, r);
                const variant = _resolveVariant(testEntry, r, nLevel);
                const responseVal = Array.isArray(r.response)
                    ? r.response.join('-')
                    : (r.response ?? '');

                rows.push([
                    session.id,
                    session.participant.id,
                    session.participant.group,
                    session.participant.sex ?? '',
                    session.participant.age,
                    testId,
                    name,
                    variant,
                    nLevel,
                    r.trialIndex !== undefined && r.trialIndex !== null ? r.trialIndex : '',
                    _bool(r.correct),
                    r.reactionTime != null ? +r.reactionTime.toFixed(2) : -1,
                    _bool(r.timedOut),
                    _bool(r.falseStart),
                    r.itiElapsedMs ?? '',
                    r.errors ?? '',
                    _bool(r.isTarget),
                    _bool(r.isGo),
                    _bool(r.congruent),
                    r.span ?? '',
                    _bool(r.hit),
                    _bool(r.miss),
                    _bool(r.falseAlarm),
                    _bool(r.commission),
                    _bool(r.omission),
                    _bool(r.correctRejection),
                    r.key ?? '',
                    r.side ?? '',
                    r.letter ?? '',
                    responseVal,
                ].map(_escapeCSV));
            });
        });

        _download(
            `cognirs_behavioral_${session.id.slice(0, 8)}.csv`,
            rows.map(r => r.join(',')).join('\n'),
            'text/csv'
        );
    },

    toFNIRSCSV(session) {
        if (!session.fnirs?.samples?.length) {
            toast('No fNIRS samples recorded in this session', 'warning');
            return;
        }

        const rows = ['relativeTime_ms,deviceTimestamp_ms,channel,hbo,hbr'];

        const events = [
            ...session.fnirs.samples.map(s => ({
                type: 'sample',
                t:    s.relativeTime ?? s.timestamp ?? 0,
                data: s,
            })),
            ...session.fnirs.markers.map(m => ({
                type: 'marker',
                t:    m.relativeTime ?? 0,
                data: m,
            })),
        ].sort((a, b) => a.t - b.t);

        events.forEach(ev => {
            if (ev.type === 'sample') {
                const s = ev.data;
                rows.push(
                    `${ev.t.toFixed(3)},${s.deviceTimestamp ?? ''},${s.channel},${s.hbo.toFixed(6)},${s.hbr.toFixed(6)}`
                );
            } else {
                const m = ev.data;
                rows.push(
                    `# MARKER,${_escapeCSV(m.type)},${ev.t.toFixed(3)},${_escapeCSV(JSON.stringify(m.payload ?? ''))}`
                );
            }
        });

        _download(
            `cognirs_fnirs_${session.id.slice(0, 8)}.csv`,
            rows.join('\n'),
            'text/csv'
        );
    },
};

function _resolveNLevel(testEntry, trial) {
    if (trial.n !== undefined && trial.n !== null) return trial.n;
    if (testEntry.n !== undefined && testEntry.n !== null) return testEntry.n;
    if (testEntry.config?.n !== undefined && testEntry.config?.n !== null) return testEntry.config.n;

    if (testEntry.testId === 'n-back' && typeof testEntry.name === 'string') {
        const match = testEntry.name.match(/^(\d+)\s*-\s*back/i);
        if (match) return parseInt(match[1], 10);
    }

    return '';
}

function _resolveVariant(testEntry, trial, nLevel) {
    if (trial.variant !== undefined && trial.variant !== null) return trial.variant;
    if (testEntry.variant !== undefined && testEntry.variant !== null) return testEntry.variant;
    if (testEntry.config?.variant !== undefined && testEntry.config?.variant !== null) {
        return testEntry.config.variant;
    }

    switch (testEntry.testId) {
        case 'n-back':
            return nLevel !== '' ? `${nLevel}-back` : '';
        case 'digit-span':
            if (typeof trial.isBack === 'boolean') return trial.isBack ? 'backward' : 'forward';
            if (/backward/i.test(testEntry.name ?? '')) return 'backward';
            if (/forward/i.test(testEntry.name ?? '')) return 'forward';
            return '';
        case 'reaction-time':
            if (trial.side === 'center') return 'simple';
            if (trial.side === 'left' || trial.side === 'right') return 'choice';
            if (/choice/i.test(testEntry.name ?? '')) return 'choice';
            if (/simple/i.test(testEntry.name ?? '')) return 'simple';
            return '';
        default:
            return '';
    }
}

function _bool(val) {
    if (val === undefined || val === null) return '';
    return val ? 1 : 0;
}

function _escapeCSV(val) {
    const str = String(val ?? '');
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function _download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}