const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(t) {
    t.mock.timers.enable({apis:['setTimeout'],now:1000});
    const instances=[];
    class FakeFTP {
        constructor(){this.calls=[];instances.push(this)}
        getFile(path,cb,options){this.calls.push({path,cb,options});this.cb=cb}
        putFile(path,data,cb){this.calls.push({path,data,cb});this.cb=cb}
        cancel(){const cb=this.cb;this.cb=null;cb?.(null)}
        handleMessage(m){return m.valid===true}
        complete(data){const cb=this.cb;this.cb=null;cb?.(data)}
    }
    const context={window:{},MAVFTP:FakeFTP,setTimeout,clearTimeout};vm.createContext(context);
    vm.runInContext(fs.readFileSync('SimpleGCS/ftp_manager.js','utf8'),context);
    const manager=context.window.FTPManager;
    const link={},ws={};manager.setLink(link,ws,42,1);
    return {manager,instances,ftp:instances[0],link,ws};
}

test('queue serializes files and completion advances exactly once',t=>{
    const {manager,ftp}=setup(t);const results=[];
    manager.getFile('first',d=>results.push(['first',d]));manager.getFile('second',d=>results.push(['second',d]));
    assert.deepEqual(ftp.calls.map(c=>c.path),['first']);assert.equal(manager.queuedCount(),1);
    const old=ftp.calls[0].cb;ftp.complete('one');assert.equal(ftp.calls[1].path,'second');old('stale');
    assert.equal(manager.isBusy(),true);ftp.complete('two');assert.deepEqual(results,[['first','one'],['second','two']]);assert.equal(manager.isBusy(),false);
});

test('timeout cancels old transfer; late callback cannot finish the next job',t=>{
    const {manager,ftp}=setup(t);const results=[];
    manager.getFile('slow',d=>results.push(d),{timeoutMs:1000});manager.getFile('next',d=>results.push(d));
    const stale=ftp.calls[0].cb;t.mock.timers.tick(1000);assert.deepEqual(results,[null]);assert.equal(ftp.calls[1].path,'next');
    stale('late');assert.deepEqual(results,[null]);ftp.complete('ok');assert.deepEqual(results,[null,'ok']);
});

test('only an accepted FTP response extends the watchdog',t=>{
    const {manager,ftp}=setup(t);const results=[];manager.getFile('file',d=>results.push(d),{timeoutMs:1000});
    t.mock.timers.tick(750);manager.handleMessage({valid:false});t.mock.timers.tick(250);assert.deepEqual(results,[null]);
    manager.getFile('file',d=>results.push(d),{timeoutMs:1000});t.mock.timers.tick(750);manager.handleMessage({valid:true});t.mock.timers.tick(750);assert.equal(manager.isBusy(),true);ftp.complete('ok');
});

test('disconnect completes active and queued jobs, and late replies are harmless',t=>{
    const {manager,ftp}=setup(t);const results=[];manager.getFile('a',d=>results.push(d));manager.getFile('b',d=>results.push(d));
    const stale=ftp.calls[0].cb;manager.clearLink();assert.deepEqual(results,[null,null]);stale('late');assert.equal(results.length,2);assert.equal(manager.isBusy(),false);
    t.mock.timers.tick(10000);assert.equal(results.length,2);
});

test('repeated link discovery preserves an active transfer; a changed link cancels it',t=>{
    const {manager,ftp,instances,link,ws}=setup(t);let result;manager.getFile('a',d=>result=d);manager.setLink(link,ws,42,1);assert.equal(instances.length,1);assert.equal(manager.isBusy(),true);
    manager.setLink(link,{},43,1);assert.equal(result,null);assert.equal(instances.length,2);assert.equal(instances[1].targetSystem,43);
});

test('deduplication notifies canceled queued jobs and preserves the active one',t=>{
    const {manager,ftp}=setup(t);const results=[];manager.getFile('a',()=>{});manager.getFile('fence',d=>results.push(d),{tag:'fence'});
    manager.getFile('new-fence',()=>{}, {tag:'fence',dropQueuedTag:true});assert.deepEqual(results,[null]);assert.equal(manager.queuedCount(),1);
    ftp.complete('a');assert.equal(ftp.calls[1].path,'new-fence');
});

test('requests without a discovered vehicle complete with failure',t=>{
    const {manager}=setup(t);manager.setLink({}, {}, -1,-1);let result;manager.getFile('a',d=>result=d);assert.equal(result,null);assert.equal(manager.isBusy(),false);
});

test('uploads share the queue with virtual-file downloads and wait for completion',t=>{
    const {manager,ftp}=setup(t);const data=new Uint8Array([1,2]);const results=[];
    manager.putFile('upload',data,d=>results.push(d));manager.getFile('params',d=>results.push(d),{sizeIsEstimate:true,fixedReadSize:true});
    assert.equal(ftp.calls[0].data,data);assert.equal(ftp.calls.length,1);ftp.complete(2);
    assert.equal(ftp.calls[1].options.sizeIsEstimate,true);assert.equal(ftp.calls[1].options.fixedReadSize,true);ftp.complete(data);assert.deepEqual(results,[2,data]);
});
