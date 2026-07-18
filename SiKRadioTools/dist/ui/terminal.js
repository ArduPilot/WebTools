/**
 * Terminal tab - AT command console
 */
import { getTransport, getSikClient } from './app.js';
import { showToast } from './toast.js';
const MAX_LINES = 500;
const terminalLines = [];
let lineListenerUnsubscribe = null;
/** Always look up the output element live — avoids stale DOM reference after re-renders */
function getOutputEl() {
    return document.getElementById('terminal-output');
}
function appendLine(type, text) {
    const time = new Date().toISOString().slice(11, 23);
    terminalLines.push({ type, text, time });
    if (terminalLines.length > MAX_LINES)
        terminalLines.shift();
    const output = getOutputEl();
    if (!output)
        return;
    const lineEl = document.createElement('div');
    lineEl.className = `terminal-line ${type}`;
    lineEl.textContent = `[${time}] ${text}`;
    output.appendChild(lineEl);
    output.scrollTop = output.scrollHeight;
}
export function renderTerminalTab(container, _state) {
    // Unsubscribe existing listener before rebuilding DOM
    lineListenerUnsubscribe?.();
    lineListenerUnsubscribe = null;
    container.innerHTML = `
    <div class="card">
      <h2 class="card-title">AT Command Terminal</h2>
      <div class="terminal-container" id="terminal-output"></div>
      <div class="terminal-input-row">
        <input type="text" id="terminal-input" placeholder="Enter AT command (e.g. ATI5, +++ for command mode)" autocomplete="off">
        <button class="btn btn-primary" id="terminal-send">Send</button>
      </div>
      <div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
        <button class="btn btn-sm" data-cmd="+++">Enter Cmd Mode</button>
        <button class="btn btn-sm" data-cmd="ATO">Exit Cmd Mode</button>
        <button class="btn btn-sm" data-cmd="ATI">ATI</button>
        <button class="btn btn-sm" data-cmd="ATI5">ATI5</button>
        <button class="btn btn-sm" data-cmd="AT&V">AT&V</button>
        <button class="btn btn-sm" data-cmd="ATZ">ATZ</button>
        <button class="btn btn-sm" data-cmd="AT&W">Save</button>
        <button class="btn btn-sm" id="terminal-copy">Copy Log</button>
      </div>
    </div>
  `;
    // Replay terminal history into the freshly-created output element
    const output = getOutputEl();
    for (const entry of terminalLines) {
        const lineEl = document.createElement('div');
        lineEl.className = `terminal-line ${entry.type}`;
        lineEl.textContent = `[${entry.time}] ${entry.text}`;
        output.appendChild(lineEl);
    }
    output.scrollTop = output.scrollHeight;
    const input = document.getElementById('terminal-input');
    const sendBtn = document.getElementById('terminal-send');
    const sendCommand = async (cmd) => {
        const transport = getTransport();
        if (!transport?.isConnected) {
            showToast('error', 'Not connected');
            return;
        }
        const toSend = cmd.trim();
        if (!toSend)
            return;
        if (toSend === '+++') {
            const client = getSikClient();
            if (client) {
                appendLine('tx', '+++');
                try {
                    showToast('info', 'Waiting for line silence (1.5s)...');
                    // enterCommandMode waits the guard time then sends +++
                    // The radio's OK will appear via addLineListener automatically
                    const ok = await client.enterCommandMode();
                    if (!ok) {
                        appendLine('rx', 'ERROR: Failed to enter command mode');
                    }
                    showToast(ok ? 'success' : 'error', ok ? 'Entered command mode' : 'Failed to enter command mode');
                }
                catch (err) {
                    appendLine('rx', `Error: ${err instanceof Error ? err.message : String(err)}`);
                    showToast('error', err instanceof Error ? err.message : String(err));
                }
                return;
            }
        }
        // All other commands (ATI5, ATI, ATO, etc.) — send raw; responses appear via addLineListener
        appendLine('tx', toSend);
        const line = toSend.endsWith('\r\n') ? toSend : toSend + '\r\n';
        try {
            await transport.write(line);
        }
        catch (err) {
            appendLine('rx', `Error: ${err instanceof Error ? err.message : String(err)}`);
        }
    };
    sendBtn.addEventListener('click', () => {
        sendCommand(input.value);
        input.value = '';
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendCommand(input.value);
            input.value = '';
        }
    });
    document.querySelectorAll('[data-cmd]').forEach((btn) => {
        btn.addEventListener('click', () => {
            sendCommand(btn.dataset.cmd ?? '');
        });
    });
    document.getElementById('terminal-copy')?.addEventListener('click', () => {
        const text = terminalLines.map((l) => `[${l.time}] ${l.type.toUpperCase()}: ${l.text}`).join('\n');
        navigator.clipboard.writeText(text);
    });
    // Subscribe to incoming serial data — listener uses appendLine which looks up output element dynamically
    const transport = getTransport();
    if (transport?.isConnected && transport.addLineListener) {
        lineListenerUnsubscribe = transport.addLineListener((line) => {
            if (line.trim())
                appendLine('rx', line.trim());
        });
    }
}
//# sourceMappingURL=terminal.js.map