// script for handling function calls 

// error handling
window.onerror = function (msg, url, linenumber) {
  alert('Sorry, something went wrong.\n\n' +
    'Please try a hard reload of this page to clear its cache.\n\n' +
    'If the error persists open an issue on the GitHub repo.\n' +
    'Include a copy of the log and the following error message:\n\n' +
    msg + '\n' +
    'URL: ' + url + '\n' +
    'Line Number: ' + linenumber)
  return false
}
window.addEventListener('unhandledrejection', function (e) {
  throw new Error(e.reason.stack)
})

// imports
import { mavlink_store } from '../modules/MAVLink/mavlink_store.js';
import { MAVLink, mavlink_ws } from './shared/mavlink.js';
import { add_text_to_debug } from "./shared/ui.js";

// global variable to store wakeup messages
window.wakeup_schedule = [];

// handle function call from assistant
async function handle_function_call(name, args) {
  // call the function
  switch (name) {
    case "get_vehicle_type":
      // get the vehicle type (e.g. Copter, Plane, Rover, Boat, etc)
      return get_vehicle_type();
    case "get_parameter":
      // Get a vehicle parameter's value.  The full list of available parameters and their values is available using the get_all_parameters function
      return await get_parameter(args);
    case "get_wakeup_timers":
      // Retrieves a list of all active wakeup timers. You can optionally provide a message parameter to filter timers by their associated messages. When specifying the message parameter, you can use regular expressions (regex) to match patterns within the timer messages. This is useful when you want to find timers with specific keywords or patterns in their messages. For example, to retrieve all timers containing the word 'hello', you can use the regex '.*hello.*', where the dot-star (.*) pattern matches any character sequence.
      return get_wakeup_timers(args);
    case "get_vehicle_location_and_yaw":
      // Get the vehicle's current location including latitude, longitude, altitude above sea level and altitude above home
      return get_vehicle_location_and_yaw()
    case "send_mavlink_set_position_target_global_int":
      // Send a mavlink SET_POSITION_TARGET_GLOBAL_INT message to the vehicle.  This message is the preferred way to command a vehicle to fly to a specified location or to fly at a specfied velocity
      return send_mavlink_set_position_target_global_int(args);
    case "get_vehicle_state":
      // Get the vehicle state including armed status and (flight) mode
      return get_vehicle_state();
    case "get_location_plus_offset":
      // Calculate the latitude and longitude given an existing latitude and longitude and distances (in meters) North and East
      return get_location_plus_offset(args);
    case "send_mavlink_command_int":
      // Send a mavlink COMMAND_INT message to the vehicle.  Available commands including changing the flight mode, arming, disarming, takeoff and commanding the vehicle to fly to a specific location
      return await send_mavlink_command_int(args);
    case "get_location_plus_dist_at_bearing":
      // Calculate the latitude and longitude given an existing latitude and longitude and a distance in meters and a bearing in degrees
      return get_location_plus_dist_at_bearing(args);
    case "get_parameter_description":
      // Get vehicle parameter descriptions including description, units, min and max
      return await get_parameter_description(args);
    case "delete_wakeup_timers":
      // Delete all active wakeup timers. You can optionally provide a message parameter to filter which timers will be deleted based on their message. When specifying the message parameter, you can use regular expressions (regex) to match patterns within the timer messages. This is useful when you want to delete timers with specific keywords or patterns in their message. For example, to delete all timers containing the word 'hello', you can use the regex '.*hello.*', where the dot-star (.*) pattern matches any character sequence.
      return delete_wakeup_timers(args);
    case "set_parameter":
      // Set a vehicle parameter's value.  The full list of parameters is available using the get_all_parameters function
      return await set_parameter(args);
    case "get_mavlink_message":
      // Get a mavlink message including all fields and values sent by the vehicle.  The list of available messages can be retrieved using the get_available_mavlink_messages
      return get_mavlink_message(args);
    case "get_current_datetime":
      // Get the current date and time, e.g. 'Saturday, June 24, 2023 6:14:14 PM
      add_text_to_debug("get_current_datetime called");
      return getFormattedDate();
    case "get_mode_mapping":
      // Get a list of mode names to mode numbers available for this vehicle.  If the name or number parameter is provided only that mode's name and number will be returned.  If neither name nor number is provided the full list of available modes will be returned
      add_text_to_debug("get_mode_mapping called");
      return get_mode_mapping(args);
    case "get_all_parameters":
      // Get all available parameter names and values
      return await get_all_parameters(args);
    case "set_wakeup_timer":
      // Set a timer to wake you up in a specified number of seconds in the future.  This allows taking actions in the future.  The wakeup message will appear with the user role but will look something like WAKEUP:<message>.  Multiple wakeup messages are supported
      return set_wakeup_timer(args);
    case "get_available_mavlink_messages":
      return mavlink_store.get_available_message_names();
    default:
      add_text_to_debug("Unknown function: " + name);
      return "Unknown function: " + name;
  }
}

