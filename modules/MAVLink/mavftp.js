// MAVLink FTP implementation for fetching fence data
// Based on MAVProxy's mavproxy_ftp.py

class MAVFTP {
    constructor(mavlink, ws) {
	this.MAVLink = mavlink;
	this.ws = ws;
	
	// Operation codes
	this.OP = {
	    None: 0,
	    TerminateSession: 1,
	    ResetSessions: 2,
	    ListDirectory: 3,
	    OpenFileRO: 4,
	    ReadFile: 5,
	    CreateFile: 6,
	    WriteFile: 7,
	    RemoveFile: 8,
	    CreateDirectory: 9,
	    RemoveDirectory: 10,
	    OpenFileWO: 11,
	    TruncateFile: 12,
	    Rename: 13,
	    CalcFileCRC32: 14,
	    BurstReadFile: 15,
	    Ack: 128,
	    Nack: 129
	};
	
	// Error codes
	this.ERR = {
	    None: 0,
	    Fail: 1,
	    FailErrno: 2,
	    InvalidDataSize: 3,
	    InvalidSession: 4,
	    NoSessionsAvailable: 5,
	    EndOfFile: 6,
	    UnknownCommand: 7,
	    FileExists: 8,
	    FileProtected: 9,
	    FileNotFound: 10
	};
	
	// FTP state
	this.seq = 0;
	this.session = 0;
	this.targetSystem = 1;
	this.targetComponent = 1;
	
	// File transfer state
	this.currentFile = null;
	this.fileBuffer = null;
	this.readGaps = [];
	this.reachedEOF = false;
	this.burstSize = 80;
	this.lastOp = null;
	this.opStartTime = null;
	this.callback = null;
	
	this.HDR_LEN = 12;
	this.MAX_PAYLOAD = 239;
    }
    
    // Pack FTP operation into bytes
    packOp(seq, session, opcode, size, req_opcode, burst_complete, offset, payload) {
	const buffer = new ArrayBuffer(this.HDR_LEN + this.MAX_PAYLOAD);
	const view = new DataView(buffer);
	
	// Header: seq(u16), session(u8), opcode(u8), size(u8), req_opcode(u8), burst_complete(u8), pad(u8), offset(u32)
	view.setUint16(0, seq, true);
	view.setUint8(2, session);
	view.setUint8(3, opcode);
	view.setUint8(4, size);
	view.setUint8(5, req_opcode);
	view.setUint8(6, burst_complete);
	view.setUint8(7, 0); // pad
	view.setUint32(8, offset, true);
	
	// Payload
	if (payload) {
	    const payloadBytes = new Uint8Array(buffer, 12);
	    for (let i = 0; i < Math.min(payload.length, this.MAX_PAYLOAD); i++) {
		payloadBytes[i] = payload[i];
	    }
	}
	
	return new Uint8Array(buffer);
    }
    
    // Parse FTP operation from FILE_TRANSFER_PROTOCOL message
    parseOp(payload) {
	// Convert payload to Uint8Array if it's not already
	// Handle case where payload is a plain array or array-like object
	if (!(payload instanceof Uint8Array)) {
	    payload = new Uint8Array([...payload].map((c) => c.charCodeAt(0)));
	}
	
	// Ensure we have at least the header
	if (payload.length < this.HDR_LEN) {
	    console.error(`FTP: Payload too short (${payload.length} bytes)`);
	    return null;
	}
	
	const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
	
	const op = {
	    seq: view.getUint16(0, true),
	    session: view.getUint8(2),
	    opcode: view.getUint8(3),
	    size: view.getUint8(4),
	    req_opcode: view.getUint8(5),
	    burst_complete: view.getUint8(6),
	    offset: view.getUint32(8, true),
	    payload: null
	};
	
	// Extract payload if present and size > 0
	if (op.size > 0 && payload.length > this.HDR_LEN) {
	    const payloadStart = this.HDR_LEN;
	    const payloadLength = Math.min(op.size, payload.length - this.HDR_LEN);
	    op.payload = new Uint8Array(payload.buffer, payload.byteOffset + payloadStart, payloadLength);
	}
	
	return op;
    }
    
