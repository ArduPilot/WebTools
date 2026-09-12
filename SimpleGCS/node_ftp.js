#!/usr/bin/env node
// Fetch one file, optionally dropping a percentage of FTP replies for testing.
const WebSocket = require('ws');
const fs = require('node:fs');
const { mavlink20, MAVLink20Processor } = require('../modules/MAVLink/mavlink.js');
const { MAVFTP } = require('../modules/MAVLink/mavftp.js');

const [url, passphrase, path, output, loss = '0'] = process.argv.slice(2);
const lossPercent = Number(loss);
if (!url || passphrase === undefined || !path || !output || !Number.isFinite(lossPercent) || lossPercent < 0 || lossPercent > 100) {
    console.error('Usage: node node_ftp.js <ws-url> <passphrase> <remote-path> <output-file> [loss-percent]');
    process.exit(1);
}
const parser = new MAVLink20Processor(null, 100 + Math.floor(Math.random() * 101), 190);
if (passphrase) {
    parser.signing.secret_key = mavlink20.sha256(new TextEncoder().encode(passphrase));
    parser.signing.sign_outgoing = true;
}
const ws = new WebSocket(url);
const ftp = new MAVFTP(parser, ws);
let heartbeat;
let started = false;
let finished = false;
const timeout = setTimeout(() => finish(null, 'Download timed out'), 60000);

function finish(data, error) {
    if (finished) return;
    finished = true;
    clearInterval(heartbeat);
    clearTimeout(timeout);
    ftp.cancel();
    if (data !== null) {
        try {
            fs.writeFileSync(output, data);
            console.log(`Saved ${data.length} bytes to ${output}`);
        } catch (e) { error = e.message; }
    } else error ||= 'Failed to fetch file';
    if (error) { console.error(error); process.exitCode = 1; }
    ws.close();
}
function sendHeartbeat() {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(Uint8Array.from(new mavlink20.messages.heartbeat(6, 8, 0, 0, 4, 3).pack(parser)));
    parser.seq = (parser.seq + 1) & 255;
}
ws.on('open', () => { sendHeartbeat(); heartbeat = setInterval(sendHeartbeat, 1000); });
ws.on('message', data => {
    for (const msg of parser.parseBuffer(new Uint8Array(data)) || []) {
        if (msg._name === 'HEARTBEAT' && msg.autopilot === mavlink20.MAV_AUTOPILOT_ARDUPILOTMEGA && !started) {
            started = true;
            ftp.targetSystem = msg._header.srcSystem;
            ftp.targetComponent = msg._header.srcComponent;
            ftp.getFile(path, data => finish(data), {sizeIsEstimate:path.startsWith('@PARAM/'), fixedReadSize:path.startsWith('@PARAM/')});
        } else if (msg._name === 'FILE_TRANSFER_PROTOCOL' && Math.random() * 100 >= lossPercent) {
            ftp.handleMessage(msg);
        }
    }
});
ws.on('close', () => finish(null, 'Connection closed'));
ws.on('error', err => finish(null, err.message));
