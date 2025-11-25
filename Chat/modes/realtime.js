let initialized = false;

export async function initMode(func) {
  if (initialized) return;
  // wire your existing globals to use ui helpers if needed
  const add_text_to_chat = func.add_text_to_chat;
  const add_text_to_debug = func.add_text_to_debug;
  const setChatBusy = func.setChatBusy;
  const loadJSONFile = func.loadJSONFile;
  const loadInstructions = func.loadInstructions;

  let wakeup_schedule = window.wakeup_schedule;

  // call check_wakeup_timers once to start the interval
  check_wakeup_timers();

  // call loadInstructions
  const assistantInstructions = await loadInstructions();

  const tools = [];
  async function loadTools() {
    for (const file of window.JSON_FUNCTION_FILES) {
      const def = await loadJSONFile(file);
      if (def) {
        // If "function" key exists and is an object
        if (def.function && typeof def.function === "object") {
          const { function: funcObj, ...rest } = def;
          tools.push({
            ...rest,      // keep "type" or any other top-level props
            ...funcObj    // move everything from "function" up here
          });
        } else {
          tools.push(def); // unchanged if it doesn't have a "function" property
        }
      }
    }
  }

  // call loadTools
  await loadTools();

  /*
     * Replace the text of an existing bubble by id.
     * You can also toggle muted on or off with opts.muted.
  */
  function replace_chat_text(msgId, newText, opts = {}) {
    const chatBox = document.getElementById("chatBox");
    const el = chatBox.querySelector(`[data-msg-id="${msgId}"]`);
    if (!el) {
      // fallback, just add a new user bubble
      return add_text_to_chat(newText, opts.role || "user", opts);
    }
    el.textContent = newText;
    if (opts.muted != null) {
      if (opts.muted) el.classList.add("muted");
      else el.classList.remove("muted");
    }
    chatBox.scrollTop = chatBox.scrollHeight;
    return msgId;
  }




  //
  // methods below here interact directly with the OpenAI API
  //

  // --- RealTime API logic ---

  let pc, dataChannel, localStream;
  const pendingVoice = new Map(); // item_id -> { placeholderId }
  let currentVoicePlaceholderId = null;
  let currentSessionId = null;


  let capturingSummary = false;
  let summaryBuffer = '';
  let summaryResolve = null;
  let summaryReject = null;
  let summaryTimeoutId = null;

  let isSessionReady = false;
  let sessionReadyResolvers = [];

  // send helper that queues until the data channel opens
  async function sendDC(obj) {
    const payload = JSON.stringify(obj);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      add_text_to_debug('Waiting for data channel to open, cannot send yet');
      return false;
    }
    dataChannel.send(payload);
    return true;
  }

  // Event listeners for button clicks
  document.getElementById('openai-connect-button').addEventListener('click', connectOpenAI);

  document.getElementById("userInput").addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      send_message();
    }
  })
  document.getElementById('sendMessageButton').addEventListener('click', send_message);

  // push-to-talk logic: unmute when pressed, mute when released
  const recordBtn = document.getElementById('recordButton');
  if (recordBtn) {
    recordBtn.addEventListener("click", () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });
  }

  async function connectOpenAI() {
    setChatBusy(true);
    add_text_to_debug('Connecting to OpenAI realtime API...');

    // Reset session ready state
    isSessionReady = false;

    const key = document.getElementById('openai_api_key').value.trim();
    if (!key) { alert('Please enter your API key'); return; }
    if (tools.length === 0) {
      add_text_to_debug('Warning, no tools loaded');
      return;
    }
    if (!assistantInstructions) {
      add_text_to_debug('Warning, assistant instructions not loaded');
      return;
    }

    // Start a session
    let session;
    try {
      const resp = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-realtime-preview',
          modalities: ['text', 'audio']
        })
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(`Session create failed ${resp.status} ${txt}`);
      }
      session = await resp.json();

      try {
        currentSessionId = session.id || null;
        const sessionEl = document.getElementById('sessionId');
        if (sessionEl) sessionEl.value = currentSessionId || '';
      } catch (e) {
        add_text_to_debug('Error setting session ID: ' + e.message);
      }
      setRunStatus('idle');

      // start the session expiry timer
      startSessionExpiryTimer(28.0);
    } catch (e) {
      add_text_to_debug('Realtime session error: ' + e.message);
      return;
    }

    // Build peer connection
    try {
      pc = new RTCPeerConnection({ iceServers: session.ice_servers });
    } catch (e) {
      add_text_to_debug('Failed to create peer connection: ' + e.message);
      return false;
    }

    // basic state logs
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      add_text_to_debug('PC state: ' + state);

      if (state === 'failed' || state === 'disconnected') {
        add_text_to_debug('Peer connection ' + state + ' detected');
      }
    };
    pc.onsignalingstatechange = () => add_text_to_debug('Signaling: ' + pc.signalingState);


    // Mic, start muted
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getAudioTracks()[0].enabled = false;
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    } catch (e) {
      add_text_to_debug('Mic error: ' + e.message);
      return false;
    }

    // Data channel
    dataChannel = pc.createDataChannel('openai_realtime');
    dataChannel.onopen = onChannelOpen;
    dataChannel.onmessage = onChannelMessage;
    dataChannel.onclose = () => { add_text_to_debug('Data channel closed'); };
    dataChannel.onerror = (e) => add_text_to_debug('Data channel error');

    // Offer and answer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    try {
      const sdpResp = await fetch(`https://api.openai.com/v1/realtime?model=${session.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp
      });
      if (!sdpResp.ok) {
        const txt = await sdpResp.text().catch(() => '');
        throw new Error(`SDP exchange failed ${sdpResp.status} ${txt}`);
      }
      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (e) {
      add_text_to_debug('SDP error: ' + e.message);
      return;
    }

    add_text_to_debug('Connected to OpenAI realtime API');
  }

  function onChannelOpen() {
    add_text_to_debug('Data channel open; sending session settings');

    // Session update
    dataChannel.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: assistantInstructions,
        tools: tools,
        tool_choice: 'auto',

        // audio in, text out, manual push-to-talk
        input_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: null
      }
    }));

  }

  async function onChannelMessage(event) {
    const msg = JSON.parse(event.data);

    switch (msg.type) {
      // A new assistant turn has been created
      case 'response.created': {
        setRunStatus(msg.type);
        return;
      }

      // Assistant text streaming
      case 'response.text.delta': {
        setRunStatus(msg.type);

        if (capturingSummary) {
          // collect the summary text
          if (typeof msg.delta === 'string') summaryBuffer += msg.delta;
          return;
        }

        add_text_to_chat(msg.delta, 'assistant');
        return;

      }

      case 'response.text.done': {
        setRunStatus(msg.type);
        if (capturingSummary) {
          add_text_to_debug(`summary: ${summaryBuffer}`);

          // parse and resolve
          clearTimeout(summaryTimeoutId);
          let result = summaryBuffer.trim();
          // try to parse fenced JSON or a bare JSON object
          const m = result.match(/```json\s*([\s\S]*?)```/i) || result.match(/\{[\s\S]*\}$/);
          if (m) {
            try {
              const obj = JSON.parse(m[1] || m[0]);
              result = obj.brief || result;
            } catch (e) {
              add_text_to_debug('Error parsing summary JSON: ' + e.message);
            }
          }

          capturingSummary = false;
          const res = summaryResolve; summaryResolve = summaryReject = null;
          summaryBuffer = '';
          if (res) res(result);
          return; // do not print anything to chat
        }

        return;
      }

      // assistant has finished its turn
      case 'response.done': {

        // handle any tool calls, then ask the model to continue
        const calls = Array.isArray(msg.response?.output)
          ? msg.response.output.filter(o => o.type === 'function_call')
          : [];

        if (calls.length) {
          setRunStatus('waiting_function_call_result');
          for (const callItem of calls) {
            const raw = callItem.arguments;
            const args = typeof raw === 'string' ? JSON.parse(raw) : raw;

            let result;
            try {
              result = await window.handle_function_call(callItem.name, args);
            } catch (err) {
              result = { error: String(err) };
            }

            // return the tool result
            sendDC({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: callItem.call_id,
                output: JSON.stringify(result)
              }
            });

            // let the model continue in text
            sendDC({
              type: 'response.create',
              response: { modalities: ['text'] }
            });
          }
          return;
        }

        setRunStatus(msg.type);
        setChatBusy(false); // end of assistant's turn
        
        // Check if we have a pending session rotation after assistant completes its turn
        if (pendingSessionRotation) {
          add_text_to_debug('Assistant turn completed, starting pending session rotation');
          setTimeout(() => performSessionRotation(), 100); // Small delay to ensure UI updates
        }
        
        return;
      }

      // Any server error for this turn
      case 'response.error': {
        setRunStatus(msg.type);
        add_text_to_debug('Realtime error: ' + JSON.stringify(msg));

        if (capturingSummary) {
          clearTimeout(summaryTimeoutId);
          capturingSummary = false;
          const rej = summaryReject; summaryResolve = summaryReject = null;
          summaryBuffer = '';
          if (rej) rej(new Error('response.error during summary'));
        }

        return;
      }

      // AI confirms it received the audio input
      case 'input_audio_buffer.committed': {
        setRunStatus(msg.type);

        // attach the server item_id to the bubble we created on press
        let phId = currentVoicePlaceholderId;
        if (!phId) {
          // very rare, but keep a fallback
          phId = add_text_to_chat("🎙️ Listening…", "user", { muted: true, append: false });
        }
        pendingVoice.set(msg.item_id, { placeholderId: phId });
        currentVoicePlaceholderId = null;
        return;
      }

      case 'conversation.item.input_audio_transcription.delta': {
        // optional live transcript, uncomment if you want to stream it
        // add_text_to_debug('mic partial: ' + (msg.delta || ''));
        return;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        setRunStatus(msg.type);

        const entry = pendingVoice.get(msg.item_id);
        const text = msg.transcript && msg.transcript.trim() ? msg.transcript.trim() : '(no transcript)';
        if (entry?.placeholderId) {
          replace_chat_text(entry.placeholderId, text, { muted: false });
        } else {
          add_text_to_chat(text, 'user');
        }
        pendingVoice.delete(msg.item_id);
        return;
      }

      case 'conversation.item.input_audio_transcription.failed': {
        setRunStatus(msg.type);

        const entry = pendingVoice.get(msg.item_id);
        if (entry?.placeholderId) {
          replace_chat_text(entry.placeholderId, 'mic transcription failed', { muted: false });
        } else {
          add_text_to_chat('mic transcription failed', 'user');
        }
        add_text_to_debug('Transcription error: ' + JSON.stringify(msg.error));
        pendingVoice.delete(msg.item_id);

        // setChatBusy(false);
        return;
      }

      case 'session.created': {
        setRunStatus(msg.type);
        return;
      }

      case 'session.updated': {
        setRunStatus(msg.type);
        setChatBusy(false);
        
        // Mark session as ready and resolve any waiting promises
        isSessionReady = true;
        sessionReadyResolvers.forEach(resolve => resolve());
        sessionReadyResolvers = [];
        
        return;
      }

      case 'conversation.item.created': {
        return;
      }

      default: {
        // add_text_to_debug('Event: ' + msg.type);
        return;
      }
    }
  }

  function setRunStatus(text) {
    const el = document.getElementById('assistantRunStatus');
    if (el) el.value = text;
  }


  function send_message(message = null) {
    // add_text_to_debug('send_message called with: ' + message);
    // If called as an event handler, ignore the event object
    if (message && typeof message === "object" && message instanceof Event) {
      add_text_to_debug('send_message called as event handler, ignoring event');
      message = null;
    }

    if (message == null && window.chatBusy) {
      add_text_to_debug('Chat is busy, ignoring message: ' + message);
      return;
    }


    // if a message is provided, use it; otherwise get from input field
    const input = document.getElementById('userInput');
    const text = message ? message : input.value.trim();
    if (!text) return;

    // If user did not connect yet, auto-connect
    if (!currentSessionId) {
      add_text_to_debug('Session not started, auto-connecting to OpenAI');
      setChatBusy(true);
      connectOpenAI();
      return;
    }

    // Only add user-typed input to the chat
    if (!message) {
      add_text_to_chat(text, 'user');
    }

    sendDC({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }]
      }
    });

    sendDC({
      type: 'response.create',
      response: { modalities: ['text'] }
    });

    input.value = '';
    setChatBusy(true);
  }

  // Mic recording logic
  let isRecording = false;

  function ensureMicReady() {
    if (!localStream) {
      add_text_to_debug('Mic not ready');
      return false;
    }
    const track = localStream.getAudioTracks()[0];
    if (!track) {
      add_text_to_debug('No audio track found');
      return false;
    }
    return true;
  }

  // 
  function startRecording() {
    if (!pc || !dataChannel || dataChannel.readyState !== 'open') {
      add_text_to_debug('Data channel not ready, cannot start recording');
      return;
    }

    if (window.chatBusy) {
      add_text_to_debug('Chat is busy, ignoring recording start');
      return;
    }

    if (!ensureMicReady()) return;
    if (isRecording) return;
    isRecording = true;

    // add a placeholder bubble for the voice input
    currentVoicePlaceholderId = add_text_to_chat("🎙️ Listening…", "user", { muted: true, append: false });

    // start a fresh audio buffer for this turn
    sendDC({ type: 'input_audio_buffer.clear' });

    // unmute the track so audio flows to the peer
    localStream.getAudioTracks()[0].enabled = true;

    recordBtn?.classList.add('recording');
    add_text_to_debug('Recording start, mic unmuted');
  }

  function stopRecording() {
    if (!ensureMicReady()) return;
    if (!isRecording) return;
    isRecording = false;

    setChatBusy(true);

    // stop audio flow
    localStream.getAudioTracks()[0].enabled = false;

    recordBtn?.classList.remove('recording');
    add_text_to_debug('Recording stop, mic muted');

    if (currentVoicePlaceholderId) {
      replace_chat_text(currentVoicePlaceholderId, 'Transcribing…', { muted: true });
    }

    // finalize this audio turn
    sendDC({ type: 'input_audio_buffer.commit' });

    // ask the model to answer in text
    sendDC({
      type: 'response.create',
      response: { modalities: ['text'] }
    });
  }

  //
  // methods below here are for session rotation 
  //

  async function requestSessionSummary() {
    // if already capturing, avoid double requests
    if (capturingSummary) {
      return Promise.reject(new Error('summary already in progress'));
    }

    capturingSummary = true;
    summaryBuffer = '';

    // build a promise that onChannelMessage will resolve
    const p = new Promise((resolve, reject) => {
      summaryResolve = resolve;
      summaryReject = reject;
    });

    const prompt =
      `Summarize the conversation so far for continuity to a new realtime session.
          Return JSON in one fenced code block with keys: brief, key_state, latest_decisions, todos, safety_notes.
          Keep total under 1000 characters.`;

    // ask the model
    sendDC({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [{ type: 'input_text', text: prompt }]
      }
    });
    sendDC({ type: 'response.create', response: { modalities: ['text'] } });
    add_text_to_debug('Requesting session summary');

    // safety timeout
    clearTimeout(summaryTimeoutId);
    summaryTimeoutId = setTimeout(() => {
      if (capturingSummary) {
        capturingSummary = false;
        const rej = summaryReject; summaryResolve = summaryReject = null;
        if (rej) rej(new Error('Timeout waiting for session summary'));
      }
    }, 15000);

    return p;
  }


  function waitForSessionReady() {
    if (isSessionReady) return Promise.resolve();
    return new Promise(resolve => sessionReadyResolvers.push(resolve));
  }

  async function rotateSession(summaryText = '') {
    add_text_to_debug('Rotating session with summary');

    try { dataChannel?.close(); } catch { add_text_to_debug('Error closing data channel'); }
    try { pc?.close(); } catch { add_text_to_debug('Error closing peer connection'); }

    // reset for the new session
    isSessionReady = false;
    sessionReadyResolvers = [];

    await connectOpenAI();

    // wait for the session to be ready
    await waitForSessionReady();

    const note = `Note:
              - latest_decisions are actions that have already been completed. Never repeat them.
              - todos are pending actions. Execute them only after confirming with the user.`;

    // now it is safe to seed
    if (summaryText && summaryText.trim()) {
      sendDC({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text: `Previous Session memory:\n${summaryText}\n${note}` }]
        }
      });

      sendDC({
        type: 'response.create',
        response: { modalities: ['text'] }
      });
    }

    add_text_to_debug('New session created');
  }


  let expiryTimerId = null;
  let pendingSessionRotation = false;

  function startSessionExpiryTimer(minutes) {
    clearSessionExpiryTimer();
    expiryTimerId = setTimeout(async () => {
      // Check if assistant is currently busy or we already have a pending rotation
      if (window.chatBusy || pendingSessionRotation) {
        add_text_to_debug('Assistant is busy, waiting for current turn to complete before session rotation');
        pendingSessionRotation = true;
        return; // Don't start rotation now, let response.done handle it
      }

      await performSessionRotation();
    }, minutes * 60 * 1000);

    // start the visible countdown
    startCountdown(minutes);
  }

  async function performSessionRotation() {
    if (pendingSessionRotation && window.chatBusy) {
      add_text_to_debug('Session rotation still pending, assistant still busy');
      return; // Still busy, will be called again from response.done
    }

    pendingSessionRotation = false;
    setChatBusy(true); // Block user from sending new messages

    add_text_to_debug('Pre expiry, requesting summary from model memory');
    let summary = '';
    try {
      summary = await requestSessionSummary();
    } catch (e) {
      add_text_to_debug('Summary request failed, ' + e.message);
    }
    await rotateSession(summary);
  }

  function clearSessionExpiryTimer() {
    if (expiryTimerId) {
      clearTimeout(expiryTimerId);
      expiryTimerId = null;
    }
    
    // Reset pending rotation flag when clearing timer
    pendingSessionRotation = false;

    stopCountdown();
  }


  let countdownId = null;

  function startCountdown(minutes) {
    const el = document.getElementById('sessionExpiryTimerText');
    if (!el) return;

    let remaining = Math.floor(minutes * 60);

    clearInterval(countdownId);
    countdownId = setInterval(() => {
      const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
      const ss = String(remaining % 60).padStart(2, '0');
      el.textContent = `${mm}:${ss}`;

      if (--remaining < 0) {
        clearInterval(countdownId);
        el.textContent = "reconnecting…";
      }
    }, 1000);
  }

  function stopCountdown() {
    clearInterval(countdownId);
    countdownId = null;
    const el = document.getElementById('sessionExpiryTimerText');
    if (el) el.textContent = "reconnecting…";
  }

  
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

          // send_to_assistant(message);
          send_message(message);

          wakeup_schedule.splice(i, 1); // remove expired timer
        }
      }
    }, 1000); // wait for one second
  }

  initialized = true;
}