// function calls below here
// returns "Copter", "Plane", "Rover", "Boat", etc or "Unknown"
function get_vehicle_type() {
  // get the latest HEARTBEAT message and perform a sanity check
  let heartbeat_msg = mavlink_store.get_latest_message(0);
  if (!heartbeat_msg || !heartbeat_msg.hasOwnProperty("type")) {
    return "unknown because no HEARTBEAT message has been received from the vehicle";
  }
  let vehicle_type = heartbeat_msg["type"];

  // get the vehicle type from the heartbeat message's type field
  switch (vehicle_type) {
    case mavlink20.MAV_TYPE_FIXED_WING:
    case mavlink20.MAV_TYPE_VTOL_DUOROTOR:
    case mavlink20.MAV_TYPE_VTOL_QUADROTOR:
    case mavlink20.MAV_TYPE_VTOL_TILTROTOR:
      return "Plane"
    case mavlink20.MAV_TYPE_GROUND_ROVER:
      return "Rover";
    case mavlink20.MAV_TYPE_SURFACE_BOAT:
      return "Boat";
    case mavlink20.MAV_TYPE_SUBMARINE:
      return "Sub";
    case mavlink20.MAV_TYPE_QUADROTOR:
    case mavlink20.MAV_TYPE_COAXIAL:
    case mavlink20.MAV_TYPE_HEXAROTOR:
    case mavlink20.MAV_TYPE_OCTOROTOR:
    case mavlink20.MAV_TYPE_TRICOPTER:
    case mavlink20.MAV_TYPE_DODECAROTOR:
      return "Copter";
    case mavlink20.MAV_TYPE_HELICOPTER:
      return "Heli";
    case mavlink20.MAV_TYPE_ANTENNA_TRACKER:
      return "Tracker";
    case mavlink20.MAV_TYPE_AIRSHIP:
      return "Blimp";
    default:
      add_text_to_debug("get_vehicle_type: default, unknown");
      return "unknown";
  }

  // if we got this far  we don't know the vehicle type
  add_text_to_debug("get_vehicle_type: no match for type:" + heartbeat_msg.type);
  return "unknown";
}

