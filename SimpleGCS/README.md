# SimpleGCS

A touch-friendly ground station for ArduPilot boats and rovers. It provides a
map, telemetry, arm/disarm, Rover mode changes, long-press repositioning,
mission and fence downloads over MAVFTP, and optional video and Google Maps.

## Run

Serve the repository root (paths to the shared MAVLink library are relative):

```sh
python3 -m http.server --bind 127.0.0.1
```

Open `http://127.0.0.1:8000/SimpleGCS/`. Press **Connect**, enter your MAVLink
WebSocket relay's `ws://` or `wss://` address and optional signing passphrase,
then press **Connect** in the dialog. HTTPS pages need a `wss://` endpoint.
Signing is configured independently of the optional 1 Hz GCS heartbeat.
Copy `config.example.js` to the ignored `config.js` to set a deployment's
`window.SIMPLEGCS_CONFIG.defaultUrl`. This prefills Connect for new browsers;
a saved URL takes priority. A configured default alone does not connect until
the user presses Connect. Signing credentials are entered in the dialog.
The saved connection is restored on reload. Commands and file requests wait
for an ArduPilot heartbeat to identify the vehicle. The first discovered
vehicle is selected until disconnect.

The relay must preserve MAVLink source system/component IDs for commands and
FTP replies. Relay authentication and vehicle signing are separate settings;
configure them according to the relay's forwarding behavior.

Connection settings, including the signing passphrase, are stored in this
browser's local storage. Use a browser profile appropriate for vehicle access.
No deployment endpoint or signing/video credentials are built into the app.

OpenStreetMap is the default map. Google Maps is optional: copy
`config.example.js` to the ignored `config.js`, or enter a browser API key in
Settings. Restrict that key to the intended website origins. The video panel
supports a configured MediaMTX WebRTC or HLS endpoint; its host, path and viewer
credentials can be changed in the panel's Settings.

## Repeatable simulator check

Use a Rover `motorboat-skid` SITL with a working navigation estimate and a
known inclusion fence, and connect it to your WebSocket relay. `sim_vehicle.py
--uds --no-extra-ports` isolates local SITL communications from other instances.
Run each instance in its own working directory. Keep SITL's existing parameters
and mission/fence files, and inspect any pre-arm failures before testing.

1. Connect from Chrome using the relay address and signing passphrase. Confirm
   vehicle position, mode, battery and continuing telemetry updates.
2. Fetch the fence from the menu. Check the inclusion/exclusion outlines against
   the reference fence. Fetch a mission and check its waypoint display.
3. Arm, select Loiter, and verify both changes in returned telemetry.
4. Hold a map point for at least 600 ms, comfortably inside the fence. Confirm
   GUIDED mode, the returned target marker and movement toward the target.
   Dragging the map should not send a target. Rejected commands appear in
   Messages and in a toast.
5. Select Loiter and disarm. Disconnect and reconnect, reload the page, and
   confirm telemetry and fence downloads resume.
6. Fetch the same file with dropped FTP replies and compare it byte-for-byte
   with a reference downloaded directly from SITL.

The optional Node helper accepts reply loss from 0 to 100 percent:

```sh
npm ci
node SimpleGCS/node_ftp.js "$WS_URL" "$SIGNING_PASSPHRASE" \
    @MISSION/fence.dat /tmp/fence.dat 30
```

MAVFTP downloads are read-only and limited to 64 MiB by default. They validate
reply addressing, session, request sequence and bounds, retry lost requests,
and recover missing ranges using ordinary reads. Completion requires every
byte advertised by OpenFileRO, including missing final burst packets.

## Tests

From the repository root, using Node 22.13 or later:

```sh
npm test
npm ci
npx playwright install chromium
npm run test:browser
```

The unit suite needs no installed npm dependencies. Checked-in wire fixtures
are generated independently by pymavlink; regeneration requires pymavlink:

```sh
python3 tests/fixtures/generate_mavlink.py
```

Browser tests use the actual page and MAVLink scripts with a deterministic
simulated WebSocket vehicle. They send no traffic to a real vehicle. To use
Chrome already running in Xephyr, set `SIMPLEGCS_CDP_URL` to its local DevTools
HTTP endpoint. Alternatively set `CHROME_PATH` to an installed Chrome binary.
See `tests/` for packet, signing, FTP recovery, mission parsing, queue lifecycle
and browser interaction coverage.
