const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup() {
    const listeners=new Map(), windowListeners=new Map();
    const video={srcObject:null,paused:false,
        addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener:n=>listeners.delete(n),
        play:()=>Promise.resolve(),pause(){this.paused=true;}};
    const status={style:{}};let config,closed=0;
    const window={addEventListener:(n,f)=>windowListeners.set(n,f),removeEventListener:n=>windowListeners.delete(n)};
    const context={window,MediaMTXWebRTCReader:class {
        constructor(options){config=options;}close(){closed++;}
    }};
    vm.runInNewContext(fs.readFileSync('SimpleGCS/webrtc-player.js','utf8'),context);
    const player=new window.WebRTCPlayer(video,status,{url:'https://video.example.org/stream/whep',user:'viewer',pass:'test'});
    return {video,status,player,config,listeners,windowListeners,closeCount:()=>closed};
}

test('WebRTC badge becomes live only on playback; errors clear stale video',()=>{
    const {config,video,status,listeners}=setup();
    assert.equal(config.user,'viewer');assert.equal(config.pass,'test');
    assert.match(status.textContent,/Connecting/);
    const stream={};config.onTrack({streams:[stream]});assert.equal(video.srcObject,stream);
    assert.match(status.textContent,/Connecting/);
    listeners.get('playing')();assert.match(status.textContent,/Live/);
    listeners.get('waiting')();assert.match(status.textContent,/Buffering/);
    config.onError('unauthorized');assert.match(status.textContent,/unauthorized/);assert.equal(video.srcObject,null);
});

test('closing or leaving the page releases playback and ignores late callbacks',()=>{
    const {config,video,status,player,listeners,windowListeners,closeCount}=setup();
    windowListeners.get('pagehide')();player.close();assert.equal(closeCount(),1);
    assert.equal(video.paused,true);assert.equal(listeners.size,0);assert.equal(windowListeners.size,0);
    const message=status.textContent;config.onError('late');config.onTrack({streams:[{}]});
    assert.equal(video.srcObject,null);assert.equal(status.textContent,message);
});
