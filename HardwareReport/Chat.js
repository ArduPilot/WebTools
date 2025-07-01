import Openai from 'https://cdn.jsdelivr.net/npm/openai@4.85.4/+esm';

  
//constants
const TARGET_ASSISTANT_NAME = "ArduPilot WebTool";
const TARGET_ASSISTANT_MODEL = "gpt-4o";


// global variables
let openai = null;
let assistantId = null;
let currentThreadId = null;

let fileId;
let documentTitle = document.title;



async function connectIfNeeded(){
    const openai_API_KEY = localStorage.getItem('openai-api-key');
    if (!openai_API_KEY)
        throw new Error('openai API key not configured.');
    if (!openai){
        openai = new Openai({apiKey: openai_API_KEY, dangerouslyAllowBrowser: true});
            if (!openai) {
                throw new Error('Could not connect to open AI');
            }
        }
    if (!assistantId){
        assistantId = await findAssistantIdByName(TARGET_ASSISTANT_NAME);
    }
    if (!currentThreadId){
        currentThreadId = await createThread();
    }
    
    if (document.title !== documentTitle) {
        fileId = await uploadLogs();
        documentTitle = document.title;
    }

}

async function uploadLogs() {
    const globalLogs = [
        { name: "Sensor_Offset", value: Sensor_Offset },
        { name: "Temperature", value: Temperature },
        { name: "Board_Voltage", value: Board_Voltage },
        { name: "power_flags", value: power_flags },
        { name: "performance_load", value: performance_load },
        { name: "performance_mem", value: performance_mem },
        { name: "performance_time", value: performance_time },
        { name: "stack_mem", value: stack_mem },
        { name: "stack_pct", value: stack_pct },
        { name: "log_dropped", value: log_dropped },
        { name: "log_buffer", value: log_buffer },
        { name: "log_stats", value: log_stats },
        { name: "clock_drift", value: clock_drift },
        { name: "ArduPilot_GitHub_tags", value: ArduPilot_GitHub_tags },
        { name: "octokitRequest_ratelimit_reset", value: octokitRequest_ratelimit_reset },
        { name: "ins", value: ins },
        { name: "compass", value: compass },
        { name: "baro", value: baro },
        { name: "airspeed", value: airspeed },
        { name: "gps", value: gps },
        { name: "rangefinder", value: rangefinder },
        { name: "flow", value: flow },
        { name: "viso", value: viso },
        { name: "can", value: can },
        { name: "params", value: params },
        { name: "defaults", value: defaults },
        { name: "board_types", value: board_types }
    ];
    console.log(globalLogs);
    
    const jsonString = JSON.stringify(globalLogs);
    const blob = new Blob([jsonString], {type:"application/json"})
    const file = new File([blob], "logs.json", { type: "application/json" });
    const filesList = await openai.files.list();
    filesList.data.forEach( file => file.filename == 'logs.json' && openai.files.del(file.id))
    const uploadRes = await openai.files.create({
        file,
        purpose: "assistants"
    });
    const fileId = uploadRes.id;
    console.log("Uploaded file ID:", fileId);
    return fileId;

}

async function createThread(){
    if (!assistantId)
        throw new Error("cannot create thread before initializing assistant");
    const newThread = await openai.beta.threads.create();
    if (!newThread)
        throw new Error("something went wrong while creating thread");
    return newThread.id;
}

async function createAssistant(name, instructions, model, tools){
    const assistant = await openai.beta.assistants.create({instructions,name,model,tools});
    if (!assistant)
        throw new Error("error creating new assistant");
    return assistant;
}

async function findAssistantIdByName(name) {
        if (assistantId) return assistantId;
        const assistantsList = await openai.beta.assistants.list({order: "desc", limit: 20});
        if (!assistantsList)
            throw new Error("could not retrieve the list of assistants");
        let assistant = assistantsList.data.find(a => a.name === name);
        if (!assistant){
            const assistantInstructions = await loadInstructions();
            const assistantTools = await loadTools();
            assistant = await createAssistant(TARGET_ASSISTANT_NAME, assistantInstructions, TARGET_ASSISTANT_MODEL, assistantTools);
        }
        return assistant.id;         
}

async function sendQueryToAssistant(query){
    await connectIfNeeded();
    const message = await openai.beta.threads.messages.create(currentThreadId, { 
        role: "user",
        content: query,
        attachments: fileId && [{
            file_id: fileId,
            tools: [{ type: "code_interpreter" }, {type: "file_search"}]
        }] });
    if (!message)
        throw new Error("Could not send message to assistant");
    let runId;
    const run = openai.beta.threads.runs.stream(currentThreadId, {assistant_id: assistantId});
    if (!run)
        throw new Error("Could not establish run streaming");
    document.getElementById('thinking-message').style.display= 'block';
    handleRunStream(run);
    
}

