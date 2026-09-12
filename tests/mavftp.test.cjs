const test = require('node:test');
const assert = require('node:assert/strict');
const { mavlink20: mav, MAVLink20Processor: Processor } = require('../modules/MAVLink/mavlink.js');
const { MAVFTP, MissionParser } = require('../modules/MAVLink/mavftp.js');

function harness(t) {
    t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 1000 });
    const client = new Processor(null, 255, 190);
    const server = new Processor(null, 42, 1);
    const sent = [];
    const ftp = new MAVFTP(client, {send(bytes) {
        const m = server.decode(bytes);
        const op = ftp.parseOp(m.payload);
        sent.push(op);
    }});
    ftp.targetSystem = 42;
    ftp.targetComponent = 1;
    function reply(request, payload = [], opts = {}) {
        const bytes = Uint8Array.from(payload);
        const body = ftp.packOp((request.seq + 1) & 65535, request.session,
            opts.nack ? ftp.OP.Nack : ftp.OP.Ack, bytes.length, request.opcode,
            opts.complete ?? 0, opts.offset ?? request.offset, bytes);
        const msg = new mav.messages.file_transfer_protocol(0,255,190,Array.from(body));
        const decoded = client.decode(Uint8Array.from(msg.pack(server)));
        return ftp.handleMessage(decoded);
    }
    function open(size, callback) {
        ftp.getFile('test.bin', callback);
        const request = sent.shift();
        const bytes = Buffer.alloc(4); bytes.writeUInt32LE(size);
        reply(request, bytes);
        return sent.shift();
    }
    t.after(()=>ftp.cancel());
    return {ftp, sent, reply, open, client, server};
}

for (const size of [0,1,80,160,239,240,2048]) {
    test(`download ${size} bytes exactly, including zero padding`, t => {
        const h = harness(t); const data = Uint8Array.from({length:size},(_,i)=>i & 255);
        let result; let calls = 0;
        let request = h.open(size,d=>{result=d;calls++});
        while (request && request.opcode !== h.ftp.OP.TerminateSession) {
            for (let offset=request.offset; offset<size; offset+=80) {
                h.reply(request,data.subarray(offset,offset+80),{offset,complete:offset+80>=size?1:0});
            }
            request = h.sent.shift();
        }
        assert.deepEqual(result,data); assert.equal(calls,1);
        assert.equal(h.ftp.timeoutCheckInterval,null);
    });
}

test('EOF cannot truncate a missing final burst packet', t => {
    const h=harness(t); const expected=Uint8Array.from({length:160},(_,i)=>i);
    let result; const req=h.open(160,d=>result=d);
    h.reply(req,expected.subarray(0,80),{offset:0});
    h.reply(req,[h.ftp.ERR.EndOfFile],{offset:160,nack:true});
    assert.equal(result,undefined);
    const gap=h.sent.shift(); assert.equal(gap.opcode,h.ftp.OP.ReadFile); assert.equal(gap.offset,80);
    h.reply(gap,expected.subarray(80)); assert.deepEqual(result,expected);
});

test('out-of-order and duplicate bursts fill missing intervals without duplicate gaps', t => {
    const h=harness(t);const expected=Uint8Array.from({length:400},(_,i)=>i & 255);let result;
    const req=h.open(400,d=>result=d);
    h.reply(req,expected.subarray(160,240),{offset:160});
    h.reply(req,expected.subarray(160,240),{offset:160});
    h.reply(req,expected.subarray(0,80),{offset:0});
    h.reply(req,expected.subarray(320),{offset:320,complete:1});
    assert.deepEqual(h.sent.map(r=>r.offset),[80,240]);
    for(const gap of h.sent.splice(0))h.reply(gap,expected.subarray(gap.offset,gap.offset+gap.size));
    assert.deepEqual(result,expected);
});

test('short gap replies leave only the missing suffix to request', t => {
    const h=harness(t);let result;const req=h.open(80,d=>result=d);
    h.reply(req,[6],{nack:true,offset:80});const gap=h.sent.shift();
    h.reply(gap,new Uint8Array(30));const rest=h.sent.shift();
    assert.equal(rest.offset,30);assert.equal(rest.size,50);
    h.reply(rest,new Uint8Array(50));assert.equal(result.length,80);
});

