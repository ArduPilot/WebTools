//!/usr/bin/env node

const WebSocket = require('ws');

global.jspack = new (require('../modules/MAVLink/local_modules/jspack/jspack.js')).default;

const mavlib = require('../modules/MAVLink/mavlink.js');  // Use local MAVLink definition

if (process.argv.length < 3) {
    console.error("Usage: node ws_mavlink.js <WebSocket URL>");
    process.exit(1);
}

//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const url = process.argv[2];
const ws = new WebSocket(url);
ws.binaryType = "arraybuffer";

// Create a MAVLink v2 parser
parser = new MAVLink20Processor()

let signing_passphrase = null;
if (process.argv.length > 3) {
    signing_passphrase = process.argv[3];
}

const crypto = require('crypto');

function passphrase_to_key(passphrase) {
    return crypto.createHash('sha256').update(Buffer.from(passphrase, 'ascii')).digest();
}

if (signing_passphrase) {
    parser.signing.secret_key = passphrase_to_key(signing_passphrase);
    parser.signing.sign_outgoing = true;
}

let heartbeat_interval;

ws.on('open', () => {
    console.log(`Connected to ${url}`);

    heartbeat_interval = setInterval(() => {
	try {
            const msg = new mavlib.mavlink20.messages.heartbeat(
		6,  // MAV_TYPE_GCS
		8,  // MAV_AUTOPILOT_INVALID
		0,  // base_mode
		0,  // custom_mode
		4   // MAV_STATE_ACTIVE
            );
	    const pkt = msg.pack(parser);
	    ws.send(pkt);
            console.log("Sent HEARTBEAT");
	} catch (e) {
	    console.error("Error sending HEARTBEAT:", e.message);
	    console.error(e.stack);
	}
    }, 1000);
});

function mav_pretty(msg) {
    // console.log(JSON.stringify(msg, null, 2));

    if (!msg || !msg._name || !msg.fieldnames) {
        return "<invalid MAVLink message>";
    }

    const name = msg._name;
    const fields = msg.fieldnames
        .map(fn => {
            let val = msg[fn];
            if (typeof val === "string") {
                val = `"${val}"`;
            } else if (Array.isArray(val)) {
                val = "[" + val.join(", ") + "]";
            }
            return `${fn}=${val}`;
        })
        .join(", ");

    return `${name} { ${fields} }`;
}


ws.on('message', (data) => {
    const buf = (data instanceof ArrayBuffer) ? Buffer.from(data) :
                (Buffer.isBuffer(data) ? data : Buffer.from(data.buffer || data));

    console.log(`Received ${buf.length} bytes: [${buf.slice(0, 10).toString('hex')}...]`);

    for (const b of buf) {
        try {
	    const msg = parser.parseChar(b);
            if (msg) {
                console.log(`MAVLink message ID: ${msg._id}`);
		console.log(mav_pretty(msg));
	    }
        } catch (e) {
            console.warn(`Parser error on byte 0x${byte.toString(16)}: ${e.message}`);
        }
    }
});

ws.on('close', () => {
    console.log("WebSocket closed");
    clearInterval(heartbeat_interval);
});

ws.on('error', (err) => {
    console.error("WebSocket error:", err.message);
});