    // Send FTP operation
    sendOp(opcode, size, req_opcode, burst_complete, offset, payload) {
	const packedOp = this.packOp(this.seq, this.session, opcode, size, req_opcode, burst_complete, offset, payload);
	
	// Send via FILE_TRANSFER_PROTOCOL message
	const msg = new mavlink20.messages.file_transfer_protocol(
	    0, // network (0 for Mavlink 2.0)
	    this.targetSystem,
	    this.targetComponent,
	    Array.from(packedOp)
	);
	
	const pkt = msg.pack(this.MAVLink);
	this.ws.send(Uint8Array.from(pkt));
	
	this.lastOp = { opcode, size, req_opcode, burst_complete, offset, payload };
	
	console.log(`FTP: Sent op ${opcode} (${this.getOpName(opcode)}) seq=${this.seq} session=${this.session} offset=${offset}`);
	this.seq = (this.seq + 1) % 256;
    }
    
    // Helper to get operation name for debugging
    getOpName(opcode) {
	for (let [name, code] of Object.entries(this.OP)) {
	    if (code === opcode) return name;
	}
	return `Unknown(${opcode})`;
    }
    
    // Terminate current session
    terminateSession() {
	this.sendOp(this.OP.TerminateSession, 0, 0, 0, 0, null);
	this.session = (this.session + 1) % 256;
	this.currentFile = null;
	this.fileBuffer = null;
	this.readGaps = [];
	this.reachedEOF = false;
	console.log("FTP: Session terminated");
    }
    
    // Get file from vehicle
    getFile(filename, callback) {
	console.log(`FTP: Getting file ${filename}`);
	
	this.terminateSession();
	this.callback = callback;
	this.currentFile = filename;
	this.fileBuffer = new Uint8Array(0);
	this.readGaps = [];
	this.reachedEOF = false;
	this.opStartTime = Date.now();
	
	// Encode filename
	const encoder = new TextEncoder();
	const filenameBytes = encoder.encode(filename);
	
	// Send OpenFileRO
	this.sendOp(this.OP.OpenFileRO, filenameBytes.length, 0, 0, 0, filenameBytes);
    }
    
    // Handle incoming FILE_TRANSFER_PROTOCOL message
    handleMessage(m) {
	if (m._name !== "FILE_TRANSFER_PROTOCOL") return;
	if (m.target_system !== this.MAVLink.srcSystem || m.target_component !== this.MAVLink.srcComponent) return;
	
	// m.payload is already a Uint8Array, pass it directly
	const op = this.parseOp(m.payload);
	if (!op) {
	    console.error("FTP: Failed to parse operation");
	    return;
	}
	
	console.log(`FTP: Received ${this.getOpName(op.opcode)} for req=${this.getOpName(op.req_opcode)} size=${op.size} offset=${op.offset} seq=${op.seq}`);
	
	// Handle different response types
	if (op.req_opcode === this.OP.OpenFileRO) {
	    this.handleOpenResponse(op);
	} else if (op.req_opcode === this.OP.BurstReadFile) {
	    this.handleBurstReadResponse(op);
	} else if (op.req_opcode === this.OP.ReadFile) {
	    this.handleReadResponse(op);
	} else if (op.req_opcode === this.OP.TerminateSession) {
	    console.log("FTP: Session terminated ACK");
	} else {
	    console.log(`FTP: Unhandled response for ${this.getOpName(op.req_opcode)}`);
	}
    }
    
    // Handle OpenFileRO response
    handleOpenResponse(op) {
	if (op.opcode === this.OP.Ack) {
	    console.log("FTP: File opened, starting burst read");
	    // Start burst read from offset 0
	    this.sendOp(this.OP.BurstReadFile, this.burstSize, 0, 0, 0, null);
	} else if (op.opcode === this.OP.Nack) {
	    console.error("FTP: Failed to open file - NACK received");
	    if (this.callback) this.callback(null);
	    this.terminateSession();
	} else {
	    console.error(`FTP: Unexpected response to OpenFileRO: opcode ${op.opcode}`);
	}
    }
    
