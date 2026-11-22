'use strict';

// USB (Web Serial) link to the flight controller. MAVLink encoding and parsing use the shared
// codec in modules/MAVLink/mavlink.js; this file only provides the serial transport and the
// OSD read / write sequences.

// Strip the NUL padding the codec leaves on char[16] fields.
const cleanId = value => String(value ?? '').replace(/\0.*$/s, '');

class MavlinkSerial {
    constructor(onMessage, onDisconnect) {
        this.onMessage = onMessage;
        this.onDisconnect = onDisconnect;
        this.pending = [];
        this.active = false;
        this.codec = new MAVLink20Processor(null, 255, 190);
        this.targetSystem = 0;
        this.targetComponent = 1;
    }

    async connect(baud) {
        if (!navigator.serial) {
            throw Error('Web Serial is unavailable. Use Chrome or Edge (or Firefox on Windows) over HTTPS or localhost.');
        }
        this.port = await navigator.serial.requestPort();
        await this.port.open({ baudRate: baud, bufferSize: 8192 });
        this.active = true;
        this.reader = this.port.readable.getReader();
        this.writer = this.port.writable.getWriter();
        this.readLoop();
    }

    async disconnect(error) {
        if (this.closed) return;
        this.closed = true;
        this.active = false;
        for (const p of this.pending.splice(0)) {
            clearTimeout(p.timer);
            p.reject(Error('Disconnected'));
        }
        try {
            await this.reader?.cancel();
        } catch {
            // Port may already be gone
        }
        try {
            this.reader?.releaseLock();
        } catch {
            // Already released
        }
        try {
            this.writer?.releaseLock();
        } catch {
            // Already released
        }
        try {
            await this.port?.close();
        } catch {
            // Port may already be closed
        }
        this.onDisconnect?.(error, this);
    }

    // On an unexpected end or read error, close the port properly so it can be reopened
    async readLoop() {
        let error = null;
        try {
            while (this.active) {
                const { value, done } = await this.reader.read();
                if (done) break;
                if (value) this.feed(value);
            }
        } catch (e) {
            error = e;
        }
        if (this.active) await this.disconnect(error ?? Error('USB serial connection closed'));
    }

    feed(chunk) {
        for (const message of this.codec.parseBuffer(chunk) || []) {
            if (message._id === -1 || !message._header) continue;
            this.onMessage?.(message);
            for (const pending of [...this.pending]) {
                if (pending.match(message)) {
                    this.pending.splice(this.pending.indexOf(pending), 1);
                    clearTimeout(pending.timer);
                    pending.resolve(message);
                }
            }
        }
    }

    async send(message) {
        if (!this.active) throw Error('Not connected');
        const packet = Uint8Array.from(message.pack(this.codec));
        this.codec.seq = (this.codec.seq + 1) % 256;
        await this.writer.write(packet);
    }

    wait(match, ms = 2200) {
        return new Promise((resolve, reject) => {
            const pending = { match, resolve, reject, timer: null };
            pending.timer = setTimeout(() => {
                this.pending.splice(this.pending.indexOf(pending), 1);
                reject(Error('MAVLink response timed out'));
            }, ms);
            this.pending.push(pending);
        });
    }

    // Send a message and resolve with the first received message accepted by match()
    async request(message, match, ms) {
        const waiting = this.wait(match, ms);
        try {
            await this.send(message);
        } catch (e) {
            const p = this.pending.find(x => x.match === match);
            if (p) {
                clearTimeout(p.timer);
                this.pending.splice(this.pending.indexOf(p), 1);
                p.reject(e);
            }
            waiting.catch(() => {});
            throw e;
        }
        return waiting;
    }
}

let link = null;
let fcParams = new Map();
let baseline = null;
let requestId = 100;
let operation = false;
let connecting = false;

const pause = ms => new Promise(r => setTimeout(r, ms));

function connected() {
    return Boolean(link?.active && link.targetSystem);
}

