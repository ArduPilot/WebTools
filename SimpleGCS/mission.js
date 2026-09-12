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

    // Robustly extract lat/lngs from common fence/mission parse output,
    // filtering invalids and the [0,0] sentinel.
    function extractLatLngs(items) {
        const pts = [];
        const addIfValid = (lat, lng) => {
            const la = Number(lat);
            const ln = Number(lng);
            if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
            if (la < -90 || la > 90 || ln < -180 || ln > 180) return;
            // Filter exact [0,0] (after numeric coercion)
            if (la === 0 && ln === 0) return;
            pts.push([la, ln]);
        };

        const tryObj = (obj) => {
	        var lat = obj.x * 1.0e-7;
	        var lng = obj.y * 1.0e-7;
	        addIfValid(lat, lng);
        };

        items.forEach(tryObj);

        return pts;
    }

    function renderMission(items) {
        clearLayers();
        const pts = extractLatLngs(items);
        if (!pts.length) {
            toast('No mission points found');
            return;
        }

        // Path polyline
        State.pathLayer = L.polyline(pts, { color: '#2196f3', weight: 3, opacity: 0.9 }).addTo(State.map);

        // Waypoint markers with indices (defensive guard against any residuals)
        pts.forEach((ll, idx) => {
            if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) return;
            if (ll[0] === 0 && ll[1] === 0) return;
            const mk = L.circleMarker(ll, {
                radius: 5,
                color: '#0d47a1',
                fillColor: '#64b5f6',
                fillOpacity: 0.9,
                weight: 2
            }).addTo(State.map);
            mk.bindTooltip(`${idx}`, { permanent: true, direction: 'top', className: 'mission-wp-label' });
            State.wpLayers.push(mk);
        });

        toast(`Loaded mission with ${pts.length} points`);
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
