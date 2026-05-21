export class Timer {
    constructor() {
        this._startTime = null;
        this._lapTime = null;
    }

    start() {
        this._startTime = performance.now();
        this._lapTime = this._startTime;
    }

    elapsed() {
        if (!this._startTime) return 0;
        return performance.now() - this._startTime;
    }

    lap() {
        const now = performance.now();
        const delta = now - (this._lapTime ?? now);
        this._lapTime = now;
        return delta;
    }

    reset() {
        this._startTime = null;
        this._lapTime = null;
    }

    isRunning() {
        return this._startTime !== null;
    }
}