// MAVLink connection and message handling logic

// imports
import { mavlink_store } from '../modules/MAVLink/mavlink_store.js';
import { setMAVLink, setMavlinkWS } from './shared/mavlink.js';
import { add_text_to_debug } from "./shared/ui.js";

window.pending_param_requests = {}
window.pending_all_params_request = null;
window.pending_command_requests = {};

// MAVLink connection related functions
let connect_button = document.getElementById("mavlink-connect-button");
let is_connected = false; // connection state
let mavlink_ws = null; // websocket object
let mavlink_sysid = 254; // system id
let mavlink_compid = MAVLink20Processor.MAV_COMP_ID_MISSIONPLANNER; // component id
let MAVLink = new MAVLink20Processor(null, mavlink_sysid, mavlink_compid);

// set the MAVLink processor 
setMAVLink(MAVLink);

// toggle connection state (called by Connect/Disconnect button)
function mavlink_toggle_connect() {
  if (is_connected) {
    mavlink_disconnect();
  } else {
    mavlink_connect();
  }
}

// attach event listener to the connect button
connect_button.addEventListener("click", mavlink_toggle_connect);

// set the mavlink button connection state
function mavlink_set_connect_state(connected) {
  is_connected = connected;
  if (connected) {
    connect_button.innerText = "Disconnect";
  } else {
    connect_button.innerText = "Connect Drone";
  }
}

// connect to the vehicle
function mavlink_connect() {
  // check connection URL
  let connect_url = document.getElementById("mavlink-connect-url").value;
  if (!connect_url) {
    alert("Error: WebSocket URL is empty");
    return;
  }

  if (mavlink_ws == null) {
    // create a new websocket connection
    mavlink_ws = new WebSocket(connect_url);
    mavlink_ws.binaryType = "arraybuffer"

    // set up event handlers
    mavlink_ws.onopen = function () {
      mavlink_set_connect_state(true);
    };
    mavlink_ws.onclose = function () {
      mavlink_set_connect_state(false);
    };
    mavlink_ws.onerror = function () {
      mavlink_disconnect();
    };

    // parse incoming message and forward
    mavlink_ws.onmessage = (msg) => {
      // sanity check parser has been created
      if (MAVLink == null) {
        return;
      }
      // parse message
      for (const char of new Uint8Array(msg.data)) {
        const mavlink_msg = MAVLink.parseChar(char)
        if ((mavlink_msg != null) && (mavlink_msg._id != -1)) {
          // got a message with a known ID
          mavlink_msg_handler(mavlink_msg);
        }
      }
    }
  }
  // set the mavlink websocket connection
  setMavlinkWS(mavlink_ws);
}

// disconnect from the vehicle
function mavlink_disconnect() {
  if (mavlink_ws != null) {
    mavlink_ws.close();
    mavlink_ws = null;
  }
}

// mavlink message handler
function mavlink_msg_handler(msg) {

  // sanity check msg
  if (msg == null || msg._id == null) {
    return;
  }

  // store the message in the message store
  mavlink_store.store_message(msg);

  switch (msg._id) {
    case 0: // HEARTBEAT
      //alert("custom mode:" + msg.custom_mode);
      //alert("Got a heartbeat: " + JSON.stringify(msg));
      break;
    case 1: // SYS_STATUS
      //alert("Got a system status: " + JSON.stringify(msg));
      break;
    case 22: // PARAM_VALUE
      const param_id = msg.param_id.replace(/\u0000/g, '').trim();
      const param_value = msg.param_value;
      const param_index = msg.param_index;
      const param_count = msg.param_count;

      add_text_to_debug(`PARAM_VALUE received: ${param_id} = ${param_value}`);

      // Handle single parameter pending requests
      if (window.pending_param_requests[param_id]) {
        window.pending_param_requests[param_id]({ [param_id]: param_value });
        delete window.pending_param_requests[param_id];
      }

      // All parameters request resolver
      if (window.pending_all_params_request) {
        window.pending_all_params_request.params[param_id] = param_value;
        if (param_index === param_count - 1) {
          // This was the last parameter
          window.pending_all_params_request.resolve(window.pending_all_params_request.params);
          window.pending_all_params_request = null;
        }
      }
      break;
    case 24: // GPS_RAW_INT
      //alert("Got a GPS raw int: " + JSON.stringify(msg));
      break;
    case 30: // ATTITUDE
      //alert("Got an attitude: " + JSON.stringify(msg));
      break;
    case 33: // GLOBAL_POSITION_INT
      //alert("Got a global position int: " + JSON.stringify(msg));
      break;
    case 35: // HIGHRES_IMU
      //alert("Got a high resolution IMU: " + JSON.stringify(msg));
      break;
    case 42: // NAMED_VALUE_FLOAT
      //alert("Got a named value float: " + JSON.stringify(msg));
      break;
    case 74: // VFR_HUD
      //alert("Got a VFR HUD: " + JSON.stringify(msg));
      break;
    case 77: // mavlink20.MAVLINK_MSG_ID_COMMAND_ACK
      const cmd = msg.command;
      const result = msg.result;

      add_text_to_debug(`COMMAND_ACK received: cmd=${cmd} result=${result}`);

      // If someone is waiting for this command’s ACK, resolve their promise
      if (window.pending_command_requests[cmd]) {
        // resolve with the entire msg, or you could resolve only result
        window.pending_command_requests[cmd](msg);
        delete window.pending_command_requests[cmd];
      }
      break;
    case 253: // STATUSTEXT
      //alert("Got a status text: " + JSON.stringify(msg));
      break;
    default:
      //alert("Got a message id: " + JSON.stringify(msg));
      break;
  }
}

