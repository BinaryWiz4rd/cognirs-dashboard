/**
 * Persistent fNIRS telemetry and connection status panel.
 */

import { eventBus, EVENTS } from '../../core/EventBus.js';
import { stateManager }     from '../../core/StateManager.js';
import { fnirsDevice }      from '../../fnirs/FNIRSDevice.js';

const STATUS_THEMES = {
    disconnected: { label: 'Disconnected',   styleClass: 'panel-status--offline' },
    connecting:   { label: 'Connecting...',  styleClass: 'panel-status--idle' },
    connected:    { label: 'Connected',      styleClass: 'panel-status--active' },
    recording:    { label: 'Recording',      styleClass: 'panel-status--recording' },
    error:        { label: 'Link Error',     styleClass: 'panel-status--error' },
};

export function renderStatusBar(mountEl) {
    let sampleCount = 0;
    let isOpen      = true;

    function getSourceLabel() {
        if (fnirsDevice.isSimulated) return '50 Hz Simulator';
        if (fnirsDevice.activeMode === 'cortivision') return 'Cortivision / LSL Bridge';
        return 'WebSerial COM Port';
    }

    function render() {
        const state         = stateManager.getState();
        const currentStatus = state.fnirsStatus || 'disconnected';
        const currentMode   = state.fnirsMode || 'cortivision';
        const config        = STATUS_THEMES[currentStatus] || STATUS_THEMES.disconnected;
        const canSwitchMode = currentStatus === 'disconnected' || currentStatus === 'error';

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

                    ${canSwitchMode ? `
                        <div class="sidebar-panel__section">
                            <label class="form-label" for="sidebar-fnirs-mode" style="font-size:0.75rem; margin-bottom:4px; display:block;">
                                Source Protocol
                            </label>
                            <select id="sidebar-fnirs-mode" class="select" style="font-size:0.8rem; padding:6px 8px;">
                                <option value="cortivision" ${currentMode === 'cortivision' ? 'selected' : ''}>Cortivision / LSL</option>
                                <option value="simulator" ${currentMode === 'simulator' ? 'selected' : ''}>Simulator (50 Hz)</option>
                                <option value="serial" ${currentMode === 'serial' ? 'selected' : ''}>WebSerial Port</option>
                            </select>
                        </div>
                    ` : ''}

                    <div class="sidebar-panel__section sidebar-panel__actions">
                        ${canSwitchMode ? `
                            <button id="fnirs-connect-action" class="sidebar-panel__btn btn-connect">
                                Connect Stream
                            </button>
                        ` : `
                            <button id="fnirs-disconnect-action" class="sidebar-panel__btn btn-disconnect"
                                ${currentStatus === 'connecting' ? 'disabled' : ''}>
                                ${currentStatus === 'connecting' ? 'Connecting...' : 'Disconnect Stream'}
                            </button>
                        `}
                    </div>

                    ${currentStatus !== 'disconnected' && currentStatus !== 'connecting' ? `
                        <div class="sidebar-panel__footer">
                            <span>Stream Source: ${getSourceLabel()}</span>
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

        const modeSelect = document.getElementById('sidebar-fnirs-mode');
        if (modeSelect) {
            modeSelect.addEventListener('change', () => {
                if (!fnirsDevice.isConnected) {
                    fnirsDevice.setMode(modeSelect.value);
                }
            });
        }

        const connectBtn    = document.getElementById('fnirs-connect-action');
        const disconnectBtn = document.getElementById('fnirs-disconnect-action');

        if (connectBtn) {
            connectBtn.addEventListener('click', async () => {
                connectBtn.disabled    = true;
                connectBtn.textContent = 'Connecting...';
                try {
                    const { fnirsMode, fnirsUrl } = stateManager.getState();
                    fnirsDevice.setMode(fnirsMode ?? 'cortivision');
                    await fnirsDevice.connect({ url: fnirsUrl });
                } catch (error) {
                    console.error('fNIRS stream initialization failure:', error);
                }
            });
        }

        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', async () => {
                try {
                    await fnirsDevice.disconnect();
                    sampleCount = 0;
                } catch (error) {
                    console.error('fNIRS stream teardown failure:', error);
                }
            });
        }
    }

    render();
    stateManager.subscribe(render);

    eventBus.on(EVENTS.FNIRS_RECORDING_START, () => {
        sampleCount = 0;
    });

    eventBus.on(EVENTS.FNIRS_DATA, (samples) => {
        sampleCount += samples.length;
        const displayElement = mountEl.querySelector('.data-counter__value');
        if (displayElement) {
            displayElement.textContent = sampleCount.toLocaleString();
        }
    });
}