/**
 * Line buffer - accumulates incoming bytes and emits complete lines
 */
export class LineBuffer {
    constructor(callbacks) {
        this.buffer = '';
        this.lineEndings = /\r\n|\r|\n/;
        this.callbacks = callbacks;
    }
    /** Push raw data; emits complete lines */
    push(data) {
        this.buffer += data;
        this.flushLines();
    }
    /** Push raw bytes (UTF-8 decoded) */
    pushBytes(bytes) {
        this.push(new TextDecoder().decode(bytes));
    }
    flushLines() {
        const parts = this.buffer.split(this.lineEndings);
        this.buffer = parts.pop() ?? '';
        for (const line of parts) {
            this.callbacks.onLine(line);
        }
    }
    /** Flush any remaining buffered content as a final line */
    flush() {
        if (this.buffer.trim().length > 0) {
            this.callbacks.onLine(this.buffer);
            this.buffer = '';
        }
    }
    /** Clear the buffer without emitting */
    clear() {
        this.buffer = '';
    }
}
//# sourceMappingURL=line-buffer.js.map