function fromTarget(m) {
    return m._header.srcSystem === link.targetSystem;
}

function busy(value) {
    operation = value;
    for (const id of ['usbConnect', 'usbDisconnect', 'readFC', 'writeFC']) $(id).disabled = value;
    updateUsbStatus();
}

function updateUsbStatus() {
    const ready = connected();
    $('usbStatus').textContent = ready
        ? `Connected: system ${link.targetSystem}, component ${link.targetComponent}`
        : link?.active
          ? 'USB open; waiting for ArduPilot heartbeat'
          : 'Disconnected';
    $('readFC').disabled = operation || !ready;
    $('writeFC').disabled = operation || !ready || !baseline;
    $('usbDisconnect').disabled = operation || !link?.active;
    const connectButton = $('usbConnect');
    connectButton.textContent = ready ? 'Connected' : connecting || link?.active ? 'Connecting…' : 'Connect USB';
    connectButton.classList.toggle('connected', ready);
    connectButton.disabled = operation || connecting || Boolean(link?.active);
}

const VEHICLE_FROM_MAV_TYPE = {
    [mavlink20.MAV_TYPE_FIXED_WING]: 'Plane',
    [mavlink20.MAV_TYPE_VTOL_DUOROTOR]: 'Plane',
    [mavlink20.MAV_TYPE_VTOL_QUADROTOR]: 'Plane',
    [mavlink20.MAV_TYPE_VTOL_TILTROTOR]: 'Plane',
    [mavlink20.MAV_TYPE_QUADROTOR]: 'Copter',
    [mavlink20.MAV_TYPE_COAXIAL]: 'Copter',
    [mavlink20.MAV_TYPE_HELICOPTER]: 'Copter',
    [mavlink20.MAV_TYPE_HEXAROTOR]: 'Copter',
    [mavlink20.MAV_TYPE_OCTOROTOR]: 'Copter',
    [mavlink20.MAV_TYPE_TRICOPTER]: 'Copter',
    [mavlink20.MAV_TYPE_DECAROTOR]: 'Copter',
    [mavlink20.MAV_TYPE_DODECAROTOR]: 'Copter',
    [mavlink20.MAV_TYPE_GROUND_ROVER]: 'Rover',
    [mavlink20.MAV_TYPE_SURFACE_BOAT]: 'Rover',
};

function onMessage(m) {
    if (
        m._id === mavlink20.MAVLINK_MSG_ID_HEARTBEAT &&
        m.autopilot === mavlink20.MAV_AUTOPILOT_ARDUPILOTMEGA &&
        m.type !== mavlink20.MAV_TYPE_GCS &&
        m.type !== mavlink20.MAV_TYPE_GIMBAL
    ) {
        if (!link.targetSystem) {
            link.targetSystem = m._header.srcSystem;
            link.targetComponent = m._header.srcComponent;
            log(
                `ArduPilot heartbeat detected (system ${link.targetSystem}, vehicle MAV_TYPE ${m.type}).`,
                'success'
            );
            const vehicle = VEHICLE_FROM_MAV_TYPE[m.type];
            if (vehicle && state.vehicle !== vehicle) {
                $('vehicle').value = vehicle;
                switchVehicle(vehicle);
            }
        }
        updateUsbStatus();
    }
    if (m._id === mavlink20.MAVLINK_MSG_ID_PARAM_VALUE && fromTarget(m)) {
        fcParams.set(cleanId(m.param_id), {
            value: m.param_value,
            type: m.param_type,
            index: m.param_index,
            count: m.param_count,
        });
    }
}

function onDisconnect(error, source) {
    // A late close callback from an earlier connection must not tear down the current one
    if (source && source !== link) return;
    baseline = null;
    if (error) log(`Warning: ${error.message}`, 'warning');
    link = null;
    clearFcParams();
    updateUsbStatus();
}

// Forget the previous FC's parameters so the Current value column doesn't show stale values
function clearFcParams() {
    fcParams = new Map();
    render();
}

