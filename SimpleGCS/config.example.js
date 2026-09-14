// Copy to config.js for this deployment. config.js is ignored by Git.
window.SIMPLEGCS_CONFIG = {
    // Browser tab/window title. Omit or leave blank to keep "Simple GCS Map".
    title: "Simple GCS Map",

    // Prefills Connect for new browsers; saved connection settings take priority.
    // Use wss:// for a relay accessed from an HTTPS page.
    defaultUrl: "ws://127.0.0.1:5763",

    // GCS identity defaults; saved connection settings take priority.
    // ArduPilot normally recognizes system 255 for its GCS heartbeat failsafe.
    // If changed, configure MAV_GCS_SYSID / MAV_GCS_SYSID_HI on the vehicle too.
    defaultSystemId: 255,
    // Preferred per-tab component ID; defaults to random 1–255.
    // Saved in sessionStorage on Connect. A busy ID moves to the next free
    // ID where Web Locks are supported; other devices need distinct IDs.
    // defaultComponentId: 190
};

// Optional Google Maps browser API key. Leave empty to use OpenStreetMap.
window.GMAPS_API_KEY = "";
