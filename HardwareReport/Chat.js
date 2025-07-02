import Openai from 'https://cdn.jsdelivr.net/npm/openai@4.85.4/+esm';

  
//constants
const TARGET_ASSISTANT_NAME = "ArduPilot WebTool";
const TARGET_ASSISTANT_MODEL = "gpt-4o";


// global variables
let openai = null;
let assistantId = null;
let currentThreadId = null;
let fileId;
let documentTitle = document.title; //title change => signals new file upload


//makes mutiple checks crucial for the assistant to work
async function connectIfNeeded(){
    const openai_API_KEY = localStorage.getItem('openai-api-key'); //if there an api key is saved, it will be in local storage
    if (!openai_API_KEY)
        throw new Error('openai API key not configured.');
    if (!openai){
        // instantiate openai object
        openai = new Openai({apiKey: openai_API_KEY, dangerouslyAllowBrowser: true});
            if (!openai) {
                throw new Error('Could not connect to open AI');
            }
        }
    if (!assistantId){
        //create or find existing assistant
        assistantId = await findAssistantIdByName(TARGET_ASSISTANT_NAME);
    }
    if (!currentThreadId){
        //create a new thread
        currentThreadId = await createThread();
    }
    
    //if document title changes => signals that a new logs file was uploaded => upload the new file to the assitant
    if (document.title !== documentTitle) {
        fileId = await uploadLogs();
        documentTitle = document.title;
    }

}

//stores the processed data from the logs file in a json file and uploads it to the assistant
async function uploadLogs() {
    //store real time values of global variables in the logs array
    //these global variables are declared in HardwareReport.js and are visible to this file
    const logs = [
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
        { name: "ins", value: ins },
        { name: "compass", value: compass },
        { name: "baro", value: baro },
        { name: "airspeed", value: airspeed },
        { name: "gps", value: gps },
        { name: "rangefinder", value: rangefinder },
        { name: "flow", value: flow },
        { name: "viso", value: viso },
        { name: "can", value: can }
    ];
    //create logs.json file from the array above
    const jsonString = JSON.stringify(logs);
    const blob = new Blob([jsonString], {type:"application/json"})
    const file = new File([blob], "logs.json", { type: "application/json" });

    //delete the previously uploaded logs.json file before uploading the new one
    const filesList = await openai.files.list();
    if (!filesList)
        throw new Error("error fetching files list");
    filesList.data.forEach( file => file.filename === 'logs.json' && openai.files.del(file.id));

    //upload new logs.json file
    const uploadRes = await openai.files.create({
        file,
        purpose: "assistants"
    });
    if (!uploadRes)
        throw new Error("error creating logs file");
    const fileId = uploadRes.id;
    return fileId;

}

//handles vector store retrieval for use by assistant
async function getOrCreateVectorStore(name = "schema-store") {
    //check if vectore store already exists
    const list = await openai.beta.vectorStores.list();
    if (!list)
        throw new Error("error fetching vector stores list");
    const existing = list.data.find(vs => vs.name === name);
    if (!existing)
        return;
    //create new vector store in case one doesn't already exist
    const vectorStore = await openai.beta.vectorStores.create({ name });
    return vectorStore;
}

//deleted old shchema file, used primary as part of the version update pipeline
async function purgeOldSchemaFile(vectorStoreId, targetFilename = "logs_schema_and_notes.txt") {
    const refs = await openai.beta.vectorStores.files.list(vectorStoreId);
    if (!refs)
        throw new Error("error retrieving vector store files list");
    for (const ref of refs.data) {
        const file = await openai.files.retrieve(ref.id);
        if (!file)
            throw new Error("error retrieving file");
        if (file.filename === targetFilename) {
        //detach from vector store
        await openai.beta.vectorStores.files.del(vectorStoreId, ref.id);
        //delete the file itself
        await openai.files.del(ref.id);
        }
    }
}


async function uploadNewSchemaFile(vectorStoreId, file) {
    //uploads new schema file
    const newFile = await openai.files.create({
        file,
        purpose: "assistants",
    });
    if (!newFile)
        throw new Error("could not create new schema file");

    // add and wait until embeddings are ready
    await openai.beta.vectorStores.fileBatches.createAndPoll(vectorStoreId, {
        file_ids: [newFile.id],
    });

    return newFile.id;
}

