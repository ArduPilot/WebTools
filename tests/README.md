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

`mavparam.test.cjs` checks packed defaults against independent Python/MAVProxy
fixtures, exact int32 values, malformed records, file formats, type validation,
search, resets, verified uploads, disconnect handling and offline definition
caching. `generate_params.py` regenerates its fixtures and requires MAVProxy.
FTP tests also cover acknowledged writes/closes and virtual files whose size is
only an estimate, including fixed-size recovery reads and lost final packets.
Browser tests exercise the parameter editor at desktop and phone viewport sizes,
including metadata search, edits, read-only fields, resets, file save/import,
and touch-operated bitmask controls.


PR review regressions additionally cover ArduPilot's cached burst replies with
loss and sequence wrap, the signing new-stream boundary and mixed-version
resynchronization. `commands.test.cjs` covers immediate sends, multiple
outstanding ACKs, denials, timeouts, progress and disconnect cancellation. Grid tests
compare CSS-pixel coordinates at DPR 1/2/3. Interaction tests cover mission
command/frame filtering, original sequence labels, stale fence/mission replies,
and both fingers remaining down during a cancelled hold.

The browser suite validates real popup exclusions and normal long press, force
command confirmation cancellation, stale-vehicle detection amid foreign relay
traffic, browser-valid stall close codes, signing replay rejection across
reconnect, connection drafts, and mouse/touch video dragging. The mock WebSocket
rejects invalid close codes. `npm run test:video` covers authenticated signaling,
hidden/closed player cleanup, native-HLS fallback, settings cancellation and an
optional local MediaMTX stream (see the SimpleGCS README).

FTP tests verify explicit reset retry correlation, immediate watchdogs without
link-setup resets, and no TerminateSession before an acknowledged open/create.
OpenFileRO and ReadFile replies are exercised across sequence 65535 → 0.
Browser tests keep a dead peer in CLOSING, check prompt reconnect and late-close
isolation, preserve the same vehicle's pan/zoom, and recenter after a vehicle change
or explicit disconnect. A duplicated tab with copied session storage must acquire
a different component ID. Review validation also removes individual fixes in
isolated copies and verifies that the targeted regression tests fail.
