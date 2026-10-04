const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');
const assets = require('../legacy-assets.json');

const app = path.resolve(__dirname, '..');
const root = path.resolve(app, '../..');
const vite = path.join(app, 'node_modules/vite/bin/vite.js');

async function startServer(mode, base) {
    const child = spawn(process.execPath, [vite, ...(mode === 'preview' ? ['preview'] : []),
        '--host', '127.0.0.1', '--port', '0'], {
        cwd: app, env: { ...process.env, PORTAL_BASE_PATH: base, BROWSER: 'none' },
        detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const exited = once(child, 'exit');
    const stop = async () => {
        if (child.exitCode !== null || child.signalCode) return;
        process.kill(-child.pid, 'SIGTERM');
        await exited;
    };
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Server startup timeout: ' + output)), 30000);
            const read = chunk => {
                output += chunk.toString();
                const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
                if (match) { clearTimeout(timer); resolve(match[0]); }
            };
            child.stdout.on('data', read);
            child.stderr.on('data', read);
            child.once('error', error => { clearTimeout(timer); reject(error); });
            child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited ' + code + ': ' + output)); });
        });
        return { origin, stop };
    } catch (error) {
        await stop();
        throw error;
    }
}

async function walk(directory, prefix = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const relative = prefix + entry.name;
        if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative + '/'));
        else files.push(relative);
    }
    return files.sort();
}

async function compareListings(browser, origin, base) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
        for (const [file, route] of [['index.html', ''], ['Dev/index.html', 'Dev/']]) {
            // Compare with the retained landing pages, not a second copy of the registry.
            await page.setContent(await fs.readFile(path.join(root, file), 'utf8'));
            const snapshot = () => ({
                title: document.title,
                text: document.body.innerText.replace(/\s+/g, ' ').trim(),
                links: [...document.querySelectorAll('a')].map(a => a.getAttribute('href')),
                images: [...document.images].map(img => ({
                    src: img.getAttribute('src'), width: img.style.width, height: img.style.height,
                    background: img.style.backgroundColor,
                })),
            });
            const expected = await page.evaluate(snapshot);
            const canonical = value => {
                if (!value || value.startsWith('https://')) return value;
                return base + value.replace(/^\.\.?\//, '');
            };
            expected.links = expected.links.map(canonical);
            expected.images = expected.images.map(img => ({ ...img, src: canonical(img.src) }));
            const response = await page.goto(origin + base + route);
            assert.equal(response.status(), 200);
            await page.locator('#root h1').waitFor();
            assert.deepEqual(await page.evaluate(snapshot), expected);
            await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
            assert.equal(await page.locator('h1').evaluate(el => getComputedStyle(el).width), '1200px');
        }
        await page.goto(origin + base + 'Dev?example=1#anchor');
        await page.locator('#root h1').waitFor();
        assert.equal(page.url(), origin + base + 'Dev/?example=1#anchor');
        // Navigate a legacy page without loading its scripts or contacting hardware.
        await context.route('**/*', route => route.request().resourceType() === 'document' ? route.continue() : route.abort());
        await page.goto(origin + base + 'DFULoader?serial=test-only#anchor', { waitUntil: 'domcontentloaded' });
        assert.equal(page.url(), origin + base + 'DFULoader/?serial=test-only#anchor');
        assert.deepEqual(errors, []);
    } finally {
        await context.close();
    }
}

async function checkAssets(origin, base) {
    for (const file of assets) {
        const response = await fetch(origin + base + file);
        assert.equal(response.status, 200, file);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(path.join(root, file)), file);
        const mime = path.extname(file);
        if (mime === '.js') assert.match(response.headers.get('content-type'), /javascript/, file);
        if (mime === '.json') assert.match(response.headers.get('content-type'), /application\/json/, file);
        if (mime === '.wasm') assert.match(response.headers.get('content-type'), /application\/wasm/, file);
        if (mime === '.html') assert.match(response.headers.get('content-type'), /text\/html/, file);
    }
    for (const file of assets.filter(file => file.endsWith('/index.html'))) {
        const directory = file.slice(0, -11);
        const response = await fetch(origin + base + directory + '?test=1', { redirect: 'manual' });
        assert.equal(response.status, 308, directory);
        assert.equal(response.headers.get('location'), origin + base + directory + '/?test=1', directory);
        const page = await fetch(origin + base + directory + '/');
        assert.deepEqual(Buffer.from(await page.arrayBuffer()), await fs.readFile(path.join(root, file)), file);
    }
    for (const route of ['index.html', 'Dev/', 'Dev/index.html']) {
        const response = await fetch(origin + base + route);
        assert.equal(response.status, 200, route);
        assert.match(await response.text(), /id="root"/);
    }
    for (const route of ['missing.js', 'missing/', 'Dev/missing.js', 'SimpleGCS/missing.js',
        'SimpleGCS/config.js', '.git/config', 'package.json', 'tests/fixtures/mavlink.json',
        'node_modules/playwright/package.json', 'modules/JsDataflashParser/Readme.md',
        '@fs' + root + '/.git/config', '@fs' + root + '/SimpleGCS/.gitignore']) {
        const response = await fetch(origin + base + route);
        assert.equal(response.status, 404, route);
        assert.doesNotMatch(await response.text(), /id="root"/, route);
    }
    if (base !== '/') {
        const redirect = await fetch(origin + base.slice(0, -1) + '?test=1', { redirect: 'manual' });
        assert.equal(redirect.status, 308);
        assert.equal(redirect.headers.get('location'), origin + base + '?test=1');
        assert.equal((await fetch(origin + '/RotationCheck/')).status, 404);
    }
}