test('open and burst retries keep the same sequence and wait a full timeout', t => {
    const h=harness(t);h.ftp.getFile('file',()=>{});const open=h.sent.shift();
    t.mock.timers.tick(3000);const retry=h.sent.shift();assert.equal(retry.seq,open.seq);assert.equal(retry.session,open.session);
    const size=Buffer.alloc(4);size.writeUInt32LE(80);h.reply(retry,size);const burst=h.sent.shift();
    t.mock.timers.tick(3000);const burstRetry=h.sent.shift();assert.equal(burstRetry.seq,burst.seq);
    t.mock.timers.tick(250);assert.equal(h.sent.length,0);
});

test('gap recovery keeps at most five reads in flight and retries dropped replies', t => {
    const h=harness(t);const data=Uint8Array.from({length:900},(_,i)=>i & 255);let result;
    const burst=h.open(data.length,d=>result=d);h.reply(burst,[6],{nack:true,offset:900});
    assert.equal(h.sent.length,5);const dropped=h.sent.shift();
    let count=0;
    while(h.sent.length && count++<30){const r=h.sent.shift();if(r.opcode===5)h.reply(r,data.subarray(r.offset,r.offset+r.size));assert.ok(h.ftp.pendingReads.size<=5)}
    assert.equal(result,undefined);t.mock.timers.tick(1000);
    const retry=h.sent.shift();assert.equal(retry.seq,dropped.seq);h.reply(retry,data.subarray(retry.offset,retry.offset+retry.size));
    assert.deepEqual(result,data);
});

test('timeouts finish once and clear timers before a callback starts the next file', t => {
    const h=harness(t);let calls=0;h.ftp.maxOpenRetries=0;
    h.ftp.getFile('first',d=>{assert.equal(d,null);calls++;h.ftp.getFile('second',()=>{})});
    t.mock.timers.tick(3000);assert.equal(calls,1);assert.equal(h.ftp.currentFile,'second');assert.ok(h.ftp.pendingOpenFile);
});

test('completion is reentrant and stale replies cannot alter the next transfer', t => {
    const h=harness(t);let result;const burst=h.open(1,()=>h.ftp.getFile('second',d=>result=d));
    h.reply(burst,[7],{complete:1});const newSession=h.ftp.session;
    assert.equal(h.ftp.currentFile,'second');assert.notEqual(newSession,burst.session);
    assert.equal(h.reply(burst,[9],{complete:1}),false);assert.equal(result,undefined);
});

test('wrong source, destination, session and sequence are ignored', t => {
    const h=harness(t);h.ftp.getFile('file',()=>{});const request=h.sent.shift();
    assert.equal(h.reply({...request,seq:request.seq+3},[1,0,0,0]),false);
    assert.equal(h.reply({...request,session:request.session+1},[1,0,0,0]),false);
    const body=h.ftp.packOp(request.seq+1,request.session,128,4,4,0,0,[1,0,0,0]);
    const msg={_name:'FILE_TRANSFER_PROTOCOL',_header:{srcSystem:41,srcComponent:1},target_system:255,target_component:190,payload:body};
    assert.equal(h.ftp.handleMessage(msg),false);msg._header.srcSystem=42;msg.target_component=2;
    assert.equal(h.ftp.handleMessage(msg),false);assert.ok(h.ftp.pendingOpenFile);
});

test('wire header uses all 16 sequence bits, binary input variants and byte offsets', t => {
    const {ftp}=harness(t);const b=ftp.packOp(65535,7,128,3,5,1,0x12345678,[0,128,255]);
    const padded=new Uint8Array(b.length+8);padded.set(b,4);
    for(const input of [b,Array.from(b),Array.from(b,c=>String.fromCharCode(c)),String.fromCharCode(...b),padded.subarray(4,-4)]) {
        const op=ftp.parseOp(input);assert.equal(op.seq,65535);assert.equal(op.offset,0x12345678);assert.deepEqual(op.payload,Uint8Array.from([0,128,255]));
    }
    ftp.seq=65535;ftp.getFile('file',()=>{});assert.equal(ftp.seq,0);
    assert.equal(ftp.parseOp(b.subarray(0,13)),null);b[4]=240;assert.equal(ftp.parseOp(b),null);
});

