// MAVLink FTP client with acknowledged downloads and uploads. Replies are correlated with the vehicle,
// session and request so delayed packets cannot complete a later transfer.
class MAVFTP {
    constructor(mavlink, ws) {
        this.MAVLink = mavlink;
        this.ws = ws;
        this.OP = { None: 0, TerminateSession: 1, ResetSessions: 2, ListDirectory: 3,
            OpenFileRO: 4, ReadFile: 5, CreateFile: 6, WriteFile: 7, RemoveFile: 8,
            CreateDirectory: 9, RemoveDirectory: 10, OpenFileWO: 11, TruncateFile: 12,
            Rename: 13, CalcFileCRC32: 14, BurstReadFile: 15, Ack: 128, Nack: 129 };
        this.ERR = { None: 0, Fail: 1, FailErrno: 2, InvalidDataSize: 3,
            InvalidSession: 4, NoSessionsAvailable: 5, EndOfFile: 6,
            UnknownCommand: 7, FileExists: 8, FileProtected: 9, FileNotFound: 10 };
        this.HDR_LEN = 12;
        this.MAX_PAYLOAD = 239;
        this.seq = 0;
        this.session = 0;
        this.targetSystem = 1;
        this.targetComponent = 1;
        this.burstSize = 80;
        this.openFileTimeout = 3000;
        this.burstReadTimeout = 3000;
        this.readGapTimeout = 1000;
        this.maxOpenRetries = 5;
        this.maxBurstRetries = 5;
        this.maxGapRetries = 20;
        this.maxConcurrentReads = 5;
        this.maxFileSize = 64 * 1024 * 1024;
        this.currentFile = null;
        this.callback = null;
        this.timeoutCheckInterval = null;
        this.pendingWrite = null;
        this.uploadBuffer = null;
        this.pendingOpenFile = null;
        this.pendingBurstRead = null;
        this.pendingReads = new Map();
        this.fileBuffer = null;
        this.readGaps = [];
    }

    packOp(seq, session, opcode, size, req_opcode, burst_complete, offset, payload) {
        if (!Number.isInteger(size) || size < 0 || size > this.MAX_PAYLOAD ||
            (payload && payload.length > this.MAX_PAYLOAD)) {
            throw new RangeError('Invalid FTP payload size');
        }
        const bytes = new Uint8Array(this.HDR_LEN + this.MAX_PAYLOAD);
        const view = new DataView(bytes.buffer);
        view.setUint16(0, seq, true);
        view.setUint8(2, session);
        view.setUint8(3, opcode);
        view.setUint8(4, size);
        view.setUint8(5, req_opcode);
        view.setUint8(6, burst_complete);
        view.setUint32(8, offset, true);
        if (payload) bytes.set(payload, this.HDR_LEN);
        return bytes;
    }

    parseOp(payload) {
        if (typeof payload === 'string') {
            payload = Uint8Array.from(payload, c => c.charCodeAt(0));
        } else if (Array.isArray(payload)) {
            payload = Uint8Array.from(payload, c => typeof c === 'string' ? c.charCodeAt(0) : c);
        }
        if (!(payload instanceof Uint8Array) || payload.length < this.HDR_LEN) return null;
        const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
        const size = view.getUint8(4);
        if (size > this.MAX_PAYLOAD || this.HDR_LEN + size > payload.length) return null;
        return { seq: view.getUint16(0, true), session: view.getUint8(2),
            opcode: view.getUint8(3), size, req_opcode: view.getUint8(5),
            burst_complete: view.getUint8(6), offset: view.getUint32(8, true),
            payload: payload.subarray(this.HDR_LEN, this.HDR_LEN + size) };
    }

    sendOp(opcode, size, req_opcode, burst_complete, offset, payload, seq = this.seq) {
        const packed = this.packOp(seq, this.session, opcode, size, req_opcode, burst_complete, offset, payload);
        const msg = new mavlink20.messages.file_transfer_protocol(0, this.targetSystem,
            this.targetComponent, Array.from(packed));
        this.ws.send(Uint8Array.from(msg.pack(this.MAVLink)));
        this.MAVLink.seq = (this.MAVLink.seq + 1) & 255;
        if (seq === this.seq) this.seq = (this.seq + 1) & 65535;
        return seq;
    }

    request(opcode, offset, size, payload = null) {
        const request = { opcode, offset, size, payload, seq: this.seq, retries: 0, sentTime: Date.now() };
        this.sendOp(opcode, size, 0, 0, offset, payload, request.seq);
        return request;
    }

