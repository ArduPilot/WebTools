/**
 * Diagnostics tab - event log, link metrics placeholder
 */
import { getEntries, formatEntry, clearLog } from '../diagnostics/logger.js';
export function renderDiagnosticsTab(container, _state) {
    container.innerHTML = `
    <div class="card">
      <h2 class="card-title">Device Event Log</h2>
      <div style="margin-bottom: 12px;">
        <button class="btn btn-sm" id="btn-clear-log">Clear Log</button>
      </div>
      <div class="terminal-container" id="diagnostics-log" style="max-height: 300px;"></div>
    </div>
    <div class="card">
      <h2 class="card-title">Link Metrics</h2>
      <p class="form-hint">RSSI and link quality appear here when MAVLink RADIO packets are received over an active link. Connect a radio and establish a link to see live data.</p>
      <div id="link-metrics" style="min-height: 120px; padding: 16px; background: var(--bg-tertiary); border-radius: var(--radius);">
        <em>No link data yet.</em>
      </div>
    </div>
  `;
    const logEl = document.getElementById('diagnostics-log');
    const refreshLog = () => {
        const entries = getEntries();
        logEl.innerHTML = entries
            .slice(-200)
            .map((e) => `<div class="terminal-line">${formatEntry(e)}</div>`)
            .join('');
        logEl.scrollTop = logEl.scrollHeight;
    };
    refreshLog();
    document.getElementById('btn-clear-log')?.addEventListener('click', () => {
        clearLog();
        refreshLog();
    });
}
//# sourceMappingURL=diagnostics.js.map