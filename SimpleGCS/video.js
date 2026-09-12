/*
  video.js — Inset Video Panel (HTTPS + Live-Edge + Catch‑up)
  - Assumes MediaMTX serves HTTPS on:
  HLS   : https://<host>:8888/<path>/index.m3u8
  WebRTC: https://<host>:8889/<path>/
  - Uses WebRTC by default for low latency, HLS as fallback
  - Adds a "Go Live" button and protocol indicator
  - Stable playback without backwards seeking
*/
(() => {
    class VideoPanel {
        constructor(opts = {}) {
            this.host = opts.host || location.hostname || "127.0.0.1";
            this.hlsPort = opts.hlsPort ?? 8888;
            this.wrtcPort = opts.wrtcPort ?? 8889;
            this.path = opts.path || "stream";
            // Viewer credentials are configured by the user.
            this.user = opts.user || localStorage.getItem("video.user") || "";
            this.pass = opts.pass || localStorage.getItem("video.pass") || "";
            this.scheme = opts.scheme || (location.protocol === "https:" ? "https" : "http");
            this.el = null;
            this.hls = null;
            this.videoEl = null;
            this.currentIframe = null;
            this.liveTimer = null;
            this.liveBadgeEl = null;
            this.isWebRTC = false;
            this.hlsRetryCount = 0;
            this.maxHLSRetries = 3;
        }

        _hlsUrl() { return `${this.scheme}://${this.host}:${this.hlsPort}/${this.path}/index.m3u8`; }

        _webrtcUrl() {
            return `${this.scheme}://${this.host}:${this.wrtcPort}/${this.path}/`;
        }

        _createWebRTCHTML() {
            const baseUrl = this._webrtcUrl();
            const auth = (this.user && this.pass) ? btoa(`${this.user}:${this.pass}`) : '';

            return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin: 0; padding: 0; background: #000; overflow: hidden; }
    iframe { width: 100%; height: 100vh; border: 0; }
  </style>
</head>
<body>
  <iframe id="webrtc-frame" allow="autoplay; fullscreen"></iframe>
  <script>
    const frame = document.getElementById('webrtc-frame');
    const baseUrl = ${JSON.stringify(baseUrl).replace(/</g, '\\u003c')};
    const auth = '${auth}';

    // Set up the iframe with auth headers if needed
    if (auth) {
      fetch(baseUrl, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + auth
        },
        credentials: 'include'
      }).then(() => {
        // After auth, load the WebRTC page
        frame.src = baseUrl;
      }).catch(() => {
        // If auth fails, try without
        frame.src = baseUrl;
      });
    } else {
      frame.src = baseUrl;
    }
  </script>
</body>
</html>`;
        }

        open() {
            if (this.el) { this.show(); return; }

            const wrap = document.createElement("div");
            wrap.id = "video-panel";

            // Responsive sizing for mobile
            const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const screenWidth = window.innerWidth || document.documentElement.clientWidth;
            const screenHeight = window.innerHeight || document.documentElement.clientHeight;

            let width, height, right, bottom;
            if (isMobile) {
                // On mobile, use most of screen width but leave margins
                width = Math.min(screenWidth - 24, 380);
                height = Math.round(width * 9 / 16); // 16:9 aspect ratio
                right = 12;
                bottom = 12;
            } else {
                // Desktop default
                width = 420;
                height = 240;
                right = 12;
                bottom = 12;
            }

            wrap.style.cssText = [
                `position:absolute; right:${right}px; bottom:${bottom}px; width:${width}px; height:${height}px;`,
                "background:#111; color:#fff; z-index:9999; border-radius:10px;",
                "box-shadow:0 8px 24px rgba(0,0,0,.35); overflow:hidden;",
                "display:flex; flex-direction:column; user-select:none;"
            ].join("");

            const bar = document.createElement("div");
            bar.style.cssText = "height:36px; background:#222; display:flex; align-items:center; padding:0 8px; gap:8px; cursor:move;";
            const title = document.createElement("div");
            title.textContent = "Video";
            title.style.cssText = "font-weight:600; flex:1;";

            const btn = (label, bg) => {
                const b = document.createElement("button");
                b.textContent = label;
                b.style.cssText = `border:0; border-radius:8px; padding:4px 8px; cursor:pointer; font:600 12px system-ui; background:${bg}; color:#111;`;
                return b;
            };

            const protocolBtn = btn("WebRTC", "#81c784");
            protocolBtn.addEventListener("click", () => this._toggleProtocol());
            const popBtn = btn("New window", "#90caf9");
            popBtn.addEventListener("click", () => this.openNewWindow());
            const cfgBtn = btn("Settings", "#ffd54f");
            cfgBtn.addEventListener("click", () => this.openSettings());
            const closeBtn = btn("×", "#ef9a9a");
            closeBtn.style.width = "28px";
            closeBtn.addEventListener("click", () => this.close());
            bar.append(title, protocolBtn, popBtn, cfgBtn, closeBtn);

            const body = document.createElement("div");
            body.style.cssText = "position:relative; flex:1; display:flex;";

            // Status badge
            const statusBadge = document.createElement("div");
            statusBadge.style.cssText = "position:absolute; left:8px; top:8px; padding:2px 8px; border-radius:999px; font:600 12px system-ui; letter-spacing:.08em; background:#4caf50; color:#fff; user-select:none; z-index:1;";
            statusBadge.textContent = "WebRTC";
            body.append(statusBadge);
            this.liveBadgeEl = statusBadge;

            const grip = document.createElement("div");
            grip.style.cssText = "position:absolute; right:0; bottom:0; width:18px; height:18px; background:linear-gradient(135deg, transparent 50%, rgba(255,255,255,.25) 50%); cursor:nwse-resize; z-index:1;";
            body.append(grip);

            wrap.append(bar, body);
            (document.getElementById("map") || document.body).appendChild(wrap);

            // Store reference to protocol button
            this.protocolBtn = protocolBtn;

            // drag
            let drag = null;
            bar.addEventListener("mousedown", (e) => { drag = { x:e.clientX, y:e.clientY, left:wrap.offsetLeft, top:wrap.offsetTop }; e.preventDefault(); });
            document.addEventListener("mousemove", (e) => {
                if (!drag) return; const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
                wrap.style.left = (drag.left + dx) + "px"; wrap.style.top = (drag.top + dy) + "px";
                wrap.style.right = "auto"; wrap.style.bottom = "auto";
            });
            document.addEventListener("mouseup", () => { drag = null; });

            // resize
            let rez = null;
            grip.addEventListener("mousedown", (e) => { rez = { x:e.clientX, y:e.clientY, w:wrap.offsetWidth, h:wrap.offsetHeight }; e.preventDefault(); });
            document.addEventListener("mousemove", (e) => {
                if (!rez) return; const dx = e.clientX - rez.x; const dy = e.clientY - rez.y;
                wrap.style.width = Math.max(280, rez.w + dx) + "px"; wrap.style.height = Math.max(160, rez.h + dy) + "px";
            });
            document.addEventListener("mouseup", () => { rez = null; });

            this.el = wrap;
            this.bodyEl = body;

            // Add resize listener for mobile responsiveness
            this.resizeHandler = () => this._handleResize();
            window.addEventListener('resize', this.resizeHandler);
            window.addEventListener('orientationchange', this.resizeHandler);

            // Start with WebRTC for lowest latency
            this._useWebRTC();
        }

        _handleResize() {
            if (!this.el) return;

            const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const screenWidth = window.innerWidth || document.documentElement.clientWidth;

            if (isMobile) {
                const newWidth = Math.min(screenWidth - 24, 380);
                const newHeight = Math.round(newWidth * 9 / 16);

                this.el.style.width = newWidth + 'px';
                this.el.style.height = newHeight + 'px';

                // Keep it on screen
                const currentRight = parseInt(this.el.style.right) || 12;
                if (currentRight + newWidth > screenWidth) {
                    this.el.style.right = '12px';
                    this.el.style.left = 'auto';
                }
            }
        }

        _toggleProtocol() {
            if (this.isWebRTC) {
                this._useHLS();
            } else {
                this._useWebRTC();
            }
        }

        _useWebRTC() {
            this._cleanup();

            const iframe = document.createElement("iframe");

            // Use data URL to avoid embedded credentials restriction
            const htmlContent = this._createWebRTCHTML();
            const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
            iframe.src = dataUrl;

            iframe.style.cssText = "border:0; width:100%; height:100%; background:#000;";
            iframe.allow = "autoplay; fullscreen";

            // Prevent auth prompts by handling load errors gracefully
            iframe.onload = () => {
                console.log("WebRTC iframe loaded successfully");
            };

            iframe.onerror = (e) => {
                console.warn("WebRTC iframe load error:", e);
                // Don't show user-visible errors, just log them
            };

            this.bodyEl.insertBefore(iframe, this.bodyEl.firstChild);
            this.currentIframe = iframe;
            this.isWebRTC = true;

            this._updateUI("WebRTC", "#4caf50", "#81c784");

            // Start monitoring connection
            this._startConnectionMonitor();
        }

        _useHLS() {
            this._cleanup();

            const video = document.createElement("video");
            video.style.cssText = "width:100%; height:100%; background:#000;";
            video.autoplay = true;
            video.playsInline = true;
            video.muted = true;
            video.controls = true;

            this.bodyEl.insertBefore(video, this.bodyEl.firstChild);
            this.videoEl = video;
            this.isWebRTC = false;

            this._updateUI("HLS", "#ff9800", "#ffb74d");

            // Use stable HLS configuration
            this._playStableHLS();
        }

        _playStableHLS() {
            const url = this._hlsUrl();

            // Store credentials
            localStorage.setItem("video.user", this.user || "");
            localStorage.setItem("video.pass", this.pass || "");
            localStorage.setItem("video.host", this.host || "");
            localStorage.setItem("video.path", this.path || "");

            if (location.protocol === "https:" && url.startsWith("http://")) {
                this._useWebRTC(); // Fallback to WebRTC
                return;
            }

            // Try native HLS first (Safari/iOS)
            if (this.videoEl && this.videoEl.canPlayType && this.videoEl.canPlayType("application/vnd.apple.mpegurl")) {
                this.videoEl.src = url;
                this.videoEl.play().catch(e => console.warn("Play failed:", e));
                return;
            }

            // Use HLS.js with stable, non-aggressive settings
            if (!window.Hls) {
                this._useWebRTC(); // Fallback to WebRTC
                return;
            }

            if (this.hls) {
                try { this.hls.destroy(); } catch {}
                this.hls = null;
            }

            const auth = (this.user && this.pass) ? "Basic " + btoa(`${this.user}:${this.pass}`) : null;

            // Stable HLS configuration - prioritize stability over latency
            const hls = new Hls({
                autoStartLoad: true,
                startPosition: -1,
                lowLatencyMode: false, // Disable for stability

                // Conservative buffering for stable playback
                backBufferLength: 30,
                liveSyncDurationCount: 3, // Stay 3 segments behind live edge
                liveMaxLatencyDurationCount: 10, // Allow up to 10 segments behind
                maxLiveSyncPlaybackRate: 1.0, // No speed adjustments

                // Larger buffers for stability
                maxBufferLength: 30,
                maxBufferSize: 100 * 1000 * 1000, // 100MB
                maxBufferHole: 2,

                // Conservative loading
                enableWorker: true,
                fragLoadingTimeOut: 20000,
                manifestLoadingTimeOut: 10000,
                levelLoadingTimeOut: 10000,

                xhrSetup: (xhr) => { if (auth) xhr.setRequestHeader("Authorization", auth); }
            });

            hls.on(Hls.Events.ERROR, (_evt, data) => {
                console.warn("HLS Error:", data);
                if (data && data.fatal) {
                    this.hlsRetryCount++;
                    if (this.hlsRetryCount >= this.maxHLSRetries) {
                        console.log("Max HLS retries reached, switching to WebRTC");
                        this._useWebRTC();
                    } else {
                        console.log(`HLS retry ${this.hlsRetryCount}/${this.maxHLSRetries}`);
                        setTimeout(() => this._playStableHLS(), 2000);
                    }
                }
            });

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this.videoEl.play().catch(e => console.warn("Play failed:", e));
                this.hlsRetryCount = 0; // Reset retry count on success
            });

            hls.loadSource(url);
            hls.attachMedia(this.videoEl);
            this.hls = hls;
        }

        _updateUI(protocol, badgeColor, buttonColor) {
            if (this.liveBadgeEl) {
                this.liveBadgeEl.textContent = protocol;
                this.liveBadgeEl.style.background = badgeColor;
            }
            if (this.protocolBtn) {
                this.protocolBtn.textContent = protocol === "WebRTC" ? "Switch to HLS" : "Switch to WebRTC";
                this.protocolBtn.style.background = buttonColor;
            }
        }

        _startConnectionMonitor() {
            this._stopConnectionMonitor();

            // Simple connection monitoring for WebRTC
            if (this.isWebRTC && this.currentIframe) {
                this.connectionTimer = setInterval(() => {
                    // Basic iframe health check
                    try {
                        if (!this.currentIframe || !this.currentIframe.parentNode) {
                            this._stopConnectionMonitor();
                        }
                    } catch (e) {
                        console.warn("WebRTC connection issue:", e);
                    }
                }, 5000);
            }
        }

        _stopConnectionMonitor() {
            if (this.connectionTimer) {
                clearInterval(this.connectionTimer);
                this.connectionTimer = null;
            }
        }

        _cleanup() {
            // Clean up video element and HLS
            if (this.hls) {
                try { this.hls.destroy(); } catch {}
                this.hls = null;
            }

            if (this.videoEl && this.videoEl.parentNode) {
                this.videoEl.parentNode.removeChild(this.videoEl);
                this.videoEl = null;
            }

            // Clean up iframe
            if (this.currentIframe && this.currentIframe.parentNode) {
                this.currentIframe.parentNode.removeChild(this.currentIframe);
                this.currentIframe = null;
            }

            this._stopConnectionMonitor();
        }

        openNewWindow() {
            window.open(this._webrtcUrl(), "_blank", "noopener,noreferrer");
        }

        openSettings() {
            const host = prompt("MediaMTX host", this.host) || this.host;
            const path = prompt("Path", this.path) || this.path;
            const user = prompt("Viewer username", this.user || "") || "";
            const pass = prompt("Viewer password", this.pass || "") || "";

            this.host = host;
            this.path = path;
            this.user = user;
            this.pass = pass;

            if (this.el) {
                // Restart current protocol
                if (this.isWebRTC) {
                    this._useWebRTC();
                } else {
                    this._useHLS();
                }
            }
        }

        show() {
            if (this.el) this.el.style.display = "flex";
        }

        hide() {
            if (this.el) this.el.style.display = "none";
        }

        toggle() {
            if (this.el && this.el.style.display !== "none") this.hide();
            else this.open();
        }

        close() {
            this._cleanup();

            // Remove resize listeners
            if (this.resizeHandler) {
                window.removeEventListener('resize', this.resizeHandler);
                window.removeEventListener('orientationchange', this.resizeHandler);
                this.resizeHandler = null;
            }

            if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
            this.el = null;
            this.bodyEl = null;
            this.liveBadgeEl = null;
            this.protocolBtn = null;
        }
    }

    const _instance = new VideoPanel({
        host: localStorage.getItem("video.host") || location.hostname || "127.0.0.1",
        path: localStorage.getItem("video.path") || "stream",
        user: localStorage.getItem("video.user") || "",
        pass: localStorage.getItem("video.pass") || ""
    });

    window.VideoPanel = {
        toggle: () => _instance.toggle(),
        open:   () => _instance.open(),
        close:  () => _instance.close(),
        openNewWindow: () => _instance.openNewWindow()
    };
})();
