# ArduPilot OSD Parameter Editor

Developed by Atx_Heli. A browser-based editor for the nine adjustable parameter slots on ArduPilot OSD Screens 5 and 6. Slots can be edited offline, or read from and written to the flight controller over USB using Web Serial and MAVLink 2. Everything runs client-side; no software installation is needed.

## Requirements

- Desktop Chrome, Edge or Firefox (Web Serial is required for USB; Safari is not supported).
- The page must be served over HTTPS or from localhost. To run locally, use `python -m http.server 8000` in this directory and open `http://localhost:8000`.
- Close Mission Planner or any other program using the flight controller's serial port. A web page cannot open a port that another program already has open.

## Connecting and reading

1. Connect the flight controller by USB, choose the baud rate (typically 115200) and click **Connect USB**. Select the serial port in the browser prompt.
2. The tool waits up to 5 seconds for an ArduPilot heartbeat. When one arrives the button shows **Connected**. If none arrives, it warns and closes the port so you can check the baud rate and port and try again.
3. Click **Read from FC**. This fetches the FC parameter list and all 18 OSD slots, replacing the slots in the editor. The **Source** column shows where each slot's values came from and whether it is disabled.
4. Click **Save JSON** to keep a backup before making changes.

## Editing slots

- **Parameter name:** click the arrow to browse, or type any part of a name to filter. Arrow keys and Enter work in the list.
- **Min, Max, Increment:** the range and step size for the slot. Enabled slots need a positive increment.
- **Enable checkbox** (under each slot number): uncheck to disable a slot without erasing its stored assignment. A disabled slot keeps its name and values visible but greyed out and not editable. Check it again to re-enable editing. Selecting `<BLANK / DISABLED>` or clearing the name also disables a slot.
- **CLEAR ALL:** clears and disables all 18 slots in the editor after confirmation. Nothing changes on the flight controller until you click **Write to FC**.
- Switch between screens with the **Screen 5** and **Screen 6** tabs.

## Writing to the flight controller

Click **Write to FC** with the vehicle disarmed.

- Writing is only possible after a successful **Read from FC**.
- Only slots that differ from the last FC read are written. The tool requests acknowledgements and checks the slot names afterwards.
- Enabled slots are checked before writing: the parameter must exist on the FC and the values must be valid numbers.
- Disabled slots are written only through their `OSD{5,6}_PARAM{1..9}_EN` flag set to 0. Their stored name and values on the FC are left untouched and are not checked.
- If an enabled slot comes back from the FC with an empty name, writing is blocked so a configuration that could not be verified is not overwritten.
- The tool does not set `OSD5_ENABLE` or `OSD6_ENABLE`. Enable the screens separately if needed.
- If a read or write fails, reconnect and read again before trying another write.

## Files and metadata

- **Vehicle / Download metadata:** loads the published Plane, Copter or Rover parameter definitions, used for the parameter list and suggested ranges. This needs network access. Alternatively use **Load metadata XML** with a locally saved `apm.pdef.xml`.
- **Fill missing ranges:** fills only empty Min/Max/Increment fields from the metadata. Metadata ranges are suggestions; check them against your firmware.
- **Save JSON / Load JSON:** save or load both screens as a JSON project, including each slot's enabled state. Loading a JSON file changes the editor but keeps the last FC read for comparison, so you can Read from FC, Load JSON, then Write to FC to apply a saved setup. In older JSON files without an `enabled` field, a slot is treated as enabled if it has a parameter name.
- **Load .param / Export numeric .param:** import or export the enable, min, max and increment values in Mission Planner `.param` format. Parameter names are not included, because they are not stored as numeric parameters.

## Activity log

The activity log at the bottom shows connection status, reads, writes and warnings, color-coded by type. Buttons show what they are doing while an operation runs (for example READING or WRITING).

## MAVLink details

A built-in MAVLink 2 codec supports HEARTBEAT, PARAM_REQUEST_LIST, PARAM_VALUE, PARAM_REQUEST_READ, PARAM_SET, OSD_PARAM_CONFIG / REPLY and OSD_PARAM_SHOW_CONFIG / REPLY. The tool targets the autopilot component of the ArduPilot system found from its heartbeat, and matches slot replies to requests by request ID. No build step or third-party JavaScript libraries are used.

## Notes

- Tested on PC in Chrome and Firefox with an ArduPlane 4.8-dev flight controller.
- The FC parameter list can be large; slow links may time out.
- Always keep a JSON backup and write only while disarmed.
