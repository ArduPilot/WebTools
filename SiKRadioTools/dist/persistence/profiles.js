/**
 * Profile management - save, load, compare
 */
import { getProfiles, saveProfiles } from './storage.js';
import { sanitizeParams, diffParams } from '../params/mapper.js';
export async function listProfiles() {
    return getProfiles();
}
export async function saveProfile(name, params) {
    const profiles = await getProfiles();
    const profile = {
        id: crypto.randomUUID(),
        name,
        createdAt: Date.now(),
        params: sanitizeParams(params),
    };
    profiles.push(profile);
    await saveProfiles(profiles);
    return profile;
}
export async function deleteProfile(id) {
    const profiles = await getProfiles().then((p) => p.filter((x) => x.id !== id));
    await saveProfiles(profiles);
}
export async function loadProfile(id) {
    const profiles = await getProfiles();
    const p = profiles.find((x) => x.id === id);
    return p ? { ...p.params } : null;
}
export function compareProfile(profile, current) {
    return diffParams(current, profile);
}
export function exportProfileToJSON(profile) {
    return JSON.stringify({
        name: profile.name,
        createdAt: new Date(profile.createdAt).toISOString(),
        params: profile.params,
    }, null, 2);
}
export function importProfileFromJSON(json) {
    const data = JSON.parse(json);
    if (!data.params || typeof data.params !== 'object') {
        throw new Error('Invalid profile JSON: missing params');
    }
    return {
        name: data.name ?? 'Imported',
        params: data.params,
    };
}
//# sourceMappingURL=profiles.js.map