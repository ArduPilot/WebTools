/**
 * Profiles tab - save/load/compare config profiles
 */
import { listProfiles, saveProfile, deleteProfile, loadProfile, exportProfileToJSON, importProfileFromJSON, } from '../persistence/profiles.js';
import { getDefaultParams } from '../params/mapper.js';
import { getCurrentParams } from './app.js';
import { showToast } from './toast.js';
export function renderProfilesTab(container, _state) {
    container.innerHTML = `
    <div class="card">
      <h2 class="card-title">Saved Profiles</h2>
      <div id="profile-list"></div>
      <div style="margin-top: 16px;">
        <button class="btn btn-primary" id="btn-save-new">Save Current as Profile</button>
        <button class="btn" id="btn-import-profile">Import Profile JSON</button>
      </div>
    </div>
    <div class="card">
      <h2 class="card-title">Example Profiles</h2>
      <p class="form-hint">Starter configurations for common use cases.</p>
      <div id="example-profiles"></div>
    </div>
  `;
    const exampleProfiles = [
        { name: '900MHz US Default', params: { ...getDefaultParams(), MIN_FREQ: 915000, MAX_FREQ: 928000 } },
        { name: '900MHz Long Range', params: { ...getDefaultParams(), AIR_SPEED: 32, TXPOWER: 20, MIN_FREQ: 915000, MAX_FREQ: 928000 } },
        { name: '433MHz EU', params: { ...getDefaultParams(), MIN_FREQ: 414000, MAX_FREQ: 454000 } },
    ];
    const exampleEl = document.getElementById('example-profiles');
    exampleEl.innerHTML = exampleProfiles
        .map((p) => `
    <div style="padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius); margin-bottom: 8px;">
      <strong>${p.name}</strong>
      <button class="btn btn-sm" data-load-example='${JSON.stringify(p.params)}'>Load</button>
    </div>
  `)
        .join('');
    exampleEl.querySelectorAll('[data-load-example]').forEach((btn) => {
        btn.addEventListener('click', () => {
            showToast('info', 'Import this profile in Profiles tab, then load in Settings');
        });
    });
    const refreshList = async () => {
        const profiles = await listProfiles();
        const listEl = document.getElementById('profile-list');
        listEl.innerHTML =
            profiles.length === 0
                ? '<p class="form-hint">No saved profiles yet.</p>'
                : profiles
                    .map((p) => `
        <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border);">
          <span>${p.name}</span>
          <button class="btn btn-sm" data-load="${p.id}">Load</button>
          <button class="btn btn-sm" data-export="${p.id}">Export</button>
          <button class="btn btn-sm btn-danger" data-delete="${p.id}">Delete</button>
        </div>
      `)
                    .join('');
        listEl.querySelectorAll('[data-load]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const params = await loadProfile(btn.dataset.load);
                if (params) {
                    showToast('success', 'Profile loaded. Apply in Settings tab.');
                    // Could use a custom event to pass params to settings
                }
            });
        });
        listEl.querySelectorAll('[data-export]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.export;
                const profiles = await listProfiles();
                const p = profiles.find((x) => x.id === id);
                if (p) {
                    const json = exportProfileToJSON(p);
                    const blob = new Blob([json], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `sik-profile-${p.name.replace(/\s/g, '-')}.json`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                }
            });
        });
        listEl.querySelectorAll('[data-delete]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this profile?'))
                    return;
                await deleteProfile(btn.dataset.delete);
                refreshList();
                showToast('info', 'Profile deleted');
            });
        });
    };
    refreshList();
    document.getElementById('btn-save-new')?.addEventListener('click', async () => {
        const name = prompt('Profile name:');
        if (!name)
            return;
        const params = Object.keys(getCurrentParams()).length > 0 ? getCurrentParams() : getDefaultParams();
        await saveProfile(name, params);
        refreshList();
        showToast('success', 'Profile saved');
    });
    document.getElementById('btn-import-profile')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file)
                return;
            try {
                const text = await file.text();
                const { name, params } = importProfileFromJSON(text);
                await saveProfile(name, params);
                refreshList();
                showToast('success', `Imported: ${name}`);
            }
            catch (err) {
                showToast('error', err instanceof Error ? err.message : String(err));
            }
        };
        input.click();
    });
}
//# sourceMappingURL=profiles.js.map