// Current FC value of a parameter, from the last parameter list read (or later PARAM_VALUE updates).
function fcParamValue(name) {
    return fcParams.get(name)?.value;
}

// MAV_TYPE is ambiguous (a QuadPlane can report a multirotor type, a Copter tailsitter a VTOL
// type), so once the parameter list is in, pick the vehicle from parameters unique to each.
function vehicleFromParams() {
    if (fcParams.has('Q_ENABLE')) return 'Plane';
    if (fcParams.has('MODE1') && !fcParams.has('FLTMODE1')) return 'Rover';
    if (fcParams.has('PILOT_SPD_UP') || fcParams.has('PILOT_SPEED_UP')) return 'Copter';
    return null;
}

async function connectUsb() {
    if (connecting || link?.active) return;
    if (!window.isSecureContext || !navigator.serial) {
        log(
            'Warning: USB requires Web Serial: use Chrome or Edge (or Firefox on Windows) on an HTTPS page or localhost. On Linux, snap builds of Firefox and Chromium cannot access serial ports.',
            'warning'
        );
        return;
    }
    connecting = true;
    // A read from a previous connection (possibly another FC) must not enable Write.
    baseline = null;
    clearFcParams();
    updateUsbStatus();
    try {
        await mavlink20.ready;
        link = new MavlinkSerial(onMessage, onDisconnect);
        await link.connect(Number($('baud').value));
        updateUsbStatus();
        log('USB port opened. Waiting for ArduPilot heartbeat…');
        const currentLink = link;
        const started = Date.now();
        while (currentLink.active && link === currentLink && !connected() && Date.now() - started < 5000) {
            await pause(100);
        }
        if (link === currentLink && !connected()) {
            log(
                'Warning: No ArduPilot heartbeat received within 5 seconds. Disconnecting USB; check baud rate and selected port.',
                'warning'
            );
            await currentLink.disconnect();
            if (link === currentLink) link = null;
            updateUsbStatus();
        }
    } catch (e) {
        log(`USB connection failed: ${e.message}`, 'warning');
        if (link?.active) await link.disconnect();
        link = null;
    } finally {
        connecting = false;
        updateUsbStatus();
    }
}

async function disconnectUsb() {
    if (link) await link.disconnect();
}

async function showSlot(link, screen, index) {
    if (!link?.active) throw Error('USB link lost');
    const id = ++requestId;
    const msg = await link.request(
        new mavlink20.messages.osd_param_show_config(link.targetSystem, link.targetComponent, id, screen, index),
        m => m._id === mavlink20.MAVLINK_MSG_ID_OSD_PARAM_SHOW_CONFIG_REPLY && fromTarget(m) && m.request_id === id,
        2600
    );
    if (msg.result === mavlink20.OSD_PARAM_INVALID_PARAMETER_INDEX) {
        // No parameter assigned, or the stored KEY/IDX/GRP no longer resolves. OSD_PARAM_CONFIG can
        // still assign one, so treat it as an empty, writable slot.
        return { ...emptySlot(), source: 'FC read (unassigned)', unassigned: true };
    }
    if (msg.result !== 0) throw Error(`OSD${screen} slot ${index}: result ${msg.result}`);
    return {
        name: cleanId(msg.param_id).trim().toUpperCase(),
        enabled: true,
        source: 'FC read',
        min: String(Number(msg.min_value.toPrecision(7))),
        max: String(Number(msg.max_value.toPrecision(7))),
        increment: String(Number(msg.increment.toPrecision(7))),
        config_type: msg.config_type,
    };
}

// Fetch one parameter into fcParams (via onMessage); returns undefined if the FC doesn't reply
async function readParam(readLink, name) {
    try {
        await readLink.request(
            new mavlink20.messages.param_request_read(readLink.targetSystem, readLink.targetComponent, name, -1),
            m => m._id === mavlink20.MAVLINK_MSG_ID_PARAM_VALUE && fromTarget(m) && cleanId(m.param_id) === name,
            2500
        );
    } catch {
        // Treated as unknown by the caller
    }
    return fcParams.get(name);
}

