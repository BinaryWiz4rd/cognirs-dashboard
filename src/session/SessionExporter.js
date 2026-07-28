/**
 * Exports session data in formats suitable for further probably Python analysis.
**/

export const SessionExporter = {

    /** Full session as JSON — includes all raw results and fNIRS (WIP) */
    toJSON(session) {
        const json = JSON.stringify(session, null, 2);
        _download(`cognirs_session_${session.id.slice(0, 8)}.json`, json, 'application/json');
    },

    /**
     * Behavioral results as flat CSV.
     * One row per trial across all tests.
     */
    toCSV(session) {
        const rows = [[
            'sessionId', 'participantId', 'group', 'sex', 'age',
            'testId', 'testName', 'trialIndex',
            'correct', 'reactionTime_ms', 'timedOut',
            'isTarget', 'isGo', 'congruent',
            'span', 'hit', 'miss', 'falseAlarm',
            'commission', 'omission', 'correctRejection',
            'key', 'side', 'letter',
        ]];

        session.tests.forEach(({ testId, name, results }) => {
            results.forEach((r, i) => {
                rows.push([
                    session.id,
                    session.participant.id,
                    session.participant.group,
                    session.participant.sex ?? '',
                    session.participant.age,
                    testId,
                    name,
                    i,
                    _bool(r.correct),
                    Math.round(r.reactionTime ?? -1),
                    _bool(r.timedOut),
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
                ]);
            });
        });

        _download(
            `cognirs_behavioral_${session.id.slice(0, 8)}.csv`,
            rows.map(r => r.join(',')).join('\n'),
            'text/csv'
        );
    },

    /**
     * WIP
     * fNIRS samples as CSV.
     * Columns: relativeTime_ms, channel, hbo, hbr
     * Markers are embedded as comment rows: # MARKER,type,relativeTime,payload
     */
    toFNIRSCSV(session) {
        if (!session.fnirs?.samples?.length) return;

        const rows = ['relativeTime_ms,channel,hbo,hbr'];

        const events = [
            ...session.fnirs.samples.map(s => ({ type: 'sample', t: s.timestamp, data: s })),
            ...session.fnirs.markers.map(m => ({ type: 'marker', t: m.relativeTime, data: m })),
        ].sort((a, b) => a.t - b.t);

        events.forEach(ev => {
            if (ev.type === 'sample') {
                const s = ev.data;
                rows.push(`${s.timestamp},${s.channel},${s.hbo.toFixed(6)},${s.hbr.toFixed(6)}`);
            } else {
                const m = ev.data;
                rows.push(`# MARKER,${m.type},${m.relativeTime},${JSON.stringify(m.payload ?? '')}`);
            }
        });

        _download(
            `cognirs_fnirs_${session.id.slice(0, 8)}.csv`,
            rows.join('\n'),
            'text/csv'
        );
    },
};

function _bool(val) {
    if (val === undefined || val === null) return '';
    return val ? 1 : 0;
}

function _download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
}