/**
 * Connection bar - Connect, Disconnect, baud rate, status
 */
import { SerialTransport, MockTransport } from '../transport/index.js';
import { SiKRadioClient } from '../protocol/sik-client.js';
import { saveSettings } from '../persistence/storage.js';
import { logInfo, logError } from '../diagnostics/logger.js';
import { showToast } from './toast.js';
const BAUD_OPTIONS = [9600, 19200, 38400, 57600, 115200];
export function renderConnectionBar(container, state, setState) {
    const statusClass = state.connectionState === 'connected' ? 'connected'
        : state.connectionState === 'error' ? 'error'
            : state.connectionState === 'connecting' ? 'connecting'
                : '';
    container.innerHTML = `
    <div class="connection-bar">
      <div class="connection-status">
        <span class="status-dot ${statusClass}"></span>
        <span id="status-text">${getStatusText(state.connectionState)}</span>
        ${state.transport?.portInfo?.name ? `<span class="text-secondary">(${state.transport.portInfo.name})</span>` : ''}
      </div>
      <select id="baud-rate" ${state.connectionState === 'connected' ? 'disabled' : ''}>
        ${BAUD_OPTIONS.map((b) => `<option value="${b}" ${b === state.baudRate ? 'selected' : ''}>${b} baud</option>`).join('')}
      </select>
      ${state.connectionState === 'connected'
        ? `<button class="btn btn-danger" id="btn-disconnect">Disconnect</button>`
        : `<button class="btn btn-primary" id="btn-connect">Connect Radio</button>`}
    </div>
  `;
    const btnConnect = document.getElementById('btn-connect');
    const btnDisconnect = document.getElementById('btn-disconnect');
    const baudSelect = document.getElementById('baud-rate');
    baudSelect?.addEventListener('change', () => {
        const baud = parseInt(baudSelect.value, 10);
        setState({ baudRate: baud });
        saveSettings({ baudRate: baud });
    });
    btnConnect?.addEventListener('click', async () => {
        await handleConnect(state, setState);
    });
    btnDisconnect?.addEventListener('click', async () => {
        await handleDisconnect(state, setState);
    });
}
function getStatusText(s) {
    switch (s) {
        case 'connected': return 'Connected';
        case 'connecting': return 'Connecting...';
        case 'error': return 'Error';
        default: return 'Disconnected';
    }
}
async function handleConnect(state, setState) {
    setState({ connectionState: 'connecting' });
    logInfo('Connecting...', 'connection');
    try {
        const TransportClass = state.demoMode ? MockTransport : SerialTransport;
        const transport = new TransportClass();
        if (state.demoMode) {
            await transport.open({ baudRate: state.baudRate });
        }
        else {
            const hadPort = await transport.reconnectKnownPort();
            if (!hadPort) {
                await transport.requestPort();
            }
            await transport.open({ baudRate: state.baudRate });
        }
        const sikClient = new SiKRadioClient(transport);
        sikClient.setCallbacks({
            onLog: (msg) => logInfo(msg, 'sik'),
        });
        setState({
            connectionState: 'connected',
            transport,
            sikClient,
        });
        saveSettings({ lastConnectedPort: transport.portInfo?.name });
        showToast('success', state.demoMode ? 'Demo mode connected' : 'Radio connected');
        logInfo('Connected', 'connection');
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState({ connectionState: 'error' });
        showToast('error', msg);
        logError(msg, 'connection');
    }
}
async function handleDisconnect(state, setState) {
    if (state.transport) {
        try {
            await state.transport.close();
        }
        catch {
            /* ignore */
        }
    }
    setState({
        connectionState: 'disconnected',
        transport: null,
        sikClient: null,
    });
    showToast('info', 'Disconnected');
    logInfo('Disconnected', 'connection');
}
//# sourceMappingURL=connection.js.map