// return a mapping of mode names to numbers for the current vehicle type
function get_mode_mapping(args) {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (e) {
      add_text_to_debug("get_mode_mapping: ERROR parsing args string");
      args = {};
    }
  }

  args = args || {};

  // get name and/or number arguments
  let mode_name = args.name ?? null;
  if (mode_name != null) {
    mode_name = mode_name.toUpperCase();
  }

  let mode_number = args.number ?? null;
  if (mode_number != null) {
    mode_number = parseInt(mode_number, 10);
  }

  // prepare list of modes
  let mode_list = [];
  let mode_mapping = {};

  const vehicle_type = get_vehicle_type();
  switch (vehicle_type) {
    case "Heli":
    case "Blimp":
    case "Copter":
      mode_mapping = {
        "STABILIZE": mavlink20.COPTER_MODE_STABILIZE,
        "ACRO": mavlink20.COPTER_MODE_ACRO,
        "ALT_HOLD": mavlink20.COPTER_MODE_ALT_HOLD,
        "AUTO": mavlink20.COPTER_MODE_AUTO,
        "GUIDED": mavlink20.COPTER_MODE_GUIDED,
        "LOITER": mavlink20.COPTER_MODE_LOITER,
        "RTL": mavlink20.COPTER_MODE_RTL,
        "CIRCLE": mavlink20.COPTER_MODE_CIRCLE,
        "LAND": mavlink20.COPTER_MODE_LAND,
        "DRIFT": mavlink20.COPTER_MODE_DRIFT,
        "SPORT": mavlink20.COPTER_MODE_SPORT,
        "FLIP": mavlink20.COPTER_MODE_FLIP,
        "AUTOTUNE": mavlink20.COPTER_MODE_AUTOTUNE,
        "POSHOLD": mavlink20.COPTER_MODE_POSHOLD,
        "BRAKE": mavlink20.COPTER_MODE_BRAKE,
        "THROW": mavlink20.COPTER_MODE_THROW,
        "AVOID_ADSB": mavlink20.COPTER_MODE_AVOID_ADSB,
        "GUIDED_NOGPS": mavlink20.COPTER_MODE_GUIDED_NOGPS,
        "SMART_RTL": mavlink20.COPTER_MODE_SMART_RTL,
        "FLOWHOLD": mavlink20.COPTER_MODE_FLOWHOLD,
        "FOLLOW": mavlink20.COPTER_MODE_FOLLOW,
        "ZIGZAG": mavlink20.COPTER_MODE_ZIGZAG,
        "SYSTEMID": mavlink20.COPTER_MODE_SYSTEMID,
        "AUTOROTATE": mavlink20.COPTER_MODE_AUTOROTATE,
        "AUTO_RTL": mavlink20.COPTER_MODE_AUTO_RTL
      };
      break;
    case "Plane":
      mode_mapping = {
        "MANUAL": mavlink20.PLANE_MODE_MANUAL,
        "CIRCLE": mavlink20.PLANE_MODE_CIRCLE,
        "STABILIZE": mavlink20.PLANE_MODE_STABILIZE,
        "TRAINING": mavlink20.PLANE_MODE_TRAINING,
        "ACRO": mavlink20.PLANE_MODE_ACRO,
        "FLY_BY_WIRE_A": mavlink20.PLANE_MODE_FLY_BY_WIRE_A,
        "FLY_BY_WIRE_B": mavlink20.PLANE_MODE_FLY_BY_WIRE_B,
        "CRUISE": mavlink20.PLANE_MODE_CRUISE,
        "AUTOTUNE": mavlink20.PLANE_MODE_AUTOTUNE,
        "AUTO": mavlink20.PLANE_MODE_AUTO,
        "RTL": mavlink20.PLANE_MODE_RTL,
        "LOITER": mavlink20.PLANE_MODE_LOITER,
        "TAKEOFF": mavlink20.PLANE_MODE_TAKEOFF,
        "AVOID_ADSB": mavlink20.PLANE_MODE_AVOID_ADSB,
        "GUIDED": mavlink20.PLANE_MODE_GUIDED,
        "INITIALIZING": mavlink20.PLANE_MODE_INITIALIZING,
        "QSTABILIZE": mavlink20.PLANE_MODE_QSTABILIZE,
        "QHOVER": mavlink20.PLANE_MODE_QHOVER,
        "QLOITER": mavlink20.PLANE_MODE_QLOITER,
        "QLAND": mavlink20.PLANE_MODE_QLAND,
        "QRTL": mavlink20.PLANE_MODE_QRTL,
        "QAUTOTUNE": mavlink20.PLANE_MODE_QAUTOTUNE,
        "QACRO": mavlink20.PLANE_MODE_QACRO,
        "THERMAL": mavlink20.PLANE_MODE_THERMAL
      };
      break;
    case "Boat":
    case "Rover":
      mode_mapping = {
        "MANUAL": mavlink20.ROVER_MODE_MANUAL,
        "ACRO": mavlink20.ROVER_MODE_ACRO,
        "STEERING": mavlink20.ROVER_MODE_STEERING,
        "HOLD": mavlink20.ROVER_MODE_HOLD,
        "LOITER": mavlink20.ROVER_MODE_LOITER,
        "FOLLOW": mavlink20.ROVER_MODE_FOLLOW,
        "SIMPLE": mavlink20.ROVER_MODE_SIMPLE,
        "AUTO": mavlink20.ROVER_MODE_AUTO,
        "RTL": mavlink20.ROVER_MODE_RTL,
        "SMART_RTL": mavlink20.ROVER_MODE_SMART_RTL,
        "GUIDED": mavlink20.ROVER_MODE_GUIDED,
        "INITIALIZING": mavlink20.ROVER_MODE_INITIALIZING
      };
      break;
    case "Sub":
      mode_mapping = {
        "STABILIZE": mavlink20.SUB_MODE_STABILIZE,
        "ACRO": mavlink20.SUB_MODE_ACRO,
        "ALT_HOLD": mavlink20.SUB_MODE_ALT_HOLD,
        "AUTO": mavlink20.SUB_MODE_AUTO,
        "GUIDED": mavlink20.SUB_MODE_GUIDED,
        "CIRCLE": mavlink20.SUB_MODE_CIRCLE,
        "SURFACE": mavlink20.SUB_MODE_SURFACE,
        "POSHOLD": mavlink20.SUB_MODE_POSHOLD,
        "MANUAL": mavlink20.SUB_MODE_MANUAL
      };
      break;
    case "Tracker":
      mode_mapping = {
        "MANUAL": mavlink20.TRACKER_MODE_MANUAL,
        "STOP": mavlink20.TRACKER_MODE_STOP,
        "SCAN": mavlink20.TRACKER_MODE_SCAN,
        "SERVO_TEST": mavlink20.TRACKER_MODE_SERVO_TEST,
        "AUTO": mavlink20.TRACKER_MODE_AUTO,
        "INITIALIZING": mavlink20.TRACKER_MODE_INITIALIZING
      };
      break;
    default:
      // maybe we don't know the vehicle type
      add_text_to_debug("get_mode_mapping: unknown vehicle type: " + vehicle_type);
      return `get_mode_mapping: failed to retrieve mode mapping: unknown vehicle type: ${vehicle_type}`;
  }

  // handle request for all modes
  if (mode_name === null && mode_number === null) {
    for (let mname in mode_mapping) {
      let mnumber = mode_mapping[mname];
      mode_list.push({ "name": mname.toUpperCase(), "number": mnumber });
    }
  }
  // handle request using mode name
  else if (mode_name !== null) {
    for (let mname in mode_mapping) {
      if (mname.toUpperCase() === mode_name) {
        mode_list.push({ "name": mname.toUpperCase(), "number": mode_mapping[mname] });
      }
    }
  }
  // handle request using mode number
  else if (mode_number !== null) {
    for (let mname in mode_mapping) {
      let mnumber = mode_mapping[mname];
      if (mnumber === mode_number) {
        mode_list.push({ "name": mname.toUpperCase(), "number": mnumber });
      }
    }
  }

  // return list of modes
  return mode_list;
}

