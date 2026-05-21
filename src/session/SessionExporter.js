export const SessionExporter = {
    toJSON(session) {
        const json   = JSON.stringify(session, null, 2);
        const blob   = new Blob([json], { type: 'application/json' });
        const url    = URL.createObjectURL(blob);
        const a      = document.createElement('a');
        a.href       = url;
        a.download   = `cognirs_session_${session.id.slice(0, 8)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    toCSV(session) {
        const rows = [['sessionId', 'participantId', 'group', 'testId', 'trial', 'correct', 'reactionTime_ms', 'timedOut']];

        session.tests.forEach(({ testId, results }) => {
            results.forEach((r, i) => {
                rows.push([
                    session.id,
                    session.participant.id,
                    session.participant.group,
                    testId,
                    i,
                    r.correct ? 1 : 0,
                    Math.round(r.reactionTime ?? -1),
                    r.timedOut ? 1 : 0,
                ]);
            });
        });

        const csv  = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `cognirs_session_${session.id.slice(0, 8)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    },

    toFNIRSCSV(session) {
        if (!session.fnirs?.samples?.length) return;

        const rows = [['relativeTime_ms', 'channel', 'hbo', 'hbr']];
        session.fnirs.samples.forEach(s => {
            rows.push([s.timestamp, s.channel, s.hbo.toFixed(6), s.hbr.toFixed(6)]);
        });

        const csv  = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `cognirs_fnirs_${session.id.slice(0, 8)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    },
};