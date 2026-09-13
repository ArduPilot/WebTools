/* mission.js
   Display mission fetched via MAVFTP @MISSION/mission.dat.
*/
(() => {
    const State = {
        map: null,
        MAVLink: null,
        toast: (m)=>console.log(m),
        ws: null,
        parser: null,

        pathLayer: null,
        wpLayers: [],

        fetched: false,
        retryTimer: null,
        pending: false,
        generation: 0
    };

    const FETCH_TAG = 'mission'; // used for de-duping queued FTP jobs

    function toast(msg){ try{ State.toast && State.toast(msg); } catch{} }

    function clearLayers() {
        if (State.pathLayer) {
            try { State.map.removeLayer(State.pathLayer); } catch {}
            State.pathLayer = null;
        }
        State.wpLayers.forEach(m => { try { State.map.removeLayer(m); } catch{} });
        State.wpLayers = [];
    }

    function stopRetry() {
        clearTimeout(State.retryTimer);
        State.retryTimer = null;
    }

    function scheduleRetry() {
        stopRetry();
        if (!State.ws || State.fetched || !window.AppSettings?.autoFetchMission) return;
        State.retryTimer = setTimeout(() => {
            State.retryTimer = null;
            if (window.AppSettings?.autoFetchMission) fetchMission(true);
        }, 5000);
    }

    // Match AP_Mission::stored_in_location. Other commands (for example
    // NAV_SCRIPT_TIME) store arguments in x/y, not geographic coordinates.
    const locationCommands = new Set([
        'NAV_WAYPOINT', 'NAV_LOITER_UNLIM', 'NAV_LOITER_TURNS', 'NAV_LOITER_TIME',
        'NAV_LAND', 'NAV_TAKEOFF', 'NAV_CONTINUE_AND_CHANGE_ALT', 'NAV_LOITER_TO_ALT',
        'NAV_SPLINE_WAYPOINT', 'NAV_GUIDED_ENABLE', 'DO_SET_HOME', 'DO_RETURN_PATH_START',
        'DO_LAND_START', 'DO_GO_AROUND', 'DO_SET_ROI_LOCATION', 'DO_SET_ROI',
        'NAV_VTOL_TAKEOFF', 'NAV_VTOL_LAND', 'NAV_PAYLOAD_PLACE', 'NAV_ARC_WAYPOINT'
    ].map(name => mavlink20['MAV_CMD_' + name]).filter(Number.isInteger));
    const globalFrames = new Set([0, 3, 5, 6, 10, 11]);

    function renderMission(items) {
        clearLayers();
        const points = items.filter(item => locationCommands.has(item.command) && globalFrames.has(item.frame))
            .map(item => ({seq: item.seq, lat: item.x * 1e-7, lng: item.y * 1e-7}))
            .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
                Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && (p.lat !== 0 || p.lng !== 0));
        if (!points.length) { toast('No mission points found'); return; }
        State.pathLayer = L.polyline(points.map(p => [p.lat, p.lng]), {
            color: '#2196f3', weight: 3, opacity: 0.9
        }).addTo(State.map);
        for (const p of points) {
            const marker = L.circleMarker([p.lat, p.lng], {
                radius: 5, color: '#0d47a1', fillColor: '#64b5f6', fillOpacity: 0.9, weight: 2
            }).addTo(State.map);
            marker.bindTooltip(String(p.seq), {permanent: true, direction: 'top', className: 'mission-wp-label'});
            State.wpLayers.push(marker);
        }
        toast(`Loaded mission with ${points.length} points`);
    }

    function fetchMission(silent=false) {
        if (!State.ws) { if (!silent) toast('Not connected'); return; }
        if (State.pending) return;
        stopRetry();
        State.pending = true;
        State.fetched = false;
        const generation = State.generation;
        if (!silent) toast('Fetching mission…');
        // Use FTPManager with de-dupe + 5s watchdog.
        FTPManager.getFile('@MISSION/mission.dat', (data) => {
            if (generation !== State.generation) return;
            State.pending = false;
            if (!data) {
                if (!silent) toast('Failed to fetch mission');
                scheduleRetry();
                return;
            }
            try {
                const items = State.parser.parseMission(data);
                if (items) {
                    renderMission(items);
                    State.fetched = true;
                    stopRetry();
                } else if (!silent) {
                    toast('Failed to parse mission');
                }
            } catch (e) {
                console.warn('Mission parse error', e);
                if (!silent) toast('Mission parse error');
            }
            if (!State.fetched) scheduleRetry();
        }, { tag: FETCH_TAG, dropQueuedTag: true, dropQueuedPath: true, timeoutMs: 5000 });
    }

    const API = {
        init({ map, MAVLink, toast }){
            State.map = map;
            State.MAVLink = MAVLink;
            if (toast) State.toast = toast;
            State.parser = new MissionParser();
            return API;
        },
        onConnected(ws) {
            API.onDisconnected();
            State.ws = ws;
            if (window.AppSettings?.autoFetchMission) fetchMission(true);
        },
        onDisconnected(){
            stopRetry();
            State.ws = null;
            State.generation++;
            State.pending = false;
            State.fetched = false;
            FTPManager.cancelQueuedByTag(FETCH_TAG);
            clearLayers();
        },
        fetch: (silent=false) => fetchMission(silent),
        clear: () => clearLayers()
    };

    window.Mission = API;
})();