async function transferFile(browser, origin, base) {
    const context = await browser.newContext();
    try {
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.origin === origin) return route.continue();
            // HardwareReport imports Octokit during startup. This test never calls GitHub.
            if (url.hostname === 'esm.sh') return route.fulfill({
                contentType: 'text/javascript', body: 'export const request = () => { throw new Error("No live GitHub calls in portal tests"); };',
            });
            return route.abort();
        });
        await context.addInitScript(() => {
            // Exercise the actual OpenIn receiver through its file-input change event;
            // parsing and numerical behavior belong to later tool conversion stages.
            const dispatch = HTMLInputElement.prototype.dispatchEvent;
            HTMLInputElement.prototype.dispatchEvent = function(event) {
                if (this.id !== 'fileItem' || event.type !== 'change') return dispatch.call(this, event);
                const file = this.files[0];
                void file.arrayBuffer().then(bytes => {
                    window.receivedFile = { name: file.name, bytes: [...new Uint8Array(bytes)] };
                });
                return true;
            };
        });
        const page = await context.newPage();
        await page.goto(origin + base + 'MAGFit/');
        await page.evaluate(() => {
            const transfer = new DataTransfer();
            transfer.items.add(new File([new Uint8Array([0, 1, 42, 128, 255])], 'portal-transfer.bin'));
            document.getElementById('fileItem').files = transfer.files;
            document.getElementById('OpenIn').disabled = false;
        });
        await page.locator('#OpenIn').hover();
        const popupPromise = context.waitForEvent('page');
        await page.locator('input[value="Hardware Report"]').click();
        const popup = await popupPromise;
        await popup.waitForFunction(() => window.receivedFile);
        assert.equal(popup.url(), origin + base + 'HardwareReport/');
        assert.deepEqual(await popup.evaluate(() => window.receivedFile), {
            name: 'portal-transfer.bin', bytes: [0, 1, 42, 128, 255],
        });
        assert.equal(await popup.evaluate(() => window.opener.location.origin), origin);
    } finally {
        await context.close();
    }
}

test('legacy HTML references are included in the runtime allowlist', async () => {
    const allowed = new Set(assets);
    for (const file of assets.filter(file => file.endsWith('.html'))) {
        const html = await fs.readFile(path.join(root, file), 'utf8');
        for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"'<>]*)["']/g)) {
            const value = match[1];
            if (!value || /^(?:https?:|data:|#|javascript:)/.test(value)) continue;
            const url = new URL(value, 'https://portal.test/' + file);
            const target = decodeURIComponent(url.pathname.slice(1));
            if (!path.extname(target) || target === 'SimpleGCS/config.js') continue;
            assert.ok(allowed.has(target), file + ' references unstaged ' + target);
        }
    }
});

test('portal, legacy routes and file transfer in development and built preview', { timeout: 240000 }, async t => {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
    try {
        // Finish with the default build so pnpm preview works immediately afterward.
        for (const base of ['/Tools/WebTools/', '/']) {
            execFileSync(process.execPath, [vite, 'build'], {
                cwd: app, env: { ...process.env, PORTAL_BASE_PATH: base }, stdio: 'pipe',
            });
            assert.deepEqual(await walk(path.join(app, '.legacy-assets')), [...assets].sort());
            const bundle = await walk(path.join(app, 'dist/client'));
            assert.deepEqual(bundle.filter(file => file !== 'index.html' && file !== '.assetsignore' && !file.startsWith('assets/')), [...assets].sort());
            for (const mode of ['preview', 'dev']) {
                await t.test(mode + ' at ' + base, async () => {
                    const server = await startServer(mode, base);
                    try {
                        await checkAssets(server.origin, base);
                        await compareListings(browser, server.origin, base);
                        await transferFile(browser, server.origin, base);
                    } finally {
                        await server.stop();
                    }
                });
            }
        }
    } finally {
        await browser.close();
    }
});
