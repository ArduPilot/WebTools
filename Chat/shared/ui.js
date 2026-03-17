export function add_text_to_debug(text) {
  const ta = document.getElementById("debugOutput");
  if (!ta) return;
  ta.value += (ta.value ? "\n" : "") + String(text);
  
  // only scroll if toggle is checked
  const autoScroll = document.getElementById("autoScrollToggle").checked;
  if (autoScroll) {
    ta.scrollTop = ta.scrollHeight;
  }
}

let chatMsgCounter = 0;

export function add_text_to_chat(text, role = "assistant", opts = {}) {
  const chatBox = document.getElementById("chatBox");
  const divClass = role === "assistant" ? "assistant-text" : "user-text";

  if (role === "assistant" && opts.append !== false) {
    const last = chatBox.querySelector(`.${divClass}:last-of-type`);
    if (last) {
      last.textContent += text;
      chatBox.scrollTop = chatBox.scrollHeight;
      return last.dataset.msgId || null;
    }
  }

  const el = document.createElement("div");
  el.className = divClass + (opts.muted ? " muted" : "");
  el.textContent = text;
  const id = `msg-${++chatMsgCounter}`;
  el.dataset.msgId = id;
  chatBox.appendChild(el);
  chatBox.scrollTop = chatBox.scrollHeight;
  return id;
}


window.chatBusy = false;

export function setChatBusy(state) {
  window.chatBusy = state
  document.getElementById("sendMessageButton").disabled = state
  document.getElementById("recordButton").disabled = state
  document.getElementById("userInput").disabled = state
}