async function readFC() {
    if (!connected()) return;
    busy(true);
    const readLink = link;
    const linkLost = () => link !== readLink || !connected();
    baseline = null;
    try {
        fcParams = new Map();
        log('Reading FC parameter list (this may take 15–30 seconds)…');
        await link.send(new mavlink20.messages.param_request_list(link.targetSystem, link.targetComponent));
        let lastCount = 0;
        let stable = Date.now();
        const start = Date.now();
        while (Date.now() - start < 30000) {
            await pause(250);
            if (fcParams.size !== lastCount) {
                lastCount = fcParams.size;
                stable = Date.now();
            }
            const count = [...fcParams.values()][0]?.count;
            if (count && fcParams.size >= count) break;
            if (Date.now() - stable > 4000 && fcParams.size > 20) break;
        }
        log(`Received ${fcParams.size} FC parameters.`);
        const vehicle = vehicleFromParams();
        if (vehicle && state.vehicle !== vehicle) {
            log(`Vehicle type set to ${vehicle} from the FC parameter list.`);
            $('vehicle').value = vehicle;
            switchVehicle(vehicle);
        }

        const next = {};
        let successes = 0;
        for (const screen of [5, 6]) {
            for (let index = 1; index <= 9; index++) {
                const key = `${screen}:${index}`;
                if (linkLost()) throw Error('USB link lost during read; reconnect and read again.');
                try {
                    const slot = await showSlot(readLink, screen, index);
                    next[key] = slot;
                    successes++;
                    if (slot.unassigned) continue;
                    const enName = `OSD${screen}_PARAM${index}_EN`;
                    if (!fcParams.has(enName)) await readParam(readLink, enName);
                    const en = fcParams.get(enName);
                    slot.enabled = en ? en.value >= 0.5 : true;
                    slot.source = en ? 'FC read' : 'FC read (EN unknown)';
                    // OSD_PARAM_CONFIG always sets EN, so a write could silently enable a disabled slot
                    if (!en) slot.enUnknown = true;
                    if (!slot.name) {
                        log(
                            `Warning: OSD${screen} slot ${index} returned an empty param_id after MAVLink 2 zero-padding (EN=${en?.value ?? 'unknown'}, min=${slot.min}, max=${slot.max}).`,
                            'warning'
                        );
                    }
                } catch (e) {
                    log(`Warning: ${e.message}`, 'warning');
                    next[key] = null;
                }
            }
        }
        if (linkLost()) throw Error('USB link lost during read; reconnect and read again.');
        if (!successes) {
            throw Error('No OSD slot replies received. The firmware may not support OSD configuration MAVLink messages.');
        }
        for (const [key, slot] of Object.entries(next)) {
            if (slot) state.slots[key] = slot;
        }
        const unresolved = Object.entries(next)
            .filter(([, v]) => v && v.enabled && !v.name)
            .map(([k]) => k);
        baseline = unresolved.length
            ? null
            : Object.fromEntries(
                  Object.entries(next)
                      .filter(([, v]) => v && !v.enUnknown)
                      .map(([k, v]) => [k, structuredClone(v)])
              );
        if (unresolved.length) {
            log(
                `Warning: ${unresolved.length} enabled slot(s) still have no name (${unresolved.join(', ')}). Writing is blocked until the read is resolved.`,
                'warning'
            );
        }
        render();
        updateUsbStatus();
        log(
            `Read completed: ${successes}/18 OSD slots. Stored names are shown even for disabled slots; Source column identifies their state.`,
            'success'
        );
        const enUnknown = Object.entries(next)
            .filter(([, v]) => v?.enUnknown)
            .map(([k]) => k);
        if (enUnknown.length) {
            log(
                `Warning: Could not read the enable flag for slot(s) ${enUnknown.join(', ')}; they will not be written until a read succeeds.`,
                'warning'
            );
        }
        if (successes < 18) {
            log('Warning: Some slots did not respond and will not be writable until a successful read.', 'warning');
        }
    } catch (e) {
        log(`Read failed: ${e.message}`, 'warning');
    } finally {
        busy(false);
    }
}

