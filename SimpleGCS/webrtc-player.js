/* Authenticated MediaMTX playback shared by the inset and separate window. */
(() => {
    class WebRTCPlayer {
        constructor(video, status, options) {
            this.video = video;
            this.status = status;
            this.closed = false;
            this.onPlaying = () => { if (video.srcObject) this.setStatus('WebRTC · Live', '#4caf50'); };
            this.onWaiting = () => { if (video.srcObject) this.setStatus('WebRTC · Buffering', '#b36b00'); };
            video.addEventListener('playing', this.onPlaying);
            video.addEventListener('waiting', this.onWaiting);
            this.setStatus('WebRTC · Connecting', '#b36b00');
            try {
                this.reader = new MediaMTXWebRTCReader({
                    ...options,
                    onError: error => {
                        if (this.closed) return;
                        video.srcObject = null;
                        this.showError(error);
                    },
                    onTrack: event => {
                        if (this.closed) return;
                        video.srcObject = event.streams[0];
                        video.play().catch(() => {
                            if (!this.closed) this.setStatus('WebRTC · Press play to watch', '#b36b00');
                        });
                    }
                });
            } catch (error) {
                this.showError(error);
            }
            this.onPageHide = () => this.close();
            window.addEventListener('pagehide', this.onPageHide);
        }

        showError(error) {
            const detail = String(error);
            let message = /401|403|unauthorized/i.test(detail) ? "Authentication failed. Check video settings." :
                /404|stream not found/i.test(detail) ? "Stream not found. Check video settings." :
                "Unable to play video. Check the connection and video settings.";
            if (/retrying/i.test(detail)) message += " Retrying…";
            this.setStatus(`WebRTC · ${message}`, '#b3261e');
        }

        setStatus(text, color) {
            if (this.closed) return;
            this.status.textContent = text;
            this.status.style.background = color;
        }

        close() {
            if (this.closed) return;
            this.closed = true;
            this.reader?.close();
            this.video.removeEventListener('playing', this.onPlaying);
            this.video.removeEventListener('waiting', this.onWaiting);
            this.video.pause();
            this.video.srcObject = null;
            window.removeEventListener('pagehide', this.onPageHide);
        }
    }
    window.WebRTCPlayer = WebRTCPlayer;
})();
