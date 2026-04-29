/**
 * Serial transport using Web Serial API
 * Requires user gesture for requestPort()
 */
import { LineBuffer } from '../protocol/line-buffer.js';
export class SerialTransport {
    constructor() {
        this.port = null;
        this.reader = null;
        this.readerLock = false;
        this.callbacks = {};
        this.lineListeners = new Set();
        this.dataListeners = new Set();
        this._isConnected = false;
        this.lineBuffer = new LineBuffer({
            onLine: (line) => {
                this.callbacks.onLine?.(line);
                this.lineListeners.forEach((cb) => cb(line));
            },
        });
    }
    addLineListener(cb) {
        this.lineListeners.add(cb);
        return () => this.lineListeners.delete(cb);
    }
    addDataListener(cb) {
        this.dataListeners.add(cb);
        return () => this.dataListeners.delete(cb);
    }
    get isConnected() {
        return this._isConnected;
    }
    get portInfo() {
        if (!this.port)
            return undefined;
        try {
            const info = this.port.getInfo?.();
            const vid = info?.usbVendorId;
            const pid = info?.usbProductId;
            const name = this.port.serialNumber ??
                (vid != null && pid != null ? `USB ${vid.toString(16).padStart(4, '0')}:${pid.toString(16).padStart(4, '0')}` : null) ??
                'Serial Port';
            return { name, vendorId: vid, productId: pid };
        }
        catch {
            return { name: 'Serial Port' };
        }
    }
    setCallbacks(cb) {
        this.callbacks = cb;
    }
    async requestPort(options) {
        if (!navigator.serial) {
            throw new Error('Web Serial API is not available. Use Chrome 89+ on desktop.');
        }
        const filters = options?.filters ?? SerialTransport.SIK_FILTERS;
        this.port = await navigator.serial.requestPort({ filters });
    }
    async reconnectKnownPort() {
        if (!navigator.serial)
            return false;
        const ports = await navigator.serial.getPorts();
        if (ports.length === 0)
            return false;
        this.port = ports[0];
        return true;
    }
    async open(options) {
        if (!this.port) {
            throw new Error('No port selected. Call requestPort() or reconnectKnownPort() first.');
        }
        await this.port.open({
            baudRate: options.baudRate,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            bufferSize: 65536,
        });
        this._isConnected = true;
        this.startReadLoop();
    }
    async close() {
        this._isConnected = false;
        if (this.reader) {
            try {
                await this.reader.cancel();
            }
            catch {
                /* ignore */
            }
            this.reader = null;
        }
        if (this.port) {
            try {
                await this.port.close();
            }
            catch {
                /* ignore */
            }
            this.port = null;
        }
        this.callbacks.onClose?.();
    }
    async write(data) {
        if (!this.port?.writable) {
            throw new Error('Port is not open for writing');
        }
        const writer = this.port.writable.getWriter();
        try {
            const bytes = typeof data === 'string'
                ? new TextEncoder().encode(data)
                : data;
            await writer.write(bytes);
        }
        finally {
            writer.releaseLock();
        }
    }
    async startReadLoop() {
        if (!this.port?.readable || this.readerLock)
            return;
        this.readerLock = true;
        this.reader = this.port.readable.getReader();
        try {
            const port = this.port;
            while (this._isConnected && port.readable) {
                const { value, done } = await this.reader.read();
                if (done)
                    break;
                if (value && value.length > 0) {
                    this.dataListeners.forEach((cb) => cb(value));
                    const text = new TextDecoder().decode(value);
                    this.callbacks.onData?.(text);
                    this.lineBuffer.push(text);
                }
            }
        }
        catch (err) {
            if (this._isConnected) {
                this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
            }
        }
        finally {
            this.reader?.releaseLock();
            this.reader = null;
            this.readerLock = false;
            if (this._isConnected) {
                this._isConnected = false;
                this.callbacks.onClose?.();
            }
        }
    }
}
/** Known SiK radio USB IDs (FTDI-based: Holybro, 3DR, etc.) */
SerialTransport.SIK_FILTERS = [
    { usbVendorId: 0x0403, usbProductId: 0x6015 },
];
//# sourceMappingURL=serial.js.map