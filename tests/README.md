# SimpleGCS protocol tests

`npm test` runs deterministic Node tests without external services. The
`fixtures/mavlink.json` wire bytes come from pymavlink, covering every telemetry
message consumed by SimpleGCS plus heartbeat, COMMAND_INT, COMMAND_ACK,
MISSION_ITEM_INT and FILE_TRANSFER_PROTOCOL. Signing fixtures have a fixed test
key/timestamp and are independent of deployment credentials.

`mavlink.test.cjs` checks encoding, fragmented/coalesced decoding, CRC recovery,
MAVLink 1/2, 64-bit fields, array payloads, SHA256, signatures and replay rejection.
`mavftp.test.cjs` passes real encoded MAVLink packets through an in-memory
vehicle and uses a fake clock for retries. It covers EOF/tail loss, reordered
and duplicate bursts, pipelined gap reads, partial replies, sequence wrap,
stale sessions, malformed replies, limits and reentrant completion.
`ftp_manager.test.cjs` covers serialization, disconnect/cancel, watchdogs and
late callbacks. `browser.cjs` exercises the real UI with signed simulated
telemetry and FTP replies, including circle rendering and mouse long-press.

Browser tests need `npm ci` and Playwright Chromium (or `CHROME_PATH` /
`SIMPLEGCS_CDP_URL`). They still load the page's external map/UI resources.
The live SITL procedure is documented in `SimpleGCS/README.md`; it requires an
explicitly selected simulator and relay and is not part of unattended tests.
