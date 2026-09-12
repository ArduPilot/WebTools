/**
 * Device event and diagnostics logger
 */
const MAX_ENTRIES = 500;
const entries = [];
export function log(level, message, source) {
    const entry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        level,
        message,
        source,
    };
    entries.push(entry);
    if (entries.length > MAX_ENTRIES) {
        entries.shift();
    }
}
export function logInfo(msg, source) {
    log('info', msg, source);
}
export function logWarn(msg, source) {
    log('warn', msg, source);
}
export function logError(msg, source) {
    log('error', msg, source);
}
export function logDebug(msg, source) {
    log('debug', msg, source);
}
export function getEntries() {
    return [...entries];
}
export function clearLog() {
    entries.length = 0;
}
export function formatEntry(e) {
    const time = new Date(e.timestamp).toISOString().slice(11, 23);
    const src = e.source ? ` [${e.source}]` : '';
    return `[${time}] ${e.level.toUpperCase()}${src} ${e.message}`;
}
//# sourceMappingURL=logger.js.map