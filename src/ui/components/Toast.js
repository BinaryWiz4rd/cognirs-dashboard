import { eventBus, EVENTS } from '../../core/EventBus.js';

const ALLOWED_TYPES = new Set(['info', 'success', 'warning', 'error']);

export function initToasts(mountEl) {
    mountEl.innerHTML = '<div class="toast-container" id="toast-container" aria-live="assertive"></div>';

    eventBus.on(EVENTS.TOAST, ({ message, type = 'info', duration = 3500 }) => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const safeType = ALLOWED_TYPES.has(type) ? type : 'info';

        const toast = document.createElement('div');
        toast.className = `toast toast--${safeType} anim-slide-up`;
        toast.setAttribute('role', 'alert');

        const dot = document.createElement('span');
        dot.className = 'toast__dot';

        const msg = document.createElement('span');
        msg.className = 'toast__msg';
        msg.textContent = String(message ?? '');

        toast.append(dot, msg);
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-8px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    });
}

export function toast(message, type = 'info', duration = 3500) {
    eventBus.emit(EVENTS.TOAST, { message, type, duration });
}