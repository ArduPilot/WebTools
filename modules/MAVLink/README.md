# Shared MAVLink tools

`mavlink.js` contains the shared MAVLink codec. Browser users must await
`mavlink20.ready` before encoding or parsing packets. `mavftp.js` exports
`MAVFTP` and `MissionParser`; `mavparam.js` exports `MAVParam` and
`MAVParamDefinitions`. They work as browser globals or CommonJS exports.

## Reusing parameters

`MAVParam` has no DOM or SimpleGCS dependency. Supply an FTP transport exposing
`getFile(path, callback, options)` and `putFile(path, bytes, callback, options)`.
Callbacks return downloaded bytes or the uploaded byte count; `null` means
failure. A `MAVFTP` instance implements this interface. If other features share
that instance, serialize transfers (SimpleGCS does this in `FTPManager`).

```js
await mavlink20.ready;
const codec = new MAVLink20Processor(null, 255, 190);
// Configure signing on codec before sending any traffic when required.
const ftp = new MAVFTP(codec, socket);
ftp.targetSystem = vehicleSystemId;
ftp.targetComponent = vehicleComponentId;
const parameters = new MAVParam({ftp});

socket.binaryType = 'arraybuffer';
socket.addEventListener('message', event => {
    for (const message of codec.parseBuffer(new Uint8Array(event.data)) || []) {
        ftp.handleMessage(message);
    }
});

await parameters.refresh();
const matches = parameters.search('cruise speed', true); // non-default only
const file = MAVParam.saveText(parameters.params.values());
const changes = MAVParam.parseText('CRUISE_SPEED 2.5');
const preview = parameters.changes(changes);
await parameters.apply(changes); // FTP write + close ACK + verified download
await parameters.reset('CRUISE_SPEED');

socket.addEventListener('close', () => {
    parameters.disconnect();
    ftp.cancel();
});
```

Create a new model for a new vehicle/link. Subscribe with
`parameters.subscribe(callback)`; its return value unsubscribes. The model
exposes `params` (Map of `{name, value, type, defaultValue}`), `busy`, `connected`
and `definitions`. The wire types are AP_PARAM int8=1, int16=2, int32=3 and
float32=4. Float inputs are rounded to float32 before comparison; int32 values
retain all bits. Current/default values always come from the vehicle.

Static helpers `decode(bytes)`, `encodeUpload(records)`, `parseText(text)` and
`saveText(records)` can be used independently. Download and upload headers differ:
uploads encode their total byte length in the final header word. Uploads are
limited to 65535 bytes by ArduPilot's packed format. Unknown names, malformed
files and out-of-type-range values are rejected. Definition ranges are displayed
as guidance; firmware remains responsible for accepting individual settings.
Uploads are not atomic: on failure, refresh before deciding what to retry.

## Parameter definitions and optional UI

`MAVParamDefinitions.load(vehicle, {refresh:false})` fetches the official JSON
for Rover, Plane, Copter, Heli, Sub, Blimp or AntennaTracker. It returns
`{definitions, cached, stale}`. `baseUrl`, `fetch`, `cache` and `maxAge` are
constructor options for alternate providers, tests, or custom caching.
Canonical vehicle directories avoid redirects lacking CORS headers. Default
caching uses Cache Storage (`mavparam-definitions-v1`) and a seven-day TTL;
network failure falls back to a valid cached copy. Cache failures do not prevent
in-memory use. These definitions describe current upstream firmware, rather
than an exact installed build.

The optional `mavparam-ui.js` / `mavparam-ui.css` layer uses a native modal dialog:

```js
const panel = new MAVParamUI();
panel.setClient(parameters, MAVParam.vehicleName(heartbeat.type));
openParametersButton.onclick = () => panel.open();
// On link loss: panel.setClient(null). On teardown: panel.destroy().
```

The UI fetches values on first open and loads definitions separately. It offers
search, non-default filtering, editing, reset, save and previewed file imports.
Closing the UI does not cancel active writes. Destroying it removes its DOM and
subscription; the caller still owns the model/transport lifecycle.

## FTP transfer behavior

`MAVFTP.getFile(path, callback, options)` defaults to exact advertised file sizes.
`{sizeIsEstimate:true, fixedReadSize:true}` supports virtual packed parameter
files: wait for EOF to establish length, then recover every missing byte using
the original read block size. The caller must validate the packed record count;
`MAVParam` does. Ordinary mission/fence downloads retain exact-size checks.

`putFile(path, bytes, callback)` uses CreateFile, acknowledged WriteFile chunks
and an acknowledged TerminateSession. Retries preserve each request's sequence
and payload; replies must match addressing, session, opcode, sequence and offset.
Failure or cancellation returns `null`; a close ACK returns the uploaded byte
count, including zero for empty files. The caller should verify virtual-file
application, as `MAVParam` does. Transfers are limited to 64 MiB by default.