//handles schema loading, vector store creation and file updating as part of versioning
async function uploadSchema(){
    const file = await loadSchema();
    const vectorStore = await getOrCreateVectorStore();
    await purgeOldSchemaFile(vectorStore.id);    
    await uploadNewSchemaFile(vectorStore.id, file);    
    return vectorStore.id;
}

//creates a new thread for use by the assistant
async function createThread(){
    if (!assistantId)
        throw new Error("cannot create thread before initializing assistant");
    const newThread = await openai.beta.threads.create();
    if (!newThread)
        throw new Error("something went wrong while creating thread");
    return newThread.id;
}

async function createAssistant(name, instructions, model, tools){
    //get vectore store id needed for assistant creation
    const vectorStoreId = await uploadSchema();
    const assistant = await openai.beta.assistants.create({
        instructions,
        name,
        model,
        tools,
        tool_resources: {file_search:{vector_store_ids: [vectorStoreId]}}
    });
    if (!assistant)
        throw new Error("error creating new assistant");
    return assistant;
}

async function findAssistantIdByName(name) {
        //if we have assitant id, terminate function
        if (assistantId) return assistantId;
        //retrive all listed assistants and look for the one with the specified name
        const assistantsList = await openai.beta.assistants.list({order: "desc", limit: 20});
        if (!assistantsList)
            throw new Error("could not retrieve the list of assistants");
        let assistant = assistantsList.data.find(a => a.name === name);
        //if assistant doesn't exist, create it.
        if (!assistant){
            const assistantInstructions = await loadInstructions();
            const assistantTools = await loadTools();
            assistant = await createAssistant(TARGET_ASSISTANT_NAME, assistantInstructions, TARGET_ASSISTANT_MODEL, assistantTools);
        }
        return assistant.id;         
}

//handles sending a message to the assistant and managing the streamed response
async function sendQueryToAssistant(query){
    //check if a connection is established
    await connectIfNeeded();    
    //create a new message with the user query, if user uploaded a logs file, it will be attached to the message
    const message = await openai.beta.threads.messages.create(currentThreadId, { 
        role: "user",
        content: query,
        attachments: fileId && [{
            file_id: fileId,
            tools: [{ type: "code_interpreter" }]
        }] });
    if (!message)
        throw new Error("Could not send message to assistant");

    //create a new run with the added message and stream the response
    const run = openai.beta.threads.runs.stream(currentThreadId, {assistant_id: assistantId});
    if (!run)
        throw new Error("Could not establish run streaming");
    //UI update for the user
    document.getElementById('thinking-message').style.display= 'block';

    handleRunStream(run);
    
}

//handling the streamed response from the assitant
async function handleRunStream(runStream){
    if (!runStream)
        throw new Error("run stream not defined");
    //run stream is in the form of an async iterable
    for await (const event of runStream) {
        //handling based on event type
        switch (event.event) {
            case 'thread.message.delta':
                //message stream
                document.getElementById('thinking-message').style.display= 'none';
                addChatMessage(event.data.delta.content[0].text.value, "assistant");
                break;
            case 'thread.run.requires_action':
                //assistant would like to call a tool
                document.getElementById('thinking-message').style.display= 'none';
                handleToolCall(event);
                break;
        }
    }
}

//calls the tool requested by the assistant, submits the tool output, and handles the run
async function handleToolCall(event) {
    //sanity check
    if (!event.data.required_action.submit_tool_outputs || !event.data.required_action.submit_tool_outputs.tool_calls)
        throw new Error ("passed event does not require action");

    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;
    const toolOutputs = [];

    for (const toolCall of toolCalls){
        const toolCallId = toolCall.id;
        const toolName = toolCall.function.name;
        //supported function names so far, these functions are defined in HardwareReport.js and are visible within this file
        const supportedTools = new Set(["save_all_parameters","save_changed_parameters","save_minimal_parameters"]);
        let toolOutput = {tool_call_id: toolCallId};
        //check if the tool requested is part of the supported tools
        if (supportedTools.has(toolName)){
            //call the tool
            window[toolName]();
            toolOutput.output = "success";
        }
        else {
            //failure message for the assistant
            toolOutput.output = "failure, the function that was called is not supported";
        }
        toolOutputs.push(toolOutput);
    }

    //submit all the called tools outputs together
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
    //handle the run again
    handleRunStream(run);
    
}

