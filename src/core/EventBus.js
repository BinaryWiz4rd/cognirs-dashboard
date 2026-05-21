class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    /**
     * subscribe to an event
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} unsubscribe function
     */
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);

        return () => this.off(event, callback);
    }

    /**
     * subscribe once
     * @param {string} event
     * @param {Function} callback
     */
    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }

    /**
     * unsubscribe
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        this._listeners.get(event)?.delete(callback);
    }

    emit(event, payload) {
        this._listeners.get(event)?.forEach(cb => {
            try {
                cb(payload);
            } catch (err) {
                console.error(`[EventBus] Error in listener for "${event}":`, err);
            }
        });
    }

    /**
     * remove all listeners for an event or all events.
     * @param {string} [event]
     */
    clear(event) {
        if (event) {
            this._listeners.delete(event);
        } else {
            this._listeners.clear();
        }
    }
}

export const eventBus = new EventBus();

export const EVENTS = Object.freeze({
    FNIRS_CONNECTED:    'fnirs:connected',
    FNIRS_DISCONNECTED: 'fnirs:disconnected',
    FNIRS_DATA:         'fnirs:data',
    FNIRS_ERROR:        'fnirs:error',
    FNIRS_RECORDING_START: 'fnirs:recording:start',
    FNIRS_RECORDING_STOP:  'fnirs:recording:stop',

    SESSION_STARTED:    'session:started',
    SESSION_ENDED:      'session:ended',
    SESSION_PAUSED:     'session:paused',

    TEST_STARTED:       'test:started',
    TEST_ENDED:         'test:ended',
    TEST_TRIAL_START:   'test:trial:start',
    TEST_TRIAL_END:     'test:trial:end',
    TEST_RESPONSE:      'test:response',

    NAVIGATE:           'navigate',

    TOAST:              'ui:toast',
    MODAL_OPEN:         'ui:modal:open',
    MODAL_CLOSE:        'ui:modal:close',
});