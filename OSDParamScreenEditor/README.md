# ArduPilot OSD Parameter Editor

Developed by Atx_Heli. A browser-based editor for the nine adjustable parameter slots on ArduPilot OSD Screens 5 and 6. Slots can be edited offline, or read from and written to the flight controller over USB using Web Serial and MAVLink 2. Everything runs client-side; no software installation is needed.

## Requirements

- Desktop Chrome or Edge, or Firefox on Windows (Web Serial is required for USB). Firefox on Linux cannot access serial ports, and Safari is not supported. On Linux, use Chrome from Google's `.deb` package; the snap builds of Firefox and Chromium are sandboxed away from serial ports.
- On Linux, your user must be in the `dialout` group to open the flight controller's port.
- The page must be served over HTTPS or from localhost. To run locally, run `python3 -m http.server 8000` from the WebTools repository root (the tool loads the shared `modules/MAVLink` codec) and open `http://localhost:8000/OSDParamScreenEditor/`.
- Close Mission Planner or any other program using the flight controller's serial port. A web page cannot open a port that another program already has open.

## Connecting and reading

1. Connect the flight controller by USB, choose the baud rate (typically 115200) and click **Connect USB**. Select the serial port in the browser prompt.
2. The tool waits up to 5 seconds for an ArduPilot heartbeat. When one arrives the button shows **Connected**. If none arrives, it warns and closes the port so you can check the baud rate and port and try again.
3. Click **Read from FC**. This fetches the FC parameter list and all 18 OSD slots, replacing the slots in the editor. The **Source** column shows where each slot's values came from and whether it is disabled.
4. Click **Save JSON** to keep a backup before making changes.

## Editing slots

- **Parameter name:** click the arrow to browse, or type any part of a name to filter. Arrow keys and Enter work in the list.
- **Min, Max, Increment:** the range and step size for the slot. Enabled slots need a positive increment.
- **Typed slots:** some stock slots have a type (serial protocol, servo function, aux function, flight mode or failsafe action), so the OSD shows value names. The FC uses fixed ranges for a typed slot and ignores the ranges you enter. When you assign a different parameter, the slot becomes untyped so your ranges apply.
- **Enable checkbox** (under each slot number): uncheck to disable a slot without erasing its stored assignment. A disabled slot keeps its name and values visible but greyed out and not editable. Check it again to re-enable editing. Selecting `<BLANK / DISABLED>` or clearing the name (once you leave the field) also disables a slot.
- **CLEAR ALL:** clears and disables all 18 slots in the editor after confirmation. Nothing changes on the flight controller until you click **Write to FC**.
- Switch between screens with the **Screen 5** and **Screen 6** tabs.

## Writing to the flight controller

Click **Write to FC** with the vehicle disarmed.

- Writing is only possible after a successful **Read from FC**.
- Only slots that differ from the last FC read are written. The tool requests acknowledgements, then reads each changed slot back and checks its name, type and ranges. The editor then shows the values the FC actually holds.
- Enabled slots are checked before writing: the parameter must exist on the FC and the values must be valid numbers.
- Disabled slots are written only through their `OSD{5,6}_PARAM{1..9}_EN` flag set to 0. Their stored name and values on the FC are left untouched and are not checked.
- A slot with no parameter assigned, or whose stored assignment no longer matches a parameter, is read as empty and disabled. You can assign a parameter to it and write it.
- If an enabled slot comes back from the FC with an empty name, writing is blocked so a configuration that could not be verified is not overwritten.
- The tool does not set `OSD5_ENABLE` or `OSD6_ENABLE`. Enable the screens separately if needed.
- If a read or write fails, reconnect and read again before trying another write.

## Files and metadata

- **Vehicle:** selects the Plane, Copter or Rover parameter definitions used for the parameter list and suggested ranges. It is set automatically from the FC heartbeat when connected, then confirmed from the parameter list on Read from FC (the heartbeat type alone can't tell a QuadPlane from a Copter). The definitions are bundled with the tool (`<Vehicle>_params.json`), so no network access is needed; regenerate them from the published `apm.pdef.json` with `python3 update_params.py`.
- **Fill missing ranges:** fills only empty Min/Max/Increment fields from the metadata. Metadata ranges are suggestions; check them against your firmware.
- **Save JSON / Load JSON:** save or load both screens as a JSON project, including each slot's assigned parameter name and enabled state. This is the only offline format that keeps the slot assignments: a `.param` file stores them as `OSDn_PARAMm_KEY/IDX/GRP` internal numbers that cannot be turned back into a name without the firmware. Loading a JSON file changes the editor but keeps the last FC read for comparison, so you can Read from FC, Load JSON, then Write to FC to apply a saved setup. In older JSON files without an `enabled` field, a slot is treated as enabled if it has a parameter name.
- **Load .param / Export numeric .param:** import or export the enable, min, max and increment values in `.param` / `.parm` format. Parameter names are not included, because they are not stored as numeric parameters. The exported enable flags follow each slot's Enable checkbox.

## Activity log

The activity log at the bottom shows connection status, reads, writes and warnings, color-coded by type. A loading overlay is shown while reading from or writing to the FC.

## MAVLink details

MAVLink encoding and parsing use the shared codec in `modules/MAVLink/mavlink.js`; this tool adds only the Web Serial transport. It uses HEARTBEAT, PARAM_REQUEST_LIST, PARAM_VALUE, PARAM_REQUEST_READ, PARAM_SET, OSD_PARAM_CONFIG / REPLY and OSD_PARAM_SHOW_CONFIG / REPLY. The tool targets the autopilot component of the ArduPilot system found from its heartbeat, and matches slot replies to requests by request ID. No build step is needed.

## Notes

- Tested on Windows in Chrome and Firefox with an ArduPlane 4.8-dev flight controller.
- The FC parameter list can be large; slow links may time out.
- Always keep a JSON backup and write only while disarmed.