test('NACK, excessive file sizes and invalid paths fail without leaking a transfer', t => {
    const h=harness(t);let calls=0;
    h.ftp.getFile('missing',d=>{assert.equal(d,null);calls++});h.reply(h.sent.shift(),[10],{nack:true});
    h.sent.length=0;h.open(h.ftp.maxFileSize+1,d=>{assert.equal(d,null);calls++});
    h.ftp.getFile('x'.repeat(240),d=>{assert.equal(d,null);calls++});
    h.ftp.getFile('x\0y',d=>{assert.equal(d,null);calls++});
    assert.equal(calls,4);assert.equal(h.ftp.currentFile,null);assert.equal(h.ftp.timeoutCheckInterval,null);
});

test('malformed or out-of-bounds data never grows the buffer or completes the file', t => {
    const h=harness(t);let result;const burst=h.open(80,d=>result=d);
    assert.equal(h.reply(burst,[1,2],{offset:79}),false);
    assert.equal(h.reply(burst,[],{offset:0}),false);
    assert.equal(h.ftp.fileBuffer.length,80);assert.equal(result,undefined);
});

function mission(items,type=1) {
    const bytes=Buffer.alloc(10+38*items.length);bytes.writeUInt16LE(0x763d);bytes.writeUInt16LE(type,2);bytes.writeUInt16LE(items.length,8);
    items.forEach((item,i)=>{const o=10+i*38;bytes.writeFloatLE(item.param1??0,o);bytes.writeInt32LE(item.x??-350000000,o+16);bytes.writeInt32LE(item.y??1490000000,o+20);bytes.writeUInt16LE(i,o+28);bytes.writeUInt16LE(item.command,o+30);bytes[o+32]=42;bytes[o+33]=1;bytes[o+37]=type});return bytes;
}
test('mission and polygon/circle fence files preserve coordinates and command fields', () => {
    const p=new MissionParser();const bytes=mission([{command:5001,param1:3},{command:5001,param1:3,x:-350000100},{command:5001,param1:3,y:1490000100},{command:5004,param1:12.5}]);
    const fences=p.parseFence(bytes);assert.equal(fences.length,2);assert.equal(fences[0].vertices.length,3);assert.equal(fences[1].radius,12.5);assert.equal(fences[1].lat,-35);
    const items=p.parseMission(mission([{command:16}],0));assert.equal(items[0].target_system,42);assert.equal(items[0].x,-350000000);
});

test('malformed mission headers and incomplete or zero-vertex polygons are rejected', () => {
    const p=new MissionParser();assert.equal(p.parseMission(new Uint8Array(0)),null);
    const bytes=mission([{command:5001,param1:3}]);assert.equal(p.parseFence(bytes),null);
    assert.equal(p.parseFence(mission([{command:5001,param1:0}])),null);
    assert.equal(p.parseFence(mission([{command:5003,param1:-1}])),null);
    assert.equal(p.parseMission(bytes.subarray(0,-1)),null);bytes[0]=0;assert.equal(p.parseMission(bytes),null);
    assert.deepEqual(p.parseFence(mission([])),[]);
});

test('burst retry exhaustion fails once and releases the session', t => {
    const h=harness(t);let calls=0;h.ftp.maxBurstRetries=1;
    h.open(160,d=>{assert.equal(d,null);calls++});
    t.mock.timers.tick(3000);t.mock.timers.tick(3000);assert.equal(calls,1);assert.equal(h.ftp.currentFile,null);
    t.mock.timers.tick(6000);assert.equal(calls,1);
});

test('gap retry exhaustion fails without returning a zero-filled file', t => {
    const h=harness(t);let calls=0;h.ftp.maxGapRetries=1;
    const burst=h.open(160,d=>{assert.equal(d,null);calls++});h.reply(burst,[6],{nack:true});
    t.mock.timers.tick(1000);t.mock.timers.tick(1000);assert.equal(calls,1);assert.equal(h.ftp.pendingReads.size,0);
});

test('cancellation reports failure once and ignores a late open ACK', t => {
    const h=harness(t);let calls=0;h.ftp.getFile('file',d=>{assert.equal(d,null);calls++});const open=h.sent.shift();
    h.ftp.cancel();h.ftp.cancel();assert.equal(calls,1);assert.equal(h.reply(open,[1,0,0,0]),false);
    t.mock.timers.tick(10000);assert.equal(calls,1);
});