    retry(request, timeout, maxRetries) {
        if (!request || Date.now() - request.sentTime < timeout) return true;
        if (request.retries >= maxRetries) {
            this.complete(null);
            return false;
        }
        request.retries++;
        request.sentTime = Date.now();
        this.sendOp(request.opcode, request.size, 0, 0, request.offset, request.payload, request.seq);
        return true;
    }

    checkTimeouts() {
        try {
            if (!this.retry(this.pendingWrite, this.openFileTimeout, this.maxOpenRetries)) return;
            if (!this.retry(this.pendingOpenFile, this.openFileTimeout, this.maxOpenRetries)) return;
            if (!this.retry(this.pendingBurstRead, this.burstReadTimeout, this.maxBurstRetries)) return;
            for (const request of this.pendingReads.values()) {
                if (!this.retry(request, this.readGapTimeout, this.maxGapRetries)) return;
            }
        } catch (e) {
            this.complete(null);
        }
    }

    getFile(filename, callback, options = {}) {
        this.cancel();
        const bytes = new TextEncoder().encode(filename);
        if (!bytes.length || bytes.length > this.MAX_PAYLOAD || bytes.includes(0)) {
            callback(null);
            return;
        }
        this.session = (this.session + 1) & 255;
        this.currentFile = filename;
        this.callback = callback;
        this.fileSize = 0;
        this.sizeIsEstimate = options.sizeIsEstimate === true;
        this.fixedReadSize = options.fixedReadSize === true;
        this.actualSize = null;
        this.highestReceivedOffset = 0;
        this.fileBuffer = null;
        this.readGaps = [];
        this.pendingReads.clear();
        try {
            this.pendingOpenFile = this.request(this.OP.OpenFileRO, 0, bytes.length, bytes);
            this.timeoutCheckInterval = setInterval(() => this.checkTimeouts(), 250);
        } catch (e) {
            this.complete(null);
        }
    }

    // Stop-and-wait writes retain their sequence on retry. Wait for the close
    // ACK too: virtual files such as @PARAM apply their contents on close.
    putFile(filename, data, callback) {
        this.cancel();
        const name = new TextEncoder().encode(filename);
        if (!name.length || name.length > this.MAX_PAYLOAD || name.includes(0) ||
            !(data instanceof Uint8Array) || data.length > this.maxFileSize) {
            callback(null);
            return;
        }
        this.session = (this.session + 1) & 255;
        this.currentFile = filename;
        this.callback = callback;
        this.uploadBuffer = data.slice();
        this.uploadOffset = 0;
        try {
            this.pendingWrite = this.request(this.OP.CreateFile, 0, name.length, name);
            this.timeoutCheckInterval = setInterval(() => this.checkTimeouts(), 250);
        } catch (e) { this.complete(null); }
    }

    handleWrite(op) {
        const request = this.pendingWrite;
        if (!request || op.req_opcode !== request.opcode ||
            op.seq !== ((request.seq + 1) & 65535)) return false;
        if (op.opcode === this.OP.Nack) { this.complete(null); return true; }
        if (op.offset !== request.offset) return false;
        if (request.opcode === this.OP.TerminateSession) {
            const size = this.uploadBuffer.length;
            this.currentFile = null; // Already closed; don't send another close.
            this.complete(size);
            return true;
        }
        if (request.opcode === this.OP.WriteFile) this.uploadOffset += request.size;
        if (this.uploadOffset === this.uploadBuffer.length) {
            this.pendingWrite = this.request(this.OP.TerminateSession, 0, 0);
        } else {
            const bytes = this.uploadBuffer.subarray(this.uploadOffset, this.uploadOffset + this.MAX_PAYLOAD);
            this.pendingWrite = this.request(this.OP.WriteFile, this.uploadOffset, bytes.length, bytes);
        }
        return true;
    }

    // Clear state before invoking callers, which may immediately start another file.
    complete(data) {
        const callback = this.callback;
        const active = this.currentFile !== null;
        this.callback = null;
        this.currentFile = null;
        clearInterval(this.timeoutCheckInterval);
        this.timeoutCheckInterval = null;
        this.pendingWrite = null;
        this.uploadBuffer = null;
        this.pendingOpenFile = this.pendingBurstRead = null;
        this.pendingReads.clear();
        this.fileBuffer = null;
        this.readGaps = [];
        if (active) {
            try { this.sendOp(this.OP.TerminateSession, 0, 0, 0, 0, null); } catch (e) { /* Link closed. */ }
        }
        if (callback) callback(data);
    }

    cancel() { this.complete(null); }
    terminateSession() { this.cancel(); }

