/*
  grid.js - Metric grid overlay for Leaflet maps
  Draws a light-yellow grid at powers of 10 meters with latitude correction.

  API:
  <script src="grid.js"></script>
  MetricGrid.init(map, {
  color: 'rgba(255, 235, 59, 0.6)', // grid line color
  targetPx: 150,                     // target pixel spacing between lines
  lineWidth: 1,                      // canvas line width
  });
  MetricGrid.on();
  MetricGrid.off();
  MetricGrid.toggle();
*/
(() => {
    const State = {
	    map: null,
	    canvas: null,
	    ctx: null,
	    enabled: false,
	    opts: {
	        color: 'rgba(255, 235, 59, 0.6)',
	        targetPx: 150,
	        lineWidth: 1,
	    }
    };

    function ensureCanvas() {
	    if (State.canvas) return;
	    const c = document.createElement('canvas');
	    c.style.cssText = 'position:absolute; top:0; left:0; pointer-events:none;';
	    State.canvas = c;
	    State.ctx = c.getContext('2d');
	    State.map.getPanes().overlayPane.appendChild(c);
    }

    function resizeCanvas() {
	    const size = State.map.getSize();
	    const dpr = window.devicePixelRatio || 1;
	    const c = State.canvas, ctx = State.ctx;
	    c.width = Math.round(size.x * dpr);
	    c.height = Math.round(size.y * dpr);
	    c.style.width = size.x + 'px';
	    c.style.height = size.y + 'px';
	    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function metersPerPixel(latDeg, zoom) {
	    const R = 6378137; // Web Mercator sphere
	    return Math.cos(latDeg * Math.PI/180) * 2 * Math.PI * R / (256 * Math.pow(2, zoom));
    }

    function pickSpacingMeters(mpp, latitude) {
	    const targetMeters = (State.opts.targetPx || 150) * mpp;
	    const logTarget = Math.log10(Math.max(1, targetMeters));
	    const p10 = Math.pow(10, Math.floor(logTarget));      // 1, 10, 100, ... meters in Web Mercator units
	    const latRad = latitude * Math.PI / 180;
	    return p10 / Math.cos(latRad);                         // correct to ground distance
    }

    function draw() {
	    if (!State.enabled || !State.canvas || !State.ctx) return;
	    ensureCanvas();
	    resizeCanvas();

	    const ctx = State.ctx;
	    const dpr = window.devicePixelRatio || 1;

	    // clear
	    ctx.clearRect(0, 0, State.canvas.width, State.canvas.height);

	    // visible bounds
	    const map = State.map;
	    const bounds = map.getBounds();
	    const center = map.getCenter();

	    // expand drawing area so panning is seamless
	    const latSpan = bounds.getNorth() - bounds.getSouth();
	    const lngSpan = bounds.getEast() - bounds.getWest();
	    const expanded = L.latLngBounds([
	        [bounds.getSouth() - latSpan * 2, bounds.getWest() - lngSpan * 2],
	        [bounds.getNorth() + latSpan * 2, bounds.getEast() + lngSpan * 2]
	    ]);

	    const mpp = metersPerPixel(center.lat, map.getZoom());
	    const spacingM = pickSpacingMeters(mpp, center.lat);

	    const crs = map.options.crs;
	    const nw = crs.project(expanded.getNorthWest());
	    const se = crs.project(expanded.getSouthEast());
	    const minX = Math.min(nw.x, se.x), maxX = Math.max(nw.x, se.x);
	    const minY = Math.min(nw.y, se.y), maxY = Math.max(nw.y, se.y);

	    // align canvas with layer origin
	    const topLeft = map.containerPointToLayerPoint([0, 0]);

	    ctx.save();
	    ctx.translate(-topLeft.x * dpr, -topLeft.y * dpr);
	    ctx.lineWidth = State.opts.lineWidth || 1;
	    ctx.strokeStyle = State.opts.color || 'rgba(255, 235, 59, 0.6)';
	    ctx.beginPath();

	    // verticals
	    let x0 = Math.floor(minX / spacingM) * spacingM;
	    for (let x = x0; x <= maxX; x += spacingM) {
	        const topLL = crs.unproject(L.point(x, minY));
	        const botLL = crs.unproject(L.point(x, maxY));
	        const p1 = map.latLngToLayerPoint(topLL);
	        const p2 = map.latLngToLayerPoint(botLL);
	        ctx.moveTo(Math.round(p1.x * dpr) + 0.5, Math.round(p1.y * dpr));
	        ctx.lineTo(Math.round(p2.x * dpr) + 0.5, Math.round(p2.y * dpr));
	    }

	    // horizontals
	    let y0 = Math.floor(minY / spacingM) * spacingM;
	    for (let y = y0; y <= maxY; y += spacingM) {
	        const leftLL = crs.unproject(L.point(minX, y));
	        const rightLL = crs.unproject(L.point(maxX, y));
	        const p1 = map.latLngToLayerPoint(leftLL);
	        const p2 = map.latLngToLayerPoint(rightLL);
	        ctx.moveTo(Math.round(p1.x * dpr), Math.round(p1.y * dpr) + 0.5);
	        ctx.lineTo(Math.round(p2.x * dpr), Math.round(p2.y * dpr) + 0.5);
	    }

	    ctx.stroke();
	    ctx.restore();
    }

    function updatePosition() {
	    if (!State.enabled || !State.canvas) return;
	    const topLeft = State.map.containerPointToLayerPoint([0, 0]);
	    State.canvas.style.transform = `translate(${topLeft.x}px, ${topLeft.y}px)`;
    }

    const API = {
	    init(map, opts={}) {
	        State.map = map;
	        State.opts = { ...State.opts, ...opts };
	        return API;
	    },
	    on() {
	        if (State.enabled) return;
	        if (!State.map) { console.warn('MetricGrid.init(map) first'); return; }
	        State.enabled = true;
	        ensureCanvas();
	        // listen & draw
	        State.map.on('zoom move', updatePosition);
	        State.map.on('moveend zoomend resize viewreset', draw);
	        draw();
	        updatePosition();
	    },
	    off() {
	        if (!State.enabled) return;
	        State.enabled = false;
	        State.map.off('zoom move', updatePosition);
	        State.map.off('moveend zoomend resize viewreset', draw);
	        if (State.canvas && State.canvas.parentNode) {
		        State.canvas.parentNode.removeChild(State.canvas);
		        State.canvas = null; State.ctx = null;
	        }
	    },
	    toggle() { State.enabled ? API.off() : API.on(); },
	    get enabled() { return State.enabled; } // Expose state for settings dialog
    };

    window.MetricGrid = API;
})();