for (const size of [0,1,239,240,1600]) {
    test(`upload ${size} bytes waits for every write and close ACK`,t=>{
        const h=harness(t);const bytes=Uint8Array.from({length:size},(_,i)=>i&255);let result;
        h.ftp.putFile('out.bin',bytes,d=>result=d);const create=h.sent.shift();assert.equal(create.opcode,6);h.reply(create);
        const received=new Uint8Array(size);
        for(;;) {
            const req=h.sent.shift();assert.ok(req);assert.equal(result,undefined);
            if(req.opcode===1){h.reply(req);break;}
            assert.equal(req.opcode,7);received.set(req.payload,req.offset);h.reply(req);
        }
        assert.equal(result,size);assert.deepEqual(received,bytes);assert.equal(h.sent.length,0);assert.equal(h.ftp.timeoutCheckInterval,null);
    });
}
test('upload retries exact bytes and sequence; stale, wrong-offset and foreign replies do not advance',t=>{
    const h=harness(t);let result;h.ftp.putFile('out',new Uint8Array(300),d=>result=d);
    const create=h.sent.shift();t.mock.timers.tick(3000);const retry=h.sent.shift();assert.deepEqual(retry,create);
    h.reply(create);const write=h.sent.shift();assert.equal(h.reply(create),false);assert.equal(h.reply(write,[],{offset:1}),false);
    const bad={...write,session:(write.session+1)&255};assert.equal(h.reply(bad),false);
    t.mock.timers.tick(3000);assert.deepEqual(h.sent.shift(),write);h.reply(write);const next=h.sent.shift();h.reply(next);
    const close=h.sent.shift();t.mock.timers.tick(3000);assert.deepEqual(h.sent.shift(),close);assert.equal(result,undefined);h.reply(close);assert.equal(result,300);
});
for(const stage of ['create','write','close','timeout','cancel']) {
    test(`upload failure at ${stage} finishes once without success`,t=>{
        const h=harness(t);let calls=0,result;h.ftp.putFile('out',new Uint8Array(1),d=>{calls++;result=d;});let req=h.sent.shift();
        if(stage!=='create'&&stage!=='timeout'&&stage!=='cancel'){h.reply(req);req=h.sent.shift();}
        if(stage==='close'){h.reply(req);req=h.sent.shift();}
        if(stage==='timeout'){for(let i=0;i<7;i++)t.mock.timers.tick(3000);}else if(stage==='cancel')h.ftp.cancel();else h.reply(req,[1],{nack:true});
        assert.equal(result,null);assert.equal(calls,1);h.reply(req);assert.equal(calls,1);
    });
}
for(const estimate of [80,400]) {
    test(`virtual file ignores size estimate ${estimate} but waits for EOF and missing fixed-size blocks`,t=>{
        const h=harness(t),bytes=Uint8Array.from({length:170},(_,i)=>i);let result;
        h.ftp.getFile('@PARAM/param.pck',d=>result=d,{sizeIsEstimate:true,fixedReadSize:true});
        const create=h.sent.shift(),size=Buffer.alloc(4);size.writeUInt32LE(estimate);h.reply(create,size);
        const burst=h.sent.shift();h.reply(burst,bytes.subarray(0,80),{offset:0});
        // Lose the middle block and the short final block. EOF alone cannot
        // report success, even when the advertised estimate was too small.
        assert.equal(result,undefined);h.reply(burst,[6],{offset:170,nack:true});
        const gaps=h.sent.splice(0);assert.deepEqual(gaps.map(g=>g.size),[80,80]);
        for(const req of gaps)h.reply(req,bytes.subarray(req.offset,req.offset+req.size));
        assert.deepEqual(result,bytes);
    });
}
test('virtual file can grow beyond its estimate and exact-size files still reject extra data',t=>{
    const h=harness(t);let result;h.ftp.getFile('@PARAM/param.pck',d=>result=d,{sizeIsEstimate:true});const create=h.sent.shift(),size=Buffer.alloc(4);size.writeUInt32LE(10);h.reply(create,size);const req=h.sent.shift();
    const bytes=new Uint8Array(20).fill(7);h.reply(req,bytes,{offset:0});assert.equal(result,undefined);h.reply(req,[6],{offset:20,nack:true});assert.deepEqual(result,bytes);
});
