// Authenticated video regression, isolated from MAVLink and real vehicles.
// Set SIMPLEGCS_WHEP_TEST_URL to a local MediaMTX test stream's WHEP URL
// (viewer / fixture-view) to additionally verify actual decoded video frames.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

(async () => {
    const root = path.resolve(__dirname,'../SimpleGCS');
    const server = http.createServer((req,res) => {
        if(req.url==='/') {
            res.setHeader('Content-Type','text/html; charset=utf-8');
            res.end('<!doctype html><script src="vendor/mediamtx/reader.js"></script><script src="webrtc-player.js"></script><script src="video.js"></script>');
            return;
        }
        const file=path.resolve(root,'.'+req.url);
        if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
        fs.readFile(file,(error,body)=>{
            if(error){res.writeHead(404).end();return;}
            res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.end(body);
        });
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser,context;
    try {
        browser=process.env.SIMPLEGCS_CDP_URL ? await chromium.connectOverCDP(process.env.SIMPLEGCS_CDP_URL) : await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
        context=await browser.newContext();
        await context.addInitScript(()=>{
            localStorage.setItem('video.user','viewer');
            localStorage.setItem('video.pass','fixture-view');
        });
        const requests=[], errors=[];
        const endpoint=process.env.SIMPLEGCS_WHEP_TEST_URL;
        let reject=true;
        await context.route('http://127.0.0.1:8889/**',async route=>{
            const req=route.request();requests.push({method:req.method(),url:req.url(),auth:req.headers().authorization});
            if(reject || !endpoint) {
                await route.fulfill({status:401,body:'Unauthorized'});return;
            }
            const source=new URL(req.url());
            const target=new URL(endpoint);
            target.pathname=source.pathname;
            const response=await route.fetch({url:target.href});
            const headers=response.headers();
            if(headers.location)headers.location=new URL(headers.location,target).href.replace(target.origin,source.origin);
            await route.fulfill({response,headers});
        });
        const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.evaluate(()=>VideoPanel.open());
        await page.getByText(/WebRTC · .*401/).waitFor();
        assert.equal(await page.locator('#video-panel iframe').count(),0);
        const auth='Basic '+Buffer.from('viewer:fixture-view').toString('base64');
        assert.ok(requests.some(r=>r.method==='POST'));
        assert.ok(requests.filter(r=>['OPTIONS','POST'].includes(r.method)).every(r=>r.auth===auth));
        await page.evaluate(()=>VideoPanel.close());
        let count=requests.length;await page.waitForTimeout(2300);
        assert.equal(requests.length,count,'closing cancels reconnect');
        const popupPromise=context.waitForEvent('page');
        await page.evaluate(()=>VideoPanel.openNewWindow());
        const popup=await popupPromise;popup.on('pageerror',e=>errors.push(e.message));
        await popup.getByText(/WebRTC · .*401/).waitFor();
        assert.equal(await popup.evaluate(()=>opener),null);
        assert.equal(new URL(popup.url()).pathname,'/video.html');
        assert.equal(new URL(popup.url()).search,'','credentials are never put in the URL');
        await popup.close();
        count=requests.length;await page.waitForTimeout(2300);assert.equal(requests.length,count);
        console.log('PASS: inset and new-window authentication, visible 401 errors and retry cancellation');
        if(endpoint) {
            await page.evaluate(()=>VideoPanel.open());
            await page.getByText(/WebRTC · .*401/).waitFor();
            reject=false;
            await page.waitForFunction(()=>document.querySelector('video')?.getVideoPlaybackQuality().totalVideoFrames>3);
            await page.getByText('WebRTC · Live',{exact:true}).waitFor();
            const next=context.waitForEvent('page');await page.evaluate(()=>VideoPanel.openNewWindow());
            const playingPopup=await next;
            await playingPopup.waitForFunction(()=>document.querySelector('video')?.getVideoPlaybackQuality().totalVideoFrames>3);
            await playingPopup.getByText('WebRTC · Live',{exact:true}).waitFor();
            await playingPopup.close();await page.evaluate(()=>VideoPanel.close());
            console.log('PASS: recovery after authentication failure and decoded MediaMTX video in inset and new window');
        }
        assert.ok(requests.filter(r=>['OPTIONS','POST'].includes(r.method)).every(r=>r.auth===auth));
        assert.deepEqual(errors,[]);
    } finally {
        await context?.close();await browser?.close();server.close();
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
