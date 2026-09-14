// Exercise the real browser scripts against a deterministic MAVLink vehicle.
// No vehicle connection is made: WebSocket is replaced before scripts load.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const paramFixture = require('./fixtures/params.json');

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
        context = await browser.newContext({viewport:{width:1280,height:900},hasTouch:true});
        await context.addInitScript(({paramsHex,paramOffsets}) => {
            const state = window.testVehicle = {sent:[], sockets:[], armed:false, mode:0, reject: false, passphrase:"test-signing"};
            state.paramBytes=Uint8Array.from(paramsHex.match(/../g),byte=>parseInt(byte,16));
            class VehicleSocket {
                static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
                constructor(url) {
                    this.url=url;this.readyState=0;state.sockets.push(this);
                    setTimeout(async()=>{
                        await mavlink20.ready;
                        if(this.readyState===3)return;
                        this.rx=new MAVLink20Processor(null,state.vehicleSystem||42,1);
                        this.rx.signing.secret_key=mavlink20.sha256(new TextEncoder().encode(state.passphrase));
                        this.rx.signing.sign_outgoing=true;
                        this.codec=new MAVFTP(this.rx,{send(){}});
                        this.readyState=1;this.onopen?.();this.telemetry();
                        this.timer=setInterval(()=>this.telemetry(),500);
                    },25);
                }
                emit(msg) {
                    const data=Uint8Array.from(msg.pack(this.rx));this.rx.seq=(this.rx.seq+1)&255;
                    if(msg._name==='HEARTBEAT'&&msg.autopilot===3)state.lastHeartbeatPacket=Array.from(data);
                    this.onmessage?.({data:data.buffer});
                }
                telemetry() {
                    if(this.readyState!==1||state.holdTelemetry)return;
                    if(state.silent) {
                        const system=this.rx.srcSystem;this.rx.srcSystem=99;
                        this.emit(new mavlink20.messages.heartbeat(6,8,0,0,4,3));
                        this.rx.srcSystem=system;return;
                    }
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
                        if(req.opcode===2)this.ftpPath='';
                        if(req.opcode===4||req.opcode===6)this.ftpPath=new TextDecoder().decode(req.payload).replace(/\0.*$/, '');
                        let bytes=new Uint8Array(48);const v=new DataView(bytes.buffer);
                        v.setUint16(0,0x763d,true);v.setUint16(2,1,true);v.setUint16(8,1,true);
                        v.setFloat32(10,50,true);v.setInt32(26,-350000000,true);v.setInt32(30,1490000000,true);v.setUint16(40,5003,true);bytes[47]=1;
                        if(this.ftpPath==='@MISSION/mission.dat'){v.setUint16(2,0,true);v.setUint16(40,16,true);}
                        if(this.ftpPath.startsWith('@PARAM/'))bytes=state.paramBytes;
                        if(req.opcode===6)this.upload=new Uint8Array(65535);
                        if(req.opcode===7)this.upload.set(req.payload,req.offset);
                        if(req.opcode===1&&this.upload){
                            const header=new DataView(this.upload.buffer);const packed=this.upload.slice(0,header.getUint16(4,true));
                            new DataView(packed.buffer).setUint16(4,header.getUint16(2,true),true);
                            for(const p of MAVParam.decode(packed).values()){
                                const {type,offset}=paramOffsets[p.name],view=new DataView(state.paramBytes.buffer);
                                if(type===1)view.setInt8(offset,p.value);else if(type===2)view.setInt16(offset,p.value,true);else if(type===3)view.setInt32(offset,p.value,true);else view.setFloat32(offset,p.value,true);
                            }
                            this.upload=null;
                        }
                        let payload=[];
                        if(req.opcode===4){payload=new Uint8Array(4);new DataView(payload.buffer).setUint32(0,bytes.length+(this.ftpPath.startsWith('@PARAM/')?128:0),true);}
                        if(req.opcode===15||req.opcode===5)payload=bytes.slice(req.offset,req.offset+80);
                        const eof=(req.opcode===15||req.opcode===5)&&req.offset>=bytes.length;
                        if(eof)payload=[6];
                        const body=this.codec.packOp((req.seq+1)&65535,req.session,eof?129:128,payload.length,req.opcode,1,req.offset,payload);
                        setTimeout(()=>{if(this.readyState===1)this.emit(new mavlink20.messages.file_transfer_protocol(0,msg._header.srcSystem,msg._header.srcComponent,Array.from(body)));},0);
                    }
                }
                close(code=1000) {
                    if(code!==1000&&(code<3000||code>4999))throw new DOMException('Invalid close code','InvalidAccessError');
                    (state.closeCodes ||= []).push(code);
                    clearInterval(this.timer);
                    if(state.hangClose){this.readyState=2;return;}
                    this.readyState=3;setTimeout(()=>this.onclose?.({code:1000,reason:''}),0);}
            }
            window.WebSocket=VehicleSocket;
        }, {paramsHex:paramFixture.hex,paramOffsets:paramFixture.offsets});
        const page = await context.newPage();
        await page.clock.install();
        const errors=[];page.on('pageerror', e=>errors.push(e.message));
        await page.route('**/SimpleGCS/config.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
        await page.route('**/Parameters/**/apm.pdef.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({Rover:{
            TEST_I8:{DisplayName:'Motor speed',Description:'Adjust the motor test speed',Range:{low:'-128',high:'127'}},
            TEST_OPTIONS:{Description:'Option flags',Bitmask:{0:'First option',2:'Third option'}},
            TEST_READONLY:{Description:'A read-only parameter',ReadOnly:'True'}
        }})}));
        await page.goto(`http://127.0.0.1:${server.address().port}/SimpleGCS/`);
        await page.waitForFunction(()=>window.AppSettings);
        await page.evaluate(()=>{
            window.testToasts=[];const original=GCSUtils.toast;
            GCSUtils.toast=(text,...args)=>{testToasts.push(text);return original(text,...args);};
        });
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
        const centerBeforeVideo=await page.evaluate(()=>MapManager.map.getCenter());
        const inset=await page.locator('#video-panel').boundingBox();
        await page.mouse.move(inset.x+20,inset.y+18);await page.mouse.down();await page.mouse.move(inset.x-30,inset.y-32,{steps:5});await page.mouse.up();
        const movedInset=await page.locator('#video-panel').boundingBox();assert.ok(movedInset.x<inset.x-40);
        assert.deepEqual(await page.evaluate(()=>MapManager.map.getCenter()),centerBeforeVideo,'video drag must not pan the map');
        await page.mouse.move(movedInset.x+movedInset.width-6,movedInset.y+movedInset.height-6);
        await page.mouse.down();await page.mouse.move(movedInset.x+movedInset.width-46,movedInset.y+movedInset.height+24,{steps:5});await page.mouse.up();
        const resizedInset=await page.locator('#video-panel').boundingBox();
        assert.ok(resizedInset.width<movedInset.width-30&&resizedInset.height>movedInset.height+20,'mouse can resize video');
        await page.evaluate(()=>VideoPanel.close());
        assert.equal(await page.locator('#video-panel').count(),0);
        await page.locator('#menuBtn').click();
        await page.getByText('Settings',{exact:true}).click();
        await page.getByLabel('Show Grid',{exact:true}).check();
        assert.equal(await page.evaluate(()=>localStorage.getItem('gcs.display.showGrid')),'1');
        await page.getByRole('button',{name:'Parameters',exact:true}).click();
        const parameterDialog=page.getByRole('dialog',{name:'Parameters',exact:true});
        await page.waitForFunction(()=>document.querySelectorAll('.mavparam-row').length===6);
        await page.getByText('Rover descriptions.',{exact:true}).waitFor();
        const search=page.getByRole('searchbox',{name:'Search parameters'});
        await search.fill('motor speed');
        assert.equal(await page.locator('.mavparam-row').count(),1);
        await page.getByRole('textbox',{name:'TEST_I8 value',exact:true}).fill('7');
        await parameterDialog.getByRole('button',{name:'Apply',exact:true}).click();
        await page.getByText('TEST_I8 saved and verified.',{exact:true}).waitFor();
        await page.getByRole('checkbox',{name:'Non-default only'}).check();
        await page.getByRole('button',{name:'Reset TEST_I8 to default'}).click();
        await page.getByText('TEST_I8 reset and verified.',{exact:true}).waitFor();
        assert.equal(await page.locator('.mavparam-row').count(),0);
        await page.getByRole('checkbox',{name:'Non-default only'}).uncheck();
        await search.fill('TEST_READONLY');
        assert.equal(await page.getByRole('textbox',{name:'TEST_READONLY value'}).isDisabled(),true);
        await search.fill('TEST_I32');
        const downloadPromise=page.waitForEvent('download');
        await parameterDialog.getByRole('button',{name:'Save to file'}).click();
        const download=await downloadPromise;const saved=fs.readFileSync(await download.path(),'utf8');
        assert.ok(saved.includes('TEST_I32\t16777217'));assert.ok(saved.includes('TEST_I8\t0'),'save includes parameters outside search');
        await parameterDialog.locator('input[type=file]').setInputFiles({name:'test.parm',mimeType:'text/plain',buffer:Buffer.from('TEST_I32 16777219\nTEST_READONLY 0\n')});
        await page.getByText('test.parm: 1 changes',{exact:true}).waitFor();
        await page.getByText('Skipped read-only parameters: TEST_READONLY',{exact:true}).waitFor();
        await parameterDialog.getByRole('button',{name:'Upload changes'}).click();
        await page.getByText('Parameter file uploaded and verified.',{exact:true}).waitFor();
        assert.equal(await page.getByRole('textbox',{name:'TEST_I32 value'}).inputValue(),'16777219');
        await page.setViewportSize({width:390,height:844});
        await search.fill('TEST_OPTIONS');
        await page.getByText('Bitmask options',{exact:true}).tap();
        await page.getByRole('checkbox',{name:'0: First option',exact:true}).uncheck();
        await parameterDialog.getByRole('button',{name:'Apply',exact:true}).tap();
        await page.getByText('TEST_OPTIONS saved and verified.',{exact:true}).waitFor();
        assert.equal(await page.getByRole('textbox',{name:'TEST_OPTIONS value'}).inputValue(),'4');
        assert.ok(await parameterDialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'mobile dialog has no horizontal overflow');
        assert.ok(await page.locator('.mavparam-row').evaluate(el=>el.scrollWidth<=el.clientWidth),'mobile card fits viewport');
        await parameterDialog.getByRole('button',{name:'Close',exact:true}).tap();
        await page.setViewportSize({width:1280,height:900});
        console.log('PASS: parameter fetch/defaults, metadata search, edit/reset, readonly, save/load via FTP, exact int32 and mobile bitmask UI');
        await page.locator('#armBtn').click();
        await page.waitForFunction(()=>document.querySelector('#armed-pill').textContent==='ARMED');
        await page.locator('#loiterBtn').click();
        await page.waitForFunction(()=>document.querySelector('#mode-value').textContent==='LOITER');
        await page.evaluate(()=>MapManager.map.setZoom(19, {animate:false}));
        const box=await page.locator('#map').boundingBox();
        const beforePopup=await page.evaluate(()=>testVehicle.sent.filter(m=>m.command===192).length);
        await page.evaluate(()=>L.popup().setLatLng(MapManager.map.getCenter()).setContent('<span id="popup-test">Fence details</span>').openOn(MapManager.map));
        const popupText=await page.locator('#popup-test').boundingBox();
        await page.mouse.move(popupText.x+5,popupText.y+5);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
        assert.equal(await page.evaluate(()=>testVehicle.sent.filter(m=>m.command===192).length),beforePopup,'holding popup text cannot reposition');
        await page.evaluate(()=>MapManager.map.closePopup());
        const touchSession=await context.newCDPSession(page);
        const finger1={x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2),id:1};
        const finger2={...finger1,x:finger1.x+80,id:2};
        const repositionCount=await page.evaluate(()=>testVehicle.sent.filter(m=>m.command===192).length);
        await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger1]});
        await page.waitForTimeout(500);
        await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[finger1,finger2]});
        await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[finger2]});
        await page.waitForTimeout(750);
        await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert.equal(await page.evaluate(()=>testVehicle.sent.filter(m=>m.command===192).length),repositionCount,'pinch cannot reposition');
        await page.evaluate(()=>{
            const control=document.querySelector('.leaflet-control-zoom');
            control.addEventListener('pointerup',event=>event.stopPropagation(),{once:true});
            control.dispatchEvent(new PointerEvent('pointerdown',{pointerId:77,bubbles:true,button:0}));
            control.dispatchEvent(new PointerEvent('pointerup',{pointerId:77,bubbles:true,button:0}));
        });
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
        const commandsBeforeConfirm=await page.evaluate(()=>testVehicle.sent.filter(m=>m._name==='COMMAND_INT').length);
        for(const label of ['ForceArm','ForceDisarm','Reboot']) {
            page.once('dialog',dialog=>dialog.dismiss());
            await page.locator('#menuBtn').click();await page.getByText(label,{exact:true}).click();
        }
        assert.equal(await page.evaluate(()=>testVehicle.sent.filter(m=>m._name==='COMMAND_INT').length),commandsBeforeConfirm,'cancelled confirmations send nothing');
        await page.locator('#connectBtn').click();
        await page.evaluate(()=>window.staleClose=testVehicle.sockets.at(-1).onclose);
        await page.locator('#connection_button').click();
        await page.waitForFunction(()=>testVehicle.sockets.length===2 && testVehicle.sockets[1].readyState===1);
        await page.evaluate(()=>staleClose({code:1006,reason:'late old close'}));
        assert.equal(await page.evaluate(()=>testVehicle.sockets.at(-1).readyState),1);
        await page.locator('#connectBtn').click();
        const signingInput=page.locator('#signing_passphrase');
        const submittedSystemId=await page.locator('#system_id').inputValue();
        await page.locator('#target_url').fill('wss://edited.example.org/mavlink');
        await page.locator('#system_id').fill('202');
        await page.locator('#component_id').fill('33');
        await page.locator('#send_heartbeat').check();
        await page.locator('#toggle_signing_passphrase').click();
        for(const width of [1280,390]) {
            await page.setViewportSize({width,height:900});
            await signingInput.fill('part');
            await signingInput.pressSequentially('ly typed',{delay:20});
            await signingInput.evaluate(el=>el.setSelectionRange(2,4));
            const previous=await page.evaluate(()=>({sockets:testVehicle.sockets.length,sent:testVehicle.sent.length}));
            await page.evaluate(()=>testVehicle.sockets.at(-1).close());
            await page.waitForFunction(n=>testVehicle.sockets.length===n+1&&testVehicle.sockets.at(-1).readyState===1,previous.sockets);
            await page.waitForFunction(n=>testVehicle.sent.length>n,previous.sent);
            assert.equal(await signingInput.isVisible(),true,'reconnect leaves the editor open');
            assert.equal(await signingInput.inputValue(),'partly typed');
            assert.deepEqual(await signingInput.evaluate(el=>[document.activeElement===el,el.selectionStart,el.selectionEnd,el.type]),[true,2,4,'text']);
            assert.equal(await page.locator('#target_url').inputValue(),'wss://edited.example.org/mavlink');
            assert.equal(await page.evaluate(()=>testVehicle.sockets.at(-1).url),'ws://127.0.0.1:5763','reconnect uses submitted URL');
            assert.equal(await page.evaluate(()=>localStorage.getItem('gcs.passphrase')),'test-signing','draft is not persisted');
            assert.ok(await page.evaluate(({sent,id})=>testVehicle.sent.slice(sent).every(m=>m._header.srcSystem===Number(id)),{sent:previous.sent,id:submittedSystemId}),'reconnect uses submitted IDs and signing key');
            await page.waitForTimeout(1100);
            assert.ok(await page.evaluate(sent=>testVehicle.sent.slice(sent).every(m=>m._name!=='HEARTBEAT'),previous.sent),'draft heartbeat checkbox is not applied');
        }
        await signingInput.fill(' updated-test-signing ');
        await page.evaluate(()=>testVehicle.passphrase=' updated-test-signing ');
        await page.locator('#connection_button').click();
        // Opening the editor again before onopen must also survive that callback.
        await page.locator('#connectBtn').click();
        await page.waitForFunction(()=>testVehicle.sockets.at(-1).readyState===1&&testVehicle.sockets.at(-1).url==='wss://edited.example.org/mavlink');
        assert.equal(await signingInput.isVisible(),true);
        assert.equal(await page.evaluate(()=>localStorage.getItem('gcs.passphrase')),' updated-test-signing ');
        await page.waitForFunction(()=>testVehicle.sent.some(m=>m._name==='HEARTBEAT'&&m._header.srcSystem===202&&m._header.srcComponent===33));
        console.log('PASS: desktop/mobile reconnect preserves draft, focus, selection and visibility; Connect applies new signing, URL, IDs and heartbeat settings');
        await page.setViewportSize({width:1280,height:900});
        await page.locator('#disconnection_button').click();
        const count=await page.evaluate(()=>testVehicle.sent.length);
        await page.locator('#Close').click();
        await page.locator('#armBtn').click();
        assert.equal(await page.evaluate(()=>testVehicle.sent.length),count,'no commands sent after disconnect');
        assert.equal(await page.evaluate(()=>testToasts.at(-1)),'Waiting for vehicle connection','no false ARM sent toast');
        for(const id of ['rtlBtn','loiterBtn']) {
            await page.locator('#'+id).click();
            assert.equal(await page.evaluate(()=>testToasts.at(-1)),'Waiting for vehicle connection');
        }
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
        await page.locator('#Close').click();
        // A shared relay can keep emitting packets after the selected boat dies.
        await page.waitForFunction(()=>MapManager.vehicleMarker);
        const countBeforeStall=await page.evaluate(()=>testVehicle.sockets.length);
        const operatorView=await page.evaluate(()=>{
            MapManager.map.setView([-34.5,148.5],12,{animate:false});
            testVehicle.silent=true;testVehicle.hangClose=true;
            window.deadSocket=testVehicle.sockets.at(-1);window.deadClose=deadSocket.onclose;
            return {center:MapManager.map.getCenter(),zoom:MapManager.map.getZoom()};
        });
        await page.clock.runFor(4000);
        assert.equal(await page.locator('#link-status').innerText(),'Telemetry stale');
        await page.clock.runFor(14500);
        assert.equal(await page.evaluate(()=>testVehicle.sockets.length),countBeforeStall+1,'reconnect starts within 18.5 seconds without a close event');
        assert.equal(await page.evaluate(()=>deadSocket.readyState),2,'dead socket still waits for its closing handshake');
        await page.evaluate(()=>deadClose({code:1006,reason:'late dead-peer timeout'}));
        assert.equal(await page.evaluate(()=>testVehicle.sockets.at(-1).readyState),1,'late close cannot tear down the replacement');
        assert.ok(await page.evaluate(()=>testVehicle.closeCodes.includes(4000)),'stall uses a browser-valid close code');
        assert.equal(await page.evaluate(()=>MapManager.vehicleMarker),null);
        assert.equal(await page.evaluate(()=>Object.values(MapManager.map._layers).some(l=>l._fenceType)),false,'old fence cleared');
        assert.equal(await page.locator('#armed-pill').innerText(),'—');
        await page.evaluate(()=>testVehicle.silent=false);await page.clock.runFor(1000);
        await page.waitForFunction(()=>MapManager.vehicleMarker);assert.equal(await page.locator('#link-status').innerText(),'Live');
        assert.deepEqual(await page.evaluate(()=>({center:MapManager.map.getCenter(),zoom:MapManager.map.getZoom()})),operatorView,'same-vehicle reconnect preserves pan and zoom');
        await page.evaluate(()=>{testVehicle.hangClose=false;testVehicle.vehicleSystem=43;testVehicle.sockets.at(-1).close();});
        await page.clock.runFor(2500);await page.waitForFunction(()=>MapManager.vehicleMarker);
        assert.equal(await page.evaluate(()=>MapManager.map.getZoom()),16,'different vehicle recenters');
        console.log('PASS: dead-peer reconnect starts promptly, ignores late close, clears stale data, preserves same-vehicle view and recenters a different vehicle');
        await page.evaluate(()=>{testVehicle.replayPacket=testVehicle.lastHeartbeatPacket;testVehicle.holdTelemetry=true;testVehicle.sockets.at(-1).close();});
        await page.clock.runFor(2200);
        const beforeReplay=await page.evaluate(()=>testVehicle.sent.length);
        await page.evaluate(()=>testVehicle.sockets.at(-1).onmessage({data:Uint8Array.from(testVehicle.replayPacket).buffer}));
        assert.equal(await page.evaluate(()=>testVehicle.sent.length),beforeReplay,'captured heartbeat cannot rediscover a vehicle after reconnect');
        assert.equal(await page.locator('#link-status').innerText(),'Waiting for vehicle');
        await page.evaluate(()=>testVehicle.holdTelemetry=false);await page.clock.runFor(1000);
        assert.equal(await page.locator('#link-status').innerText(),'Live');
        console.log('PASS: replayed signed telemetry stays rejected across reconnect; fresh telemetry recovers');
        // Even a duplicated tab with copied sessionStorage must get a distinct
        // component ID. Web Locks reserve IDs across pages of this origin.
        await page.locator('#connectBtn').click();
        const originalComponent=Number(await page.locator('#component_id').inputValue());
        await page.locator('#Close').click();
        const sibling=await context.newPage();
        await sibling.route('**/SimpleGCS/config.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
        await sibling.addInitScript(id=>sessionStorage.setItem('gcs.componentId',id),String(originalComponent));
        await sibling.goto(page.url());
        await sibling.waitForFunction(()=>testVehicle.sockets.length>0);
        await sibling.locator('#connectBtn').click();
        const siblingComponent=Number(await sibling.locator('#component_id').inputValue());
        assert.notEqual(siblingComponent,originalComponent,'copied per-tab settings cannot duplicate an active identity');
        await sibling.locator('#connection_button').click();
        assert.equal(await sibling.evaluate(()=>sessionStorage.getItem('gcs.componentId')),String(siblingComponent));
        assert.equal(await sibling.evaluate(()=>localStorage.getItem('gcs.componentId')),null,'component identity is not shared via localStorage');
        await sibling.close();
        assert.ok(await page.evaluate(()=>testVehicle.sent.filter(m=>m._name==='FILE_TRANSFER_PROTOCOL').every(m=>m.payload[3]!==2)),'connections and reconnects never reset other FTP sessions');
        // Explicit disconnect requests a fresh view on the next connection.
        await page.evaluate(()=>MapManager.map.setView([-34.5,148.5],12,{animate:false}));
        await page.locator('#connectBtn').click();await page.locator('#disconnection_button').click();
        await page.locator('#connection_button').click();await page.clock.runFor(1000);
        await page.waitForFunction(()=>MapManager.vehicleMarker);
        assert.equal(await page.evaluate(()=>MapManager.map.getZoom()),16,'explicit disconnect resets centering');
        console.log('PASS: duplicated tabs use independent MAVLink identities; explicit disconnect recenters on the next connection');
        // Run raw CDP drag gestures after the browser's normal tap checks.
        await page.evaluate(()=>VideoPanel.open());
        await page.setViewportSize({width:390,height:844});
        await page.waitForFunction(()=>{const r=document.querySelector('#video-panel').getBoundingClientRect();return r.left>=0&&r.right<=390;});
        const mobileInset=await page.locator('#video-panel').boundingBox();assert.ok(mobileInset.x>=0&&mobileInset.x+mobileInset.width<=390);
        const videoTouch=await context.newCDPSession(page);
        await videoTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mobileInset.x+15,y:mobileInset.y+15,id:1}]});
        await videoTouch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mobileInset.x+15,y:mobileInset.y-35,id:1}]});
        await videoTouch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert.ok((await page.locator('#video-panel').boundingBox()).y<mobileInset.y-40,'touch can drag video');
        const touchResize=await page.locator('#video-panel').boundingBox();
        await videoTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchResize.x+touchResize.width-6,y:touchResize.y+touchResize.height-6,id:1}]});
        await videoTouch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchResize.x+touchResize.width-26,y:touchResize.y+touchResize.height+24,id:1}]});
        await videoTouch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        const touchResized=await page.locator('#video-panel').boundingBox();assert.ok(touchResized.width<touchResize.width-15&&touchResized.height>touchResize.height+20,'touch can resize video');
        await page.evaluate(()=>VideoPanel.close());await page.setViewportSize({width:1280,height:900});
        assert.deepEqual(errors,[]);
        console.log('PASS: browser signing, discovery, circle fence, mission, video panel, arm/disarm, mode, long press, ACK errors, reconnect, disconnect and deployment defaults');
    } finally {
        await context?.close();await browser?.close();server.close();
    }
})().catch(error=>{console.error(error);process.exitCode=1});
