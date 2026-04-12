/**
 * Advanced tab - manual register access, developer tools
 */
import { getSikClient } from './app.js';
import { SIK_PARAM_SCHEMA } from '../params/schema.js';
import { showToast } from './toast.js';
export function renderAdvancedTab(container, _state) {
    container.innerHTML = `
    <div class="card">
      <h2 class="card-title">Manual Parameter Editor</h2>
      <p class="form-hint">Direct AT register access. Use when schema doesn't cover your firmware variant.</p>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <input type="text" id="adv-register" placeholder="e.g. S1" style="width: 80px;">
        <span>=</span>
        <input type="text" id="adv-value" placeholder="value" style="flex: 1;">
        <button class="btn" id="adv-read">Read</button>
        <button class="btn btn-primary" id="adv-write">Write</button>
      </div>
    </div>
    <div class="card">
      <h2 class="card-title">Register Reference</h2>
      <div class="terminal-container" style="max-height: 300px; font-size: 12px;">
        ${SIK_PARAM_SCHEMA.map((p) => `${p.register ?? ''}: ${p.key} - ${p.description}`).join('\n')}
      </div>
    </div>
    <div class="card">
      <h2 class="card-title">Firmware Workflow</h2>
      <p class="form-hint">Firmware upgrade placeholder. Future versions may support bootloader mode and firmware upload.</p>
    </div>
  `;
    const regInput = document.getElementById('adv-register');
    const valInput = document.getElementById('adv-value');
    document.getElementById('adv-read')?.addEventListener('click', async () => {
        const client = getSikClient();
        if (!client) {
            showToast('error', 'Not connected');
            return;
        }
        const reg = regInput.value.trim().toUpperCase();
        if (!reg) {
            showToast('warning', 'Enter register (e.g. S1)');
            return;
        }
        try {
            const ok = await client.enterCommandMode();
            if (!ok)
                throw new Error('Failed to enter command mode');
            const val = await client.readParameter(reg);
            await client.exitCommandMode();
            valInput.value = String(val ?? '');
            showToast('success', `Read ${reg}=${val}`);
        }
        catch (err) {
            showToast('error', err instanceof Error ? err.message : String(err));
        }
    });
    document.getElementById('adv-write')?.addEventListener('click', async () => {
        const client = getSikClient();
        if (!client) {
            showToast('error', 'Not connected');
            return;
        }
        const reg = regInput.value.trim().toUpperCase();
        const val = valInput.value.trim();
        if (!reg || val === '') {
            showToast('warning', 'Enter register and value');
            return;
        }
        try {
            const ok = await client.enterCommandMode();
            if (!ok)
                throw new Error('Failed to enter command mode');
            await client.writeParameter(reg, val);
            await client.saveParameters();
            await client.exitCommandMode();
            showToast('success', `Wrote ${reg}=${val}. Use ATZ to reboot.`);
        }
        catch (err) {
            showToast('error', err instanceof Error ? err.message : String(err));
        }
    });
}
//# sourceMappingURL=advanced.js.map