function sameNumber(a, b) {
    const x = Number(a);
    const y = Number(b);
    return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Math.abs(x - y) <= Math.max(1e-5, Math.abs(x) * 1e-5, Math.abs(y) * 1e-5)
    );
}

function slotChanged(slot, original) {
    if (!original) return false;
    if ((slot.enabled === true) !== (original.enabled === true)) return true;
    if (slot.enabled !== true) return false;
    return (
        String(slot.name || '').trim().toUpperCase() !== String(original.name || '').trim().toUpperCase() ||
        Number(slot.config_type || 0) !== Number(original.config_type || 0) ||
        ['min', 'max', 'increment'].some(f => !sameNumber(slot[f], original[f]))
    );
}

function numericSlot(slot, key) {
    const result = {};
    for (const field of ['min', 'max', 'increment']) {
        const value = slot[field];
        if (String(value).trim() === '' || !Number.isFinite(Number(value))) {
            throw Error(`${key}: ${field} must be a number`);
        }
        result[field] = Number(value);
    }
    if (result.min > result.max) throw Error(`${key}: minimum exceeds maximum`);
    if (result.increment <= 0) {
        throw Error(
            `OSD${key.replace(':', ' slot ')} is enabled but its increment must be positive. Uncheck Enable to leave its stored values untouched, or enter a positive increment.`
        );
    }
    return result;
}

async function setEnable(screen, index, enabled) {
    const param = `OSD${screen}_PARAM${index}_EN`;
    const previous = fcParams.get(param);
    if (!previous) {
        if (!enabled) throw Error(`${param} not available: cannot disable this slot`);
        log(`Warning: ${param} unavailable; skipping enable flag.`, 'warning');
        return;
    }
    const val = enabled ? 1 : 0;
    const ack = await link.request(
        new mavlink20.messages.param_set(link.targetSystem, link.targetComponent, param, val, previous.type),
        m =>
            m._id === mavlink20.MAVLINK_MSG_ID_PARAM_VALUE &&
            fromTarget(m) &&
            cleanId(m.param_id) === param &&
            Math.abs(m.param_value - val) < 0.01,
        2500
    );
    if (!ack) throw Error(`${param}: no acknowledgement`);
}

