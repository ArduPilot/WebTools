let initialized = false;

import OpenAI from "https://cdn.jsdelivr.net/npm/openai@4.85.4/+esm";
import EventEmitter from 'https://cdn.jsdelivr.net/npm/eventemitter3@5.0.1/+esm'

export async function initMode(func) {
  if (initialized) return;

  const add_text_to_chat = func.add_text_to_chat;
  const add_text_to_debug = func.add_text_to_debug;
  const setChatBusy = func.setChatBusy;
  const loadJSONFile = func.loadJSONFile;
  const loadInstructions = func.loadInstructions;

  let wakeup_schedule = window.wakeup_schedule;

  // call check_wakeup_timers once to start the interval
  check_wakeup_timers();

  // constants
  const OPENAI_API_KEY = ""; // replace with your OpenAI API key
  const OPENAI_MODEL = "gpt-4o"
  const OPENAI_ASSISTANT_NAME = "ArduPilot Vehicle Control via MAVLink"

  async function loadTools() {
    const tools = [];
    for (const file of window.JSON_FUNCTION_FILES) {
      const def = await loadJSONFile(file);
      if (def) tools.push(def);
    }
    return tools;
  }

  // helper: create event handler if missing
  function ensure_event_handler() {
    if (!openai_event_handler) {
      openai_event_handler = new EventHandler(openai);
      if (!openai_event_handler) {
        add_text_to_debug('Unable to create event handler');
        return false;
      }
      openai_event_handler.on("event", openai_event_handler.onEvent.bind(openai_event_handler));
    }
    return true;
  }

  // helper: load or create thread and optionally load history
  async function ensure_thread(loadHistory=true) {
    if (openai_thread_id) return true;
    let stored = localStorage.getItem('thread_id');
    if (stored) {
      openai_thread_id = stored;
      const threadEl = document.getElementById("assistantThreadId");
      if (threadEl) threadEl.value = openai_thread_id;
      if (loadHistory) { await load_thread_history(openai_thread_id); }
      return true;
    }
    openai_thread_id = await create_thread();
    if (!openai_thread_id) {
      add_text_to_debug('Error creating new thread');
      return false;
    }
    localStorage.setItem('thread_id', openai_thread_id);
    const threadEl = document.getElementById("assistantThreadId");
    if (threadEl) threadEl.value = openai_thread_id;
    return true;
  }

  // helper: finalize assistant context after obtaining assistant id
  async function finalize_assistant_context(loadHistory=true) {
    if (!openai_assistant_id) return false;
    const idEl = document.getElementById("assistantId");
    if (idEl) idEl.value = openai_assistant_id;
    if (!(await ensure_thread(loadHistory))) return false;
    if (!ensure_event_handler()) return false;
    return true;
  }

  // helper: create assistant dynamically
  async function create_assistant_when_missing() {
    add_text_to_debug(`Assistant '${OPENAI_ASSISTANT_NAME}' not found, creating...`);
    const instructions = await loadInstructions();
    if (!instructions) {
      add_text_to_debug('Failed to load assistant instructions');
      return false;
    }
    const tools = await loadTools();
    try {
      const created = await openai.beta.assistants.create({
        name: OPENAI_ASSISTANT_NAME,
        instructions,
        model: OPENAI_MODEL,
        tools
      });
      if (!created?.id) {
        add_text_to_debug('Assistant creation failed (no id)');
        return false;
      }
      openai_assistant_id = created.id;
      add_text_to_debug(`Assistant created with id ${openai_assistant_id}`);
      return await finalize_assistant_context(false); // no history for brand new thread
    } catch (e) {
      add_text_to_debug('Assistant creation error: ' + e);
      return false;
    }
  }

  // variables 
  let openai = null
  let openai_assistant_id = null
  let openai_thread_id = null
  let openai_event_handler = null


  // chat listener for user input and enter key
  document.getElementById("userInput").addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      send_message();
    }
  })
  // listener for send message button click
  document.getElementById("sendMessageButton").addEventListener("click", send_message);

  // get openai API key (use this in API calls)
  function get_openai_api_key() {
    if (OPENAI_API_KEY.length > 0) {
      return OPENAI_API_KEY;
    }
    return document.getElementById("openai_api_key").value.trim();
  }

  // attach connection handler to the OpenAI connect button
  const openaiConnectButton = document.getElementById("openai-connect-button");
  if (openaiConnectButton) {
    openaiConnectButton.addEventListener("click", () => {
      check_connection();
    });
  }

  const startNewChatButton = document.getElementById("startNewChatButton");
  if (startNewChatButton) {
    startNewChatButton.addEventListener("click", () => {
      if (confirm("Start a new chat? This will clear the existing conversation.")) {
        localStorage.removeItem('thread_id');

        for (const id of ["assistantThreadId", "assistantId", "assistantRunStatus", "debugOutput"]) {   // 3) blank inputs now
          const el = document.getElementById(id); if (el) el.value = "";
        }
        location.reload();
      }
    });
  }

  // unified send function; optional message param used for programmatic sends
  async function send_message(arg) {
    if (window.chatBusy) return; // guard against rapid multi-clicks
    setChatBusy(true); // lock immediately to avoid races during connection setup

    try {
      if (!(await check_connection())) {
        return;
      }

      let message;
      let isUserMessage = true;
      if (typeof arg === 'string') {
        message = arg;
        isUserMessage = false;
      } else {
        const inputEl = document.getElementById("userInput");
        message = inputEl.value;
        inputEl.value = ""; // clear early for snappier UX
      }

      if (!message || !message.trim()) {
        add_text_to_debug("send_message: message is empty");
        return;
      }

      // only log user messages
      if(isUserMessage) add_text_to_chat(message, "user");
      
      const resp = await get_assistant_response(message);
      // get_assistant_response streams assistant output; only log explicit errors
      if (typeof resp === 'string' && resp.startsWith('get_assistant_response:')) {
        add_text_to_debug(resp);
        setChatBusy(false); // ensure unlocked on immediate error
      }
    } catch (err) {
      add_text_to_debug("send_message error: " + err);
      setChatBusy(false);
    }
  }

  //
  // methods below here interact directly with the OpenAI API
  //

  // check connection to OpenAI API and return true on success, false on failure
  async function check_connection() {
    // check openai API key
    if (!get_openai_api_key()) {
      setChatBusy(false)
      return false;
    }
    // check openai connection
    if (!openai) {
      openai = new OpenAI({ apiKey: get_openai_api_key(), dangerouslyAllowBrowser: true });
      if (!openai) {
        setChatBusy(false)
        return false;
      }
    }

    // already fully initialized
    if (openai_assistant_id && openai_thread_id && openai_event_handler) return true;

    // find existing assistant id if not set
    if (!openai_assistant_id) {
      const foundId = await find_assistant(OPENAI_ASSISTANT_NAME);
      if (foundId) {
        openai_assistant_id = foundId;
      } else {
        const createdOk = await create_assistant_when_missing();
        if (!createdOk) { setChatBusy(false); return false; }
      }
    }

    // finalize (will create thread + handler if missing)
    const ok = await finalize_assistant_context();
    if (!ok) { setChatBusy(false); }
    return ok;
  }

  // get assistant response based on user input
  async function find_assistant(assistant_name) {
    // sanity check openai connection
    if (!openai) {
      return null;
    }

    try {
      // get a list of all assistants
      const assistants_list = await openai.beta.assistants.list({ order: "desc", limit: 20 });

      // iterate through assistants and find the one with the matching name
      let assistant = assistants_list.data.find(a => a.name === assistant_name);

      // return assistant ID if found, otherwise return null
      return assistant ? assistant.id : null;
    } catch (error) {
      // return null in case of an error
      return null;
    }
  }

  // create a new thread
  // returns thread id on success, null on failure
  async function create_thread() {
    // sanity check the assistant id
    if (!openai_assistant_id) {
      return null;
    }

    try {
      // create a thread
      const new_thread = await openai.beta.threads.create();
      return new_thread ? new_thread.id : null;
    } catch (error) {
      add_text_to_debug("create_thread error: " + error);
      return null;
    }
  }

  async function load_thread_history(threadId) {
    if (!openai) { return; }
    try {
      const history = await openai.beta.threads.messages.list(threadId, { order: 'asc', limit: 100 });
      for (const msg of history.data) {
        if (msg.role === 'assistant' || msg.role === 'user') {
          const content = msg.content[0]?.text?.value || '';
          if (content) {
            add_text_to_chat(content, msg.role);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }


  // get assistant response based on user input
  async function get_assistant_response(input) {
    // sanity check the assistant id
    if (!openai_assistant_id) {
      return "get_assistant_response: assistant not found";
    }
    // sanity check thread
    if (!openai_thread_id) {
      return "get_assistant_response: thread not found";
    }

    // add a message to the thread
    const message = await openai.beta.threads.messages.create(openai_thread_id, { role: "user", content: input });

    // run the assistant
    const stream = await openai.beta.threads.runs.stream(openai_thread_id, { assistant_id: openai_assistant_id, stream: true })
    stream.on('event', (event) => openai_event_handler.emit("event", event))
  }




  class EventHandler extends EventEmitter {
    constructor(client) {
      super()
      this.client = client;
    }

    async onEvent(event) {
      try {
        // print status on html page
        document.getElementById("assistantRunStatus").value = event.event;

        // handle each event
        switch (event.event) {
          // retrieve events that are denoted with 'requires_action'
          // since these will have our tool_calls
          case "thread.run.requires_action":
            await this.handleRequiresAction(
              event.data,
              event.data.id,
              event.data.thread_id,
            )
            break;
          case "thread.message.delta":
          case "thread.run.step.delta":
            let delta_text = event.data.delta.content[0].text.value
            add_text_to_chat(delta_text, "assistant")
            break;

          // events below can be ignored
          case "thread.created":
          case "thread.message.completed":
          case "thread.run.created":
          case "thread.run.queued":
          case "thread.run.in_progress":
            break;
          case "thread.run.completed":
          case "thread.run.incomplete":
          case "thread.run.failed":
            setChatBusy(false)
            break;
          case "thread.run.step.created":
          case "thread.run.cancelling":
          case "thread.run.step.in_progress":
          case "thread.run.cancelled":
          case "thread.run.expired":
          case "thread.run.step.created":
          case "thread.run.step.in_progress":
          case "thread.run.step.completed":
          case "thread.run.step.failed":
          // setChatBusy(false)
          // break
          case "thread.run.step.cancelled":
          case "thread.run.step.expired":
          case "thread.message.created":
          case "thread.message.in_progress":
            break;
          case "thread.message.completed":
          case "thread.message.incomplete":
          case "error":
          case "done":
            setChatBusy(false)
            break;

          // catch unhandled events
          default:
            add_text_to_debug("Unhandled event: " + event.event)
            console.log(event)
        }

      } catch (error) {
        console.error("Error handling event:", error)
      }
    }

    // handle requires action event by calling a local function and returning the result to the assistant
    async handleRequiresAction(data, runId, threadId) {
      try {
        const toolOutputs = await Promise.all(
          data.required_action.submit_tool_outputs.tool_calls.map(async (toolCall) => {
            let output;
            try {
              output = await window.handle_function_call(toolCall.function.name, toolCall.function.arguments);
            } catch (err) {
              add_text_to_debug("handle_function_call error: " + err);
              output = JSON.stringify({ error: err.toString() });
            }

            output = typeof output === "string" ? output : JSON.stringify(output);

            add_text_to_debug("fn:" + toolCall.function.name + " output:" + output)
            return {
              tool_call_id: toolCall.id,
              output: output
            }
          })
        )

        // submit all the tool outputs at the same time
        await this.submitToolOutputs(toolOutputs, runId, threadId)
      } catch (error) {
        console.error("Error processing required action:", error)
      }
    }

    // return function call results to the assistant
    async submitToolOutputs(toolOutputs, runId, threadId) {
      try {
        // use the submitToolOutputsStream helper
        const stream = this.client.beta.threads.runs.submitToolOutputsStream(
          threadId,
          runId,
          { tool_outputs: toolOutputs },
        )
        for await (const event of stream) {
          this.emit("event", event)
        }
      } catch (error) {
        console.error("Error submitting tool outputs:", error)
      }
    }
  }



  const recordButton = document.getElementById("recordButton");

  const state = {
    mediaRecorder: null,
    audioChunks: [],
    stream: null,
    audioBlob: null,
    isRecording: false,
    listeners: {
      dataavailable: null,
      stop: null
    }
  };

  async function startRecording(options = {}) {
    if (window.chatBusy) {
      add_text_to_debug("Recording is busy, please wait");
      return;
    }

    if (state.isRecording) {
      add_text_to_debug("recording is in progress");
      return;
    }

    state.isRecording = true;
    state.audioChunks = [];

    try {
      const defaultOptions = {
        mimeType: "audio/webm",
        audioBitsPerSecond: 128000
      };
      const recordingOptions = { ...defaultOptions, ...options };

      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (MediaRecorder.isTypeSupported(recordingOptions.mimeType)) {
        state.mediaRecorder = new MediaRecorder(state.stream, recordingOptions);
      } else {
        add_text_to_debug(recordingOptions.mimeType + " is not supported, using default codec");
        state.mediaRecorder = new MediaRecorder(state.stream);
      }

      state.listeners.dataavailable = event => {
        state.audioChunks.push(event.data);
      };

      state.listeners.stop = async () => {
        state.audioBlob = new Blob(state.audioChunks, { type: recordingOptions.mimeType });
        cleanupResources();
        await handleTranscription(state.audioBlob);
      };

      state.mediaRecorder.addEventListener("dataavailable", state.listeners.dataavailable);
      state.mediaRecorder.addEventListener("stop", state.listeners.stop);
      state.mediaRecorder.start();

    } catch (error) {
      state.isRecording = false;
      cleanupResources();
      add_text_to_debug("Error accessing microphone: " + error);
      setChatBusy(false);
    }
  }

  function stopRecording() {
    if (!state.mediaRecorder || state.mediaRecorder.state === "inactive") {
      return false;
    }
    state.mediaRecorder.stop();
    setChatBusy(true);
    add_text_to_debug("Recording stopped, processing audio...");
    return true;
  }

  function cleanupResources() {
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
      state.stream = null;
    }
    if (state.mediaRecorder) {
      if (state.listeners.dataavailable) {
        state.mediaRecorder.removeEventListener("dataavailable", state.listeners.dataavailable);
      }
      if (state.listeners.stop) {
        state.mediaRecorder.removeEventListener("stop", state.listeners.stop);
      }
      state.mediaRecorder = null;
    }
    state.isRecording = false;
  }

  async function handleTranscription(blob) {
    try {
      // ensure OpenAI connection exists
      // let openai = getOpenAIInstance();
      if (!openai && check_connection) {
        const ok = await check_connection();
        if (!ok) {
          add_text_to_debug("Unable to connect to OpenAI");
          return;
        }
        // openai = getOpenAIInstance();
      }

      const formData = new FormData();
      formData.append("file", blob, "recording.webm");
      formData.append("model", "whisper-1");
      // formData.append("language", "en");

      const apiKey = openai ? openai.apiKey : document.getElementById("openai_api_key").value.trim();

      const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData
      });
      const data = await resp.json();
      const transcript = data.text.trim();
      add_text_to_chat(transcript, "user");
      const response = await get_assistant_response(transcript);
      add_text_to_chat(response, "assistant");
    } catch (err) {
      add_text_to_debug("Transcription error: " + err);
    }
  }

  recordButton.addEventListener("click", () => {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording().catch(err => {
        add_text_to_debug("Failed to start recording: " + err);
      });
    }
  });

  // check if any wakeup timers have expired and send messages if they have
  // this function never returns so it should be called from a new thread
  function check_wakeup_timers() {
    setInterval(() => {
      // check if any timers are set
      if (wakeup_schedule.length === 0) {
        return;
      }

      const now = Date.now();

      // iterate backward to safely remove expired timers
      for (let i = wakeup_schedule.length - 1; i >= 0; i--) {
        if (now >= wakeup_schedule[i].time) {
          const message = "WAKEUP:" + wakeup_schedule[i].message;
          add_text_to_debug("check_wakeup_timers: sending message: " + message);

          send_message(message);

          wakeup_schedule.splice(i, 1); // remove expired timer
        }
      }
    }, 1000); // wait for one second
  }


  initialized = true;
}
