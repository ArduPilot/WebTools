const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function events() {
    const handlers = {};
    return {
        addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
        emit(type, event) { for (const fn of handlers[type] || []) fn(event); }
    };
}

function gesture(t) {
    t.mock.timers.enable({apis:['setTimeout']});
    const el = events(), window = events(), commands = [];
    window.dispatchEvent = event => commands.push(event.detail);
    const context = {window, setTimeout, clearTimeout,
        CustomEvent: class { constructor(type, opts) { this.detail = opts.detail; } }};
    vm.runInNewContext(fs.readFileSync('SimpleGCS/map.js','utf8'), context);
    window.MapManager.map = {
        getContainer: () => el,
        mouseEventToContainerPoint: e => ({x:e.x, distanceTo(p) { return Math.abs(this.x-p.x); }}),
        containerPointToLatLng: p => ({lat:p.x,lng:149})
    };
    window.MapManager._setupLongPressReposition();
    function send(type, id=1, x=10, overrides={}) {
        const event = {pointerId:id, x, button:0, pointerType:'touch', preventDefault(){}, target:{closest:()=>false}, ...overrides};
        if (type === "pointerdown") window.emit(type,event);
        el.emit(type,event);
        if (type !== "pointerdown") window.emit(type,event);
    }
    return {send,commands,window};
}

test('single-finger long press still commands directly at 600ms', t => {
    const {send,commands}=gesture(t);
    send('pointerdown');t.mock.timers.tick(599);assert.equal(commands.length,0);
    t.mock.timers.tick(1);assert.equal(commands.length,1);assert.equal(commands[0].lat,10);
    t.mock.timers.tick(1000);send('pointerup');assert.equal(commands.length,1);
});

test('second finger cancels the old timer even when the first finger lifts first', t => {
    const {send,commands}=gesture(t);
    send('pointerdown',1);t.mock.timers.tick(500);send('pointerdown',2,20);
    t.mock.timers.tick(50);send('pointerup',1);t.mock.timers.tick(1000);
    assert.equal(commands.length,0);
    // Still suppress new fingers until the whole pinch has ended.
    send('pointerdown',3);t.mock.timers.tick(1000);assert.equal(commands.length,0);
    send('pointerup',2);send('pointercancel',3);
    send('pointerdown',4,40);t.mock.timers.tick(600);assert.equal(commands[0].lat,40);
});

test('drag, cancel, leaving the map and window blur cancel holds', t => {
    const {send,commands,window}=gesture(t);
    for (const action of ['pointermove','pointercancel','pointerleave','blur']) {
        send('pointerdown');t.mock.timers.tick(300);
        if(action==='blur')window.emit('blur');else send(action,1,21);
        t.mock.timers.tick(600);send('pointerup');
    }
    assert.equal(commands.length,0);
    send('pointerdown',1,10,{pointerType:'mouse'});t.mock.timers.tick(600);
    assert.equal(commands.length,1,'mouse hold remains available');
});

test('second finger on an excluded map control also cancels the hold', t => {
    const {send,commands}=gesture(t);
    send('pointerdown');send('pointerdown',2,20,{target:{closest:()=>true}});
    t.mock.timers.tick(1000);assert.equal(commands.length,0);
});

function mission(t, auto=true) {
    t.mock.timers.enable({apis:['setTimeout']});
    const calls=[], layers=new Set();
    const window={AppSettings:{autoFetchMission:auto}};
    const layer=()=>({addTo(){layers.add(this);return this;},bindTooltip(){}});
    const context={window,setTimeout,clearTimeout,console:{warn(){}},
        FTPManager:{getFile(path,cb){calls.push({path,cb});},cancelQueuedByTag(){}},
        MissionParser:class {parseMission(data){if(data==='bad')throw Error('malformed');return data;}},
        L:{polyline:layer,circleMarker:layer}};
    vm.runInNewContext(fs.readFileSync('SimpleGCS/mission.js','utf8'),context);
    const api=window.Mission;
    api.init({map:{removeLayer:l=>layers.delete(l)},toast(){}});
    api.onConnected({});
    return {api,calls,layers,settings:window.AppSettings};
}
const points=[{x:-350000000,y:1490000000}];

test('automatic mission download retries failures without overlapping pending transfers', t => {
    const {api,calls,layers}=mission(t);
    assert.equal(calls.length,1);t.mock.timers.tick(15000);api.fetch();assert.equal(calls.length,1);
    calls[0].cb(null);t.mock.timers.tick(4999);assert.equal(calls.length,1);
    t.mock.timers.tick(1);assert.equal(calls.length,2);calls[1].cb(points);
    assert.equal(layers.size,2);t.mock.timers.tick(20000);assert.equal(calls.length,2);
});

test('mission auto-fetch setting is respected, including disabling a scheduled retry', t => {
    const {api,calls,settings}=mission(t,false);
    t.mock.timers.tick(10000);assert.equal(calls.length,0);
    api.fetch();calls[0].cb(null);t.mock.timers.tick(10000);assert.equal(calls.length,1);
    settings.autoFetchMission=true;api.onConnected({});calls[1].cb(null);
    settings.autoFetchMission=false;t.mock.timers.tick(10000);assert.equal(calls.length,2);
});

test('disconnect clears mission layers and ignores replies from a previous vehicle', t => {
    const {api,calls,layers}=mission(t);
    calls[0].cb(points);api.fetch();const stale=calls[1].cb;
    api.onDisconnected();assert.equal(layers.size,0);
    api.onConnected({});stale(points);assert.equal(layers.size,0);
    calls[2].cb(null);api.onDisconnected();t.mock.timers.tick(10000);assert.equal(calls.length,3);
});

test('malformed missions retry; an empty mission completes and clears the overlay', t => {
    const {api,calls,layers}=mission(t);
    calls[0].cb('bad');t.mock.timers.tick(5000);assert.equal(calls.length,2);
    calls[1].cb(points);assert.equal(layers.size,2);
    api.fetch();calls[2].cb([]);assert.equal(layers.size,0);
    t.mock.timers.tick(10000);assert.equal(calls.length,3);
});