    handleMessage(m) {
        if (this.currentFile === null || m?._name !== 'FILE_TRANSFER_PROTOCOL' ||
            m._header?.srcSystem !== this.targetSystem || m._header?.srcComponent !== this.targetComponent ||
            m.target_system !== this.MAVLink.srcSystem || m.target_component !== this.MAVLink.srcComponent) return false;
        const op = this.parseOp(m.payload);
        if (!op || op.session !== this.session || (op.opcode !== this.OP.Ack && op.opcode !== this.OP.Nack)) return false;
        try {
            if (this.uploadBuffer) return this.handleWrite(op);
            if (op.req_opcode === this.OP.OpenFileRO) {
                const request = this.pendingOpenFile;
                if (!request || op.seq !== ((request.seq + 1) & 65535)) return false;
                if (op.opcode === this.OP.Nack) { this.complete(null); return true; }
                if (op.size !== 4) return false;
                this.fileSize = new DataView(op.payload.buffer, op.payload.byteOffset, 4).getUint32(0, true);
                if (this.fileSize > this.maxFileSize) { this.complete(null); return true; }
                this.pendingOpenFile = null;
                this.fileBuffer = new Uint8Array(this.fileSize);
                if (!this.fileSize && !this.sizeIsEstimate) { this.complete(this.fileBuffer); return true; }
                this.readGaps = [{ offset: 0, length: this.fileSize }];
                this.pendingBurstRead = this.request(this.OP.BurstReadFile, 0, this.burstSize);
                return true;
            }
            if (!this.fileBuffer) return false;
            if (op.req_opcode === this.OP.BurstReadFile) {
                if (!this.pendingBurstRead) return false;
                if (op.opcode === this.OP.Nack) {
                    if (op.size !== 1 || op.payload[0] !== this.ERR.EndOfFile) {
                        this.complete(null);
                    } else {
                        if (this.sizeIsEstimate) {
                            // Virtual parameter files only advertise an estimate.
                            // The EOF offset bounds the file; still recover every
                            // missing byte below it before reporting completion.
                            if (op.offset < this.highestReceivedOffset || op.offset < this.pendingBurstRead.offset || op.offset > this.maxFileSize) return false;
                            this.actualSize = op.offset;
                            this.resizeFile(op.offset);
                        }
                        this.pendingBurstRead = null;
                        this.checkReadSend();
                    }
                    return true;
                }
                if (!this.storeData(op)) return false;
                if (!this.readGaps.length && (!this.sizeIsEstimate || this.actualSize !== null)) { this.complete(this.fileBuffer); return true; }
                this.pendingBurstRead.sentTime = Date.now();
                this.pendingBurstRead.retries = 0;
                const nextOffset = op.offset + op.size;
                if (op.burst_complete && nextOffset > this.pendingBurstRead.offset) {
                    if (nextOffset >= this.fileSize && !this.sizeIsEstimate) {
                        this.pendingBurstRead = null;
                        this.checkReadSend();
                    } else {
                        this.pendingBurstRead = this.request(this.OP.BurstReadFile, nextOffset, this.burstSize);
                    }
                }
                return true;
            }
            if (op.req_opcode === this.OP.ReadFile) {
                const seq = (op.seq - 1) & 65535;
                const request = this.pendingReads.get(seq);
                if (!request || op.offset !== request.offset) return false;
                if (op.opcode === this.OP.Nack) { this.complete(null); return true; }
                if (op.size > request.size || !this.storeData(op)) return false;
                this.pendingReads.delete(seq);
                if (!this.readGaps.length) this.complete(this.fileBuffer);
                else this.checkReadSend();
                return true;
            }
        } catch (e) {
            this.complete(null);
        }
        return false;
    }

    resizeFile(size) {
        const oldSize = this.fileSize;
        const buffer = new Uint8Array(size);
        buffer.set(this.fileBuffer.subarray(0, size));
        this.fileBuffer = buffer;
        this.fileSize = size;
        if (size > oldSize) this.readGaps.push({offset:oldSize,length:size-oldSize});
        else this.readGaps = this.readGaps.filter(g=>g.offset<size).map(g=>({offset:g.offset,length:Math.min(g.length,size-g.offset)}));
    }

    storeData(op) {
        const end = op.offset + op.size;
        if (!op.size || end > this.maxFileSize) return false;
        if (end > this.fileSize && this.sizeIsEstimate && this.actualSize === null) this.resizeFile(end);
        if (end > this.fileSize) return false;
        this.highestReceivedOffset = Math.max(this.highestReceivedOffset, end);
        this.fileBuffer.set(op.payload, op.offset);
        const missing = [];
        for (const gap of this.readGaps) {
            const gapEnd = gap.offset + gap.length;
            if (end <= gap.offset || op.offset >= gapEnd) missing.push(gap);
            else {
                if (gap.offset < op.offset) missing.push({ offset: gap.offset, length: op.offset - gap.offset });
                if (end < gapEnd) missing.push({ offset: end, length: gapEnd - end });
            }
        }
        this.readGaps = missing;
        return true;
    }

