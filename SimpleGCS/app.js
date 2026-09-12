/*
  app.js - Simple, mobile-friendly GCS app for autonomous buoys
  Refactored to use MapManager and utility modules
*/

(async () => {
    await mavlink20.ready;
    // --- State ---
    let MAVLink = new MAVLink20Processor();
    let gcsSystemId = 255, gcsComponentId = 190;
    let vehSysId = -1, vehCompId = -1;
    let parameterClient = null;
    const parameterUI = new MAVParamUI();
    function disconnectParameters() {
        parameterClient?.disconnect();
        parameterClient = null;
        parameterUI.setClient(null);
    }

    // Vehicle type cache
    const VehicleType = { mavType: null, cls: "plane", lastSeen: 0 };

    // Connection
    let ws = null;
    let hbInterval = null;
    let reconnectTimer = null;
    let reconnectAttempts = 0;
    let intentionalDisconnect = false;
    let lastConnectionSettings = null;

    // Link health tracking
    let lastRxMs = 0;
    let linkHealthTimer = null;

    // Messages dictionary
    let messages = {};
    // Track pending command ACKs (by MAV_CMD id)
    const PendingAcks = new Set();

    // Human-readable names for common MAV_CMDs we send
    function mavCmdName(id) {
        switch (id) {
            case mavlink20.MAV_CMD_COMPONENT_ARM_DISARM: return "COMPONENT_ARM_DISARM";
            case mavlink20.MAV_CMD_DO_SET_MODE: return "DO_SET_MODE";
            case mavlink20.MAV_CMD_DO_REPOSITION: return "DO_REPOSITION";
            case mavlink20.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN: return "PREFLIGHT_REBOOT_SHUTDOWN";
            case mavlink20.MAV_CMD_DO_FENCE_ENABLE: return "DO_FENCE_ENABLE";
            default: return "MAV_CMD " + id;
        }
    }

    // Human-readable names for MAV_RESULT
    function mavResultName(code) {
        switch (code) {
            case mavlink20.MAV_RESULT_ACCEPTED: return "ACCEPTED";
            case mavlink20.MAV_RESULT_TEMPORARILY_REJECTED: return "TEMPORARILY_REJECTED";
            case mavlink20.MAV_RESULT_DENIED: return "DENIED";
            case mavlink20.MAV_RESULT_UNSUPPORTED: return "UNSUPPORTED";
            case mavlink20.MAV_RESULT_FAILED: return "FAILED";
            case mavlink20.MAV_RESULT_IN_PROGRESS: return "IN_PROGRESS";
            case mavlink20.MAV_RESULT_CANCELLED: return "CANCELLED";
            default: return "RESULT " + code;
        }
    }


    // Telemetry state
    let telemetry = {
        batteryPct: null,
        currentA: null,
        speed: 0,
        lastUpdate: 0,
        armed: false,
        modeName: "—",
        numSats: null
    };

    // --- AppSettings (persisted) ---
    const AppSettings = (() => {
        const LS = {
            tiles: "gcs.tiles.provider",
            autoFence: "gcs.auto.fetchFence",
            autoMission: "gcs.auto.fetchMission",
            showGPSNumSats: "gcs.display.showGPSNumSats",
            showGrid: "gcs.display.showGrid",
            showLocation: "gcs.display.showLocation"
        };

        function get(key, def) {
            const v = localStorage.getItem(key);
            if (v == null) return def;
            return v;
        }

        function getBool(key, def = false) {
            const v = localStorage.getItem(key);
            if (v == null) return def;
            return v === "1" || v === "true";
        }

        const state = {
            tiles: get(LS.tiles, "osm"),
            autoFetchFence: getBool(LS.autoFence, true),
            autoFetchMission: getBool(LS.autoMission, false),
            showGPSNumSats: getBool(LS.showGPSNumSats, false),
            showGrid: getBool(LS.showGrid, false),
            showLocation: getBool(LS.showLocation, false)
        };

        function save() {
            localStorage.setItem(LS.tiles, state.tiles);
            localStorage.setItem(LS.autoFence, state.autoFetchFence ? "1" : "0");
            localStorage.setItem(LS.autoMission, state.autoFetchMission ? "1" : "0");
            localStorage.setItem(LS.showGPSNumSats, state.showGPSNumSats ? "1" : "0");

            localStorage.setItem(LS.showGrid, state.showGrid ? "1" : "0");
            localStorage.setItem(LS.showLocation, state.showLocation ? "1" : "0");
        }

        return {
            get tiles() { return state.tiles; },
            set tiles(v) { state.tiles = v; save(); },
            get autoFetchFence() { return state.autoFetchFence; },
            set autoFetchFence(v) { state.autoFetchFence = !!v; save(); },
            get autoFetchMission() { return state.autoFetchMission; },
            set autoFetchMission(v) { state.autoFetchMission = !!v; save(); },
            get showGPSNumSats() { return state.showGPSNumSats; },
            set showGPSNumSats(v) { state.showGPSNumSats = !!v; save(); },
            get showGrid() { return state.showGrid; },
            set showGrid(v) { state.showGrid = !!v; save(); },
            get showLocation() { return state.showLocation; },
            set showLocation(v) { state.showLocation = !!v; save(); },
            save, state
        };
    })();
    window.AppSettings = AppSettings;

    // Initialize map
    const map = MapManager.init("map");


    // Apply persisted display options
    try { AppSettings.showGrid ? MetricGrid.on() : MetricGrid.off(); } catch (e) { console.warn('MetricGrid toggle failed:', e); }
    try { if (AppSettings.showLocation) { UserLocation.start(); } } catch (e) { console.warn('UserLocation start failed:', e); }

    // Setup fence and mission modules
    Fence.init({ map, MAVLink, toast: window.GCSUtils.toast, sendCommandInt });
    Mission.init({ map, MAVLink, toast: window.GCSUtils.toast, sendCommandInt });

    // UI elements
    const armBtn = document.getElementById("armBtn");
    const disarmBtn = document.getElementById("disarmBtn");
    const rtlBtn = document.getElementById("rtlBtn");
    const loiterBtn = document.getElementById("loiterBtn");
    const recenterBtn = document.getElementById("recenterBtn");
    const connectBtn = document.getElementById("connectBtn");

    // --- Command helpers ---
    function sendCommandInt(cmd, params = []) {
        if (!ws || ws.readyState !== WebSocket.OPEN || vehSysId < 1) {
            window.GCSUtils.toast("Waiting for vehicle connection");
            return;
        }

        const payload = new mavlink20.messages.command_int(
            vehSysId,
            vehCompId,
            mavlink20.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
            cmd,
            0, 0,
            params[0] || 0, params[1] || 0, params[2] || 0, params[3] || 0,
            params[4] || 0, params[5] || 0, params[6] || 0
        );

        const pkt = payload.pack(MAVLink);
        try { PendingAcks.add(cmd); } catch {}
        ws.send(Uint8Array.from(pkt));
        MAVLink.seq = (MAVLink.seq + 1) % 256;
    }

    function sendSetMode(mode) {
        if (!ws || ws.readyState !== WebSocket.OPEN || vehSysId < 1) {
            window.GCSUtils.toast("Waiting for vehicle connection");
            return;
        }
        sendCommandInt(mavlink20.MAV_CMD_DO_SET_MODE, [
            mavlink20.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
            mode
        ]);
    }

    function sendReboot() {
        sendCommandInt(mavlink20.MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN, [1]);
    }

    function sendForceDisarm() {
        sendCommandInt(mavlink20.MAV_CMD_COMPONENT_ARM_DISARM, [0, 21196]);
    }

    function sendForceArm() {
        sendCommandInt(mavlink20.MAV_CMD_COMPONENT_ARM_DISARM, [1, 21196]);
    }

    // --- Telemetry Display ---
    function initTelemetryDisplay() {
        const toolbar = document.getElementById("toolbar");
        const telemetryDiv = document.createElement("div");
        telemetryDiv.id = "telemetry";
        telemetryDiv.style.cssText = `
            background: rgba(255,255,255,0.1);
            border-radius: 8px;
            padding: 8px;
            margin: 10px 0;
            font-size: 11px;
            text-align: center;
            color: #fff;
            width: calc(var(--barW) - 12px);
        `;

        // Status display
        const statusDiv = document.createElement("div");
        statusDiv.id = "status-display";
        statusDiv.style.cssText = "margin-bottom: 8px;";
        statusDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                <span></span>
                <span id="armed-pill" style="
                    padding:1px 4px; border-radius:999px; font-weight:500;
                    background:#9e9e9e; color:#111;">DISARM</span>
            </div>
            <div style="opacity:0.8">MODE: <span id="mode-value" style="font-weight:700">—</span></div>
        `;
        telemetryDiv.prepend(statusDiv);

        // Battery display
        const batteryDiv = document.createElement("div");
        batteryDiv.id = "battery-display";
        batteryDiv.style.cssText = "margin-bottom: 6px;";
        batteryDiv.innerHTML = `
            <div style="opacity: 0.7; margin-bottom: 2px;">BATTERY</div>
            <div id="battery-value" style="font-size: 14px; font-weight: bold;">---%</div>
            <div id="current-value" style="font-size: 12px; opacity: 0.85;">--- A</div>
        `;

        // Speed display
        const speedDiv = document.createElement("div");
        speedDiv.id = "speed-display";
        speedDiv.innerHTML = `
            <div style="opacity: 0.7; margin-bottom: 2px;">SPEED</div>
            <div id="speed-value" style="font-size: 14px; font-weight: bold;">--- knots</div>
        `;
        // GPS display
        const gpsDiv = document.createElement("div");
        gpsDiv.id = "gps-display";
        gpsDiv.style.cssText = "margin-top: 6px;";
        gpsDiv.innerHTML = `
            <div style="opacity: 0.7; margin-bottom: 2px;">GPS</div>
            <div id="gps-sats-value" style="font-size: 14px; font-weight: bold;">— sats</div>
        `;

        // LTE display
        const lteDiv = document.createElement("div");
        lteDiv.id = "lte-display";
        lteDiv.style.cssText = "margin-top: 6px;";
        lteDiv.innerHTML = `
            <div style="opacity:.7; margin-bottom:2px;">LTE</div>
            <div id="lte-carrier" style="font-size:13px; font-weight:600;">—</div>
            <div id="lte-rsrp" style="font-size:12px; opacity:.85;">— dBm</div>
        `;

        telemetryDiv.appendChild(batteryDiv);
        telemetryDiv.appendChild(speedDiv);
        telemetryDiv.appendChild(gpsDiv);
        telemetryDiv.appendChild(lteDiv);

        const spacer = toolbar.querySelector('div[style*="flex:1"]');
        toolbar.insertBefore(telemetryDiv, spacer);
        const gpsWrapInit = document.getElementById("gps-display");
        if (gpsWrapInit) gpsWrapInit.style.display = AppSettings.showGPSNumSats ? "block" : "none";
    }

    function updateTelemetryDisplay() {
        const batteryEl = document.getElementById("battery-value");
        const currentEl = document.getElementById("current-value");
        const speedEl = document.getElementById("speed-value");
        const armedEl = document.getElementById("armed-pill");
        const modeEl = document.getElementById("mode-value");
        const gpsWrap = document.getElementById("gps-display");
        const gpsEl = document.getElementById("gps-sats-value");

        // Battery
        if (batteryEl) {
            if (telemetry.batteryPct !== null && telemetry.batteryPct >= 0) {
                let color = "#4caf50";
                if (telemetry.batteryPct < 20) color = "#f44336";
                else if (telemetry.batteryPct < 40) color = "#ff9800";
                batteryEl.textContent = `${telemetry.batteryPct}%`;
                batteryEl.style.color = color;
            } else {
                batteryEl.textContent = "---";
                batteryEl.style.color = "#fff";
            }
        }

        // Current
        if (currentEl) {
            if (telemetry.currentA !== null && telemetry.currentA >= 0) {
                currentEl.textContent = `${telemetry.currentA.toFixed(1)} A`;
            } else {
                currentEl.textContent = "--- A";
            }
        }

        // Speed
        if (speedEl) {
            if (telemetry.speed >= 0) {
                const speedKnots = 1.94384449 * telemetry.speed;
                speedEl.textContent = `${speedKnots.toFixed(1)} knots`;
            } else {
                speedEl.textContent = "--- knots";
            }
        }

        // Armed status
        if (armedEl) {
            if (telemetry.armed) {
                armedEl.textContent = "ARMED";
                armedEl.style.background = "#81c784";
            } else {
                armedEl.textContent = "DISARM";
                armedEl.style.background = "#9e9e9e";
            }
        }

        if (modeEl) modeEl.textContent = telemetry.modeName || "—";
        // GPS NumSats
        if (gpsWrap) gpsWrap.style.display = AppSettings.showGPSNumSats ? "block" : "none";
        if (gpsEl && AppSettings.showGPSNumSats) {
            if (typeof telemetry.numSats === "number") {
                gpsEl.textContent = `${telemetry.numSats} sats`;
                gpsEl.style.color = (telemetry.numSats >= 20) ? "#4caf50" : "#fff";
            } else {
                gpsEl.textContent = "— sats";
                gpsEl.style.color = "#fff";
            }
        }

    }

    function updateLTE() {
        const carrierEl = document.getElementById("lte-carrier");
        const rsrpEl = document.getElementById("lte-rsrp");
        if (!carrierEl || !rsrpEl) return;

        const sysmsgs = messages[vehSysId];
        if (!sysmsgs) return;

        const nvfMcc = sysmsgs["NAMED_VALUE_FLOAT[LTE_MCCMNC]"];
        const nvfRsrp = sysmsgs["NAMED_VALUE_FLOAT[LTE_RSRP]"];

        // Carrier
        let carrierTxt = "—";
        if (nvfMcc && typeof nvfMcc.value === "number") {
            const code = Math.round(nvfMcc.value);
            carrierTxt = window.GCSUtils.MCCMNC_MAP[code] || String(code);
        }
        carrierEl.textContent = carrierTxt;

        // RSRP (0.1 dB units → dBm)
        let rsrpTxt = "— dBm";
        if (nvfRsrp && typeof nvfRsrp.value === "number") {
            const dbm = nvfRsrp.value / 10.0;
            rsrpTxt = `${dbm.toFixed(1)} dBm`;
        }
        rsrpEl.textContent = rsrpTxt;
    }

    // --- StatusText log ---
    const StatusLog = {
        max: 500,
        items: [],

        push(sev, txt) {
            if (Array.isArray(txt)) txt = String.fromCharCode(...txt);
            txt = String(txt || "").replace(/\0+$/, "");
            this.items.push({ t: new Date(), sev: sev ?? -1, txt });
            if (this.items.length > this.max) {
                this.items.splice(0, this.items.length - this.max);
            }
            this.renderIfOpen();
        },

        tag(sev) {
            const map = ["EMERG","ALERT","CRIT","ERR","WARN","NOTICE","INFO","DEBUG"];
            return (sev >= 0 && sev < map.length) ? map[sev] : "INFO";
        },

        _tip: null,
        _box: null,

        open(anchorEl) {
            if (this._tip) { this._tip.show(); return; }

            const wrap = document.createElement("div");
            wrap.style.cssText = "display:flex; flex-direction:column; gap:6px; width:520px;";

            const header = document.createElement("div");
            header.textContent = "Messages (STATUSTEXT)";
            header.style.cssText = "font-weight:600;";

            const box = document.createElement("pre");
            box.style.cssText = `
                margin:0; background:#111; color:#eee; border-radius:6px;
                padding:8px; max-height:15.5em; overflow:auto;
                font: 12px/1.25 ui-monospace, SFMono-Regular, Menlo, monospace;
                white-space: pre-wrap; word-break: break-word;
            `;
            this._box = box;

            const help = document.createElement("div");
            help.style.cssText = "opacity:.7; font-size:12px;";
            help.textContent = "Newest at the bottom. Keeps last 500 messages.";

            wrap.append(header, box, help);

            this._tip = tippy(anchorEl, {
                content: wrap,
                interactive: true,
                trigger: "click",
                theme: "light-border",
                placement: "right-end",
                appendTo: () => document.body,
                zIndex: 9999,
                onShow: () => this.renderIfOpen()
            });

            this._tip.show();
        },

        renderIfOpen() {
            if (!this._box) return;
            const lines = this.items.map(it => {
                const t = it.t.toTimeString().slice(0, 8);
                return `${t}  [${this.tag(it.sev)}] ${it.txt}`;
            });
            this._box.textContent = lines.join("\n");
            this._box.scrollTop = this._box.scrollHeight;
        }
    };

    // --- Menu System ---
    function initMenuButton() {
        const toolbar = document.getElementById("toolbar");
        const recenterBtn = document.getElementById("recenterBtn");

        const menuBtn = document.createElement("button");
        menuBtn.id = "menuBtn";
        menuBtn.className = "btn small";
        menuBtn.innerHTML = "☰";
        menuBtn.style.fontSize = "18px";

        toolbar.insertBefore(menuBtn, recenterBtn);

        const menuDiv = document.createElement("div");
        menuDiv.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 4px;
            min-width: 150px;
        `;

        const menuItems = [
            { text: "Video (Inset)", action: () => { window.VideoPanel?.toggle(); menuTip.hide(); }},
            { text: "Video (New Window)", action: () => { window.VideoPanel?.openNewWindow(); menuTip.hide(); }},
            { text: "Messages", action: () => { StatusLog.open(menuBtn); menuTip.hide(); } },
            { text: "Settings", action: () => { openSettingsTip(menuBtn); menuTip.hide(); } },
            { text: "Fetch Fence", action: () => { Fence.fetch(); menuTip.hide(); }},
            { text: "Fetch Mission", action: () => { Mission.fetch(); menuTip.hide(); }},
            { text: "Fence Disable", action: () => { Fence.disable(); menuTip.hide(); }},
            { text: "Fence Enable", action: () => { Fence.enable(); menuTip.hide(); }},
            { text: "Reboot", action: () => { sendReboot(); menuTip.hide(); }},
            { text: "ForceDisarm", action: () => { sendForceDisarm(); menuTip.hide(); }},
            { text: "ForceArm", action: () => { sendForceArm(); menuTip.hide(); }},
        ];

        menuItems.forEach(item => {
            const btn = document.createElement("button");
            btn.style.cssText = `
                padding: 8px 12px;
                background: #f0f0f0;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                text-align: left;
                font-size: 14px;
                transition: background 0.2s;
            `;
            btn.textContent = item.text;
            btn.onmouseover = () => btn.style.background = "#e0e0e0";
            btn.onmouseout = () => btn.style.background = "#f0f0f0";
            btn.onclick = item.action;
            menuDiv.appendChild(btn);
        });

        const menuTip = tippy(menuBtn, {
            content: menuDiv,
            interactive: true,
            trigger: "click",
            theme: "light-border",
            placement: "right-start",
            appendTo: () => document.body,
            zIndex: 10000
        });

        return menuBtn;
    }

    // Settings dialog
    function openSettingsTip(anchorEl) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex; flex-direction:column; gap:12px; min-width:280px;";

    // Map tiles section
    const tilesSection = document.createElement("div");
    tilesSection.innerHTML = `<label style="display:block; font-weight:600; margin-bottom:4px;">Map Tiles</label>`;
    const select = document.createElement("select");
    select.style.cssText = "width:100%; padding:6px;";

    const allProviders = [
        ["osm", "OpenStreetMap (default)"],
        ["opentopomap", "OpenTopoMap"],
        ["carto-light", "Carto Light"],
        ["carto-dark", "Carto Dark"],
        ["esri-world-imagery", "Esri World Imagery (Satellite)"],
        ["au-ga-topo", "Australia — Geoscience Topographic"],
        ["uk-os-opendata", "UK — Ordnance Survey OpenData"],
        ["google", "Google Maps (Roadmap)"],
        ["google-terrain", "Google Maps (Terrain)"],
        ["google-satellite", "Google Maps (Satellite)"],
        ["google-hybrid", "Google Maps (Hybrid)"]
    ];

    // Filter out Google options if no API key
    const hasGoogleKey = window.GMAPS_API_KEY && window.GMAPS_API_KEY.length > 0;
    const availableProviders = allProviders.filter(([val]) =>
        hasGoogleKey || !val.startsWith('google')
    );

    availableProviders.forEach(([val, label]) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = label;
        if (AppSettings.tiles === val) opt.selected = true;
        select.appendChild(opt);
    });

    // If current setting is Google but no key, switch to OSM
    if (!hasGoogleKey && AppSettings.tiles.startsWith('google')) {
        AppSettings.tiles = 'osm';
        MapManager.applyTileProvider();
    }

    // Apply tile changes immediately
    select.onchange = () => {
        AppSettings.tiles = select.value;
        MapManager.applyTileProvider();
    };

    tilesSection.appendChild(select);

    // Add API key configuration section
    const apiSection = document.createElement("div");
    apiSection.innerHTML = `
        <label style="display:block; font-weight:600; margin-bottom:4px;">Google Maps API Key</label>
        <input type="text" id="gmaps-key-input" placeholder="Enter API key (optional)"
               style="width:100%; padding:6px; margin-bottom:4px;">
        <small style="opacity:0.7; font-size:11px;">
            Leave empty to use only free tile sources.
            <a href="https://developers.google.com/maps/documentation/javascript/get-api-key"
               target="_blank" style="color:#1976d2;">Get a key</a>
        </small>
    `;

    const keyInput = apiSection.querySelector('#gmaps-key-input');
    keyInput.value = window.GMAPS_API_KEY || '';
    keyInput.onchange = () => {
        const newKey = keyInput.value.trim();
        localStorage.setItem('gcs.gmaps.apikey', newKey);
        window.GMAPS_API_KEY = newKey;
        window.GCSUtils.toast("API key saved. Refresh page to apply.");
    };

        // Display options section
        const displaySection = document.createElement("div");
        displaySection.innerHTML = `<label style="display:block; font-weight:600; margin-bottom:6px;">Display Options</label>`;

        const mkChk = (id, label, init, onChange) => {
            const d = document.createElement("label");
            d.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:4px;";
            const c = document.createElement("input");
            c.type = "checkbox";
            c.checked = init;
            c.id = id;
            c.onchange = onChange;
            const s = document.createElement("span");
            s.textContent = label;
            d.append(c, s);
            return { wrap: d, chk: c };
        };

        const showGrid = mkChk("show-grid", "Show Grid", MetricGrid.enabled || false, (e) => {
            if (e.target.checked) {
                MetricGrid.on();
            } else {
                MetricGrid.off();
            }
        });

        const showLocation = mkChk("show-location", "Show My Location", AppSettings.showLocation, (e) => {
            AppSettings.showLocation = e.target.checked;
            if (e.target.checked) { UserLocation.start(); } else { UserLocation.stop(); }
        });

        displaySection.appendChild(showGrid.wrap);
        displaySection.appendChild(showLocation.wrap);
        const showGPS = mkChk("show-gps-sats", "Show GPS NumSats", AppSettings.showGPSNumSats, (e) => {
            AppSettings.showGPSNumSats = e.target.checked;
            updateTelemetryDisplay();
        });
        displaySection.appendChild(showGPS.wrap);

        // Auto-fetch section
        const autoSection = document.createElement("div");
        autoSection.innerHTML = `<label style="display:block; font-weight:600; margin-bottom:6px;">Auto-fetch on Connect</label>`;

        const fence = mkChk("auto-fence", "Fetch fence on first heartbeat", AppSettings.autoFetchFence, (e) => {
            AppSettings.autoFetchFence = e.target.checked;
        });

        const mission = mkChk("auto-mission", "Fetch mission on first heartbeat", AppSettings.autoFetchMission, (e) => {
            AppSettings.autoFetchMission = e.target.checked;
        });

        autoSection.appendChild(fence.wrap);
        autoSection.appendChild(mission.wrap);

        // Close button
        const closeBtn = document.createElement("button");
        closeBtn.className = "btn small";
        closeBtn.textContent = "Close";
        closeBtn.style.cssText = "align-self: flex-end; margin-top: 8px;";
        closeBtn.onclick = () => {
            tip.hide();
        };

        const parametersBtn = document.createElement("button");
        parametersBtn.className = "btn small";
        parametersBtn.textContent = "Parameters";
        parametersBtn.onclick = () => { tip.hide(); parameterUI.open(); };
        wrap.append(parametersBtn, tilesSection, displaySection, autoSection, closeBtn);

        const tip = tippy(anchorEl, {
            content: wrap,
            interactive: true,
            trigger: "manual",
            theme: "light-border",
            appendTo: () => document.body,
            placement: "right-start"
        });
        tip.show();
    }

    // --- Connection Management ---
    function initConnection() {
        const button = connectBtn;
        const tipDiv = document.createElement("div");
        tipDiv.appendChild(document.importNode(
            document.getElementById("connection_tip_template").content, true)
                          );

        const tip = tippy(button, {
            content: tipDiv,
            interactive: true,
            trigger: "click",
            theme: "light-border",
            appendTo: () => document.body,
            placement: "right-start"
        });

        tipDiv.querySelector("#Close").onclick = () => tip.hide();

        const urlInput = tipDiv.querySelector("#target_url");
        const hbCheckbox = tipDiv.querySelector("#send_heartbeat");
        const passphraseInput = tipDiv.querySelector("#signing_passphrase");
        const passphraseToggle = tipDiv.querySelector("#toggle_signing_passphrase");
        function showPassphrase(visible) {
            passphraseInput.type = visible ? "text" : "password";
            const label = visible ? "Hide signing passphrase" : "Show signing passphrase";
            passphraseToggle.setAttribute("aria-label", label);
            passphraseToggle.setAttribute("aria-pressed", String(visible));
            passphraseToggle.title = label;
            passphraseToggle.querySelector(".eye-slash").style.display = visible ? "none" : "";
        }
        passphraseToggle.onclick = () => showPassphrase(passphraseInput.type === "password");
        tip.setProps({ onHide: () => showPassphrase(false) });
        const connectBtnDialog = tipDiv.querySelector("#connection_button");
        const disconnectBtn = tipDiv.querySelector("#disconnection_button");
        const sysInput = tipDiv.querySelector("#system_id");
        const compInput = tipDiv.querySelector("#component_id");

        // Random IDs to avoid collisions
        function rand100_200() {
            return Math.floor(Math.random() * 101) + 100;
        }
        sysInput.value = rand100_200();
        compInput.value = rand100_200();

        const LS_KEYS = {
            url: "gcs.url",
            pass: "gcs.passphrase"
        };

        urlInput.value = localStorage.getItem(LS_KEYS.url) ||
            window.SIMPLEGCS_CONFIG?.defaultUrl || "ws://127.0.0.1:5763";
        passphraseInput.value = localStorage.getItem(LS_KEYS.pass) || "";

        // Reconnects use the last submitted settings, never an in-progress edit.
        function readConnectionSettings() {
            const sid = parseInt(sysInput.value || "255", 10);
            const cid = parseInt(compInput.value || "190", 10);
            return {
                url: urlInput.value.trim(),
                passphrase: passphraseInput.value.trim(),
                systemId: (sid >= 1 && sid <= 255) ? sid : 255,
                componentId: (cid >= 0 && cid <= 255) ? cid : 190,
                sendHeartbeat: hbCheckbox.checked
            };
        }

        function setConnState(state) {
            if (state === "connected") button.style.background = "#00c853";
            else if (state === "connecting") button.style.background = "#f9a825";
            else if (state === "error") button.style.background = "#e53935";
            else button.style.background = "";
        }


        function startLinkHealthMonitor() {
            if (linkHealthTimer) return;
            linkHealthTimer = setInterval(() => {
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                    connectBtn.style.background = "";
                    connectBtn.textContent = "Connect";
                    return;
                }
                const now = Date.now();
                const lagMs = now - (lastRxMs || now);

                // If we've had no MAVLink packets for >15s, force a reconnect
                if (lagMs > 15000) {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        try { console.warn("No MAVLink for 15s; forcing reconnect");
                              ws.close(1011, "link stall");
                            } catch (e) {}
                    }
                    return; // onclose will schedule reconnect and reset UI
                }
if (lagMs > 3000) {
                    const secs = Math.round(lagMs / 1000);
                    connectBtn.style.background = "#e53935";
                    connectBtn.textContent = `Connect (${secs}s)`;
                } else {
                    connectBtn.style.background = "#00c853";
                    connectBtn.textContent = "Connect";
                }
            }, 500);
        }

        function stopLinkHealthMonitor() {
            if (linkHealthTimer) {
                clearInterval(linkHealthTimer);
                linkHealthTimer = null;
            }
            connectBtn.style.background = "";
            connectBtn.textContent = "Connect";
        }


        function startHeartbeatLoop(enabled) {
            if (hbInterval) {
                clearInterval(hbInterval);
                hbInterval = null;
            }
            if (!enabled) return;

            hbInterval = setInterval(() => {
                try {
                    const msg = new mavlink20.messages.heartbeat(6, 8, 0, 0, 4);
                    const pkt = msg.pack(MAVLink);
                    if (ws?.readyState !== WebSocket.OPEN) return;
                    ws.send(Uint8Array.from(pkt));
                    MAVLink.seq = (MAVLink.seq + 1) % 256;
                } catch (e) {
                    console.error("Heartbeat send failed:", e?.message || e);
                    if (hbInterval) {
                        clearInterval(hbInterval);
                        hbInterval = null;
                    }
                    setConnState("error");
                    window.GCSUtils.toast("Heartbeat stopped after error");
                }
            }, 1000);
        }

        function connect(settings) {
            disconnect(false);
            gcsSystemId = MAVLink.srcSystem = settings.systemId;
            gcsComponentId = MAVLink.srcComponent = settings.componentId;
            lastConnectionSettings = settings;
            intentionalDisconnect = false;
            MAVLink.buf = new Uint8Array();
            MAVLink.expected_length = mavlink20.HEADER_LEN;
            MAVLink.signing.stream_timestamps = {};
            MAVLink.signing.timestamp = Math.max(MAVLink.signing.timestamp,
                Math.floor((Date.now() - Date.UTC(2015, 0, 1)) * 100));
            const pass = settings.passphrase;
            MAVLink.signing.secret_key = pass ? mavlink20.sha256(new TextEncoder().encode(pass)) : new Uint8Array();
            MAVLink.signing.sign_outgoing = pass.length > 0;

            setConnState("connecting");
            const socket = new WebSocket(settings.url);
            ws = socket;
            ws.binaryType = "arraybuffer";

            ws.onopen = () => {
                if (ws !== socket) return;
                setConnState("connected");
                reconnectAttempts = 0;
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
                startHeartbeatLoop(settings.sendHeartbeat);
                lastRxMs = Date.now();
                startLinkHealthMonitor();
                window.GCSUtils.toast("Connected");};

            ws.onerror = (error) => {
                if (ws !== socket) return;
                console.log("WebSocket error:", error);
                setConnState("error");
            };

            ws.onclose = (event) => {
                if (ws !== socket) return;
                ws = null;
                vehSysId = vehCompId = -1;
                console.log("WebSocket closed:", event.code, event.reason);

                if (hbInterval) {
                    clearInterval(hbInterval);
                    hbInterval = null;
                }

                Fence.onDisconnected();
                Mission.onDisconnected();
                FTPManager.clearLink();
                disconnectParameters();
                stopLinkHealthMonitor();

                if (!intentionalDisconnect) {
                    setConnState("error");
                    scheduleReconnect();
                } else {
                    setConnState("");
                    window.GCSUtils.toast("Disconnected");
                }
            };

            ws.onmessage = event => { if (ws === socket) handleMessage(event); };
        }

        function scheduleReconnect() {
            if (reconnectTimer || intentionalDisconnect) return;

            reconnectAttempts++;
            const delay = 2000;

            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                if (!intentionalDisconnect && lastConnectionSettings) {
                    connect(lastConnectionSettings);
                }
            }, delay);
        }

        function disconnect(intentional = true) {
            intentionalDisconnect = intentional;

            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }

            if (intentional) {
                reconnectAttempts = 0;
                lastConnectionSettings = null;
            }

            const oldSocket = ws;
            ws = null;
            if (oldSocket) {
                oldSocket.onopen = oldSocket.onclose = oldSocket.onerror = oldSocket.onmessage = null;
                try { oldSocket.close(); } catch {}
            }
            vehSysId = vehCompId = -1;
            PendingAcks.clear();
            messages = {};
            Fence.onDisconnected();
            Mission.onDisconnected();
            FTPManager.clearLink();
            disconnectParameters();
            stopLinkHealthMonitor();

            if (hbInterval) {
                clearInterval(hbInterval);
                hbInterval = null;
            }

            if (intentional) {
                setConnState("");
                window.GCSUtils.toast("Disconnected");
            }

            MapManager.clearTargetPosition();
        }

        connectBtnDialog.onclick = () => {
            if (!urlInput.checkValidity()) {
                window.GCSUtils.toast("Enter ws:// or wss:// URL");
                urlInput.focus();
                return;
            }

            const settings = readConnectionSettings();
            localStorage.setItem(LS_KEYS.url, settings.url);
            const pass = settings.passphrase;
            if (pass.length) {
                localStorage.setItem(LS_KEYS.pass, pass);
            } else {
                localStorage.removeItem(LS_KEYS.pass);
            }

            tip.hide();
            connect(settings);
        };

        disconnectBtn.onclick = () => {
            disconnect(true);
        };

        // Reconnect only to an explicitly saved endpoint.
        if (localStorage.getItem(LS_KEYS.url)) connect(readConnectionSettings());
    }

    // --- Message Handling ---
    function handleMessage(evt) {
        const buf = new Uint8Array(evt.data);
        MAVLink.pushBuffer(buf);

        while (true) {
            const m = MAVLink.parseChar(null);
            if (m === null) break;
            if (m._id == -1 || !m._header) continue;

            lastRxMs = Date.now();

            // Update messages dictionary
            if (!(m._header.srcSystem in messages)) {
                messages[m._header.srcSystem] = {};
            }
            messages[m._header.srcSystem][m._name] = m;

            const trimNuls = v => (typeof v === "string" ? v.replace(/\0+$/, "") : v);

            if (m._instance_field !== undefined) {
                let instanceValue = trimNuls(m[m._instance_field]);
                messages[m._header.srcSystem][`${m._name}[${instanceValue}]`] = m;
            }

            processMessage(m);
        }
    }

    function processMessage(m) {
        // HEARTBEAT - vehicle discovery and status
        if (m._name === "HEARTBEAT" && m.autopilot == mavlink20.MAV_AUTOPILOT_ARDUPILOTMEGA) {
            if (vehSysId < 1) {
                vehSysId = m._header.srcSystem;
                vehCompId = m._header.srcComponent;
                FTPManager.setLink(MAVLink, ws, vehSysId, vehCompId);
                parameterClient = new MAVParam({ftp: FTPManager});
                parameterUI.setClient(parameterClient, MAVParam.vehicleName(m.type));
                Fence.onConnected(ws);
                Mission.onConnected(ws);

            }

            if (m._header.srcSystem !== vehSysId || m._header.srcComponent !== vehCompId) return;

            VehicleType.mavType = m.type;
            VehicleType.cls = window.GCSUtils.classifyVehicle(m.type);
            VehicleType.lastSeen = Date.now();

            telemetry.armed = !!(m.base_mode & mavlink20.MAV_MODE_FLAG_SAFETY_ARMED);

            const isRoverish = (VehicleType.mavType === mavlink20.MAV_TYPE_GROUND_ROVER) ||
                  (VehicleType.mavType === mavlink20.MAV_TYPE_SURFACE_BOAT);
            telemetry.modeName = isRoverish ?
                (window.GCSUtils.roverModeNames[m.custom_mode] || `${m.custom_mode}`) :
                `${m.custom_mode}`;

            updateTelemetryDisplay();
        }

        if (m._header.srcSystem !== vehSysId || m._header.srcComponent !== vehCompId) return;

        // GLOBAL_POSITION_INT - position and speed
        if (m._name === "GLOBAL_POSITION_INT") {
            const lat = m.lat / 1e7;
            const lon = m.lon / 1e7;
            MapManager.updateVehiclePosition(lat, lon, VehicleType.cls, MapManager.lastHeadingDeg);

            // Calculate ground speed
            const vxMs = m.vx / 100.0;
            const vyMs = m.vy / 100.0;
            telemetry.speed = Math.sqrt(vxMs * vxMs + vyMs * vyMs);
            updateTelemetryDisplay();
        }

        // ATTITUDE - heading
        if (m._name === "ATTITUDE") {
            if (typeof m.yaw === "number") {
                MapManager.updateVehicleHeading(m.yaw);
            }
        }

        // File transfer
        if (m._name === "FILE_TRANSFER_PROTOCOL") {
            FTPManager.handleMessage(m);
        }

        // Battery status
        if (m._name === "BATTERY_STATUS") {
            telemetry.batteryPct = m.battery_remaining;
            telemetry.lastUpdate = Date.now();
            telemetry.currentA = m.current_battery / 100.0;
            updateTelemetryDisplay();
        }

        // GPS status
        if (m._name === "GPS_RAW_INT" || m._name === "GPS2_RAW") {
            if (typeof m.satellites_visible === "number") {
                telemetry.numSats = m.satellites_visible;
                updateTelemetryDisplay();
            }
        }

        // System status
        if (m._name === "SYS_STATUS") {
            const sensorsEnabled = m.onboard_control_sensors_enabled;
            Fence.setEnabled((sensorsEnabled & mavlink20.MAV_SYS_STATUS_GEOFENCE) != 0);
        }

        // Target position
        if (m._name === "POSITION_TARGET_GLOBAL_INT") {
            if (m.lat_int !== 0 || m.lon_int !== 0) {
                const lat = m.lat_int / 1e7;
                const lon = m.lon_int / 1e7;
                MapManager.updateTargetPosition(lat, lon);
            } else {
                MapManager.clearTargetPosition();
            }
        }

        // Command acknowledgements
        if (m._name === "COMMAND_ACK") {
            if (gcsSystemId == m.target_system &&
                gcsComponentId == m.target_component) {
                // Optional: check we were expecting this command
                if (PendingAcks.has(m.command)) {
                    if (m.result !== mavlink20.MAV_RESULT_IN_PROGRESS) {
                        PendingAcks.delete(m.command);
                        if (m.result !== mavlink20.MAV_RESULT_ACCEPTED) {
                            const msg = `CMD ${mavCmdName(m.command)}: ${mavResultName(m.result)}`;
                            // Log to STATUSTEXT panel and show a bottom-of-map toast
                            try { StatusLog.push(mavlink20.MAV_SEVERITY_ERROR ?? 3, msg); } catch {}
                            try { window.GCSUtils.toast(msg, 3000); } catch {}
                        }
                    }
                }
            }
        }

        // Status messages
        if (m._name === "STATUSTEXT") {
            StatusLog.push(m.severity, m.text);
        }
    }

    // --- Button Event Handlers ---
    armBtn.onclick = () => {
        sendCommandInt(mavlink20.MAV_CMD_COMPONENT_ARM_DISARM, [1]);
        window.GCSUtils.toast("ARM sent");
    };

    disarmBtn.onclick = () => {
        sendCommandInt(mavlink20.MAV_CMD_COMPONENT_ARM_DISARM, [0]);
        window.GCSUtils.toast("DISARM sent");
    };

    rtlBtn.onclick = () => {
        sendSetMode(window.GCSUtils.roverModes.RTL);
        window.GCSUtils.toast("RTL sent");
    };

    loiterBtn.onclick = () => {
        sendSetMode(window.GCSUtils.roverModes.LOITER);
        window.GCSUtils.toast("LOITER sent");
    };

    recenterBtn.onclick = () => {
        MapManager.recenterOnVehicle();
    };

    // Handle long press for repositioning
    window.addEventListener('mapLongPress', (e) => {
        const { lat, lng } = e.detail;
        sendCommandInt(mavlink20.MAV_CMD_DO_REPOSITION, [
            0, mavlink20.MAV_DO_REPOSITION_FLAGS_CHANGE_MODE, 0, 0,
            lat * 1e7, lng * 1e7, 0
        ]);
        window.GCSUtils.toast("DO_REPOSITION sent");
    });

    // --- Initialize Everything ---
    initTelemetryDisplay();
    initMenuButton();
    initConnection();

    // Start LTE update timer
    setInterval(updateLTE, 1000);

    console.log("Simple GCS Map ready.");
})();
