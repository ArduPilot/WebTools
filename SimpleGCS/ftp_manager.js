/* Serialize FTP requests on one vehicle link. Cancellation and timeouts finish
   each job once, before allowing a queued request to start. */
(() => {
    let ftp = null;
    let current = null;
    let queue = [];
    let link = null;

    function finish(job, data) {
        if (job.completed) return;
        job.completed = true;
        clearTimeout(job.timer);
        if (current === job) current = null;
        try { job.cb?.(data); } finally { pump(); }
    }

    function armTimeout(job) {
        clearTimeout(job.timer);
        job.timer = setTimeout(() => {
            if (current !== job || job.completed) return;
            ftp.cancel();
        }, job.timeoutMs ?? 5000);
    }

    function pump() {
        if (current || !queue.length) return;
        const job = queue.shift();
        if (!ftp) { finish(job, null); return; }
        current = job;
        armTimeout(job);
        try { ftp.getFile(job.path, data => finish(job, data)); }
        catch (e) { finish(job, null); }
    }

    function dropQueued(predicate) {
        const canceled = queue.filter(predicate);
        queue = queue.filter(job => !predicate(job));
        for (const job of canceled) {
            job.completed = true;
            job.cb?.(null);
        }
    }

    const API = {
        setLink(MAVLink, ws, sysId, compId) {
            if (link && link.MAVLink === MAVLink && link.ws === ws &&
                link.sysId === sysId && link.compId === compId) return;
            API.clearLink();
            if (!MAVLink || !ws || !Number.isInteger(sysId) || sysId < 1 || sysId > 255 ||
                !Number.isInteger(compId) || compId < 0 || compId > 255) return;
            link = { MAVLink, ws, sysId, compId };
            ftp = new MAVFTP(MAVLink, ws);
            ftp.targetSystem = sysId;
            ftp.targetComponent = compId;
        },
        clearLink() {
            const previous = ftp;
            const canceled = queue;
            queue = [];
            ftp = link = null;
            previous?.cancel();
            for (const job of canceled) finish(job, null);
        },
        handleMessage(m) {
            const job = current;
            if (ftp?.handleMessage(m) && job && current === job && !job.completed) armTimeout(job);
        },
        getFile(path, cb, opts = {}) {
            if (opts.dropQueuedTag && opts.tag) dropQueued(job => job.tag === opts.tag);
            if (opts.dropQueuedPath) dropQueued(job => job.path === path);
            queue.push({ path, cb, tag: opts.tag, timeoutMs: opts.timeoutMs });
            pump();
        },
        cancelQueuedByTag(tag) { dropQueued(job => job.tag === tag); },
        cancelQueuedByPath(path) { dropQueued(job => job.path === path); },
        isBusy() { return current !== null; },
        queuedCount() { return queue.length; }
    };
    window.FTPManager = API;
})();