    checkReadSend() {
        if (!this.readGaps.length) { this.complete(this.fileBuffer); return; }
        for (const gap of this.readGaps) {
            const end = gap.offset + gap.length;
            for (let offset = gap.offset; offset < end;) {
                const pending = [...this.pendingReads.values()].find(r => offset >= r.offset && offset < r.offset + r.size);
                if (pending) { offset = pending.offset + pending.size; continue; }
                if (this.pendingReads.size >= this.maxConcurrentReads) return;
                const nextPending = [...this.pendingReads.values()].filter(r => r.offset > offset).map(r => r.offset);
                const size = this.fixedReadSize ? this.burstSize : Math.min(this.burstSize, end - offset, ...nextPending.map(o => o - offset));
                const request = this.request(this.OP.ReadFile, offset, size);
                this.pendingReads.set(request.seq, request);
                offset += size;
            }
        }
    }
}

// Mission data parser
class MissionParser {
    constructor() {
    }

    parseMissionItems(data) {
        if (!(data instanceof Uint8Array) || data.length < 10) return null;
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const magic = view.getUint16(0, true);
        const type = view.getUint16(2, true);
        const options = view.getUint16(4, true);
        const start = view.getUint16(6, true);
        const count = view.getUint16(8, true);
        if (magic !== 0x763d || type > 2 || options !== 0 || start !== 0 || data.length !== 10 + count * 38) return null;
        const items = [];
        for (let i = 0; i < count; i++) {
            const offset = 10 + i * 38;
            items.push(new mavlink20.messages.mission_item_int(
                view.getUint8(offset + 32), view.getUint8(offset + 33), view.getUint16(offset + 28, true),
                view.getUint8(offset + 34), view.getUint16(offset + 30, true),
                view.getUint8(offset + 35), view.getUint8(offset + 36),
                view.getFloat32(offset, true), view.getFloat32(offset + 4, true),
                view.getFloat32(offset + 8, true), view.getFloat32(offset + 12, true),
                view.getInt32(offset + 16, true), view.getInt32(offset + 20, true),
                view.getFloat32(offset + 24, true), view.getUint8(offset + 37)));
        }
        return items;
    }

    // parse as a set of fences
    parseFence(data) {
        try {
            var items = this.parseMissionItems(data);
            if (!items) return null;
            var fences = [];
            var idx = 0;
            while (idx < items.length) {
                var item = items[idx];
                const fitem = {};
                fitem.type = item.command;
                if (item.command === mavlink20.MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION ||
                    item.command === mavlink20.MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION) {
                    fitem.radius = item.param1;
                    fitem.lat = item.x / 1.0e7;
                    fitem.lng = item.y / 1.0e7;
                    idx++;
                } else if (item.command === mavlink20.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION ||
                           item.command === mavlink20.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION) {
                    const num_vertices = item.param1;
                    if (!Number.isInteger(num_vertices) || num_vertices < 3 || idx + num_vertices > items.length) return null;
                    fitem.vertices = [];
                    fitem.vertex_count = num_vertices;
                    for (var i = 0; i < num_vertices; i++) {
                        if (items[idx+i].command !== item.command || items[idx+i].param1 !== num_vertices) return null;
                        var lat = items[idx+i].x / 1.0e7;
                        var lng = items[idx+i].y / 1.0e7;
                        fitem.vertices.push({ lat, lng });
                    }
                    idx += num_vertices;
                } else {
                    idx++;
                    continue;
                }
                const points = fitem.vertices || [{ lat: fitem.lat, lng: fitem.lng }];
                if (points.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng) ||
                    Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)) return null;
                if (fitem.radius !== undefined && (!Number.isFinite(fitem.radius) || fitem.radius <= 0)) return null;
                fences.push(fitem);
            }
            return fences;
        } catch (e) {
            console.error("Error parsing fence data:", e);
            return null;
        }
    }

    // parse as a mission
    parseMission(data) {
	    try {
	        return this.parseMissionItems(data);
	    } catch (e) {
	        console.error("Error parsing mission data:", e);
	        return null;
	    }
    }
}

// Export for use in main app
if (typeof window !== 'undefined') {
    window.MAVFTP = MAVFTP;
    window.MissionParser = MissionParser;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { MAVFTP, MissionParser };
