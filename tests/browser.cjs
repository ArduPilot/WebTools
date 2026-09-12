// Exercise the real browser scripts against a deterministic MAVLink vehicle.
// No vehicle connection is made: WebSocket is replaced before scripts load.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
    const root = path.resolve(__dirname, '..');
    const server = http.createServer((req, res) => {
        const name = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
        if (!name.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        const file = name.endsWith(path.sep) || fs.existsSync(name) && fs.statSync(name).isDirectory() ? path.join(name, 'index.html') : name;
        fs.readFile(file, (err, bytes) => {
            if (err) { res.writeHead(404).end(); return; }
            res.setHeader('Content-Type', ({'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
            res.end(bytes);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser, context;
    try {
        browser = process.env.SIMPLEGCS_CDP_URL ? await chromium.connectOverCDP(process.env.SIMPLEGCS_CDP_URL) :
            await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || undefined});
        context = await browser.newContext({viewport:{width:1280,height:900}});
        await context.addInitScript(() => {
            const state = window.testVehicle = {sent:[], sockets:[], armed:false, mode:0, reject: false};
            class VehicleSocket {
                static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
                constructor(url) {
                    this.url=url;this.readyState=0;state.sockets.push(this);
                    setTimeout(async()=>{
                        await mavlink20.ready;
                        if(this.readyState===3)return;
                        this.rx=new MAVLink20Processor(null,42,1);
                        this.rx.signing.secret_key=mavlink20.sha256(new TextEncoder().encode('test-signing'));
                        this.rx.signing.sign_outgoing=true;
                        this.codec=new MAVFTP(this.rx,{send(){}});
                        this.readyState=1;this.onopen?.();this.telemetry();
                        this.timer=setInterval(()=>this.telemetry(),500);
                    },25);
                }
                emit(msg) {
                    const data=Uint8Array.from(msg.pack(this.rx));this.rx.seq=(this.rx.seq+1)&255;
                    this.onmessage?.({data:data.buffer});
                }
                telemetry() {
                    if(this.readyState!==1)return;
                    this.emit(new mavlink20.messages.heartbeat(11,3,state.armed?137:9,state.mode,4,3));
                    this.emit(new mavlink20.messages.global_position_int(1000,-350000000,1490000000,500000,0,100,0,0,9000));
                    if(state.target)this.emit(new mavlink20.messages.position_target_global_int(1000,0,65016,state.target.x,state.target.y,500,0,0,0,0,0,0,0,0));
                }
                send(data) {
                    const msg=this.rx.decode(new Uint8Array(data));state.sent.push(msg);
                    if(msg._name==='COMMAND_INT') {
                        if(!state.reject) {
                            if(msg.command===400)state.armed=msg.param1===1;
                            if(msg.command===176)state.mode=msg.param2;
                            if(msg.command===192){state.mode=15;state.target=msg;}
                        }
                        this.emit(new mavlink20.messages.command_ack(msg.command,state.reject?2:0,0,0,msg._header.srcSystem,msg._header.srcComponent));
                        this.telemetry();
                    }
                    if(msg._name==='FILE_TRANSFER_PROTOCOL') {
                        const req=this.codec.parseOp(msg.payload);
                        if(req.opcode===4)this.ftpPath=new TextDecoder().decode(req.payload).replace(/\0.*$/, '');
                        const bytes=new Uint8Array(48);const v=new DataView(bytes.buffer);
                        v.setUint16(0,0x763d,true);v.setUint16(2,1,true);v.setUint16(8,1,true);
                        v.setFloat32(10,50,true);v.setInt32(26,-350000000,true);v.setInt32(30,1490000000,true);v.setUint16(40,5003,true);bytes[47]=1;
                        if(this.ftpPath==='@MISSION/mission.dat'){v.setUint16(2,0,true);v.setUint16(40,16,true);}
                        let payload=[];
                        if(req.opcode===4){payload=new Uint8Array(4);new DataView(payload.buffer).setUint32(0,bytes.length,true);}
                        if(req.opcode===15||req.opcode===5)payload=bytes.slice(req.offset,req.offset+80);
                        const body=this.codec.packOp((req.seq+1)&65535,req.session,128,payload.length,req.opcode,1,req.offset,payload);
                        setTimeout(()=>{if(this.readyState===1)this.emit(new mavlink20.messages.file_transfer_protocol(0,msg._header.srcSystem,msg._header.srcComponent,Array.from(body)));},0);
                    }
                }
                close() {this.readyState=3;clearInterval(this.timer);setTimeout(()=>this.onclose?.({code:1000,reason:''}),0);}
            }
            window.WebSocket=VehicleSocket;
        });
        const page = await context.newPage();
        const errors=[];page.on('pageerror', e=>errors.push(e.message));
        await page.route('**/SimpleGCS/config.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
        await page.goto(`http://127.0.0.1:${server.address().port}/SimpleGCS/`);
        await page.waitForFunction(()=>window.AppSettings);
        assert.equal(await page.evaluate(()=>testVehicle.sockets.length),0,'no unsolicited connection');
        await page.locator('#connectBtn').click();
        assert.equal(await page.locator('#target_url').inputValue(),'ws://127.0.0.1:5763');
        assert.equal(await page.locator('#signing_passphrase').inputValue(),'');
        await page.locator('#signing_passphrase').fill('test-signing');
        await page.locator('#send_heartbeat').uncheck();
        await page.locator('#connection_button').click();
        await page.waitForFunction(()=>Object.values(MapManager.map._layers).some(l=>l._fenceType===5003));
        assert.ok(await page.evaluate(()=>testVehicle.sent.length>0));
        assert.ok(await page.evaluate(()=>testVehicle.sent.every(m=>m._header.incompat_flags&1)),'FTP signed with heartbeat disabled');
        assert.ok(await page.evaluate(()=>testVehicle.sent.every(m=>m.target_system===42 && m.target_component===1)),'vehicle header IDs used');
        await page.locator('#menuBtn').click();
        await page.getByText('Fetch Mission',{exact:true}).click();
        await page.waitForFunction(()=>Object.values(MapManager.map._layers).some(l=>l.options?.color==='#2196f3'));
        await page.route('**:8889/**',route=>route.fulfill({contentType:'text/html',body:'Video endpoint fixture'}));
        await page.evaluate(()=>VideoPanel.open());
        await page.locator('#video-panel').waitFor();
        await page.evaluate(()=>VideoPanel.close());
        assert.equal(await page.locator('#video-panel').count(),0);
        await page.locator('#armBtn').click();
        await page.waitForFunction(()=>document.querySelector('#armed-pill').textContent==='ARMED');
        await page.locator('#loiterBtn').click();
        await page.waitForFunction(()=>document.querySelector('#mode-value').textContent==='LOITER');
        await page.evaluate(()=>MapManager.map.setZoom(19, {animate:false}));
        const box=await page.locator('#map').boundingBox();
        await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+30);
        await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
        await page.waitForFunction(()=>document.querySelector('#mode-value').textContent==='GUIDED'&&MapManager.targetMarker);
        const command=await page.evaluate(()=>testVehicle.sent.findLast(m=>m.command===192));
        assert.equal(command.frame,6);assert.equal(command.param2,1);assert.ok(Number.isInteger(command.x));assert.equal(command.target_system,42);
        await page.locator('#disarmBtn').click();
        await page.waitForFunction(()=>document.querySelector('#armed-pill').textContent==='DISARM');
        await page.evaluate(()=>testVehicle.reject=true);
        await page.locator('#armBtn').click();
        await page.getByText('CMD COMPONENT_ARM_DISARM: DENIED',{exact:true}).waitFor();
        await page.locator('#connectBtn').click();
        await page.evaluate(()=>window.staleClose=testVehicle.sockets.at(-1).onclose);
        await page.locator('#connection_button').click();
        await page.waitForFunction(()=>testVehicle.sockets.length===2 && testVehicle.sockets[1].readyState===1);
        await page.evaluate(()=>staleClose({code:1006,reason:'late old close'}));
        assert.equal(await page.evaluate(()=>testVehicle.sockets.at(-1).readyState),1);
        await page.locator('#connectBtn').click();
        await page.locator('#disconnection_button').click();
        const count=await page.evaluate(()=>testVehicle.sent.length);
        await page.locator('#Close').click();
        await page.locator('#armBtn').click();
        assert.equal(await page.evaluate(()=>testVehicle.sent.length),count,'no commands sent after disconnect');
        await page.evaluate(()=>localStorage.clear());
        await page.unroute('**/SimpleGCS/config.js');
        await page.route('**/SimpleGCS/config.js',route=>route.fulfill({contentType:'text/javascript',body:
            'window.SIMPLEGCS_CONFIG = {defaultUrl:"wss://relay.example.org/mavlink"};'}));
        await page.reload();
        await page.waitForFunction(()=>window.AppSettings);
        assert.equal(await page.evaluate(()=>testVehicle.sockets.length),0,'configured default does not auto-connect');
        await page.locator('#connectBtn').click();
        assert.equal(await page.locator('#target_url').inputValue(),'wss://relay.example.org/mavlink');
        assert.equal(await page.locator('#signing_passphrase').inputValue(),'');
        await page.evaluate(()=>{localStorage.setItem('gcs.url','wss://saved.example.org/mavlink');localStorage.setItem('gcs.passphrase','test-signing');});
        await page.reload();
        await page.waitForFunction(()=>testVehicle.sockets.length===1);
        await page.locator('#connectBtn').click();
        assert.equal(await page.locator('#target_url').inputValue(),'wss://saved.example.org/mavlink','saved URL overrides deployment default');
        assert.equal(await page.evaluate(()=>testVehicle.sockets[0].url),'wss://saved.example.org/mavlink');
        assert.deepEqual(errors,[]);
        console.log('PASS: browser signing, discovery, circle fence, mission, video panel, arm/disarm, mode, long press, ACK errors, reconnect, disconnect and deployment defaults');
    } finally {
        await context?.close();await browser?.close();server.close();
    }
})().catch(error=>{console.error(error);process.exitCode=1});