function get_mavlink_message(args) {
  // Check if it's a string and parse it
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (e) {
      return { status: "error", message: "Invalid JSON in arguments" };
    }
  }

  // check if name is provided
  if (!args || !args.hasOwnProperty("message")) {
    add_text_to_debug("get_mavlink_message: message is null");
    return "get_mavlink_message: message is Null";
  }

  const msg = mavlink_store.find_message_by_name(args.message);
  if (!msg) {
    return "get_mavlink_message: message not found";
  }
  return msg;
}

function get_parameter(args) {
  try {
    return new Promise((resolve, reject) => {
      // Check WebSocket ready
      if (!MAVLink || !mavlink_ws || mavlink_ws.readyState !== WebSocket.OPEN) {
        reject("MAVLink or WebSocket not ready");
        return;
      }

      // Parse input
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch (e) {
          add_text_to_debug("get_parameter: ERROR parsing args string");
          reject("Invalid arguments: JSON parse error");
          return;
        }
      }

      if (!args || !args.name) {
        reject("get_parameter: name not specified");
        return;
      }

      const param_name = args.name.trim();

      // Register resolver
      const resolver = (value) => {
        clearTimeout(timeoutId);
        delete window.pending_param_requests[param_name];
        resolve(value);
      };

      // Register in global pending requests
      window.pending_param_requests[param_name] = resolver;

      // Send PARAM_REQUEST_READ
      try {
        const message = new mavlink20.messages.param_request_read(
          1,   // target_system
          1,   // target_component
          param_name, // param_id
          -1   // use param_id
        );

        const pkt = message.pack(MAVLink);
        mavlink_ws.send(Uint8Array.from(pkt));

        add_text_to_debug(`Sent PARAM_REQUEST_READ for ${param_name}`);
      } catch (error) {
        delete window.pending_param_requests[param_name];
        reject("Error sending PARAM_REQUEST_READ: " + error);
        return;
      }

      // timeout: 5 seconds
      const timeoutId = setTimeout(() => {
        if (window.pending_param_requests[param_name]) {
          delete window.pending_param_requests[param_name];
          add_text_to_debug(`Timeout waiting for PARAM_VALUE for ${param_name}`);
          reject(`No PARAM_VALUE received for "${param_name}" within 10 seconds. The parameter may not exist on this vehicle.`);
        }
      }, 5000);
    });
  } catch (error) {
    add_text_to_debug("get_parameter: Error: " + error);
    return Promise.reject("get_parameter: Error retrieving parameter");
  }
}

// returns true if string contains regex characters
function contains_regex(string) {
  const regex_characters = ".^$*+?{}[]\\|()";
  for (const char of regex_characters) {
    if (string.includes(char)) {
      return true;
    }
  }
  return false;
}

function get_all_parameters() {
  return new Promise((resolve, reject) => {
    if (!MAVLink || !mavlink_ws || mavlink_ws.readyState !== WebSocket.OPEN) {
      reject("MAVLink or WebSocket not ready");
      return;
    }

    if (window.pending_all_params_request) {
      reject("Another get_all_parameters request is already in progress");
      return;
    }

    // Set up the pending request
    window.pending_all_params_request = {
      params: {},
      resolve: resolve
    };

    try {
      const message = new mavlink20.messages.param_request_list(
        1, // target_system
        1  // target_component
      );

      const pkt = message.pack(MAVLink);
      mavlink_ws.send(Uint8Array.from(pkt));

      add_text_to_debug("Sent PARAM_REQUEST_LIST to vehicle");
    } catch (error) {
      window.pending_all_params_request = null;
      reject("Error sending PARAM_REQUEST_LIST: " + error);
      return;
    }

    // timeout: 15 seconds
    setTimeout(() => {
      if (window.pending_all_params_request) {
        window.pending_all_params_request = null;
        reject("Timeout waiting for all parameters");
      }
    }, 15000);
  });
}

// Global cache for parameter metadata
const parameter_metadata_cache = {};