    // Handle BurstReadFile response
    handleBurstReadResponse(op) {
	if (op.opcode === this.OP.Ack && op.payload) {
	    if (!this.fileBuffer) {
		return;
	    }
	    // Expand buffer if needed
	    const newSize = op.offset + op.size;
	    if (newSize > this.fileBuffer.length) {
		const newBuffer = new Uint8Array(newSize);
		newBuffer.set(this.fileBuffer);
		this.fileBuffer = newBuffer;
	    }
	    
	    // Write data at offset
	    this.fileBuffer.set(op.payload, op.offset);
	    
	    console.log(`FTP: Read ${op.size} bytes at offset ${op.offset}`);
	    
	    // Check if we need to continue
	    if (op.burst_complete) {
		if (op.size > 0 && op.size < this.burstSize) {
		    // EOF reached
		    this.reachedEOF = true;
		    this.finishTransfer();
		} else {
		    // Continue reading
		    const nextOffset = op.offset + op.size;
		    this.sendOp(this.OP.BurstReadFile, this.burstSize, 0, 0, nextOffset, null);
		}
	    }
	} else if (op.opcode === this.OP.Nack) {
	    const errorCode = op.payload ? op.payload[0] : 0;
	    if (errorCode === this.ERR.EndOfFile || errorCode === 0) {
		console.log("FTP: EOF reached");
		this.reachedEOF = true;
		this.finishTransfer();
	    } else {
		console.error(`FTP: Read failed with error ${errorCode}`);
		if (this.callback) this.callback(null);
		this.terminateSession();
	    }
	}
    }
    
    // Handle ReadFile response (for gap filling)
    handleReadResponse(op) {
	if (op.opcode === this.OP.Ack && op.payload) {
	    // Fill gap
	    this.fileBuffer.set(op.payload, op.offset);
	    
	    // Remove from gaps list
	    this.readGaps = this.readGaps.filter(g => g.offset !== op.offset);
	    
	    console.log(`FTP: Filled gap at ${op.offset}, ${this.readGaps.length} gaps remaining`);
	    
	    if (this.readGaps.length === 0 && this.reachedEOF) {
		this.finishTransfer();
	    }
	}
    }
    
    // Finish file transfer
    finishTransfer() {
	if (!this.fileBuffer) {
	    return;
	}
	const dt = (Date.now() - this.opStartTime) / 1000;
	const size = this.fileBuffer.length;
	const rate = (size / dt) / 1024;
	
	console.log(`FTP: Transfer complete - ${size} bytes in ${dt.toFixed(2)}s (${rate.toFixed(1)} KB/s)`);
	
	if (this.callback) {
	    this.callback(this.fileBuffer);
	}
	
	this.terminateSession();
    }
}

// Fence data parser
class FenceParser {
    constructor() {
    }

    parseMissionItems(data) {
	var header = data.buffer.slice(0,10);
	var hdr = jspack.Unpack("<HHHHH", new Uint8Array(header));
	const magic = hdr[0];
	if (magic !== 0x763d) {
	    console.error(`Invalid mission magic: 0x${magic.toString(16)}`);
	    return null;
	}
	const data_type = hdr[1];
	const options = hdr[2];
	const start = hdr[3];
	const count = hdr[4];

	console.log(`MissionItems: count=${count}`);

	var items = [];

	// Read each fence item
	for (let i = 0; i < count; i++) {

	    const item_len = 38;
	    var buf = data.buffer.slice(10+i*item_len, 10+(i+1)*item_len);
	    var a = jspack.Unpack('<ffffiifHHBBBBBB', new Uint8Array(buf));
	    var param1 = a[0];
	    var param2 = a[1];
	    var param3 = a[2];
	    var param4 = a[3];
	    var x = a[4];
	    var y = a[5];
	    var z = a[6];
	    var seq = a[7];
	    var command = a[8];
	    var target_system = a[9];
	    var target_component = a[10];
	    var frame = a[11];
	    var current = a[12];
	    var autocontinue = a[13];
	    var mission_type = a[14];
	    const msg = new mavlink20.messages.mission_item_int(target_system, target_component, seq,
								frame, command, current, autocontinue,
								param1, param2, param3, param4,
								x, y, z, mission_type);
	    items.push(msg);
	}
	return items;
    }
    
    parse(data) {
	try {
	    var items = this.parseMissionItems(data);
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
		    fitem.vertices = [];
		    fitem.vertex_count = num_vertices;
		    for (var i = 0; i < num_vertices; i++) {
			var lat = items[idx+i].x / 1.0e7;
			var lng = items[idx+i].y / 1.0e7;
			fitem.vertices.push({ lat, lng });
		    }
		    idx += num_vertices;
		} else {
		    idx++;
		}
		fences.push(fitem);
	    }
	    return fences;
	} catch (e) {
	    console.error("Error parsing fence data:", e);
	    return null;
	}
    }
}

// Export for use in main app
window.MAVFTP = MAVFTP;
window.FenceParser = FenceParser;
