/**
 * Settings tab - schema-driven parameter editor
 */
import { SIK_PARAM_SCHEMA, keyToRegister } from '../params/schema.js';
import { ati5ToParams, getDefaultParams, sanitizeParams, } from '../params/mapper.js';
import { getSikClient, setCurrentParams } from './app.js';
import { showToast } from './toast.js';
let localParams = {};
export function renderSettingsTab(container, state) {
    const hasLoadedParams = state.currentParams && Object.keys(state.currentParams).length > 0;
    localParams = hasLoadedParams ? { ...state.currentParams } : { ...getDefaultParams() };
    setCurrentParams(localParams);
    container.innerHTML = `
    <div class="card">
      <h2 class="card-title">Radio Parameters</h2>
      <div class="param-actions" style="margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 8px;">
        <button class="btn btn-primary" id="btn-load">Load from Radio</button>
        <button class="btn btn-primary" id="btn-save" disabled>Save to Radio</button>
        <button class="btn" id="btn-reset">Reset to Defaults</button>
        <button class="btn" id="btn-export">Export Config JSON</button>
        <button class="btn" id="btn-import">Import Config JSON</button>
        <button class="btn" id="btn-clone-remote" title="Copy local settings to remote radio">Clone to Remote</button>
      </div>
      <div id="param-grid" class="param-grid"></div>
      <div id="diff-area" style="margin-top: 16px; display: none;"></div>
    </div>
  `;
    renderParamGrid(container.querySelector('#param-grid'));
    bindSettingsActions(container, state);
}
function renderParamGrid(gridEl, params) {
    const p = params ?? localParams;
    gridEl.innerHTML = SIK_PARAM_SCHEMA.map((def) => {
        const val = p[def.key] ?? def.default;
        const inputHtml = def.type === 'enum'
            ? `<select data-param="${def.key}">
            ${(def.options ?? []).map((o) => `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>`
            : `<input type="${def.type}" data-param="${def.key}" value="${val}" ${def.min !== undefined ? `min="${def.min}"` : ''} ${def.max !== undefined ? `max="${def.max}"` : ''}>`;
        return `
      <div class="param-field ${def.category}" data-param="${def.key}">
        <label class="form-label" title="${def.description}">${def.label}</label>
        ${inputHtml}
        <span class="form-hint">${def.description}</span>
      </div>
    `;
    }).join('');
    gridEl.querySelectorAll('input, select').forEach((el) => {
        el.addEventListener('change', () => {
            const key = el.dataset.param;
            const val = el instanceof HTMLSelectElement
                ? (el.value.match(/^\d+$/) ? parseInt(el.value, 10) : el.value)
                : el.value;
            localParams[key] = typeof val === 'string' && /^\d+$/.test(val) ? parseInt(val, 10) : val;
            setCurrentParams(localParams);
            document.getElementById('btn-save').disabled = false;
        });
    });
}
/** Update each visible input/select in-place without rebuilding grid HTML */
function applyParamsToGrid(params) {
    for (const def of SIK_PARAM_SCHEMA) {
        const val = params[def.key] ?? def.default;
        const el = document.querySelector(`input[data-param="${def.key}"], select[data-param="${def.key}"]`);
        if (el) {
            el.value = String(val);
            // For localParams keep in sync
            localParams[def.key] = typeof val === 'number' ? val : (typeof val === 'string' && /^\d+$/.test(val) ? parseInt(val, 10) : val);
        }
    }
}
function bindSettingsActions(container, _state) {
    container.querySelector('#btn-load')?.addEventListener('click', async () => {
        const client = getSikClient();
        if (!client) {
            showToast('error', 'Not connected');
            return;
        }
        const loadBtn = container.querySelector('#btn-load');
        const saveBtn = container.querySelector('#btn-save');
        loadBtn.disabled = true;
        loadBtn.textContent = 'Loading...';
        try {
            let params;
            try {
                showToast('info', 'Sending ATI5…');
                params = await client.readAllParameters();
            }
            catch {
                showToast('info', 'Entering command mode, then ATI5…');
                const cmdOk = await client.enterCommandMode();
                if (!cmdOk)
                    throw new Error('Failed to enter command mode');
                params = await client.readAllParameters();
                await client.exitCommandMode().catch(() => { });
            }
            const loaded = ati5ToParams(params);
            const rawCount = Object.keys(params).length;
            if (rawCount === 0)
                throw new Error('Radio returned no parameters');
            localParams = { ...getDefaultParams(), ...loaded };
            setCurrentParams(localParams);
            const gridEl = container.querySelector('#param-grid');
            if (gridEl)
                applyParamsToGrid(localParams);
            if (saveBtn)
                saveBtn.disabled = true;
            const count = Object.keys(loaded).length;
            showToast('success', `Loaded ${count} params from radio (NETID=${localParams.NETID})`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/timeout|did not respond/i.test(msg)) {
                showToast('error', 'Radio did not respond. Enter command mode first: Terminal → "Enter Cmd Mode", then Load from Radio again.');
            }
            else {
                showToast('error', msg);
            }
        }
        finally {
            loadBtn.disabled = false;
            loadBtn.textContent = 'Load from Radio';
        }
    });
    container.querySelector('#btn-save')?.addEventListener('click', async () => {
        const client = getSikClient();
        if (!client) {
            showToast('error', 'Not connected');
            return;
        }
        const saveBtn = container.querySelector('#btn-save');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        try {
            const ok = await client.enterCommandMode();
            if (!ok)
                throw new Error('Failed to enter command mode');
            for (const def of SIK_PARAM_SCHEMA) {
                const reg = keyToRegister(def.key);
                const val = localParams[def.key];
                if (reg && val !== undefined) {
                    await client.writeParameter(reg, val);
                }
            }
            await client.saveParameters();
            await client.reboot();
            saveBtn.textContent = 'Save to Radio';
            showToast('success', 'Saved to radio. Rebooting...');
        }
        catch (err) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save to Radio';
            showToast('error', err instanceof Error ? err.message : String(err));
        }
    });
    container.querySelector('#btn-reset')?.addEventListener('click', () => {
        if (!confirm('Reset all parameters to defaults?'))
            return;
        localParams = { ...getDefaultParams() };
        setCurrentParams(localParams);
        renderParamGrid(container.querySelector('#param-grid'));
        container.querySelector('#btn-save').disabled = false;
        showToast('info', 'Reset to defaults');
    });
    container.querySelector('#btn-export')?.addEventListener('click', () => {
        const json = JSON.stringify({ params: localParams, exportedAt: new Date().toISOString() }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sik-config-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('success', 'Config exported');
    });
    container.querySelector('#btn-import')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file)
                return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data.params) {
                    localParams = sanitizeParams(data.params);
                    setCurrentParams(localParams);
                    renderParamGrid(container.querySelector('#param-grid'));
                    container.querySelector('#btn-save').disabled = false;
                    showToast('success', 'Config imported');
                }
                else {
                    throw new Error('Invalid config file');
                }
            }
            catch (err) {
                showToast('error', err instanceof Error ? err.message : String(err));
            }
        };
        input.click();
    });
    container.querySelector('#btn-clone-remote')?.addEventListener('click', async () => {
        const client = getSikClient();
        if (!client) {
            showToast('error', 'Not connected');
            return;
        }
        try {
            const ok = await client.enterCommandMode();
            if (!ok)
                throw new Error('Failed to enter command mode');
            for (const def of SIK_PARAM_SCHEMA) {
                const reg = keyToRegister(def.key);
                const val = localParams[def.key];
                if (reg && val !== undefined) {
                    await client.sendAT(`RT${reg}=${val}`);
                }
            }
            await client.sendAT('RT&W');
            await client.exitCommandMode();
            showToast('success', 'Cloned to remote radio');
        }
        catch (err) {
            showToast('error', err instanceof Error ? err.message : String(err));
        }
    });
}
//# sourceMappingURL=settings.js.map