/**
 * Firmware flashing tab
 */
import { getSikClient, getTransport } from './app.js';
import { showToast } from './toast.js';
import { parseIntelHex } from '../protocol/hex-parser.js';
import { BootloaderClient } from '../protocol/bootloader-client.js';
let selectedFirmware = null;
export function renderFirmwareTab(container, state) {
    container.innerHTML = `
    <div class="card">
      <h2 class="card-title">Firmware Update</h2>
      <div class="form-group">
        <details>
          <summary class="form-label" style="cursor:pointer;">How to prepare a SiK firmware .hex file</summary>
          <div class="form-hint" style="margin-top:8px; line-height:1.5;">
            1) Download a valid SiK firmware <code>.hex</code> for your exact radio hardware/frequency (for example from ArduPilot SiK releases or your radio vendor).<br>
            2) Make sure the target board/frequency matches your radio (e.g. RFD900x vs HM-TRP, 900MHz vs 433MHz).<br>
            3) If the download is a ZIP, extract it and select the firmware <code>.hex</code> file only (not bootloader files unless you intend to replace bootloader).<br>
            4) Connect radio by USB at <strong>115200 baud</strong> in this tool before flashing.<br>
            5) In case sync fails, put radio into bootloader/update mode (this tab also tries <code>AT&UPDATE</code> automatically).<br>
            6) Keep USB connected and do not power-cycle during erase/program/verify.
          </div>
        </details>
      </div>
      <div class="form-group">
        <label class="form-label">Firmware (.hex)</label>
        <input type="file" id="fw-file" accept=".hex,.ihx,text/plain">
        <span id="fw-meta" class="form-hint">No file selected</span>
      </div>

      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="fw-verify" checked>
          Verify after flashing
        </label>
      </div>

      <div class="form-group">
        <button class="btn btn-primary" id="fw-flash" ${state.connectionState !== 'connected' ? 'disabled' : ''}>Flash Firmware</button>
      </div>

      <div class="form-group">
        <div class="fw-progress-row">
          <progress id="fw-progress" max="100" value="0"></progress>
          <span id="fw-progress-text" class="form-hint">Idle</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Flash Log</label>
        <div id="fw-log" class="terminal-container"></div>
      </div>
    </div>
  `;
    bindFirmwareActions(container, state);
}
function bindFirmwareActions(container, state) {
    const fileEl = container.querySelector('#fw-file');
    const metaEl = container.querySelector('#fw-meta');
    const flashBtn = container.querySelector('#fw-flash');
    const verifyEl = container.querySelector('#fw-verify');
    const progressEl = container.querySelector('#fw-progress');
    const progressText = container.querySelector('#fw-progress-text');
    const logEl = container.querySelector('#fw-log');
    const appendLog = (msg) => {
        const line = document.createElement('div');
        line.className = 'terminal-line rx';
        line.textContent = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    };
    const setProgress = (p) => {
        const percent = p.total > 0 ? Math.floor((p.completed / p.total) * 100) : 0;
        progressEl.value = percent;
        progressText.textContent = `${p.phase}: ${p.completed}/${p.total} (${percent}%)`;
    };
    fileEl.addEventListener('change', async () => {
        const file = fileEl.files?.[0];
        selectedFirmware = null;
        if (!file) {
            metaEl.textContent = 'No file selected';
            return;
        }
        try {
            const text = await file.text();
            const parsed = parseIntelHex(text);
            selectedFirmware = parsed;
            metaEl.textContent = `${file.name} • ${parsed.totalBytes} bytes • ${parsed.segments.length} segments${parsed.usesBanking ? ' • 24-bit' : ''}`;
            appendLog(`Loaded firmware: ${file.name}`);
        }
        catch (err) {
            metaEl.textContent = 'Failed to parse HEX file';
            showToast('error', err instanceof Error ? err.message : String(err));
        }
    });
    flashBtn.addEventListener('click', async () => {
        if (!selectedFirmware) {
            showToast('error', 'Select a .hex firmware file first');
            return;
        }
        if (state.demoMode) {
            showToast('error', 'Firmware flashing is not available in demo mode');
            return;
        }
        if (state.baudRate !== 115200) {
            showToast('warning', 'For flashing, reconnect at 115200 baud');
            return;
        }
        const transport = getTransport();
        if (!transport?.isConnected) {
            showToast('error', 'Not connected');
            return;
        }
        const sik = getSikClient();
        if (!sik) {
            showToast('error', 'SiK client not available');
            return;
        }
        flashBtn.disabled = true;
        flashBtn.textContent = 'Flashing...';
        progressEl.value = 0;
        progressText.textContent = 'Starting...';
        let boot = null;
        try {
            boot = new BootloaderClient(transport, appendLog);
            setProgress({ phase: 'sync', completed: 0, total: selectedFirmware.totalBytes });
            let synced = await boot.sync();
            if (!synced) {
                appendLog('No bootloader sync; trying AT&UPDATE...');
                const inCmd = await sik.enterCommandMode().catch(() => false);
                if (!inCmd) {
                    throw new Error('Could not enter command mode for AT&UPDATE');
                }
                await transport.write('AT&UPDATE\r\n');
                await new Promise((r) => setTimeout(r, 900));
                synced = await boot.sync();
            }
            if (!synced) {
                throw new Error('Failed to sync bootloader. Put radio in bootloader mode and retry.');
            }
            await boot.identify();
            await boot.flash(selectedFirmware, {
                verify: verifyEl.checked,
                onProgress: setProgress,
            });
            showToast('success', 'Firmware flash complete');
            appendLog('Flash completed successfully');
        }
        catch (err) {
            showToast('error', err instanceof Error ? err.message : String(err));
            appendLog(`Flash failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        finally {
            boot?.dispose();
            flashBtn.disabled = false;
            flashBtn.textContent = 'Flash Firmware';
        }
    });
}
//# sourceMappingURL=firmware.js.map