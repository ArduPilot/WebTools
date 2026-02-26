// remote source for instructions, tools, and knowledge files
const GITHUB_BASE = "https://raw.githubusercontent.com/ArduPilot/MAVProxy/master/MAVProxy/modules/mavproxy_chat/assistant_setup/";

// list of JSON function definition files
window.JSON_FUNCTION_FILES = [
  "delete_wakeup_timers.json",
  "get_all_parameters.json",
  "get_available_mavlink_messages.json",
  "get_current_datetime.json",
  "get_location_plus_dist_at_bearing.json",
  "get_location_plus_offset.json",
  "get_mavlink_message.json",
  "get_mode_mapping.json",
  "get_parameter.json",
  "get_parameter_description.json",
  "get_vehicle_location_and_yaw.json",
  "get_vehicle_state.json",
  "get_vehicle_type.json",
  "get_wakeup_timers.json",
  "send_mavlink_command_int.json",
  "send_mavlink_set_position_target_global_int.json",
  "set_parameter.json",
  "set_wakeup_timer.json"
];

const KNOWLEDGE_TEXT_FILES = [
  "copter_flightmodes.txt",
  "plane_flightmodes.txt",
  "rover_modes.txt",
  "sub_modes.txt"
];

export async function loadTextFile(fileName) {
  try {
    const url = `${GITHUB_BASE}${fileName}`;
    const res = await fetch(url);
    if (!res.ok) {
      add_text_to_debug(`Failed to fetch text file ${fileName}: ${res.status}`);
      return "";
    }
    return await res.text();
  } catch (err) {
    add_text_to_debug(`Error fetching text file ${fileName}: ${err}`);
    return "";
  }
}

export async function loadJSONFile(fileName) {
  try {
    const url = `${GITHUB_BASE}${fileName}`;
    const res = await fetch(url);
    if (!res.ok) {
      add_text_to_debug(`Failed to fetch JSON file ${fileName}: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    add_text_to_debug(`Error fetching JSON file ${fileName}: ${err}`);
    return null;
  }
}


export async function loadInstructions() {
  const base = await loadTextFile("assistant_instructions.txt");
  if (!base) return "";
  let knowledgeConcat = "";
  for (const file of KNOWLEDGE_TEXT_FILES) {
    const content = await loadTextFile(file);
    if (content) {
      knowledgeConcat += `\n\n# ${file}\n${content}`;
    }
  }
  return base + knowledgeConcat;
}