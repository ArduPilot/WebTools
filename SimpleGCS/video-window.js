/* Receive configuration only from the same-origin window that opened us. */
(() => {
    const parent = window.opener;
    const status = document.getElementById('status');
    if (!parent) { status.textContent = 'Open video from the GCS video panel.'; return; }
    const receive = event => {
        if (event.source !== parent || event.origin !== location.origin ||
            event.data?.type !== 'simplegcs-video-config') return;
        window.removeEventListener('message', receive);
        clearTimeout(timer);
        window.opener = null;
        new WebRTCPlayer(document.querySelector('video'), status, event.data.options);
    };
    const timer = setTimeout(() => {
        window.removeEventListener('message', receive);
        window.opener = null;
        status.textContent = 'Unable to connect to the GCS video panel. Close this window and try again.';
    }, 30000);
    window.addEventListener('message', receive);
    parent.postMessage('simplegcs-video-ready', location.origin);
})();
