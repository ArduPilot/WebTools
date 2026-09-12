const test=require('node:test'), assert=require('node:assert/strict');
const {MAVParam:P,MAVParamDefinitions:D}=require('../modules/MAVLink/mavparam.js');
const fixture=require('./fixtures/params.json');
const packed=()=>Buffer.from(fixture.hex,'hex');

test('packed defaults decode independent Python/MAVProxy fixtures, padding and exact int32',()=>{
    const data=P.decode(packed());assert.equal(data.size,6);
    assert.deepEqual(data.get('TEST_I32'),{name:'TEST_I32',value:16777217,type:3,defaultValue:0});
    assert.equal(data.get('TEST_FLOAT').defaultValue,.5);assert.equal(data.get('TEST_I16').value,-1234);
    // Decode a subarray with a non-zero buffer offset.
    assert.deepEqual(P.decode(Buffer.concat([Buffer.alloc(7),packed()]).subarray(7)),data);
});
test('implicit defaults and no-default files',()=>{
    for(const magic of [0x671b,0x671c]) {
        const bytes=Buffer.from([0,0,1,0,1,0,1,0,65,12]);bytes.writeUInt16LE(magic);
        const p=P.decode(bytes).get('A');assert.equal(p.value,12);assert.equal(p.defaultValue,magic===0x671c?12:undefined);
    }
});
test('malformed records, prefixes, counts, duplicate names, flags and nonfinite values fail',()=>{
    for(let i=0;i<packed().length-2;i++) assert.throws(()=>P.decode(packed().subarray(0,i)),`truncation ${i}`);
    for(const [offset,value] of [[0,0],[2,7],[6,0x51],[7,15]]) {const b=packed();b[offset]=value;assert.throws(()=>P.decode(b));}
    const bad=packed();bad.writeFloatLE(Infinity,fixture.offsets.TEST_FLOAT.offset);assert.throws(()=>P.decode(bad),/finite/);
});
test('upload encoding matches independent bytes and preserves int32 beyond float precision',()=>{
    assert.equal(Buffer.from(P.encodeUpload([{name:'TEST_I32',value:16777219,type:3}])).toString('hex'),fixture.uploadHex);
    for(const [type,value] of [[1,128],[2,-32769],[3,2147483648],[3,1.5],[4,Infinity],[4,1e50]]) assert.throws(()=>P.encodeUpload([{name:'TEST',value,type}]));
    assert.throws(()=>P.encodeUpload([{name:'TOO_LONG_PARAMETER_NAME',value:1,type:1}]));
});
test('parameter text supports MAVProxy and QGC, rejects malformed and duplicate lines',()=>{
    assert.deepEqual(P.parseText('# parameters\nTEST_I8,-2\nTEST_FLOAT = 1.25 # note\n'),new Map([['TEST_I8',-2],['TEST_FLOAT',1.25]]));
    assert.deepEqual(P.parseText('1\t1\tTEST_I32\t16777219\t6'),new Map([['TEST_I32',16777219]]));
    for(const text of ['', 'A NaN','A 1\nA 2','A 1 junk','A 0x10','A Infinity']) assert.throws(()=>P.parseText(text));
    const params=P.decode(packed());const parsed=P.parseText(P.saveText(params.values()));
    for(const p of params.values()) assert.equal(P.valueForType(parsed.get(p.name),p.type),p.value);
});
test('short display decimals retain exact float32 values',()=>{
    const p={type:4,value:Math.fround(.1)};assert.equal(P.formatValue(p),'0.1');assert.equal(Math.fround(Number(P.formatValue(p))),p.value);
});
function client() {
    let bytes=packed();const calls=[];
    const ftp={getFile(path,cb,opts){calls.push({path,opts});cb(bytes);},putFile(path,data,cb){calls.push({path,data});
        const upload=Buffer.from(data);upload.writeUInt16LE(upload.readUInt16LE(2),4);
        for(const p of P.decode(upload).values()) {const {offset,type}=fixture.offsets[p.name];const v=new DataView(bytes.buffer,bytes.byteOffset);if(type===1)v.setInt8(offset,p.value);else if(type===2)v.setInt16(offset,p.value,true);else if(type===3)v.setInt32(offset,p.value,true);else v.setFloat32(offset,p.value,true);}
        cb(data.length);
    }};
    return {model:new P({ftp}),ftp,calls};
}
test('fetch, incremental description search, nondefaults, reset and file apply verify readback',async()=>{
    const {model,calls}=client();await model.refresh();assert.equal(calls[0].path,P.DOWNLOAD);assert.equal(calls[0].opts.fixedReadSize,true);assert.equal(calls[0].opts.sizeIsEstimate,true);
    assert.equal(model.search('',true).length,4);
    model.definitions.set('TEST_I8',{description:'Motor test speed'});assert.equal(model.search('motor speed')[0].name,'TEST_I8');
    await model.reset('TEST_I8');assert.equal(model.params.get('TEST_I8').value,0);assert.equal(model.search('TEST_I8',true).length,0);
    await model.apply(P.parseText('TEST_I32 16777219'));assert.equal(model.params.get('TEST_I32').value,16777219);assert.equal(calls.filter(c=>c.path===P.UPLOAD).length,2);
});
test('unknown, read-only, invalid types and no-op imports never upload',async()=>{
    const {model,calls}=client();await model.refresh();model.definitions.set('TEST_READONLY',{readOnly:true});
    for(const text of ['UNKNOWN 1','TEST_READONLY 0','TEST_I8 1.5']) await assert.rejects(model.apply(P.parseText(text)));
    await model.apply(P.parseText('TEST_I8 -12'));assert.equal(calls.length,1);assert.equal(model.busy,false);
});
test('rejected values and failed close are reported after refreshing actual state',async()=>{
    const {model,ftp}=client();await model.refresh();ftp.putFile=(path,bytes,cb)=>cb(bytes.length);
    await assert.rejects(model.apply(new Map([['TEST_I8',2]])),/did not retain/);assert.equal(model.params.get('TEST_I8').value,-12);
    ftp.putFile=(path,bytes,cb)=>cb(null);await assert.rejects(model.apply(new Map([['TEST_I8',2]])),/not acknowledged/);
});
test('lost readback clears stale data; disconnect and concurrent operations cannot update another vehicle',async()=>{
    const {model,ftp}=client();await model.refresh();ftp.getFile=(path,cb)=>cb(null);
    await assert.rejects(model.apply(new Map([['TEST_I8',2]])),/unverified/);assert.equal(model.params.size,0);
    let callback;ftp.getFile=(path,cb)=>callback=cb;
    const pending=model.refresh();await assert.rejects(model.refresh(),/already in progress/);model.disconnect();callback(packed());await assert.rejects(pending,/disconnected/);assert.equal(model.params.size,0);
});
const metadata={Rover:{TEST_I8:{DisplayName:'Test speed',Description:'Motor speed',Units:'m/s',Range:{low:'0',high:'10'},Values:{0:'Off',1:'On'},ReadOnly:'True',RebootRequired:'True'},TEST_OPTIONS:{Bitmask:{0:'A',2:'C'}}}};
test('definitions retain descriptions, ranges, enum/bitmask options and read-only flags',()=>{
    const d=D.parse(metadata);assert.equal(d.get('TEST_I8').description,'Motor speed');assert.equal(d.get('TEST_I8').readOnly,true);assert.equal(d.get('TEST_I8').rebootRequired,true);assert.equal(d.get('TEST_OPTIONS').bitmask[2],'C');assert.throws(()=>D.parse({}));
});
test('metadata caches per vehicle, supports refresh and stale offline copies',async()=>{
    let calls=0,offline=false;const fetch=async()=>{calls++;if(offline)throw new Error('offline');return new Response(JSON.stringify(metadata));};
    const cacheData=new Map();const cache={open:async()=>({match:async u=>cacheData.get(u)?.clone(),put:async(u,r)=>cacheData.set(u,r)})};
    const store=new D({fetch,cache});await store.load('Rover');assert.equal(calls,1);assert.equal((await store.load('Rover')).cached,true);assert.equal(calls,1);
    const other=new D({fetch,cache});assert.equal((await other.load('Rover')).cached,true);assert.equal(calls,1);
    offline=true;assert.equal((await other.load('Rover',{refresh:true})).stale,true);await assert.rejects(other.load('Plane'),/offline/);
    await assert.rejects(other.load('../bad'),/Unknown/);
});