async function writeFC() {
    if (!connected() || !baseline) return;

    // Collect and validate the changed slots before touching the FC
    const changes = [];
    try {
        for (const screen of [5, 6]) {
            for (let index = 1; index <= 9; index++) {
                const key = `${screen}:${index}`;
                const slot = state.slots[key];
                if (!(key in baseline)) continue;
                if (!slotChanged(slot, baseline[key])) continue;
                const active = slot.enabled === true;
                if (active && !slot.name) throw Error(`OSD${screen} slot ${index} is enabled but has no parameter name.`);
                if (active && !fcParams.has(slot.name)) {
                    throw Error(`${slot.name} is not in the FC parameter list. Read from FC again or check firmware.`);
                }
                const numbers = active ? numericSlot(slot, key) : null;
                changes.push({ screen, index, key, slot, numbers });
            }
        }
    } catch (e) {
        log(`Warning: ${e.message}`, 'warning');
        return;
    }
    if (!changes.length) {
        log('No changes since the last FC read.');
        return;
    }
    const summary = changes
        .map(
            x =>
                `OSD${x.screen} slot ${x.index}: ${x.numbers ? x.slot.name : 'DISABLED (stored: ' + (x.slot.name || 'none') + ')'}`
        )
        .join('\n');
    if (
        !confirm(
            `Write ${changes.length} OSD slot change(s) to the flight controller?\n\n${summary}\n\nThe aircraft must be disarmed. Back up settings first.`
        )
    ) {
        return;
    }

    busy(true);
    let completed = 0;
    try {
        for (const change of changes) {
            const { screen, index, slot, numbers, key } = change;
            if (slot.enabled !== true) {
                await setEnable(screen, index, false);
            } else {
                const id = ++requestId;
                const msg = await link.request(
                    new mavlink20.messages.osd_param_config(
                        link.targetSystem,
                        link.targetComponent,
                        id,
                        screen,
                        index,
                        slot.name,
                        slot.config_type || 0,
                        numbers.min,
                        numbers.max,
                        numbers.increment
                    ),
                    m => m._id === mavlink20.MAVLINK_MSG_ID_OSD_PARAM_CONFIG_REPLY && fromTarget(m) && m.request_id === id,
                    3500
                );
                if (msg.result !== 0) throw Error(`${key} (${slot.name}) rejected: result ${msg.result}`);
                await setEnable(screen, index, true);
            }
            completed++;
            log(
                `Wrote OSD${screen} slot ${index}: ${numbers ? slot.name : 'disabled (stored assignment retained)'}`,
                'success'
            );
        }
        log(`Write completed: ${completed}/${changes.length} changed slots. Reading back for verification…`, 'success');

        // Read back every changed slot to confirm the FC accepted it
        for (const { screen, index, key } of changes) {
            const actual = await showSlot(link, screen, index);
            if (state.slots[key].enabled !== true) {
                const param = `OSD${screen}_PARAM${index}_EN`;
                const response = await link.request(
                    new mavlink20.messages.param_request_read(link.targetSystem, link.targetComponent, param, -1),
                    m => m._id === mavlink20.MAVLINK_MSG_ID_PARAM_VALUE && fromTarget(m) && cleanId(m.param_id) === param,
                    2500
                );
                if (response.param_value !== 0) throw Error(`${key}: disable did not verify`);
                baseline[key] = { ...actual, enabled: false, source: 'FC read' };
                state.slots[key].source = 'FC read';
            } else {
                const wanted = state.slots[key];
                if (actual.name !== wanted.name) throw Error(`${key}: readback name mismatch (${actual.name})`);
                const type = Number(wanted.config_type || 0);
                if (Number(actual.config_type) !== type) {
                    throw Error(`${key}: readback type mismatch (sent ${type}, FC has ${actual.config_type})`);
                }
                const ranges = ['min', 'max', 'increment'];
                if (ranges.some(f => !sameNumber(actual[f], wanted[f]))) {
                    const got = `${actual.min}..${actual.max} step ${actual.increment}`;
                    // A typed slot always uses the FC's fixed ranges for its type, so that is expected
                    if (type === 0) throw Error(`${key}: readback range mismatch (FC has ${got})`);
                    log(
                        `Warning: OSD${screen} slot ${index} (${actual.name}) is a typed slot (type ${type}); the FC applied its fixed range ${got} instead of the values entered.`,
                        'warning'
                    );
                }
                // Keep what the FC actually holds
                baseline[key] = { ...actual, enabled: true, source: 'FC read' };
                state.slots[key] = structuredClone(baseline[key]);
            }
        }
        render();
        log('All changed OSD slots verified successfully.', 'success');
    } catch (e) {
        log(
            `Warning: Write stopped after ${completed}/${changes.length} slots: ${e.message}. Read from FC to resynchronize.`,
            'warning'
        );
        baseline = null;
    } finally {
        busy(false);
    }
}

$('usbConnect').addEventListener('click', () => connectUsb().catch(error => log(`Warning: ${error.message}`, 'warning')));
$('usbDisconnect').addEventListener('click', () => disconnectUsb().catch(error => log(`Warning: ${error.message}`, 'warning')));
$('readFC').addEventListener('click', () => withOverlay(readFC));
$('writeFC').addEventListener('click', () => withOverlay(writeFC));
updateUsbStatus();