const parameter_url_map = {
  Tracker: "https://autotest.ardupilot.org/Parameters/AntennaTracker/apm.pdef.json",
  Copter: "https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.json",
  Plane: "https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.json",
  Rover: "https://autotest.ardupilot.org/Parameters/Rover/apm.pdef.json",
  Sub: "https://autotest.ardupilot.org/Parameters/ArduSub/apm.pdef.json"
};

async function load_parameter_metadata(vehicle_type) {
  if (parameter_metadata_cache[vehicle_type]) {
    add_text_to_debug(`Using cached parameter metadata for ${vehicle_type}`);
    return parameter_metadata_cache[vehicle_type];
  }

  const url = parameter_url_map[vehicle_type];
  if (!url) {
    add_text_to_debug(`No parameter definition URL found for vehicle type: ${vehicle_type}`);
    return null;
  }

  try {
    add_text_to_debug(`Fetching parameter metadata for ${vehicle_type} from ${url}`);
    const res = await fetch(url);
    if (!res.ok) {
      add_text_to_debug(`Failed to fetch parameter metadata for ${vehicle_type}: ${res.status}`);
      return null;
    }
    add_text_to_debug(`Successfully fetched parameter metadata for ${vehicle_type}`);

    const data = await res.json();
    parameter_metadata_cache[vehicle_type] = data;
    return data;

  } catch (error) {
    add_text_to_debug(`Error fetching parameter metadata for ${vehicle_type}:`, error);
    return null;
  }
}

function find_param_in_tree(tree, vehicle_type, param_upper) {
  for (const [key, val] of Object.entries(tree)) {
    if (typeof val === "object") {
      if (key.toUpperCase() === param_upper) {
        return { key, meta: val };
      }
      if (`${vehicle_type}:${param_upper}` === key.toUpperCase()) {
        return { key, meta: val };
      }
      const result = find_param_in_tree(val, vehicle_type, param_upper);
      if (result) return result;
    }
  }
  return null;
}

function get_single_parameter_description(param_tree, vehicle_type, param_name) {
  const param_upper = param_name.toUpperCase();

  const result = find_param_in_tree(param_tree, vehicle_type, param_upper);

  if (!result) return null;

  return result;
}


async function get_parameter_description(args) {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return "get_parameter_description: invalid JSON";
    }
  }

  if (!args || !args.name) {
    return "get_parameter_description: name not specified";
  }

  const param_name = args.name;
  const vehicle_type = get_vehicle_type();
  const param_tree = await load_parameter_metadata(vehicle_type);
  if (!param_tree) {
    return `get_parameter_description: No metadata for vehicle type: ${vehicle_type}`;
  }

  const results = {};

  if (contains_regex(param_name)) {
    const pattern = new RegExp(param_name.replace(/\*/g, ".*"), "i");

    for (const [key, val] of Object.entries(param_tree)) {
      if (pattern.test(key)) {
        const single = get_single_parameter_description(param_tree, vehicle_type, key);
        if (single) results[key] = single;
      } else if (typeof val === "object") {
        for (const [subkey] of Object.entries(val)) {
          if (pattern.test(subkey)) {
            const single = get_single_parameter_description(param_tree, vehicle_type, subkey);
            if (single) results[subkey] = single;
          }
        }
      }
    }

    if (Object.keys(results).length === 0) {
      return `get_parameter_description: No parameters matched pattern: ${param_name}`;
    }
    return results;
  }

  // Exact
  const single = get_single_parameter_description(param_tree, vehicle_type, param_name);
  if (!single) {
    return `get_parameter_description: ${param_name} parameter description not found`;
  }

  results[param_name] = single;
  return results;
}

// send a PARAM_SET message to change a vehicle parameter
function set_parameter(args) {
  if (!MAVLink || !mavlink_ws) {
    return "set_parameter: MAVLink or WebSocket not ready";
  }

  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (e) {
      add_text_to_debug("ERROR set_parameter: Could not parse args JSON");
      return "Invalid arguments: JSON parse error";
    }
  }

  if (!args || !args.hasOwnProperty("name") || args.value === undefined) {
    return "set_parameter: name and value required";
  }

  const name = args.name ? args.name.trim() : null;
  if (!name) {
    return "set_parameter: name cannot be empty";
  }

  const value = parseFloat(args.value);
  const message = new mavlink20.messages.param_set(
    1, // target system
    1, // target component
    name,
    value,
    mavlink20.MAV_PARAM_TYPE_REAL32
  );

  if (mavlink_ws.readyState === WebSocket.OPEN) {
    try {
      const pkt = message.pack(MAVLink);
      mavlink_ws.send(Uint8Array.from(pkt));
      return "set_parameter: sent";
    } catch (error) {
      add_text_to_debug("Error sending PARAM_SET: " + error);
      return "set_parameter: send failed";
    }
  }
  return "set_parameter: WebSocket not open";
}

