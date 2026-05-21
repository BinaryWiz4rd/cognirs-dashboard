import { eventBus, EVENTS } from '../../core/EventBus.js';

export function renderHeader(mountEl) {
    mountEl.innerHTML = `
    <header class="app-header">
      <div class="app-header__brand" role="button" tabindex="0" id="header-logo">
        <span class="brand-logo">COGNIRS.</span>
        <span class="brand-divider"></span>
        <span class="brand-subtitle"> cognitivity + fNIRS </span>
      </div>
      <nav class="app-header__nav" aria-label="Main navigation">
        <button class="btn btn--ghost nav-btn" data-page="home">Overview</button>
        <button class="btn btn--ghost nav-btn" data-page="setup">New session</button>
        <button class="btn btn--ghost nav-btn" data-page="results">Results</button>
      </nav>
    </header>
  `;

    mountEl.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => eventBus.emit(EVENTS.NAVIGATE, btn.dataset.page));
    });

    document.getElementById('header-logo')
        .addEventListener('click', () => eventBus.emit(EVENTS.NAVIGATE, 'home'));
}