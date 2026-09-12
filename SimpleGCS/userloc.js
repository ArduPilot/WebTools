/*
  userloc.js - Browser Geolocation for the GCS map
*/
(() => {
    const State = {
	    map: null,
	    watchId: null,
	    marker: null,
	    accuracy: null,
	    firstFix: true,
	    retryTimer: null,
	    retryInterval: 15000, // 15 seconds
	    errorCount: 0,
	    maxConsecutiveErrors: 50, // Stop after 5 consecutive failures
	    opts: {
	        autoCenterFirstFix: true,
	        accuracyStyle: {
		        color: '#2962ff',
		        weight: 1,
		        dashArray: '4 2',
		        fillOpacity: 0.08
	        },
	        markerStyle: {
		        radius: 7,
		        color: '#2962ff',
		        fillColor: '#2962ff',
		        fillOpacity: 0.9,
		        weight: 2
	        }
	    }
    };

    function toast(msg, ms=1500){ try{ const el=document.createElement('div'); el.className='toast'; el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(), ms);}catch{}}

    function onPos(pos){
	    if (!State.map) return;

	    // Reset error count on successful position
	    State.errorCount = 0;

	    const { latitude, longitude, accuracy } = pos.coords;
	    const ll = [latitude, longitude];

	    if (!State.marker) {
	        State.marker = L.circleMarker(ll, State.opts.markerStyle).addTo(State.map).bindPopup('You are here');
	    } else {
	        State.marker.setLatLng(ll);
	    }

	    if (!State.accuracy) {
	        State.accuracy = L.circle(ll, { ...State.opts.accuracyStyle, radius: accuracy }).addTo(State.map);
	    } else {
	        State.accuracy.setLatLng(ll); State.accuracy.setRadius(accuracy);
	    }

	    if (State.firstFix && State.opts.autoCenterFirstFix) {
	        State.map.setView(ll, Math.max(State.map.getZoom() || 0, 16));
	        State.firstFix = false;
	    }
    }

    function onErr(err){
	    console.warn('Geolocation error:', err);
	    State.errorCount++;

	    // Check if this is a permission denial (permanent error)
	    const isPermanentError = err && err.code === 1; // PERMISSION_DENIED

	    if (isPermanentError) {
	        toast('Location permission denied');
	        API.stop();
	        return;
	    }

	    // Check if we've exceeded max consecutive errors
	    if (State.errorCount >= State.maxConsecutiveErrors) {
	        toast('Location unavailable after multiple attempts');
	        API.stop();
	        return;
	    }

	    // For temporary errors, schedule retry
	    toast('Location error, will retry…');
	    scheduleRetry();
    }

    function scheduleRetry() {
	    // Clear any existing retry timer
	    if (State.retryTimer) {
	        clearTimeout(State.retryTimer);
	    }

	    // Stop current watch if active
	    if (State.watchId) {
	        navigator.geolocation.clearWatch(State.watchId);
	        State.watchId = null;
	    }

	    // Schedule retry
	    State.retryTimer = setTimeout(() => {
	        State.retryTimer = null;
	        if (State.map) { // Only retry if still initialized
	            console.log('Retrying geolocation...');
	            startWatch();
	        }
	    }, State.retryInterval);
    }

    function startWatch() {
	    if (State.watchId) {
	        navigator.geolocation.clearWatch(State.watchId);
	    }
	    State.watchId = navigator.geolocation.watchPosition(onPos, onErr, {
		    enableHighAccuracy: true,
		    maximumAge: 5000,
		    timeout: 10000
	    });
    }

    const API = {
	    init(map, opts={}){
	        State.map = map;
	        State.opts = { ...State.opts, ...opts };
	        return API;
	    },
	    start(){
	        if (!('geolocation' in navigator)) { toast('Geolocation not available'); return; }
	        if (!State.map) { console.warn('UserLocation.init(map) first'); return; }
	        if (State.watchId || State.retryTimer) { toast('Location on'); return; }
	        State.firstFix = true;
	        State.errorCount = 0;
	        startWatch();
	        toast('Locating…');
	    },
	    stop(){
	        // Clear retry timer if active
	        if (State.retryTimer) {
	            clearTimeout(State.retryTimer);
	            State.retryTimer = null;
	        }
	        // Clear watch if active
	        if (State.watchId) {
	            navigator.geolocation.clearWatch(State.watchId);
	            State.watchId = null;
	        }
	        // Remove markers
	        if (State.marker) {
	            try { State.map.removeLayer(State.marker); } catch{}
	            State.marker = null;
	        }
	        if (State.accuracy) {
	            try { State.map.removeLayer(State.accuracy); } catch{}
	            State.accuracy = null;
	        }
	        State.firstFix = true;
	        State.errorCount = 0;
	        toast('Location off');
	    },
	    toggle(){ (State.watchId || State.retryTimer) ? API.stop() : API.start(); },
	    active(){ return !!(State.watchId || State.retryTimer); }
    };

    window.UserLocation = API;
})();