function send_mavlink_set_position_target_global_int(args) {
  if (!MAVLink || !mavlink_ws) {
    add_text_to_debug("MAVLink or WebSocket not ready");
    return { success: false, error: "MAVLink not initialized" };
  }

  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (e) {
      add_text_to_debug("ERROR: Could not parse args JSON");
      return "Invalid arguments: JSON parse error";
    }
  }

  try {
    const time_boot_ms = args.time_boot_ms ?? 0;
    const target_system = args.target_system ?? 1;

    const target_component = args.target_component ?? 1;
    const coordinate_frame = args.coordinate_frame ?? 5;
    const type_mask = args.type_mask ?? 0; // ignore all position, velocity and acceleration except for the ones we set

    const lat_int = args.latitude !== undefined ? Math.round(args.latitude * 1e7) : 0;
    const lon_int = args.longitude !== undefined ? Math.round(args.longitude * 1e7) : 0;
    const alt = args.alt !== undefined ? args.alt : 0;  // in meters

    // Velocity
    const vx = args.vx ?? 0;
    const vy = args.vy ?? 0;
    const vz = args.vz ?? 0;

    // Acceleration (ignored if not needed)
    const afx = args.afx ?? 0;
    const afy = args.afy ?? 0;
    const afz = args.afz ?? 0;

    // Yaw and yaw_rate
    const yaw = args.yaw ?? 0;
    const yaw_rate = args.yaw_rate ?? 0;


    // sanity check arguments
    if (type_mask === 3576) {
      // if position is specified check lat, lon, alt are provided
      if (!args.hasOwnProperty("latitude")) {
        return "send_mavlink_set_position_target_global_int: latitude field required";
      }
      if (!args.hasOwnProperty("longitude")) {
        return "send_mavlink_set_position_target_global_int: longitude field required";
      }
      if (!args.hasOwnProperty("alt")) {
        return "send_mavlink_set_position_target_global_int: alt field required";
      }
    }

    const message = new mavlink20.messages.set_position_target_global_int(
      time_boot_ms, target_system, target_component,
      coordinate_frame, type_mask,
      lat_int, lon_int, alt,
      vx, vy, vz, afx, afy, afz,
      yaw, yaw_rate
    );

    if (mavlink_ws && mavlink_ws.readyState === WebSocket.OPEN) {
      try {
        const pkt = message.pack(MAVLink);
        mavlink_ws.send(Uint8Array.from(pkt));

      } catch (error) {
        add_text_to_debug("Error sending COMMAND_INT: " + error);
        return "command_int not sent.  Error sending COMMAND_INT: " + error;
      }
    } else {
      add_text_to_debug("WebSocket not open. Cannot send COMMAND_INT.");
    }
  } catch (error) {
    add_text_to_debug("Error sending SET_POSITION_TARGET_GLOBAL_INT: " + error);
  }

  return "set_position_target_global_int sent";
}

// send a mavlink COMMAND_INT message to the vehicle
function send_mavlink_command_int(args) {
  return new Promise((resolve, reject) => {
    // ensure pending map
    if (!window.pending_command_requests) {
      window.pending_command_requests = {};
    }

    if (!MAVLink || !mavlink_ws || mavlink_ws.readyState !== WebSocket.OPEN) {
      add_text_to_debug("MAVLink or WebSocket not ready");
      return reject({ success: false, error: "MAVLink not initialized or WS not open" });
    }

    // parse JSON if needed
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch (e) {
        add_text_to_debug("send_mavlink_command_int: ERROR parsing args string");
        return reject({ success: false, error: "Invalid arguments: JSON parse error" });
      }
    }
    args = args || {};

    if (!args.hasOwnProperty("command")) {
      add_text_to_debug("send_mavlink_command_int: missing command");
      return reject({ success: false, error: "command field required" });
    }

    const command = args.command;
    const frame = args.frame || 0; // kept for compatibility
    const target_system = 1;
    const target_component = 1;
    const confirmation = 1;
    const param1 = args.hasOwnProperty("param1") ? args.param1 : 0;
    const param2 = args.hasOwnProperty("param2") ? args.param2 : 0;
    const param3 = args.hasOwnProperty("param3") ? args.param3 : 0;
    const param4 = args.hasOwnProperty("param4") ? args.param4 : 0;
    const x = args.hasOwnProperty("x") ? args.x : 0;
    const y = args.hasOwnProperty("y") ? args.y : 0;
    const z = args.hasOwnProperty("z") ? args.z : 0;

    // example sanity check
    if (command === mavlink20.MAV_CMD_NAV_TAKEOFF && z === 0) {
      return reject({ success: false, error: "MAV_CMD_NAV_TAKEOFF requires altitude in z field" });
    }

    let timeoutId;

    try {
      // Build COMMAND_LONG message
      const message = new mavlink20.messages.command_long(
        target_system, target_component,
        command, confirmation,
        param1, param2, param3, param4,
        x, y, z
      );

      const pkt = message.pack(MAVLink);
      mavlink_ws.send(Uint8Array.from(pkt));
      add_text_to_debug(`Sent COMMAND_INT ${command}, awaiting ACK`);
    } catch (error) {
      return reject({ success: false, error: "Error sending COMMAND_INT: " + error });
    }

    // register resolver with cleanup
    window.pending_command_requests[command] = (ackMsg) => {
      if (timeoutId) clearTimeout(timeoutId);
      delete window.pending_command_requests[command];
      add_text_to_debug(`Resolving COMMAND_INT ${command} → result ${ackMsg.result}`);
      resolve({ success: true, ack: ackMsg });
    };

    // set a timeout to reject if no ACK arrives
    timeoutId = setTimeout(() => {
      if (window.pending_command_requests[command]) {
        delete window.pending_command_requests[command];
        add_text_to_debug(`Timeout waiting for COMMAND_ACK ${command}`);
        reject({ success: false, error: "COMMAND_ACK timeout" });
      }
    }, 5000);
  });
}


