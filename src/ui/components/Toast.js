import { eventBus, EVENTS } from '../../core/EventBus.js';

export function initToasts(mountEl) {
    mountEl.innerHTML = '<div class="toast-container" id="toast-container" aria-live="assertive"></div>';

    eventBus.on(EVENTS.TOAST, ({ message, type = 'info', duration = 3500 }) => {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast--${type} anim-slide-up`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
      <span class="toast__dot"></span>
      <span class="toast__msg">${message}</span>
    `;
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