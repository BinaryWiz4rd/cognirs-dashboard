import './styles/global.css';
import './styles/components.css';
import './styles/animations.css';
import { renderHeader }  from './ui/components/Header.js';
import { renderStatusBar }from './ui/components/StatusBar.js';
import { initToasts }    from './ui/components/Toast.js';
import { initRouter }    from './router.js';
import { createLogger }  from './core/Logger.js';

const log = createLogger('App');

function init() {
    log.info('COGNIRS initializing…');

    renderHeader(document.getElementById('header-mount'));
    renderStatusBar(document.getElementById('status-bar-mount'));
    initToasts(document.getElementById('toast-mount'));
    initRouter(document.getElementById('page-mount'));

    log.info('COGNIRS ready');
}

document.addEventListener('DOMContentLoaded', init);