// get the current time and date as a string. E.g. 'Saturday, June 24, 2023 6:14:14 PM'
function getFormattedDate() {
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: true
  };
  return new Date().toLocaleString('en-US', options);
}

// set a wakeup timer
function set_wakeup_timer(args) {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (e) {
      add_text_to_debug("ERROR set_wakeup_timer: Could not parse args JSON");
      return "Invalid arguments: JSON parse error";
    }
  }

  // check required arguments are specified
  const seconds = args.seconds ?? -1;
  if (seconds < 0) {
    return "set_wakeup_timer: seconds not specified";
  }
  const message = args.message ?? null;
  if (message === null) {
    return "set_wakeup_timer: message not specified";
  }

  // add timer to wakeup schedule
  const triggerTime = Date.now() + seconds * 1000; // seconds → milliseconds → match Date.now()
  add_text_to_debug("set_wakeup_timer: triggerTime: " + new Date(triggerTime).toLocaleString());
  window.wakeup_schedule.push({ time: triggerTime, message: message });
  return "set_wakeup_timer: wakeup timer set";
}

// get wake timers
function get_wakeup_timers(args) {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (e) {
      add_text_to_debug("ERROR set_wakeup_timer: Could not parse args JSON");
      return "Invalid arguments: JSON parse error";
    }
  }

  try {

    // check message argument, default to null meaning all
    const message = args.message ?? null;
    // prepare list of matching timers
    let matching_timers = [];

    // handle simple case of all timers
    if (message === null) {
      matching_timers = window.wakeup_schedule;
      add_text_to_debug("get_wakeup_timers: returning all timers");
    }

    // handle regex in message
    else if (contains_regex(message)) {
      const pattern = new RegExp(message, "i"); // ignore case
      for (const wakeup_timer of window.wakeup_schedule) {
        if (pattern.test(wakeup_timer.message)) {
          matching_timers.push(wakeup_timer);
        }
      }
      add_text_to_debug("get_wakeup_timers: returning timers matching regex: " + message);
    }

    // handle case of a specific message
    else {
      for (const wakeup_timer of window.wakeup_schedule) {
        if (wakeup_timer.message === message) {
          matching_timers.push(wakeup_timer);
        }
      }
      add_text_to_debug("get_wakeup_timers: returning timers matching message: " + message);
    }

    // return matching timers
    return matching_timers;

  } catch (e) {
    add_text_to_debug("ERROR get_wakeup_timers: " + e);
    return "Invalid arguments: JSON parse error";
  }
}

// delete wake timers
function delete_wakeup_timers(args) {
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (e) {
      add_text_to_debug("ERROR set_wakeup_timer: Could not parse args JSON");
      return "Invalid arguments: JSON parse error";
    }
  }

  // check message argument, default to all
  const message = args.message ?? null;

  // find matching timers
  let numDeleted = 0;

  // handle simple case of deleting all timers
  if (message === null) {
    numDeleted = window.wakeup_schedule.length;
    window.wakeup_schedule.length = 0;
    add_text_to_debug("delete_wakeup_timers: deleted all timers");
  }
  // handle regex in message
  else if (contains_regex(message)) {
    const pattern = new RegExp(message, "i");
    for (let i = window.wakeup_schedule.length - 1; i >= 0; i--) {
      if (pattern.test(window.wakeup_schedule[i].message)) {
        window.wakeup_schedule.splice(i, 1);
        numDeleted++;
      }
    }
    add_text_to_debug("delete_wakeup_timers: deleted timers matching regex: " + message);
  }
  // handle simple case of a single message
  else {
    for (let i = window.wakeup_schedule.length - 1; i >= 0; i--) {
      if (window.wakeup_schedule[i].message === message) {
        window.wakeup_schedule.splice(i, 1);
        numDeleted++;
      }
    }
    add_text_to_debug("delete_wakeup_timers: deleted timers matching message: " + message);
  }

  // return number deleted and remaining
  return `delete_wakeup_timers: deleted ${numDeleted} timers, ${window.wakeup_schedule.length} remaining`;
}

