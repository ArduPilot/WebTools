const test=require('node:test');
const assert=require('node:assert/strict');
const CommandAcks=require('../SimpleGCS/commands.js');
function setup(t){t.mock.timers.enable({apis:['setTimeout']});const reports=[],sent=[];const acks=new CommandAcks({report:(...args)=>reports.push(args),timeoutMs:1000});return {acks,reports,sent};}

test('rapid mode changes send immediately and retain both ACKs, including a denial',t=>{
    const {acks,reports,sent}=setup(t);
    acks.submit(176,()=>sent.push('RTL'));acks.submit(176,()=>sent.push('LOITER'));
    assert.deepEqual(sent,['RTL','LOITER']);acks.acknowledge(176,'ACCEPTED');acks.acknowledge(176,'DENIED');
    assert.deepEqual(reports,[[176,'ACCEPTED'],[176,'DENIED']]);
    t.mock.timers.tick(2000);assert.equal(reports.length,2);
});

test('missing ACKs report timeouts without holding up later control commands',t=>{
    const {acks,reports,sent}=setup(t);acks.submit(400,()=>sent.push(1));acks.submit(400,()=>sent.push(0));
    assert.deepEqual(sent,[1,0]);t.mock.timers.tick(1000);
    assert.deepEqual(reports,[[400,'no acknowledgement'],[400,'no acknowledgement']]);
    assert.equal(acks.acknowledge(400,'DENIED'),false);
});

test('in-progress ACK extends deadline; disconnect cancels outstanding timers',t=>{
    const {acks,reports}=setup(t);acks.submit(400,()=>{});
    t.mock.timers.tick(900);acks.acknowledge(400,'IN_PROGRESS',true);t.mock.timers.tick(900);assert.equal(reports.length,0);
    acks.submit(400,()=>{});acks.clear();t.mock.timers.tick(2000);assert.equal(reports.length,0);
});

test('different command types progress independently and send failures are visible',t=>{
    const {acks,reports}=setup(t);acks.submit(400,()=>{});assert.equal(acks.submit(176,()=>{throw Error('closed')}),false);
    assert.deepEqual(reports,[[176,'not sent']]);assert.equal(acks.acknowledge(400,'ACCEPTED'),true);
    t.mock.timers.tick(2000);assert.equal(reports.length,2);
});
