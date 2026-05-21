import { eventBus, EVENTS } from '../../core/EventBus.js';
import { stateManager }     from '../../core/StateManager.js';
import { fnirsDevice }      from '../../fnirs/FNIRSDevice.js';

const STATUS_THEMES = {
    disconnected: { label: 'Disconnected', styleClass: 'panel-status--offline' },
    connecting:   { label: 'Connecting...',  styleClass: 'panel-status--idle' },
    connected:    { label: 'Connected',      styleClass: 'panel-status--active' },
    recording:    { label: 'Recording',      styleClass: 'panel-status--recording' },
    error:        { label: 'Hardware Error', styleClass: 'panel-status--error' }
};

export function renderStatusBar(mountEl) {
    let sampleCount = 0;
    let isOpen = true;

    function render() {
        const currentStatus = stateManager.getState().fnirsStatus || 'disconnected';
        const config = STATUS_THEMES[currentStatus] || STATUS_THEMES.disconnected;
        const isSimulated = fnirsDevice.isSimulated;

        mountEl.innerHTML = `
            <aside class="fnirs-sidebar-panel ${!isOpen ? 'fnirs-sidebar-panel--collapsed' : ''}" aria-label="fNIRS Device Management">
                <button id="sidebar-toggle-trigger" class="sidebar-panel__toggle" aria-label="${isOpen ? 'Collapse panel' : 'Expand panel'}">
                    <span class="toggle-icon">${isOpen ? '→' : '←'}</span>
                </button>

                <div class="sidebar-panel__content">
                    <div class="sidebar-panel__section">
                        <h2 class="sidebar-panel__title">fNIRS Connection</h2>
                        
                        <div class="panel-status ${config.styleClass}">
                            <span class="panel-status__dot"></span>
                            <span class="panel-status__text">${config.label}</span>
                        </div>

                        ${currentStatus === 'recording' ? `
                            <div class="data-counter">
                                <span class="data-counter__value">${sampleCount.toLocaleString()}</span>
                                <span class="data-counter__label">samples ingested</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="sidebar-panel__section sidebar-panel__actions">
                        ${currentStatus === 'disconnected' || currentStatus === 'error' ? `
                            <button id="fnirs-connect-action" class="sidebar-panel__btn btn-connect">
                                Connect Device
                            </button>
                        ` : `
                            <button id="fnirs-disconnect-action" class="sidebar-panel__btn btn-disconnect">
                                Disconnect Device
                            </button>
                        `}
                    </div>

                    ${currentStatus !== 'disconnected' && currentStatus !== 'connecting' ? `
                        <div class="sidebar-panel__footer">
                            <span>Stream Source: ${isSimulated ? 'Simulation Window' : 'WebSerial COM Port'}</span>
                        </div>
                    ` : ''}
                </div>
            </aside>
        `;

        setupActionListeners();
    }

    function setupActionListeners() {
        const toggleBtn = document.getElementById('sidebar-toggle-trigger');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                isOpen = !isOpen;
                render();
            });
        }

        const connectBtn = document.getElementById('fnirs-connect-action');
        const disconnectBtn = document.getElementById('fnirs-disconnect-action');

        if (connectBtn) {
            connectBtn.addEventListener('click', async () => {
                connectBtn.disabled = true;
                connectBtn.textContent = 'Opening Port...';
                try {
                    await fnirsDevice.connect();
                } catch (error) {
                    console.error('fNIRS hardware initialization failure:', error);
                }
            });
        }

        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', async () => {
                try {
                    await fnirsDevice.disconnect();
                    sampleCount = 0;
                } catch (error) {
                    console.error('fNIRS hardware teardown failure:', error);
                }
            });
        }
    }

    render();
    stateManager.subscribe(render);

    eventBus.on(EVENTS.FNIRS_DATA, (samples) => {
        sampleCount += samples.length;
        const displayElement = mountEl.querySelector('.data-counter__value');
        if (displayElement) {
            displayElement.textContent = sampleCount.toLocaleString();
        }
    });
}