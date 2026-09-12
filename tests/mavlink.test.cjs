const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { mavlink20: mav, MAVLink20Processor: Processor } = require('../modules/MAVLink/mavlink.js');
const fixtures = require('./fixtures/mavlink.json');

function parser() { const p = new Processor(null, 42, 1); p.seq = 17; return p; }
function normalize(value) {
    if (typeof value === 'string') return value.replace(/\0+$/, '');
    if (Array.isArray(value)) return value.map(v => typeof v === 'string' ? v.charCodeAt(0) : v);
    return value;
}
for (const fixture of fixtures.messages) {
    test(`${fixture.name}: encode matches pymavlink and decode handles fragmented input`, () => {
        const Constructor = mav.messages[fixture.name];
        const fields = new Constructor().fieldnames;
        const message = new Constructor(...fields.map(name => name === 'time_usec' ?
            [fixture.fields[name] >>> 0, Math.floor(fixture.fields[name] / 2 ** 32)] : fixture.fields[name]));
        const packet = Uint8Array.from(message.pack(parser()));
        assert.equal(Buffer.from(packet).toString('hex'), fixture.hex);
        const p = parser();
        let decoded;
        for (const byte of packet) { const m = p.parseChar(byte); if (m) decoded = m; }
        assert.equal(decoded._name, fixture.name.toUpperCase());
        assert.equal(decoded._header.srcSystem, 42);
        assert.equal(decoded._header.srcComponent, 1);
        for (const name of fields) {
            const expected = fixture.fields[name];
            const actual = Array.isArray(expected) && typeof decoded[name] === "string" ? Array.from(decoded[name], c => c.charCodeAt(0)) : normalize(decoded[name]);
            if (name === 'time_usec') {
                // jspack represents uint64 as [low, high, unsigned].
                assert.equal(BigInt(actual[0]) + (BigInt(actual[1]) << 32n), BigInt(expected));
            } else if (typeof expected === 'number') {
                assert.ok(Math.abs(actual - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-6), `${name}: ${actual} != ${expected}`);
            } else if (expected !== undefined) assert.deepEqual(actual, expected, name);
        }
    });
}

test('SHA256 and MAVLink signatures match the independent crypto implementation', () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 239, 1024]) {
        const input = Uint8Array.from({length}, (_, i) => i & 255);
        assert.deepEqual(Buffer.from(mav.sha256(input)), crypto.createHash('sha256').update(input).digest());
    }
    const key = Uint8Array.from({length: 32}, (_, i) => i);
    const packet = Buffer.from(fixtures.messages[0].hex, 'hex');
    assert.deepEqual(Buffer.from(mav.create_signature(key, packet)), crypto.createHash('sha256').update(key).update(packet).digest().subarray(0, 6));
});

test('signed packet bytes, timestamp, link ID and signature match pymavlink', () => {
    const p = parser();
    p.signing.secret_key = Uint8Array.from({length:32}, (_,i)=>i);
    p.signing.timestamp = 1000000000000;
    p.signing.link_id = 7;
    p.signing.sign_outgoing = true;
    const m = new mav.messages.heartbeat(11,3,137,5,4,3);
    assert.equal(Buffer.from(m.pack(p)).toString('hex'), fixtures.signed);
    const rx = parser(); rx.signing.secret_key = p.signing.secret_key; rx.signing.timestamp = 0;
    const decoded = rx.decode(Buffer.from(fixtures.signed, 'hex'));
    assert.equal(decoded._name, 'HEARTBEAT');
    assert.equal(decoded._link_id, 7);
    assert.throws(()=>rx.decode(Buffer.from(fixtures.signed,'hex')), /signature/);
    // A newer valid packet advances the stream's replay watermark too.
    const next = m.pack(p); rx.decode(next);
    assert.throws(()=>rx.decode(next), /signature/);
});

test('invalid signatures cannot poison a new stream timestamp', () => {
    const rx = parser(); rx.signing.secret_key = Uint8Array.from({length:32},(_,i)=>i); rx.signing.timestamp = 0;
    const packet = Buffer.from(fixtures.signed, 'hex');
    const forged = Buffer.from(packet); forged[forged.length - 7] ^= 1;
    assert.throws(()=>rx.decode(forged), /signature/);
    assert.equal(Object.keys(rx.signing.stream_timestamps).length, 0);
    assert.equal(rx.decode(packet)._name, 'HEARTBEAT');
    assert.throws(()=>rx.decode(Buffer.from(fixtures.messages[0].hex,'hex')), /signature/);
});

test('MAVLink1, coalesced frames, noise and bad CRC recover to the next frame', () => {
    const p = parser();
    const packet = Buffer.from(fixtures.messages[0].hex,'hex');
    assert.equal(p.decode(Buffer.from(fixtures.v1,'hex'))._name,'HEARTBEAT');
    assert.equal(p.parseBuffer(Buffer.from(fixtures.v1,'hex'))[0]._name,'HEARTBEAT');
    const bad = Buffer.from(packet); bad[10] ^= 1;
    const data = Buffer.concat([Buffer.from([1,2,3]), packet, bad, packet]);
    const messages = p.parseBuffer(data);
    assert.deepEqual(messages.map(m=>m._name), ['BAD_DATA','HEARTBEAT','BAD_DATA','HEARTBEAT']);
    assert.match(messages[2]._reason, /CRC/);
    assert.equal(p.parseChar(null),null);
});

test('unknown incompatibility flags and malformed packets are rejected', () => {
    const packet = Buffer.from(fixtures.messages[0].hex,'hex'); packet[2] = 2;
    assert.throws(()=>parser().decode(packet), /incompatibility/);
    assert.throws(()=>parser().decode(packet.subarray(0,5)));
});

test('a short MAVLink1 packet is parsed without waiting for a MAVLink2 header', () => {
    // MISSION_CLEAR_ALL has a two-byte MAVLink1 payload.
    const bytes=[254,2,17,42,1,45,255,190];
    const crc=mav.x25Crc([232],mav.x25Crc(bytes.slice(1)));
    bytes.push(crc&255,crc>>8);
    const decoded=parser().parseBuffer(Uint8Array.from(bytes));
    assert.equal(decoded[0]._name,'MISSION_CLEAR_ALL');assert.equal(decoded[0].target_system,255);
});
