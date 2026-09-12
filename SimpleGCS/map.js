/*
  map.js - Map functionality for the GCS web app
  Handles Leaflet map initialization, vehicle markers, and map interactions
*/

(() => {
    const MapManager = {
        // Map state
        map: null,
        vehicleMarker: null,
        appliedVehClass: null,
        lastHeadingDeg: null,
        targetMarker: null,
        lastTargetSeenMs: 0,

        // Base layer management
        _baseLayer: null,
        _googleMapsReady: false,

        // Initialize the map
        init(containerId = "map") {
            this.map = L.map(document.getElementById(containerId), {
                zoomControl: true
            }).setView([0, 0], 2);

            this._setupBaseLayers();
            this._setupControls();
            this._setupInteractions();

            return this.map;
        },

        // Setup base tile layers
        _setupBaseLayers() {
            this.applyTileProvider();
        },

        // Setup map controls
        _setupControls() {
            // Scale bar
            L.control.scale({
                position: 'bottomright',
                imperial: false,
                maxWidth: 300
            }).addTo(this.map);

            // Initialize modules
            UserLocation.init(this.map, { autoCenterFirstFix: false });
            MetricGrid.init(this.map);
        },

        // Setup map interactions
        _setupInteractions() {
            // Prevent iPhone popup menus
            this.map.getContainer().addEventListener("contextmenu", (e) => e.preventDefault());

            // Setup long-press for repositioning
            this._setupLongPressReposition();

            // Target marker cleanup interval
            this._setupTargetCleanup();
        },

        // Base layer management
        _removeBase() {
            if (this._baseLayer) {
                try {
                    this.map.removeLayer(this._baseLayer);
                } catch {}
                this._baseLayer = null;
            }
        },

        async applyTileProvider() {
            this._removeBase();
            const provider = window.AppSettings ? window.AppSettings.tiles : "osm";

            // XYZ tile providers
            const XYZ = {
                "osm": {
                    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                    opts: { maxZoom: 19, attribution: "© OpenStreetMap" }
                },
                "opentopomap": {
                    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
                    opts: { maxZoom: 17, attribution: "© OpenTopoMap (CC-BY-SA)" }
                },
                "carto-light": {
                    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
                    opts: { maxZoom: 20, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }
                },
                "carto-dark": {
                    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                    opts: { maxZoom: 20, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }
                },
                "esri-world-imagery": {
                    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                    opts: { maxZoom: 20, attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community" }
                },
                "au-ga-topo": {
                    url: "https://services.ga.gov.au/gis/rest/services/NationalBaseMap/MapServer/tile/{z}/{y}/{x}",
                    opts: { maxZoom: 20, attribution: "© Geoscience Australia" }
                },
                "uk-os-opendata": {
                    url: "https://tiles.arcgis.com/tiles/knu9Ytn4VsWTJ4CG/arcgis/rest/services/OS_Open_Zoomstack_3857/MapServer/tile/{z}/{y}/{x}",
                    opts: { maxZoom: 20, attribution: "© Ordnance Survey OpenData" }
                }
            };

            // Google via GoogleMutant
            const MUTANT_TYPES = {
                "google": "roadmap",
                "google-terrain": "terrain",
                "google-satellite": "satellite",
                "google-hybrid": "hybrid"
            };

            if (MUTANT_TYPES[provider]) {
                try {
                    // Load Google Maps API asynchronously
                    if (!this._googleMapsReady) {
                        await (window.GMapsLoader?.load(window.GMAPS_API_KEY));
                        this._googleMapsReady = true;
                    }

                    if (L.gridLayer && L.gridLayer.googleMutant) {
                        this._baseLayer = L.gridLayer.googleMutant({
                            type: MUTANT_TYPES[provider]
                        }).addTo(this.map);
                        return;
                    }
                } catch (e) {
                    console.warn("Google Maps failed to load, falling back to OSM:", e);
                    // Fall through to OSM fallback
                }
            }

            // XYZ fallbacks / non-Google providers
            const meta = XYZ[provider] || XYZ["osm"];
            this._baseLayer = L.tileLayer(meta.url, meta.opts).addTo(this.map);
        },

        // Vehicle marker management
        makeSvgIcon(kind, rotateDeg = 0) {
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
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
                     style="transform: rotate(${rotateDeg}deg); transform-origin: center;">
                    ${paths[kind] || paths.plane}
                </svg>`;

            return L.divIcon({
                html: svg,
                className: "veh-ico",
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
        },

        updateVehiclePosition(lat, lon, vehicleClass, headingDeg = null) {
            if (!this.vehicleMarker) {
                this.vehicleMarker = L.marker([lat, lon], {
                    icon: this.makeSvgIcon(vehicleClass, headingDeg || 0)
                }).addTo(this.map);
                this.appliedVehClass = vehicleClass;
                this.lastHeadingDeg = headingDeg;
            } else {
                this.vehicleMarker.setLatLng([lat, lon]);
            }

            // Update icon if vehicle class changed or heading changed
            if (this.appliedVehClass !== vehicleClass ||
                (headingDeg !== null && headingDeg !== this.lastHeadingDeg)) {
                this.vehicleMarker.setIcon(this.makeSvgIcon(vehicleClass, headingDeg || 0));
                this.appliedVehClass = vehicleClass;
                if (headingDeg !== null) this.lastHeadingDeg = headingDeg;
            }

            // Auto-center on first position
            if (!this.map._movedOnce) {
                this.map.setView([lat, lon], 16);
                this.map._movedOnce = true;
            }
        },

        updateVehicleHeading(yawRad) {
            let deg = yawRad * 180 / Math.PI;
            deg = (deg + 360) % 360;
            this.lastHeadingDeg = deg;

            if (this.vehicleMarker) {
                this.vehicleMarker.setIcon(this.makeSvgIcon(this.appliedVehClass, deg));
            }
        },

        // Target position management
        updateTargetPosition(lat, lon) {
            if (!this.targetMarker) {
                this.targetMarker = L.circleMarker([lat, lon], {
                    radius: 8,
                    color: '#f44336',
                    fillColor: '#f44336',
                    fillOpacity: 0.6,
                    weight: 2
                }).addTo(this.map);
                this.targetMarker.bindPopup("Target Position");
            } else {
                this.targetMarker.setLatLng([lat, lon]);
            }
            this.lastTargetSeenMs = Date.now();
        },

        clearTargetPosition() {
            if (this.targetMarker) {
                this.map.removeLayer(this.targetMarker);
                this.targetMarker = null;
            }
            this.lastTargetSeenMs = 0;
        },

        // Center map on vehicle
        recenterOnVehicle() {
            if (this.vehicleMarker) {
                const ll = this.vehicleMarker.getLatLng();
                this.map.setView(ll, Math.max(this.map.getZoom(), 16));
            }
        },

        // Long-press for repositioning
        _setupLongPressReposition() {
            const el = this.map.getContainer();
            let pressTimer = null, startPt = null, lastPt = null, activeId = null;
            const HOLD_MS = 600, MOVE_PX_TOL = 10;
            const pointers = new Set();

            const clearAll = () => {
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
                activeId = null;
                startPt = lastPt = null;
            };

            window.addEventListener("pointerdown", (ev) => {
                // A second finger cancels the entire gesture, including the first
                // finger's timer. Do not start another hold until all are lifted.
                pointers.add(ev.pointerId);
                if (pointers.size > 1) clearAll();
            }, { capture: true });
            el.addEventListener("pointerdown", (ev) => {
                if (pointers.size > 1) return;
                if (ev.button !== 0 || ev.target.closest(".leaflet-control, #video-panel, button, input, select, textarea, a")) return;
                if (ev.pointerType === "touch") ev.preventDefault();

                activeId = ev.pointerId;
                startPt = lastPt = this.map.mouseEventToContainerPoint(ev);
                pressTimer = setTimeout(() => {
                    if (!lastPt) return;
                    const ll = this.map.containerPointToLatLng(lastPt);

                    // Fire custom event for long press
                    const event = new CustomEvent('mapLongPress', {
                        detail: { lat: ll.lat, lng: ll.lng }
                    });
                    window.dispatchEvent(event);

                    clearAll();
                }, HOLD_MS);
            }, { passive: false });

            el.addEventListener("pointermove", (ev) => {
                if (ev.pointerId !== activeId) return;
                if (ev.pointerType === "touch") ev.preventDefault();
                lastPt = this.map.mouseEventToContainerPoint(ev);
                if (startPt && lastPt && startPt.distanceTo(lastPt) > MOVE_PX_TOL) {
                    clearAll();
                }
            }, { passive: false });

            // Child map layers can redraw under the pointer during a hold.
            // Only leaving the map itself should cancel the gesture.
            el.addEventListener("pointerleave", (ev) => {
                if (ev.pointerId === activeId) clearAll();
            });
            // Releases can occur outside the map after a drag or pinch.
            ["pointerup", "pointercancel"].forEach(t =>
                window.addEventListener(t, (ev) => {
                    pointers.delete(ev.pointerId);
                    if (ev.pointerId === activeId) clearAll();
                }, { capture: true })
            );
            window.addEventListener("blur", () => { pointers.clear(); clearAll(); });
        },

        // Target cleanup timer
        _setupTargetCleanup() {
            setInterval(() => {
                if (this.targetMarker && this.lastTargetSeenMs &&
                    (Date.now() - this.lastTargetSeenMs > 5000)) {
                    this.clearTargetPosition();
                }
            }, 1000);
        },

        // Get current map instance
        getMap() {
            return this.map;
        },

        // Destroy map instance
        destroy() {
            if (this.map) {
                this.map.remove();
                this.map = null;
                this.vehicleMarker = null;
                this.targetMarker = null;
                this._baseLayer = null;
            }
        }
    };

    // Export to global scope
    window.MapManager = MapManager;
})();
