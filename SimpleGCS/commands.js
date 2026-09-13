/* ACKs identify a MAVLink command, not its individual parameter values. Track
   every send without delaying control actions or claiming a per-request result. */
(() => {
    class CommandAcks {
        constructor({report, timeoutMs = 5000}) {
            this.report = report;
            this.timeoutMs = timeoutMs;
            this.pending = new Map();
        }

        submit(command, send) {
            const entries = this.pending.get(command) || [];
            const entry = {timer: null};
            entries.push(entry);
            this.pending.set(command, entries);
            this.armTimeout(command, entry);
            try { send(); return true; }
            catch (error) {
                this.remove(command, entry);
                this.report(command, 'not sent');
                return false;
            }
        }

        remove(command, entry) {
            clearTimeout(entry.timer);
            const entries = this.pending.get(command);
            const index = entries?.indexOf(entry) ?? -1;
            if (index < 0) return false;
            entries.splice(index, 1);
            if (!entries.length) this.pending.delete(command);
            return true;
        }

        armTimeout(command, entry) {
            clearTimeout(entry.timer);
            entry.timer = setTimeout(() => {
                if (this.remove(command, entry)) this.report(command, 'no acknowledgement');
            }, this.timeoutMs);
        }

        acknowledge(command, result, inProgress = false) {
            const entry = this.pending.get(command)?.[0];
            if (!entry) return false;
            if (inProgress) { this.armTimeout(command, entry); return true; }
            this.remove(command, entry);
            this.report(command, result);
            return true;
        }

        clear() {
            for (const entries of this.pending.values()) {
                for (const entry of entries) clearTimeout(entry.timer);
            }
            this.pending.clear();
        }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = CommandAcks;
    else window.CommandAcks = CommandAcks;
})();