//get the vehicle's location and yaw
function get_vehicle_location_and_yaw() {
  // get GLOBAL_POSITION_INT
  const gpi = mavlink_store.get_latest_message(33);

  let lat_deg = 0
  let lon_deg = 0
  let alt_amsl_m = 0
  let alt_rel_m = 0
  let yaw_deg = 0

  if (gpi) {
    lat_deg = gpi.lat * 1e-7
    lon_deg = gpi.lon * 1e-7
    alt_amsl_m = gpi.alt * 1e-3
    alt_rel_m = gpi.relative_alt * 1e-3
    yaw_deg = gpi.hdg * 1e-2
  }

  const location = {
    "latitude": lat_deg,
    "longitude": lon_deg,
    "altitude_amsl": alt_amsl_m,
    "altitude_above_home": alt_rel_m,
    "yaw": yaw_deg
  }

  return location;
}

//get vehicle state
function get_vehicle_state() {
  //get latest HEARTBEAT message
  const heartbeat_msg = mavlink_store.get_latest_message(0);
  //sanity check
  if (!heartbeat_msg || !heartbeat_msg.hasOwnProperty("base_mode") || !heartbeat_msg.hasOwnProperty("custom_mode")) {
    return "unknown because no HEARTBEAT message has been received from the vehicle";
  }
  //get the armed state flag by applying mask to base_model property
  const armed_flag = (heartbeat_msg["base_mode"] & mavlink20.MAV_MODE_FLAG_SAFETY_ARMED) > 0;
  //get mode number from custom_mode property
  const mode_number = heartbeat_msg["custom_mode"];

  return {
    "armed": armed_flag,
    "mode": mode_number
  }
}

// Calculate the latitude and longitude given distances (in meters) North and East
function get_location_plus_offset(args) {
  // check if args is a string, if so, parse it
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (e) {
      add_text_to_debug("ERROR: Could not parse args JSON");
      return "Invalid arguments: JSON parse error";
    }
  }

  const lat = args.latitude ?? 0;
  const lon = args.longitude ?? 0;
  const dist_north = args.distance_north ?? 0;
  const dist_east = args.distance_east ?? 0;
  const { latitude: lat_with_offset, longitude: lon_with_offset } =
    get_latitude_longitude_given_offset(lat, lon, dist_north, dist_east);

  return {
    latitude: lat_with_offset,
    longitude: lon_with_offset
  };
}

// Calculate the latitude and longitude given a distance (in meters) and bearing (in degrees)
function get_location_plus_dist_at_bearing(args) {
  // If args is a string, parse it
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch (e) {
      add_text_to_debug("get_location_plus_dist_at_bearing: ERROR parsing args string");
      return { latitude: 0, longitude: 0 };
    }
  }

  const lat = args.latitude ?? 0;
  const lon = args.longitude ?? 0;
  const distance = args.distance ?? 0;
  const bearing_deg = args.bearing ?? 0;

  const dist_north = Math.cos(bearing_deg * Math.PI / 180) * distance;
  const dist_east = Math.sin(bearing_deg * Math.PI / 180) * distance;

  const { latitude: lat_with_offset, longitude: lon_with_offset } =
    get_latitude_longitude_given_offset(lat, lon, dist_north, dist_east);

  return {
    latitude: lat_with_offset,
    longitude: lon_with_offset
  };


}

// wrap latitude to range -90 to 90
function wrap_latitude(latitude_deg) {
  if (latitude_deg > 90) {
    return 180 - latitude_deg;
  }
  if (latitude_deg < -90) {
    return -(180 + latitude_deg);
  }
  return latitude_deg;
}
// wrap longitude to range -180 to 180
function wrap_longitude(longitude_deg) {
  if (longitude_deg > 180) {
    return longitude_deg - 360;
  }
  if (longitude_deg < -180) {
    return longitude_deg + 360;
  }
  return longitude_deg;
}

// calculate latitude and longitude given distances (in meters) North and East
// returns latitude and longitude in degrees
function get_latitude_longitude_given_offset(latitude, longitude, dist_north, dist_east) {
  const lat_lon_to_meters_scaling = 89.8320495336892 * 1e-7;
  const lat_diff = dist_north * lat_lon_to_meters_scaling;
  const lon_diff = dist_east * lat_lon_to_meters_scaling / Math.max(0.01, Math.cos((latitude + lat_diff) * Math.PI / 180 / 2));
  return {
    latitude: wrap_latitude(latitude + lat_diff),
    longitude: wrap_longitude(longitude + lon_diff)
  };
}

// make it visible to other modules
window.handle_function_call = handle_function_call;
