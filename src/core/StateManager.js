const initialState = {
    participant: null,
    session: null,
    fnirsStatus: 'disconnected',
    currentTest: null,
    currentPage: 'home',
};

class StateManager {
    constructor() {
        this._state = { ...initialState };
        this._subscribers = new Set();
    }

    getState() {
        return Object.freeze({ ...this._state });
    }

    setState(patch) {
        const prev = { ...this._state };
        this._state = { ...this._state, ...patch };
        this._notify(prev, this._state);
    }

    subscribe(callback) {
        this._subscribers.add(callback);
        return () => this._subscribers.delete(callback);
    }

    reset() {
        this._state = { ...initialState };
    }

    _notify(prev, next) {
        this._subscribers.forEach(cb => {
            try { cb(next, prev); } catch (e) { console.error('[StateManager]', e); }
        });
    }
}

export const stateManager = new StateManager();