//load the system instructions file for use by the assitant
async function loadInstructions() {
    const response = await fetch('instructions.txt');
    if (!response.ok) 
        throw new Error('error fetching file');
    const data = await response.text();
    if (!data)
        throw new Error("could not load instructions for new assistant");
    return data;
}

//load the schema and notes file for the assistant, used to detail to the assitant how to process logs.json
async function loadSchema() {
    const response = await fetch('logs_schema_and_notes.txt');
    if (!response.ok) 
        throw new Error('error fetching file');
    const blob = await response.blob();
    if (!blob)
        throw new Error("could not load instructions for new assistant");
    return new File([blob], 'logs_schema_and_notes.txt',{ type:blob.type});
}

//load the assistant tools file, defining all the tools accessible to the assistant
async function loadTools(){
    const response = await fetch("assistantTools.json");
    if (!response.ok)
        throw new Error("error fetching file");
    const data = response.json();
    if (!data)
        throw new Error("could not load assistant tools for new assistant");
    return data;
}

//upgrade assistant version, deletes the old assistant and creates a completely new one
async function upgradeAssistant() {
    //UI feedback
    const upgradeButton = document.getElementById('upgrade-assistant');
    upgradeButton.title = 'Upgrade in progress...';
    upgradeButton.textContent = "Upgrading...";
    //connection check
    await connectIfNeeded();
    //delete assistant
    const response = await openai.beta.assistants.del(assistantId);
    if (!response)
        throw new Error("error deleting assitant");
    //signal that the assitant was deleted
    assistantId=null;

    //connecting again would automatically recreate a new assistant with no additional overhead
    await connectIfNeeded();

    //check that a new assistant was created
    if (assistantId){
        upgradeButton.title = 'Upgraded successfully to the newest Assistant version';
        upgradeButton.textContent = 'Upgraded';
    }
        
}

//save the api key in the local storage, user will not have to re-enter it manually every time
function saveAPIKey(){
    const apiKey = document.getElementById('openai-api-key').value.trim();
    localStorage.setItem('openai-api-key', apiKey);    
}

//toggle chat window
function toggleChat(show) {
    //retrieve DOM elements
    const chatWindow = document.getElementById('ai-chat-window');
    const chatBubble = document.getElementById('ai-chat-bubble');
    if (show){
        //show window, hide bubble
        chatWindow.style.display = 'flex';
        chatBubble.style.display = 'none';
    }
    else{
        //show bubble, hide window
        chatWindow.style.display = 'none';
        chatBubble.style.display = 'flex';
    }
}

//triggered by user's enter key press or send button click
function sendMessage(event) {
    //prevent default form behavior of page refresh upon submission
    event.preventDefault();   
    const messageInput = document.getElementById('ai-chat-input');    
    const messageText = messageInput.value.trim();
    //add to chat and send to assitant
    if (messageText) {
        addChatMessage(messageText, 'user');
        messageInput.value = '';
        sendQueryToAssistant(messageText);
    }
}

function addChatMessage(text, sender) {
    //assistant might add non native formatting or file annotations to text messages, these regex replacements remove them. 
    text=text.replace(/【[\d:]+†[^】]*】/g, '');
    text = text.replace(/\*/g, '');

    const messagesContainer = document.querySelector('#ai-chat-window .ai-chat-messages');
    //stream the assitant response
    if (sender === "assistant") {
          let last_message = messagesContainer.querySelector(`.assistant:last-of-type`);
          if (last_message) {
              last_message.textContent += text;
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
              return;
          }
      }
    //add user message
    const messageElement = document.createElement('li');
    messageElement.classList.add('ai-chat-message', sender);
    messageElement.textContent = text;
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


async function init(){
    //define event listeners
    document.getElementById("ai-chat-bubble").addEventListener('click', ()=>toggleChat(true));
    document.getElementById("ai-chat-close-button").addEventListener('click', ()=>toggleChat(false));
    document.getElementById("ai-chat-input-area").addEventListener('submit', sendMessage);
    document.getElementById('save-api-key').addEventListener('click', saveAPIKey);
    //in case an api key was previously saved, add UI feedback to signal that to the user
    document.getElementById('openai-api-key').value=localStorage.getItem('openai-api-key');
    document.getElementById('upgrade-assistant').addEventListener('click',upgradeAssistant);
}

init();