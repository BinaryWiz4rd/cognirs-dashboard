const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LEVEL = LOG_LEVELS.DEBUG;

class Logger {
    constructor(namespace) {
        this._namespace = namespace;
        this._entries = [];
    }

    _log(level, message, data) {
        if (LOG_LEVELS[level] < CURRENT_LEVEL) return;

        const entry = {
            timestamp: performance.now(),
            isoTime: new Date().toISOString(),
            level,
            namespace: this._namespace,
            message,
            data,
        };

        this._entries.push(entry);

        const prefix = `[COGNIRS:${this._namespace}] [${level}]`;
        const style = {
            DEBUG: 'color: #6a9fc0',
            INFO:  'color: #5bc8ff',
            WARN:  'color: #ffcc00',
            ERROR: 'color: #ff4466',
        }[level];

        if (data !== undefined) {
            console.log(`%c${prefix} ${message}`, style, data);
        } else {
            console.log(`%c${prefix} ${message}`, style);
        }
    }

    debug(message, data) { this._log('DEBUG', message, data); }
    info(message, data)  { this._log('INFO',  message, data); }
    warn(message, data)  { this._log('WARN',  message, data); }
    error(message, data) { this._log('ERROR', message, data); }

    getEntries() { return [...this._entries]; }
    clear()      { this._entries = []; }
}

export const createLogger = (namespace) => new Logger(namespace);