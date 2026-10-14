/**
 * Settings and profiles persisted in localStorage
 */
const KEYS = {
    SETTINGS: 'app_settings',
    PROFILES: 'profiles',
};
const DEFAULT_SETTINGS = {
    baudRate: 57600,
    darkMode: false,
};
function readLocalStorageJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null)
            return fallback;
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function writeLocalStorageJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}
export async function getSettings() {
    const stored = readLocalStorageJson(KEYS.SETTINGS, null);
    return { ...DEFAULT_SETTINGS, ...stored };
}
export async function saveSettings(settings) {
    const current = await getSettings();
    writeLocalStorageJson(KEYS.SETTINGS, { ...current, ...settings });
}
export async function getProfiles() {
    const list = readLocalStorageJson(KEYS.PROFILES, null);
    return Array.isArray(list) ? list : [];
}
export async function saveProfiles(profiles) {
    writeLocalStorageJson(KEYS.PROFILES, profiles);
}
//# sourceMappingURL=storage.js.map