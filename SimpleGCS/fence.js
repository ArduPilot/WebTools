/*
  fence.js - Geofence fetch/render module for the web GCS

  Depends on:
  - Leaflet (L)
  - MAVLink JS globals: mavlink20

  API (attached to window.Fence):
  Fence.init({ map, MAVLink, toast, sendCommandInt })
  Fence.onConnected(ws)
  Fence.onDisconnected()
  Fence.fetch(silent=false)                 // fetch @MISSION/fence.dat now
  Fence.enable() / Fence.disable()
  Fence.clear()                             // remove fence layers
*/
(() => {
    const State = {
        map: null,
        MAVLink: null,
        toast: (m)=>console.log(m),
        sendCommandInt: null,
        ws: null,
        parser: null,
        fenceLayers: [],
        fetched: false,
        retryTimer: null,
        enabled: true,
    };

    const FETCH_TAG = 'fence'; // used for de-duping queued FTP jobs

    function log(...a){ try{ console.log('[Fence]', ...a); } catch{} }
    function toast(msg){ try{ State.toast && State.toast(msg); } catch{} }

    // Map a fence type → style, taking enabled/disabled into account
    function styleFor(type, enabled = State.enabled) {
        const COLORS = {
            inc: '#4caf50',
            exc: '#f44336'
        };
        const isInc = (type === mavlink20.MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION) ||
              (type === mavlink20.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION);
        const color = isInc ? COLORS.inc : COLORS.exc;
        return {
            color,
            fillColor: color,
            fillOpacity: 0,
            weight: enabled? 6 : 3,
            opacity: 1,
            dashArray: enabled ? null : "6,6"   // dashed when disabled
        };
    }

    function restyleAllFences(){
        State.fenceLayers.forEach(l => {
            try {
                if (l && l._fenceType) l.setStyle(styleFor(l._fenceType, State.enabled));
            } catch {}
        });
    }

    function displayFences(fences){
        // clear old
        State.fenceLayers.forEach(l => { try { State.map.removeLayer(l); } catch{} });
        State.fenceLayers = [];

        fences.forEach((fence, idx) => {
            let layer = null;
            if (fence.type === mavlink20.MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION) {
                layer = L.circle([fence.lat, fence.lng], Object.assign(
                    { radius: fence.radius },
                    styleFor(fence.type)
                )).addTo(State.map);
                layer.bindPopup(`Circle Inclusion #${idx}<br>Radius: ${fence.radius}m`);
            } else if (fence.type === mavlink20.MAV_CMD_NAV_FENCE_CIRCLE_EXCLUSION) {
                layer = L.circle([fence.lat, fence.lng], Object.assign(
                    { radius: fence.radius },
                    styleFor(fence.type)
                )).addTo(State.map);
            } else if (fence.type === mavlink20.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION) {
                const latlngs = fence.vertices.map(v => [v.lat, v.lng]);
                layer = L.polygon(latlngs, styleFor(fence.type)).addTo(State.map);
            } else if (fence.type === mavlink20.MAV_CMD_NAV_FENCE_POLYGON_VERTEX_EXCLUSION) {
                const latlngs = fence.vertices.map(v => [v.lat, v.lng]);
                layer = L.polygon(latlngs, styleFor(fence.type)).addTo(State.map);
            }
            if (layer) {
                // remember the type so we can restyle later
                layer._fenceType = fence.type;
                State.fenceLayers.push(layer);
            }
        });
    }

    function stopRetry(){ if (State.retryTimer) { clearInterval(State.retryTimer); State.retryTimer = null; } }

    function startRetry(){
        stopRetry();
        State.fetched = false;
        // immediate attempt
        fetchFence(true);
        // then retry until fetched
        State.retryTimer = setInterval(() => {
            if (!State.fetched && State.ws) {
                log('Retrying fence fetch…');
                fetchFence(true);
            } else if (State.fetched) {
                stopRetry();
            }
        }, 5000);
    }

    function fetchFence(silent=false){
        if (!State.ws) {
            if (!silent) toast('Not connected');
            return;
        }
        if (!silent) toast('Fetching fence…');
        // Use FTPManager with de-dupe + 5s watchdog. This prevents stacking retries.
        FTPManager.getFile('@MISSION/fence.dat', (data) => {
            if (!data) { if (!silent) toast('Failed to fetch fence'); return; }
            try {
		        const fences = State.parser.parseFence(data);
                if (fences) {
                    displayFences(fences);
                    log(`Loaded ${fences.length} fence items`);
                    if (!silent) toast(`Loaded ${fences.length} fence items`);
                    State.fetched = true;
                    stopRetry();
                } else if (!silent) {
                    toast('Failed to parse fence');
                }
            } catch (e) {
                console.warn('Fence parse error', e);
                if (!silent) toast('Fence parse error');
            }
        }, { tag: FETCH_TAG, dropQueuedTag: true, dropQueuedPath: true, timeoutMs: 5000 });
    }

    const API = {
        init({ map, MAVLink, toast, sendCommandInt }){
            State.map = map; State.MAVLink = MAVLink;
            if (toast) State.toast = toast;
            State.sendCommandInt = sendCommandInt;
	        State.parser = new MissionParser();
            return API;
        },
        onConnected(ws){
            State.ws = ws;
            if (window.AppSettings ? AppSettings.autoFetchFence : true) startRetry();
        },
        onDisconnected(){
            stopRetry();
            State.ws = null;
        },
        fetch: (silent=false) => fetchFence(silent),
        clear(){ displayFences([]); },
        enable(){ if (State.sendCommandInt) State.sendCommandInt(mavlink20.MAV_CMD_DO_FENCE_ENABLE, [1]); },
        disable(){ if (State.sendCommandInt) State.sendCommandInt(mavlink20.MAV_CMD_DO_FENCE_ENABLE, [0]); },

        setEnabled(enabled) {
            if (State.enabled != enabled) {
                State.enabled = enabled;
                // update the map styling immediately
                restyleAllFences();
            }
        }
    };

    window.Fence = API;
})();
