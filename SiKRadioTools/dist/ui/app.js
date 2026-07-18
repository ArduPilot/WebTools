/**
 * Main app shell - tabs, connection bar, routing
 */
import { getSettings, saveSettings } from '../persistence/storage.js';
import { showToast } from './toast.js';
import { renderConnectionBar } from './connection.js';
import { renderSettingsTab } from './settings.js';
import { renderTerminalTab } from './terminal.js';
import { renderDiagnosticsTab } from './diagnostics.js';
import { renderProfilesTab } from './profiles.js';
import { renderAdvancedTab } from './advanced.js';
import { renderFirmwareTab } from './firmware.js';
let state = {
    connectionState: 'disconnected',
    transport: null,
    sikClient: null,
    baudRate: 57600,
    darkMode: false,
    demoMode: false,
    activeTab: 'settings',
    currentParams: {},
};
export function getState() {
    return { ...state };
}
export function setState(partial) {
    state = { ...state, ...partial };
    render();
}
export function getTransport() {
    return state.transport;
}
export function getSikClient() {
    return state.sikClient;
}
export function getCurrentParams() {
    return { ...state.currentParams };
}
export function setCurrentParams(params) {
    state.currentParams = params;
}
const TABS = [
    { id: 'settings', label: 'Settings' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'firmware', label: 'Firmware' },
    { id: 'diagnostics', label: 'Diagnostics' },
    { id: 'profiles', label: 'Profiles' },
    { id: 'advanced', label: 'Advanced' },
];
function webSerialSupported() {
    return typeof navigator !== 'undefined' && !!navigator.serial;
}
function render() {
    const root = getRoot();
    root.innerHTML = `
    ${webSerialSupported()
        ? ''
        : `<div class="browser-warning" role="alert">
      Web Serial is not available in this browser. Use <strong>Chrome</strong> or <strong>Edge</strong> on desktop over <strong>HTTPS</strong> (or localhost) to connect USB radios.
    </div>`}
    <header class="app-header">
      <h1 class="app-title">SiK Radio Tools</h1>
      <label class="btn">
        <input type="checkbox" id="demo-mode" ${state.demoMode ? 'checked' : ''}>
        Demo Mode
      </label>
      <label class="btn">
        <input type="checkbox" id="dark-mode" ${state.darkMode ? 'checked' : ''}>
        Dark Mode
      </label>
    </header>
    <div id="connection-bar"></div>
    <nav class="tabs">
      ${TABS.map((t) => `<button class="tab ${t.id === state.activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </nav>
    <div id="tab-content"></div>
    <div id="toast-root"></div>
  `;
    document.documentElement.dataset.theme = state.darkMode ? 'dark' : 'light';
    // Event bindings
    document.getElementById('demo-mode')?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        if (state.connectionState === 'connected') {
            showToast('warning', 'Disconnect before switching mode');
            e.target.checked = !checked;
            return;
        }
        setState({ demoMode: checked });
    });
    document.getElementById('dark-mode')?.addEventListener('change', (e) => {
        const darkMode = e.target.checked;
        setState({ darkMode });
        saveSettings({ darkMode });
    });
    document.querySelectorAll('.tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            setState({ activeTab: btn.dataset.tab ?? 'settings' });
        });
    });
    // Render connection bar and active tab
    const connBar = document.getElementById('connection-bar');
    if (connBar) {
        renderConnectionBar(connBar, state, setState);
    }
    const tabContent = document.getElementById('tab-content');
    if (tabContent) {
        tabContent.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'tab-panel active';
        panel.id = `panel-${state.activeTab}`;
        tabContent.appendChild(panel);
        switch (state.activeTab) {
            case 'settings':
                renderSettingsTab(panel, state);
                break;
            case 'terminal':
                renderTerminalTab(panel, state);
                break;
            case 'firmware':
                renderFirmwareTab(panel, state);
                break;
            case 'diagnostics':
                renderDiagnosticsTab(panel, state);
                break;
            case 'profiles':
                renderProfilesTab(panel, state);
                break;
            case 'advanced':
                renderAdvancedTab(panel, state);
                break;
            default:
                renderSettingsTab(panel, state);
        }
    }
}
let appRoot = null;
export function renderApp(root) {
    appRoot = root;
    getSettings().then((s) => {
        setState({ baudRate: s.baudRate, darkMode: s.darkMode });
        render();
    });
}
function getRoot() {
    return appRoot ?? document.getElementById('app') ?? document.body;
}
//# sourceMappingURL=app.js.map