// Handles chat mode selection and initialization.

import { add_text_to_chat, add_text_to_debug, setChatBusy } from "./shared/ui.js";
import { loadTextFile, loadJSONFile, loadInstructions } from "./shared/resource_loader.js";

let currentMode = null;   // "realtime" or "assistant"
let modeApi = null;       // module ref that implements init and start

function showApp() {
  document.getElementById("modeChooser").classList.add("hidden");
  document.getElementById("appRoot").classList.remove("hidden");
}

async function loadMode(mode) {
  if (currentMode) return; // lock after first pick
  currentMode = mode;

  showApp();
  add_text_to_debug("Mode chosen: " + mode);
  add_text_to_debug('waiting for mode initialization...');

  if (mode === "realtime") {
    // show session timer
    document.getElementById("sessionTimer").classList.remove("hidden");
    document.getElementById("sessionTimer").classList.remove("lg:hidden");
    // remove assistant ID 
    document.getElementById("assistantIdContainer").classList.add("hidden");
    // remove assistantThreadIdContainer 
    document.getElementById("assistantThreadIdContainer").classList.add("hidden");
    // add sessionIdContainer
    document.getElementById("sessionIdContainer").classList.remove("hidden");

    // load realtime mode 
    modeApi = await import("./modes/realtime.js");
  } else {
    modeApi = await import("./modes/assistant.js");
    // Assistant-only: ask to resume previous thread
    const stored = localStorage.getItem('thread_id');
    if (stored) {
      const ok = confirm("Continue your previous chat? Click Cancel to start a new session.");
      if (ok) document.getElementById('assistantThreadId').value = stored;
      else localStorage.removeItem('thread_id');
    }
  }

  // pass shared UI helpers and DOM ids the module needs
  await modeApi.initMode({
    add_text_to_chat,
    add_text_to_debug,
    setChatBusy,
    loadTextFile,
    loadJSONFile,
    loadInstructions,
  });

  add_text_to_debug("Mode initialized");
}

document.getElementById("pickRealtime").addEventListener("click", () => loadMode("realtime"));
document.getElementById("pickAssistant").addEventListener("click", () => loadMode("assistant"));