import { eventBus, EVENTS } from './core/EventBus.js';
import { renderHomePage }   from './ui/pages/HomePage.js';
import { renderSetupPage }  from './ui/pages/SetupPage.js';
import { renderResultsPage }from './ui/pages/ResultsPage.js';

const ROUTES = {
    home:    renderHomePage,
    setup:   renderSetupPage,
    results: renderResultsPage,
    test:    (el) => { el.innerHTML = '<div class="test-runner anim-fade-in"></div>'; },
};

export function initRouter(mountEl) {
    const navigate = (page) => {
        const renderer = ROUTES[page] ?? ROUTES.home;
        mountEl.innerHTML = '';
        renderer(mountEl);
    };

    eventBus.on(EVENTS.NAVIGATE, (page) => navigate(page));

    eventBus.on(EVENTS.SESSION_ENDED, () => navigate('results'));

    navigate('home');
}