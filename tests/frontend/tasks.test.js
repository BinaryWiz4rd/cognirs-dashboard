// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NBackTask }                 from '../../src/tasks/NBackTask.js';
import { StroopTask }                from '../../src/tasks/StroopTask.js';
import { GoNoGoTask }                from '../../src/tasks/GoNoGoTask.js';
import { ContinuousPerformanceTask } from '../../src/tasks/ContinuousPerformanceTask.js';
import { DigitSpanTask }             from '../../src/tasks/DigitSpanTask.js';
import { TrailMakingTask }           from '../../src/tasks/TrailMakingTask.js';
import { ReactionTimeTask }          from '../../src/tasks/ReactionTimeTask.js';

describe('COGNIRS Cognitive Tasks', () => {
    let box;

    beforeEach(() => {
        box = document.createElement('div');
        document.body.appendChild(box);
    });

    afterEach(() => {
        box.remove();
    });

    it('2-Back rejects 2nd consecutive identical letter (1-back lure) and accepts 3rd (2-back target) even in blank ISI', () => {
        const task = new NBackTask({ n: 2, trials: 2, stimDurationMs: 5000, isiMs: 5000 });
        task.mount(box);
        task._sequence = [
            { letter: 'K', isTarget: false, isPrime: true },
            { letter: 'G', isTarget: false, isPrime: true },
            { letter: 'G', isTarget: false, isPrime: false },
            { letter: 'G', isTarget: true,  isPrime: false },
        ];

        task._trialIndex = 2;
        task._nextStimulus();
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        expect(box.querySelector('#nback-card').classList.contains('nback-card--miss')).toBe(true);
        expect(task.results[0].falseAlarm).toBe(true);

        task._trialIndex = 3;
        task._nextStimulus();
        task._onStimulusHide();
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        expect(box.querySelector('#nback-card').classList.contains('nback-card--hit')).toBe(true);
        expect(task.results[1].hit).toBe(true);

        task.unmount();
    });

    it('Stroop scores ink color and ignores duplicate clicks', () => {
        const task = new StroopTask({ trials: 2, displayMs: 5000, itiMs: 5000 });
        task.mount(box);
        task.setup();
        const trial = task._trials[0];
        const btns = [...box.querySelectorAll('.stroop-choice-btn')];
        btns.find((b) => b.dataset.color === trial.inkColor.name).click();
        btns.find((b) => b.dataset.color !== trial.inkColor.name).click();
        expect(task.results).toHaveLength(1);
        expect(task.results[0].correct).toBe(true);
        task.unmount();
    });

    it('Go / No-Go records Go hit and No-Go commission error', () => {
        const task = new GoNoGoTask({ trials: 2, stimMs: 5000, responseMs: 5000 });
        task.mount(box);
        task._sequence = [{ isGo: true }, { isGo: false }];

        task._phase = 'iti';
        task._showStimulus();
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        expect(task.results[0]).toMatchObject({ correct: true, commission: false });

        task._trialIndex = 1;
        task._responded = false;
        task._phase = 'iti';
        task._showStimulus();
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        expect(task.results[1]).toMatchObject({ correct: false, commission: true });

        task.unmount();
    });

    it('CPT-AX never generates accidental A->X lure pairs and scores target hits', () => {
        const task = new ContinuousPerformanceTask({ trials: 100, stimMs: 5000, isiMs: 5000 });
        const seq = task._generateSequence();
        for (let i = 1; i < seq.length; i++) {
            if (seq[i - 1].letter === 'A' && seq[i].letter === 'X') {
                expect(seq[i].isTarget).toBe(true);
            }
        }
        task.mount(box);
        task._sequence = [{ letter: 'A', isTarget: false }, { letter: 'X', isTarget: true }];
        task._trialIndex = 1;
        task._nextStimulus();
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        expect(task.results[0]).toMatchObject({ hit: true, correct: true });
        task.unmount();
    });

    it('Digit Span reverses digits in backward mode and steps up after 2 hits', () => {
        const task = new DigitSpanTask({ variant: 'backward', startSpan: 3, maxTrials: 3 });
        task.mount(box);
        for (let t = 0; t < 2; t++) {
            task._sequence = [1, 5, 9];
            task._phase = 'presentation';
            task._startResponsePhase();
            ['9', '5', '1'].forEach((k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k })));
            document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
        }
        expect(task.results.every((r) => r.correct)).toBe(true);
        expect(task._span).toBe(4);
        task.unmount();
    });

    it('Trail Making Part B enforces 1->A->2->B order and counts errors', () => {
        const task = new TrailMakingTask({ variant: 'B', count: 4 });
        task.mount(box);
        task.setup();
        expect(task._items.map((i) => i.label).join(',')).toBe('1,A,2,B');
        box.querySelector('#tmt-node-1').click();
        expect(task._errors).toBe(1);
        ['#tmt-node-0', '#tmt-node-1', '#tmt-node-2', '#tmt-node-3'].forEach((s) => box.querySelector(s).click());
        expect(task.results[0].errors).toBe(1);
        task.unmount();
    });

    it('Reaction Time Choice validates ArrowLeft vs ArrowRight', () => {
        const task = new ReactionTimeTask({ variant: 'choice', trials: 1, minItiMs: 5000, maxItiMs: 5000 });
        task.mount(box);
        task.setup();
        task._currentTrial = { variant: 'choice', side: 'left' };
        task._showStimulus();
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
        expect(task.results[0].correct).toBe(false);
        task.unmount();
    });
});