async function handleRunStream(runStream){
    for await (const event of runStream) {
        switch (event.event) {
            case 'thread.message.delta':
                document.getElementById('thinking-message').style.display= 'none';
                addChatMessage(event.data.delta.content[0].text.value, "assistant");
                break;
            case 'thread.run.requires_action':
                document.getElementById('thinking-message').style.display= 'none';
                handleToolCall(event);
                break;
        }
    }
}

async function handleToolCall(event) {
    console.log(event);
    
    if (!event.data.required_action.submit_tool_outputs || !event.data.required_action.submit_tool_outputs.tool_calls)
        throw new Error ("passed event does not require action")
    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;
    const toolOutputs = [];
    for (const toolCall of toolCalls){
        const toolCallId = toolCall.id;
        const toolName = toolCall.function.name;
        const supportedTools = new Set(["save_all_parameters","save_changed_parameters","save_minimal_parameters"]);
        let toolOutput = {tool_call_id: toolCallId};
        if (supportedTools.has(toolName)){
            window[toolName]();
            toolOutput.output = "success";
        }
        else {
            toolOutput.output = "failure, the function that was called is not supported";
        }
        toolOutputs.push(toolOutput);
    }
    
    const run = await openai.beta.threads.runs.submitToolOutputs(
        currentThreadId,
        event.data.id,
        {
            tool_outputs: toolOutputs,
            stream: true
        }
    );

    if (!run)
        throw new Error ("error occurred while submitting tool outputs");
    document.getElementById('thinking-message').style.display= 'block';
    handleRunStream(run);
    
}

async function loadInstructions() {
    const response = await fetch('instructions.txt');
    if (!response.ok) 
        throw new Error('error fetching file');
    const data = await response.text();
    if (!data)
        throw new Error("could not load instructions for new assistant");
    return data;
}



async function loadTools(){
    const response = await fetch("assistantTools.json");
    if (!response.ok)
        throw new Error("error fetching file");
    const data = response.json();
    if (!data)
        throw new Error("could not load assistant tools for new assistant");
    return data;
}

async function upgradeAssistant() {
    const upgradeButton = document.getElementById('upgrade-assistant');
    upgradeButton.title = 'Upgrade in progress...'
    await connectIfNeeded();
    const response = await openai.beta.assistants.del(assistantId);
    assistantId=null;
    if (!response)
        throw new Error("error deleting assitant");
    console.log(response);

    //connecting again would automatically recreate a new assistant with no additional overhead
    await connectIfNeeded();
    if (assistantId)
        upgradeButton.title = 'Upgraded successfully to the newest Assistant version'
}


function saveAPIKey(){
    const apiKey = document.getElementById('openai-api-key').value.trim();
    localStorage.setItem('openai-api-key', apiKey);    
}


function toggleChat(show) {
    
    const chatWindow = document.getElementById('ai-chat-window');
    const chatBubble = document.getElementById('ai-chat-bubble');
    if (show){
        chatWindow.style.display = 'flex';
        chatBubble.style.display = 'none';
    }
    else{
        chatWindow.style.display = 'none';
        chatBubble.style.display = 'flex'
    }
  }

function sendMessage(event) {
    event.preventDefault();   

    const messageInput = document.getElementById('ai-chat-input');    

    const messageText = messageInput.value.trim();
    if (messageText) {
        addChatMessage(messageText, 'user');
        messageInput.value = '';
        sendQueryToAssistant(messageText);
    }
}

function addChatMessage(text, sender) {
    text=text.replace(/【[\d:]+†[^】]*】/g, '');
    text = text.replace(/\*/g, '');
    const messagesContainer = document.querySelector('#ai-chat-window .ai-chat-messages');
    if (sender === "assistant") {
          let last_message = messagesContainer.querySelector(`.assistant:last-of-type`);
          if (last_message) {
              last_message.textContent += text;
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
              return;
          }
      }

    const messageElement = document.createElement('li');
    messageElement.classList.add('ai-chat-message', sender);
    messageElement.textContent = text;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


async function init(){
    document.getElementById("ai-chat-bubble").addEventListener('click', ()=>toggleChat(true));
    document.getElementById("ai-chat-close-button").addEventListener('click', ()=>toggleChat(false));
    document.getElementById("ai-chat-input-area").addEventListener('submit', sendMessage);
    document.getElementById('save-api-key').addEventListener('click', saveAPIKey);
    document.getElementById('openai-api-key').value=localStorage.getItem('openai-api-key');
    document.getElementById('upgrade-assistant').addEventListener('click',upgradeAssistant);
}

init();