/*
  app.js — Simple, mobile-friendly GCS map for autonomous buoys
 */

(() => {
    // --- State ---
    let MAVLink = new MAVLink20Processor(); // provided by ../modules/MAVLink/mavlink.js
    // IDs we send as (GCS identity)
    let gcsSystemId = 255, gcsComponentId = 190;
    // Target vehicle (auto-discovered from incoming msgs)
    let vehSysId = 1, vehCompId = 1;

    // Vehicle type cache (for icon)
    const VehicleType = { mavType: null, cls: "plane", lastSeen: 0 };

    // Map + marker
    const map = L.map(document.getElementById("map"), { zoomControl: true }).setView([0,0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);

    // prevent iPhone popup menus
    map.getContainer().addEventListener("contextmenu", (e) => e.preventDefault());

    let vehicleMarker = null;
    let appliedVehClass = null;
    let lastHeadingDeg = null;

    // marker for vehicle target
    let targetMarker = null;

    // Toolbar
    const armBtn = document.getElementById("armBtn");
    const disarmBtn = document.getElementById("disarmBtn");
    const rtlBtn = document.getElementById("rtlBtn");
    const loiterBtn = document.getElementById("loiterBtn");
    const recenterBtn = document.getElementById("recenterBtn");
    const connectBtn = document.getElementById("connectBtn");

    // Connection
    let ws = null;
    let hbInterval = null;
    let setupSigning = false;

    const roverModes = {
        MANUAL       : 0,
        ACRO         : 1,
        STEERING     : 3,
        HOLD         : 4,
        LOITER       : 5,
        FOLLOW       : 6,
        SIMPLE       : 7,
	DOCK         : 8,
	CIRCLE       : 9,
        AUTO         : 10,
        RTL          : 11,
        SMART_RTL    : 12,
        GUIDED       : 15,
        INITIALISING : 16,
    };

    // --- Helpers ---
    function toast(msg, ms=1500) {
	const el = document.createElement("div");
	el.className = "toast";
	el.textContent = msg;
	document.body.appendChild(el);
	setTimeout(() => el.remove(), ms);
    }

    // --- COMMAND_INT helper ---
    function sendCommandInt(cmd, params = []) {
	if (!ws) { toast("Not connected"); return; }
	const payload = new mavlink20.messages.command_int(
	    vehSysId,         // target_system
	    vehCompId,        // target_component
	    mavlink20.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
	    cmd,              // command
	    0, 0,
	    params[0] || 0, params[1] || 0, params[2] || 0, params[3] || 0,
	    params[4] || 0, params[5] || 0, params[6] || 0
	);
	const pkt = payload.pack(MAVLink);
	ws.send(Uint8Array.from(pkt));
    }

    function sendSetMode(mode) {
	if (!ws) { toast("Not connected"); return; }
	sendCommandInt(mavlink20.MAV_CMD_DO_SET_MODE, [ mavlink20.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, mode ]);
    }

    // Telemetry state
    let telemetry = {
	batteryPct: null,
	currentA: null,
	speed: 0,
	lastUpdate: 0,
	armed: false,
	modeName: "—"
    };

    // make rover mode names map
    const roverModeNames = Object.fromEntries(Object.entries(roverModes).map(([k,v]) => [v, k]));

    let lastTargetSeenMs = 0;

    // Create telemetry display elements
    function initTelemetryDisplay() {
	// Find the toolbar
	const toolbar = document.getElementById("toolbar");

	// Create telemetry container
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

	// Status (armed + mode)
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
	
	telemetryDiv.appendChild(batteryDiv);
	telemetryDiv.appendChild(speedDiv);
	
	// Insert before the flex spacer
	const spacer = toolbar.querySelector('div[style*="flex:1"]');
	toolbar.insertBefore(telemetryDiv, spacer);
    }

    function updateTelemetryDisplay() {
	const batteryEl = document.getElementById("battery-value");
	const currentEl = document.getElementById("current-value");
	const speedEl = document.getElementById("speed-value");
	const armedEl = document.getElementById("armed-pill");
	const modeEl = document.getElementById("mode-value");

	// battery
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

	if (currentEl) {
	    if (telemetry.currentA !== null && telemetry.currentA >= 0) {
		currentEl.textContent = `${telemetry.currentA.toFixed(1)} A`;
	    } else {
		currentEl.textContent = "--- A";
	    }
	}

	// speed
	if (speedEl) {
	    if (telemetry.speed >= 0) {
		var speed_knots = 1.94384449 * telemetry.speed;
		speedEl.textContent = `${speed_knots.toFixed(1)} knots`;
	    } else {
		speedEl.textContent = "--- knots";
	    }
	}

	// armed + mode
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
    }

    // Call initTelemetryDisplay() after the DOM is ready
    initTelemetryDisplay();

    // --- StatusText log
    const StatusLog = {
	max: 500,
	items: [],          // { t: Date, sev: number, txt: string }

	push(sev, txt) {
	    // normalise & strip trailing NULs
	    if (Array.isArray(txt)) txt = String.fromCharCode(...txt);
	    txt = String(txt || "").replace(/\0+$/, "");
	    this.items.push({ t: new Date(), sev: sev ?? -1, txt });
	    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
	    this.renderIfOpen();
	},

	// severity to short tag
	tag(sev) {
	    const map = ["EMERG","ALERT","CRIT","ERR","WARN","NOTICE","INFO","DEBUG"];
	    // MAV_SEVERITY matches this order in ArduPilot (0..7)
	    return (sev >= 0 && sev < map.length) ? map[sev] : "INFO";
	},

	// UI
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
	    // ~10 rows visible. line-height ~1.25 → height ≈ 10*1.25em + padding
	    box.style.cssText = `
      margin:0; background:#111; color:#eee; border-radius:6px; 
      padding:8px; max-height:15.5em; overflow:auto; 
      font: 12px/1.25 ui-monospace, SFMono-Regular, Menlo, monospace; 
      white-space: pre-wrap; word-break: break-word;
    `;
	    this._box = box;

	    // tiny footer
	    const help = document.createElement("div");
	    help.style.cssText = "opacity:.7; font-size:12px;";
	    help.textContent = "Newest at the bottom. Keeps last 500 messages.";

	    wrap.append(header, box, help);

	    this._tip = tippy(anchorEl, {
		content: wrap,
		interactive: true,
		trigger: "click",
		theme: "light-border",
		placement: "right-start",
		appendTo: () => document.body,
		onShow: () => this.renderIfOpen()
	    });

	    this._tip.show();
	},

	renderIfOpen() {
	    if (!this._box) return;
	    const lines = this.items.map(it => {
		// HH:MM:SS  [SEV] message
		const t = it.t.toTimeString().slice(0,8);
		return `${t}  [${this.tag(it.sev)}] ${it.txt}`;
	    });
	    this._box.textContent = lines.join("\n");
	    // autoscroll to bottom
	    this._box.scrollTop = this._box.scrollHeight;
	}
    };
    
    // setup the menu
    initMenuButton();
    
    // Fence handling
    let ftp = null;
    let fenceParser = new FenceParser();
    let fenceLayers = [];
    let fenceFetched = false;
    let fenceRetryInterval = null;
  
    // Initialize FTP when connected
    function initFTP() {
	if (ws && ws.readyState === WebSocket.OPEN) {
	    ftp = new MAVFTP(MAVLink, ws);
	    ftp.targetSystem = vehSysId;
	    ftp.targetComponent = vehCompId;
	    console.log("FTP initialized");
	}
    }
  
    // Start fence fetch retry loop
    function startFenceFetchRetry() {
	// Clear any existing interval
	if (fenceRetryInterval) {
	    clearInterval(fenceRetryInterval);
	}
	
	// Reset fence fetched flag
	fenceFetched = false;
	
	// Try to fetch immediately
	fetchFence(true); // true = silent mode
	
	// Retry every 5 seconds until successful
	fenceRetryInterval = setInterval(() => {
	    if (!fenceFetched && ftp) {
		console.log("Retrying fence fetch...");
		fetchFence(true); // silent retry
	    } else if (fenceFetched) {
		// Stop retrying once we have the fence
		clearInterval(fenceRetryInterval);
		fenceRetryInterval = null;
	    }
	}, 5000);
    }
    
    // Stop fence fetch retry loop
    function stopFenceFetchRetry() {
	if (fenceRetryInterval) {
	    clearInterval(fenceRetryInterval);
	    fenceRetryInterval = null;
	}
    }
  
    // Fetch fence from vehicle
    function fetchFence(silent = false) {
	if (!ftp) {
	    if (!silent) toast("Not connected");
	    return;
	}
    
	if (!silent) toast("Fetching fence...");
    
	ftp.getFile("@MISSION/fence.dat", (data) => {
	    if (!data) {
		if (!silent) toast("Failed to fetch fence");
		return;
	    }
      
	    const fences = fenceParser.parse(data);
	    if (fences) {
		displayFences(fences);
		console.log(`Loaded ${fences.length} fence items`);
		if (!silent) toast(`Loaded ${fences.length} fence items`);
		fenceFetched = true; // Mark as successfully fetched
		stopFenceFetchRetry(); // Stop retrying
	    } else {
		if (!silent) toast("Failed to parse fence");
	    }
	});
    }

    function fenceDisable() {
	sendCommandInt(mavlink20.MAV_CMD_DO_FENCE_ENABLE, [ 0 ]);
    }
    function fenceEnable() {
	sendCommandInt(mavlink20.MAV_CMD_DO_FENCE_ENABLE, [ 1 ]);
    }

    // Initialize menu button
    function initMenuButton() {
	const toolbar = document.getElementById("toolbar");
	const recenterBtn = document.getElementById("recenterBtn");
	
	// Create menu button
	const menuBtn = document.createElement("button");
	menuBtn.id = "menuBtn";
	menuBtn.className = "btn small";
	menuBtn.innerHTML = "☰"; // Hamburger icon
	menuBtn.style.fontSize = "18px";
	
	// Insert before recenter button
	toolbar.insertBefore(menuBtn, recenterBtn);
	
	// Create menu using Tippy
	const menuDiv = document.createElement("div");
	menuDiv.style.cssText = `
	    display: flex;
	    flex-direction: column;
	    gap: 4px;
	    padding: 4px;
	    min-width: 150px;
	`;
	
	// Menu items
	const menuItems = [
	    { text: "Fetch Fence", action: () => { fetchFence(); menuTip.hide(); }},
	    { text: "Fence Disable", action: () => { fenceDisable(); menuTip.hide(); }},
	    { text: "Fence Enable", action: () => { fenceEnable(); menuTip.hide(); }},
	    { text: "Messages", action: () => { StatusLog.open(menuBtn); } },
	];

	/*
	menuItems.push(
	    { text: "Dev: Enable cache‑bust", action: () => { window.__dev__?.enable(true); } },
	    { text: "Dev: Hard reload (cache‑bust)", action: () => { window.__dev__?.hardReload(); } },
	    { text: "Dev: Disable cache‑bust", action: () => { window.__dev__?.enable(false); } },
	);
	*/

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
	
	// Create Tippy tooltip as menu
	const menuTip = tippy(menuBtn, {
	    content: menuDiv,
	    interactive: true,
	    trigger: "click",
	    theme: "light-border",
	    placement: "right-start",
	    appendTo: () => document.body
	});
	
	return menuBtn;
    }

    // Display fences on map
    function displayFences(fences) {
	// Clear existing fence layers
	fenceLayers.forEach(layer => map.removeLayer(layer));
	fenceLayers = [];

	fences.forEach((fence, idx) => {
	    let layer = null;
      
	    if (fence.type === mavlink20.MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION) {
		// Circle inclusion (green)
		layer = L.circle([fence.center.lat, fence.center.lng], {
		    radius: fence.radius,
		    color: '#4caf50',
		    fillColor: '#4caf50',
		    fillOpacity: 0,
		    weight: 2
		}).addTo(map);
		layer.bindPopup(`Circle Inclusion #${idx}<br>Radius: ${fence.radius}m`);

	    } else if (fence.type === mavlink20.MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION) {
		// Circle exclusion (red)
		layer = L.circle([fence.center.lat, fence.center.lng], {
		    radius: fence.radius,
		    color: '#f44336',
		    fillColor: '#f44336',
		    fillOpacity: 0,
		    weight: 2
		}).addTo(map);
	    } else if (fence.type === mavlink20.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION) {
		// Polygon inclusion (green)
		const latlngs = fence.vertices.map(v => [v.lat, v.lng]);
		layer = L.polygon(latlngs, {
		    color: '#4caf50',
		    fillColor: '#4caf50',
		    fillOpacity: 0,
		    weight: 2
		}).addTo(map);
	    } else if (fence.type === mavlink20.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION) {
		// Polygon exclusion (red)
		const latlngs = fence.vertices.map(v => [v.lat, v.lng]);
		layer = L.polygon(latlngs, {
		    color: '#f44336',
		    fillColor: '#f44336',
		    fillOpacity: 0,
		    weight: 2
		}).addTo(map);
	    }

	    if (layer) {
		fenceLayers.push(layer);
	    }
	});
    
	// Zoom to show all fences
	if (fenceLayers.length > 0) {
	    const group = L.featureGroup(fenceLayers);
	    map.fitBounds(group.getBounds().pad(0.1));
	}
    }
  
    function classifyVehicle(mavType) {
	if (mavType === mavlink20.MAV_TYPE_SURFACE_BOAT) return "boat";     // MAV_TYPE_SURFACE_BOAT
	if (mavType === mavlink20.MAV_TYPE_GROUND_ROVER) return "rover";    // MAV_TYPE_GROUND_ROVER
	if (mavType === mavlink20.MAV_TYPE_FIXED_WING)  return "plane";    // MAV_TYPE_FIXED_WING
	if (mavType === mavlink20.MAV_TYPE_QUADROTOR || mavType === mavlink20.MAV_TYPE_COAXIAL || mavType === mavlink20.MAV_TYPE_HELICOPTER) return "copter"; // quad/coax/heli
	return "plane";
    }

    function makeSvgIcon(kind, rotateDeg = 0) {
	const paths = {
	    plane: `
        <!-- Fixed-wing aircraft top view -->
        <g stroke-width="1" stroke="#333" fill="#e53935">
          <!-- Fuselage -->
          <path d="M12,20 L11,17 L11,10 L10,7 L10,4 L12,2 L14,4 L14,7 L13,10 L13,17 L12,20 Z"/>
          <!-- Main wings -->
          <path d="M3,11 L11,12 L11,14 L3,13 Z"/>
          <path d="M21,11 L13,12 L13,14 L21,13 Z"/>
          <!-- Tail wings -->
          <path d="M7,18 L11,17 L11,18 L7,19 Z"/>
          <path d="M17,18 L13,17 L13,18 L17,19 Z"/>
        </g>
      `,
	    copter: `
        <!-- Quadcopter top view -->
        <g stroke-width="1" stroke="#333" fill="#ff9800">
          <!-- Center body -->
          <circle cx="12" cy="12" r="3"/>
          <!-- Arms -->
          <rect x="11" y="4" width="2" height="16" />
          <rect x="4" y="11" width="16" height="2" />
          <!-- Motors/props -->
          <circle cx="12" cy="5" r="2.5" fill="#666"/>
          <circle cx="12" cy="19" r="2.5" fill="#666"/>
          <circle cx="5" cy="12" r="2.5" fill="#666"/>
          <circle cx="19" cy="12" r="2.5" fill="#666"/>
        </g>
      `,
	    rover: `
        <!-- Ground vehicle top view -->
        <g stroke-width="1" stroke="#333" fill="#4caf50">
          <!-- Main body -->
          <rect x="7" y="6" width="10" height="12" rx="2"/>
          <!-- Wheels -->
          <rect x="5" y="7" width="3" height="4" fill="#333" rx="0.5"/>
          <rect x="16" y="7" width="3" height="4" fill="#333" rx="0.5"/>
          <rect x="5" y="13" width="3" height="4" fill="#333" rx="0.5"/>
          <rect x="16" y="13" width="3" height="4" fill="#333" rx="0.5"/>
          <!-- Direction indicator -->
          <path d="M12,6 L10,9 L12,8 L14,9 Z" fill="#fff"/>
        </g>
      `,
	    boat: `
        <!-- Boat/USV top view -->
        <g stroke-width="1" stroke="#333" fill="#2196f3">
          <!-- Hull shape - pointed bow -->
          <path d="M12,4 L8,10 L8,18 Q12,20 12,20 Q12,20 16,18 L16,10 L12,4 Z"/>
          <!-- Deck detail -->
          <rect x="10" y="11" width="4" height="5" fill="#1976d2" rx="0.5"/>
          <!-- Bow indicator -->
          <path d="M12,4 L11,7 L12,6 L13,7 Z" fill="#fff"/>
        </g>
      `
	};
	
	const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" style="transform: rotate(${rotateDeg}deg); transform-origin: center;">
        ${paths[kind] || paths.plane}
      </svg>`;
	
	return L.divIcon({
	    html: svg,
	    className: "veh-ico",
	    iconSize: [40, 40],
	    iconAnchor: [20, 20]
	});
    }

    function ensureMarker(lat, lon) {
	if (!vehicleMarker) {
	    vehicleMarker = L.marker([lat, lon], { icon: makeSvgIcon(VehicleType.cls, lastHeadingDeg || 0) }).addTo(map);
	    appliedVehClass = VehicleType.cls;
	} else {
	    vehicleMarker.setLatLng([lat, lon]);
	}
	
	// Update icon if vehicle class changed or heading changed
	if (appliedVehClass !== VehicleType.cls || lastHeadingDeg != null) {
	    vehicleMarker.setIcon(makeSvgIcon(VehicleType.cls, lastHeadingDeg || 0));
	    appliedVehClass = VehicleType.cls;
	}
    }

    function rotateMarker(deg) {
	if (!vehicleMarker) return;
	
	// Update the icon with new rotation
	vehicleMarker.setIcon(makeSvgIcon(VehicleType.cls, deg));
    }

    function updateHeadingFromATTITUDE(yawRad) {
	let deg = yawRad * 180/Math.PI;
	deg = (deg + 360) % 360;
	lastHeadingDeg = deg;
	rotateMarker(deg);
    }

    // update vehicle target position
    function updateTargetPosition(lat, lon) {
	if (!targetMarker) {
	    // Create a small red circle marker for the target
	    targetMarker = L.circleMarker([lat, lon], {
		radius: 8,
		color: '#f44336',
		fillColor: '#f44336',
		fillOpacity: 0.6,
		weight: 2
	    }).addTo(map);
	    targetMarker.bindPopup("Target Position");
	} else {
	    targetMarker.setLatLng([lat, lon]);
	}
    }

    // remove the target marker when not needed:
    function clearTargetPosition() {
	if (targetMarker) {
	    map.removeLayer(targetMarker);
	    targetMarker = null;
	}
    }

    // --- Connection dialog on left-bar Connect button ---
    (function initConnectTip(){
	const button = connectBtn;
	const tipDiv = document.createElement("div");
	tipDiv.appendChild(document.importNode(document.getElementById("connection_tip_template").content, true));
	const tip = tippy(button, {
	    content: tipDiv, interactive: true, trigger: "click", theme: "light-border",
	    appendTo: () => document.body, placement: "right-start"
	});
	tipDiv.querySelector("#Close").onclick = () => tip.hide();

	const url_input = tipDiv.querySelector("#target_url");
	const hb_checkbox = tipDiv.querySelector("#send_heartbeat");
	const passphrase_input = tipDiv.querySelector("#signing_passphrase");
	const connect_btn = tipDiv.querySelector("#connection_button");
	const disconnect_btn = tipDiv.querySelector("#disconnection_button");

	// use random sysid and compid so multiple users are less likely to collide
	const sys_input = tipDiv.querySelector("#system_id");
	const comp_input = tipDiv.querySelector("#component_id");
	// default random IDs between 100–200 inclusive
	function rand100_200() {
	    return Math.floor(Math.random() * 101) + 100; // 0–100 + 100 → 100–200
	}
	sys_input.value = rand100_200();
	comp_input.value = rand100_200();

	const LS_KEYS = {
	    url: "gcs.url",
	    pass: "gcs.passphrase"
	};

	// preload saved values (fallbacks preserved)
	url_input.value = localStorage.getItem(LS_KEYS.url) || "ws://127.0.0.1:56781";
	passphrase_input.value = localStorage.getItem(LS_KEYS.pass) || "";


	function applyIds() {
	    let sid = parseInt(sys_input.value || "255", 10);
	    let cid = parseInt(comp_input.value || "190", 10);
	    sid = (sid>=1 && sid<=255) ? sid : 255;
	    cid = (cid>=0 && cid<=255) ? cid : 190;
	    gcsSystemId = sid; gcsComponentId = cid;

	    MAVLink.srcSystem = sid;
	    MAVLink.srcComponent = cid;
	}

	function setConnState(state) {
	    // color feedback on the left button
	    if (state === "connected")      button.style.background = "#00c853";
	    else if (state === "connecting")button.style.background = "#f9a825";
	    else if (state === "error")     button.style.background = "#e53935";
	    else                             button.style.background = ""; // default style
	}

	function startHeartbeatLoop() {
	    if (hbInterval) { clearInterval(hbInterval); hbInterval = null; }
	    if (!hb_checkbox.checked) return;
	    hbInterval = setInterval(() => {
		try {
		    if (!setupSigning) {
			const pass = passphrase_input.value.trim();
			if (pass.length > 0) {
			    setupSigning = true;
			    const enc = new TextEncoder();
			    const hash = mavlink20.sha256(enc.encode(pass));
			    MAVLink.signing.secret_key = new Uint8Array(hash);
			    MAVLink.signing.sign_outgoing = true;
			}
		    }
		    const msg = new mavlink20.messages.heartbeat(
			6, // MAV_TYPE_GCS
			8, // MAV_AUTOPILOT_INVALID
			0, 0, 4
		    );
		    const pkt = msg.pack(MAVLink);
		    ws?.send(Uint8Array.from(pkt));
		} catch (e) {
		    console.error("Heartbeat send failed:", e?.message || e);
		    if (hbInterval) { clearInterval(hbInterval); hbInterval = null; }
		    setConnState("error");
		    toast("Heartbeat stopped after error");
		}
	    }, 1000);
	}

	function connect(url) {
	    applyIds();
	    if (ws) disconnect();
	    setupSigning = false;

	    setConnState("connecting");
	    ws = new WebSocket(url);
	    ws.binaryType = "arraybuffer";

	    ws.onopen = () => {
		tip.hide();
		setConnState("connected");
		toast("Connected");
		startHeartbeatLoop();
		initFTP();
		startFenceFetchRetry();
	    };
	    ws.onerror = () => {
		setConnState("error");
	    };
	    ws.onclose = () => {
		if (hbInterval) { clearInterval(hbInterval); hbInterval = null; }
		setConnState(""); // default
		stopFenceFetchRetry();
		toast("Disconnected");
	    };
	    ws.onmessage = (evt) => {
		const buf = new Uint8Array(evt.data);
		MAVLink.pushBuffer(buf);
		while (true) {
		    const m = MAVLink.parseChar(null);
		    if (m === null) break;
		    if (m._id == -1) continue;

		    // Learn target addresses
		    if (typeof m.sysid === "number") vehSysId = m.sysid;
		    if (typeof m.compid === "number") vehCompId = m.compid;

		    // HEARTBEAT => vehicle type
		    if (m._name === "HEARTBEAT") {
			VehicleType.mavType = m.type;
			VehicleType.cls = classifyVehicle(m.type);
			VehicleType.lastSeen = Date.now();

			telemetry.armed = !!(m.base_mode & mavlink20.MAV_MODE_FLAG_SAFETY_ARMED);
			// Mode name: for Rover/Boat use known names; otherwise show numeric
			const isRoverish = (VehicleType.mavType === mavlink20.MAV_TYPE_GROUND_ROVER) ||
			      (VehicleType.mavType === mavlink20.MAV_TYPE_SURFACE_BOAT);
			telemetry.modeName = isRoverish ? (roverModeNames[m.custom_mode] || `${m.custom_mode}`) : `${m.custom_mode}`;

			updateTelemetryDisplay();
		    }

		    // GLOBAL_POSITION_INT => lat/lon + heading if present and speed
		    if (m._name === "GLOBAL_POSITION_INT") {
			const lat = m.lat / 1e7, lon = m.lon / 1e7;
			ensureMarker(lat, lon);
			if (!map._movedOnce) { map.setView([lat, lon], 16); map._movedOnce = true; }

			// Calculate ground speed from vx and vy (cm/s)
			const vx_ms = m.vx / 100.0;  // Convert cm/s to m/s
			const vy_ms = m.vy / 100.0;
			telemetry.speed = Math.sqrt(vx_ms * vx_ms + vy_ms * vy_ms);
			updateTelemetryDisplay();
		    }

		    // ATTITUDE => yaw (continuous)
		    if (m._name === "ATTITUDE") {
			if (typeof m.yaw === "number") updateHeadingFromATTITUDE(m.yaw);
		    }

		    // Handle FTP messages
		    if (ftp && m._name === "FILE_TRANSFER_PROTOCOL") {
			ftp.handleMessage(m);
		    }

		    // BATTERY_STATUS => battery percentage
		    if (m._name === "BATTERY_STATUS") {
			telemetry.batteryPct = m.battery_remaining;
			telemetry.lastUpdate = Date.now();
			telemetry.currentA = m.current_battery / 100.0;
			updateTelemetryDisplay();
		    }

		    if (m._name === "POSITION_TARGET_GLOBAL_INT") {
			if (m.lat_int !== 0 || m.lon_int !== 0) {
			    const lat = m.lat_int / 1e7;
			    const lon = m.lon_int / 1e7;
			    updateTargetPosition(lat, lon);
			    lastTargetSeenMs = Date.now();
			} else {
			    clearTargetPosition();
			    lastTargetSeenMs = 0;
			}
		    }

		    // STATUSTEXT / STATUSTEXT_LONG => capture into Messages log
		    if (m._name === "STATUSTEXT") {
			StatusLog.push(m.severity, m.text);
		    }
		};
	    }
	}

	function disconnect() {
	    if (ws) { try { ws.close(); } catch {} }
	    ws = null;
	    if (hbInterval) { clearInterval(hbInterval); hbInterval = null; }
	    setConnState("");
	    clearTargetPosition();
	}

	connect_btn.onclick = () => {
	    if (!url_input.checkValidity()) { toast("Enter ws:// or wss:// URL"); url_input.focus(); return; }

	    // remember URL and passphrase
	    localStorage.setItem(LS_KEYS.url, url_input.value.trim());
	    const pass = passphrase_input.value.trim();
	    if (pass.length) {
		localStorage.setItem(LS_KEYS.pass, pass);
	    } else {
		localStorage.removeItem(LS_KEYS.pass); // don't store empty
	    }

	    connect(url_input.value);
	};
	disconnect_btn.onclick = () => disconnect();
    })();

    // Buttons
    armBtn.onclick = () => { sendCommandInt(mavlink20.MAV_CMD_COMPONENT_ARM_DISARM, [1]); toast("ARM sent"); };       // MAV_CMD_COMPONENT_ARM_DISARM
    disarmBtn.onclick = () => { sendCommandInt(mavlink20.MAV_CMD_COMPONENT_ARM_DISARM, [0]); toast("DISARM sent"); };
    rtlBtn.onclick = () => { sendSetMode(roverModes.RTL, []); toast("RTL sent"); };
    loiterBtn.onclick = () => { sendSetMode(roverModes.LOITER, []); toast("LOITER sent"); };
    recenterBtn.onclick = () => {
	if (vehicleMarker) {
	    const ll = vehicleMarker.getLatLng();
	    map.setView(ll, Math.max(map.getZoom(), 16));
	}
    };

    // --- Long-press to DO_REPOSITION (desktop + mobile), avoids pan-as-click ---
    (() => {
	const el = map.getContainer();
	let pressTimer = null, startPt = null, lastPt = null, activeId = null;
	const HOLD_MS = 600, MOVE_PX_TOL = 10;

	function clearAll(){ if (pressTimer){ clearTimeout(pressTimer); pressTimer=null; } activeId=null; startPt=lastPt=null; }

	el.addEventListener("pointerdown", (ev) => {
	    if (ev.target.closest(".leaflet-control")) return;
	    if (ev.pointerType === "touch") ev.preventDefault(); // <- suppress iOS long‑press callout

	    activeId = ev.pointerId;
	    startPt = lastPt = map.mouseEventToContainerPoint(ev);
	    pressTimer = setTimeout(() => {
		if (!lastPt) return;
		const ll = map.containerPointToLatLng(lastPt);
		sendCommandInt(mavlink20.MAV_CMD_DO_REPOSITION, [
		    0, mavlink20.MAV_DO_REPOSITION_FLAGS_CHANGE_MODE, 0, 0,
		    ll.lat*1e7, ll.lng*1e7, 0
		]);
		toast("DO_REPOSITION sent");
		clearAll();
	    }, HOLD_MS);
	}, { passive: false });

	el.addEventListener("pointermove", (ev) => {
	    if (ev.pointerId !== activeId) return;
	    if (ev.pointerType === "touch") ev.preventDefault(); // keep iOS from starting callout/scroll
	    lastPt = map.mouseEventToContainerPoint(ev);
	    if (startPt && lastPt && startPt.distanceTo(lastPt) > MOVE_PX_TOL) clearAll();
	}, { passive: false });

	["pointerup","pointercancel","pointerleave","pointerout"].forEach(t =>
	    el.addEventListener(t, (ev) => { if (ev.pointerId === activeId) clearAll(); }, { passive:false })
	);
    })();

    // clear target if stale
    setInterval(() => {
	if (targetMarker && lastTargetSeenMs && (Date.now() - lastTargetSeenMs > 5000)) {
	    clearTargetPosition();
	    lastTargetSeenMs = 0;
	}
    }, 1000);
    
    console.log("Simple GCS Map ready.");
})();
