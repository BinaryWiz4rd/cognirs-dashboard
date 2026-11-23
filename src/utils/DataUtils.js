export const DataUtils = {
    mean(arr) {
        if (!arr.length) return 0;
        return arr.reduce((s, v) => s + v, 0) / arr.length;
    },

    std(arr) {
        if (arr.length < 2) return 0;
        const m = DataUtils.mean(arr);
        const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
        return Math.sqrt(variance);
    },

    median(arr) {
        if (!arr.length) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    },

    movingAverage(arr, windowSize) {
        return arr.map((_, i) => {
            const start = Math.max(0, i - windowSize + 1);
            const window = arr.slice(start, i + 1);
            return DataUtils.mean(window);
        });
    },

    normalize(arr) {
        if (!arr.length) return [];
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] < min) min = arr[i];
            if (arr[i] > max) max = arr[i];
        }
        const range = max - min || 1;
        return arr.map(v => (v - min) / range);
    },

    formatMs(ms) {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    },

    timestamp() {
        return new Date().toISOString().replace('T', ' ').slice(0, 19);
    },
};