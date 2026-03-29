/**
 * SiK bootloader flashing client (Web Serial)
 */
const INSYNC = 0x12;
const OK = 0x10;
const EOC = 0x20;
const GET_SYNC = 0x21;
const GET_DEVICE = 0x22;
const CHIP_ERASE = 0x23;
const LOAD_ADDRESS = 0x24;
const PROG_MULTI = 0x27;
const READ_MULTI = 0x28;
const REBOOT = 0x30;
const PROG_MULTI_MAX = 32;
const READ_MULTI_MAX = 128;
export class BootloaderClient {
    constructor(transport, onLog) {
        this.byteQueue = [];
        this.unsubData = null;
        this.transport = transport;
        this.onLog = onLog;
        if (!transport.addDataListener) {
            throw new Error('Transport does not support raw data listener');
        }
        this.unsubData = transport.addDataListener((data) => {
            for (const b of data)
                this.byteQueue.push(b);
        });
    }
    dispose() {
        this.unsubData?.();
        this.unsubData = null;
    }
    log(msg) {
        this.onLog?.(msg);
    }
    clearRx() {
        this.byteQueue = [];
    }
    async writeBytes(bytes) {
        await this.transport.write(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    }
    async readByte(timeoutMs = 3000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (this.byteQueue.length > 0) {
                return this.byteQueue.shift();
            }
            await new Promise((r) => setTimeout(r, 5));
        }
        throw new Error('Timeout waiting for bootloader data');
    }
    async getSync(timeoutMs = 3000) {
        const a = await this.readByte(timeoutMs);
        const b = await this.readByte(timeoutMs);
        return a === INSYNC && b === OK;
    }
    async sync(retries = 3) {
        for (let i = 0; i < retries; i++) {
            this.clearRx();
            // Send NOP stream like official uploader and request sync.
            await this.writeBytes(new Uint8Array(PROG_MULTI_MAX + 2));
            await this.writeBytes([GET_SYNC, EOC]);
            try {
                if (await this.getSync(1000)) {
                    this.log('Bootloader sync OK');
                    return true;
                }
            }
            catch {
                // retry
            }
            await new Promise((r) => setTimeout(r, 100));
        }
        return false;
    }
    async identify() {
        await this.writeBytes([GET_DEVICE, EOC]);
        const boardId = await this.readByte();
        const boardFreq = await this.readByte();
        const ok = await this.getSync();
        if (!ok)
            throw new Error('Bootloader identify failed');
        this.log(`Board ID=0x${boardId.toString(16)} FREQ=0x${boardFreq.toString(16)}`);
        return { boardId, boardFreq };
    }
    async erase() {
        await this.writeBytes([CHIP_ERASE, EOC]);
        const ok = await this.getSync(10000);
        if (!ok)
            throw new Error('Erase failed');
    }
    async loadAddress(address, useBanking) {
        if (useBanking) {
            await this.writeBytes([
                LOAD_ADDRESS,
                address & 0xff,
                (address >> 8) & 0xff,
                (address >> 16) & 0xff,
                EOC,
            ]);
        }
        else {
            await this.writeBytes([LOAD_ADDRESS, address & 0xff, (address >> 8) & 0xff, EOC]);
        }
        const ok = await this.getSync();
        if (!ok)
            throw new Error(`LOAD_ADDRESS failed at 0x${address.toString(16)}`);
    }
    async programChunk(data) {
        await this.writeBytes([PROG_MULTI, data.length]);
        await this.writeBytes(data);
        await this.writeBytes([EOC]);
        const ok = await this.getSync();
        if (!ok)
            throw new Error('PROG_MULTI failed');
    }
    async verifyChunk(data) {
        await this.writeBytes([READ_MULTI, data.length, EOC]);
        for (let i = 0; i < data.length; i++) {
            const b = await this.readByte();
            if (b !== data[i]) {
                throw new Error(`Verify mismatch at chunk byte ${i}`);
            }
        }
        const ok = await this.getSync();
        if (!ok)
            throw new Error('READ_MULTI sync failed');
    }
    *split(data, max) {
        for (let i = 0; i < data.length; i += max) {
            yield data.slice(i, i + max);
        }
    }
    async flash(fw, opts) {
        const verify = opts?.verify ?? true;
        const onProgress = opts?.onProgress;
        onProgress?.({ phase: 'erase', completed: 0, total: fw.totalBytes });
        await this.erase();
        let completed = 0;
        onProgress?.({ phase: 'program', completed, total: fw.totalBytes });
        for (const seg of fw.segments) {
            await this.loadAddress(seg.address, fw.usesBanking);
            for (const chunk of this.split(seg.data, PROG_MULTI_MAX)) {
                await this.programChunk(chunk);
                completed += chunk.length;
                onProgress?.({ phase: 'program', completed, total: fw.totalBytes });
            }
        }
        if (verify) {
            completed = 0;
            onProgress?.({ phase: 'verify', completed, total: fw.totalBytes });
            for (const seg of fw.segments) {
                await this.loadAddress(seg.address, fw.usesBanking);
                for (const chunk of this.split(seg.data, READ_MULTI_MAX)) {
                    await this.verifyChunk(chunk);
                    completed += chunk.length;
                    onProgress?.({ phase: 'verify', completed, total: fw.totalBytes });
                }
            }
        }
        await this.writeBytes([REBOOT]);
        onProgress?.({ phase: 'reboot', completed: fw.totalBytes, total: fw.totalBytes });
    }
}
//# sourceMappingURL=bootloader-client.js.map