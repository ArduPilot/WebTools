let import_done = []
var DataflashParser
import_done[0] = import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default })
import "https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js"
import "https://cdn.jsdelivr.net/npm/dompurify@3.0.5/dist/purify.min.js"


// Constants
const TARGET_ASSISTANT_NAME = "Log Analyzer";
const TARGET_ASSISTANT_MODEL = "gpt-4o";

// Import OpenAI
import { OpenAI } from 'https://cdn.jsdelivr.net/npm/openai@4.85.4/+esm';

// Global variables
let openai = null;
let assistantId = null;
let currentThreadId = null;
let fileId = null;
let apiKey = null;
let isProcessing = false;

// DOM Elements
let chatMessages;
let fileInput;
let messageInput;
let sendButton;
let fileUploadLabel;
let vizArea;
let log;

//Initialize the app, check for API key and OpenAI availability
async function initializeApp() {
    try {
        if (apiKey) {
            await connectIfNeeded();
        } else {
            showApiKeyPrompt();
        }
    } catch (error) {
        console.error("Failed to initialize:", error);
        showOfflineMessage();
    }
}

//Show API key input dialog
function showApiKeyPrompt() {
    // Create and show a modal for API key input
    const modal = createModal(
        "OpenAI API Key Required",
        `
        <p>Please enter your OpenAI API key to use the Log Analyzer:</p>
        <form id="apiKeyForm">
            <input type="password" id="apiKeyInput" placeholder="sk-..." required>
            <button type="submit" class="submit-btn">Connect</button>
        </form>
        `
    );
    
    document.body.appendChild(modal);
    
    // Set up the form submission
    document.getElementById('apiKeyForm').addEventListener('submit', (e) => {
        e.preventDefault();
        apiKey = document.getElementById('apiKeyInput').value.trim();
        if (apiKey) {
            modal.remove();
            connectIfNeeded();
        }
    });
}

//Create a modal dialog with title and content
function createModal(title, content) {
    const modalContainer = document.createElement('div');
    modalContainer.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const modalTitle = document.createElement('h2');
    modalTitle.textContent = title;
    
    const closeButton = document.createElement('span');
    closeButton.className = 'close-modal';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = () => modalContainer.remove();
    
    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    modalBody.innerHTML = content;
    
    modalContent.appendChild(closeButton);
    modalContent.appendChild(modalTitle);
    modalContent.appendChild(modalBody);
    modalContainer.appendChild(modalContent);
    
    return modalContainer;
}

//Show offline message when OpenAI is not available
function showOfflineMessage() {
    addChatMessage("I'm currently in offline mode. AI features require an internet connection and an OpenAI API key.", 'system');
    
    // Disable inputs
    messageInput.disabled = true;
    messageInput.placeholder = "AI chat unavailable in offline mode";
    sendButton.disabled = true;
}

// Helper: detect 401 Unauthorized errors from OpenAI SDK responses
function isUnauthorizedError(error) {
    return (
        error?.status === 401 ||
        error?.response?.status === 401 ||
        error?.code === 401 ||
        error?.error?.type === 'invalid_request_error' && /unauthorized|invalid api key/i.test(error?.message || '') ||
        /401/.test(String(error)) && /unauthorized|invalid api key/i.test(String(error))
    );
}

// Helper: show invalid API key message and prompt for a new key
function handleInvalidApiKey() {
    addChatMessage("Invalid OpenAI API key (401). Please enter a valid key.", 'error');
    // Reset client state to force re-authentication
    openai = null;
    assistantId = null;
    currentThreadId = null;
    // Prompt for a new key
    showApiKeyPrompt();
}

//Connect to the OpenAI API and initialize the assistant if needed
async function connectIfNeeded() {
    if (!apiKey) {
        showApiKeyPrompt();
        return;
    }
    
    if (!openai) {
        try {
            // Instantiate OpenAI client
            openai = new OpenAI({apiKey, dangerouslyAllowBrowser: true});
        } catch (error) {
            throw new Error('Could not connect to OpenAI');
        }
    }
    
    if (!assistantId) {
        try {
            // Find or create the assistant
            const assistantsList = await openai.beta.assistants.list({
                order: "desc",
                limit: 100,
            });
            
            // Look for an existing assistant with the target name
            const existingAssistant = assistantsList.data.find(
                assistant => assistant.name === TARGET_ASSISTANT_NAME
            );
            
            if (existingAssistant) {
                assistantId = existingAssistant.id;
                console.log("Found existing assistant:", assistantId);
            } else {
                // Create a new assistant
                const instructions = await loadInstructions();
                const tools = await loadTools();
                const assistant = await openai.beta.assistants.create({
                    name: TARGET_ASSISTANT_NAME,
                    instructions,
                    model: TARGET_ASSISTANT_MODEL,
                    tools,
                });
                assistantId = assistant.id;
            }
        } catch (error) {
            if (isUnauthorizedError(error)) {
                handleInvalidApiKey();
                throw new Error('Invalid API key (401)');
            }
            throw new Error('Could not initialize assistant');
        }
    }
    
    if (!currentThreadId) {
        try {
            // Create a new thread
            const thread = await openai.beta.threads.create();
            currentThreadId = thread.id;
            // Update UI to show successful connection
            addChatMessage("Connected to AI assistant! Upload a log file or ask a question about drone flight analysis.", 'system');    
        } catch (error) {
            if (isUnauthorizedError(error)) {
                handleInvalidApiKey();
                throw new Error('Invalid API key (401)');
            }
            throw new Error('Could not create conversation thread');
        }
    }
}

//definition of the callable tool "get" by the assistant, returns parsed message data
window.get = async function get(message) {
    let output;
    if (message in log.messageTypes){
        if ("instances" in log.messageTypes[message]) {
    
            for (const inst of Object.keys(log.messageTypes[message].instances)) {                
                output=log.get_instance(message, inst)
            }
        }
        else {
            output=log.get(message)
        }   
    }
    if (output) {
        const jsonString = JSON.stringify(output);
        const blob = new Blob([jsonString], {type:"application/json"})
        const file = new File([blob], "output.json", { type: "application/json" });

        //delete the previously uploaded output.json file before uploading the new one
        const filesList = await openai.files.list();
        if (!filesList)
            throw new Error("error fetching files list");
        filesList.data.forEach( file => file.filename === 'output.json' && openai.files.del(file.id));
        

        //upload new output.json file
        const uploadRes = await openai.files.create({
            file:file,
            purpose: "assistants"
        });
        if (!uploadRes)
            throw new Error("error creating logs file");
        const fileId = uploadRes.id;
        return fileId;
    }

    return output;
    
}

//load log and process data
async function loadLog(logFile) {
    await Promise.allSettled(import_done)
    log = new DataflashParser()
    log.processData(logFile, [])
}



//Handle file upload
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Update label to show the selected file
    fileUploadLabel.textContent = `Selected: ${file.name}`;
    fileUploadLabel.classList.add('file-selected');
    
    // Show processing message
    addChatMessage(`Processing ${file.name}...`, 'system');

    setProcessingState(true);

    if (file.name.toLowerCase().endsWith(".bin")) {
        let reader = new FileReader()
        reader.onload = function (e) {
            loadLog(reader.result)
        }
        reader.readAsArrayBuffer(file)
        addChatMessage(`Log file uploaded successfully. You can now ask questions about the log.`, 'system');
    }
    
    updateVisualization({
            summary: "Log File Ready",
            issues: ["Ask questions in the chat to analyze the log and generate visualizations."],
        });
    setProcessingState(false);
}

//Update the visualization area with analysis results
function updateVisualization(data) {
    if (!vizArea) return;
    
    // Store existing graph containers
    const existingGraphs = Array.from(vizArea.querySelectorAll('.graph-container'));
    
    // Remove all non-graph content
    Array.from(vizArea.children).forEach(child => {
        if (!child.classList.contains('graph-container')) {
            child.remove();
        }
    });
    
    // Create summary section
    if (data.summary) {
        const summarySection = document.createElement('div');
        summarySection.className = 'viz-section';
        summarySection.id = 'summary-section';
        
        const summaryTitle = document.createElement('h3');
        summaryTitle.textContent = 'Summary';
        summarySection.appendChild(summaryTitle);
        
        const summaryContent = document.createElement('p');
        summaryContent.textContent = data.summary;
        summarySection.appendChild(summaryContent);
        
        // Insert summary at the beginning
        vizArea.insertBefore(summarySection, vizArea.firstChild);
    }
    
    // Create issues section if there are issues
    if (data.issues && data.issues.length > 0) {
        const issuesSection = document.createElement('div');
        issuesSection.className = 'viz-section';
        issuesSection.id = 'findings-section';
        
        const issuesTitle = document.createElement('h3');
        issuesTitle.textContent = 'Findings';
        issuesSection.appendChild(issuesTitle);
        
        const issuesList = document.createElement('ul');
        data.issues.forEach(issue => {
            const issueItem = document.createElement('div');
            issueItem.textContent = issue;
            issuesList.appendChild(issueItem);
        });
        
        issuesSection.appendChild(issuesList);
        
        // If there's a summary section, insert findings after it, otherwise at the beginning
        const summarySection = document.getElementById('summary-section');
        if (summarySection) {
            vizArea.insertBefore(issuesSection, summarySection.nextSibling);
        } else {
            vizArea.insertBefore(issuesSection, vizArea.firstChild);
        }
    }
}

//Add a visualization (image/graph) to the visualization area
function addVisualization(imageElement) {
    if (!vizArea) return;
    
    // Make sure thinking indicator is hidden since we have content to show
    showThinkingMessage(false);
    
    // Check if there's a placeholder message to remove
    // If the visualization area is empty or only contains placeholder messages, clear it
    if (!vizArea.querySelector('.graph-container')) {
        vizArea.innerHTML = '';
    }
    
    // Create container for the graph
    const graphSection = document.createElement('div');
    graphSection.className = 'viz-section graph-container';
    
    // Create title for the graph with timestamp
    const graphTitle = document.createElement('h3');
    const timestamp = new Date().toLocaleTimeString();
    graphSection.appendChild(graphTitle);
    
    // Add responsive container for the image
    const imageContainer = document.createElement('div');
    imageContainer.className = 'graph-image-container';
    
    // Set image to be responsive
    imageElement.style.maxWidth = '100%';
    imageElement.style.height = 'auto';
    
    // Add the image to the container
    imageContainer.appendChild(imageElement);
    graphSection.appendChild(imageContainer);
    
    // Add click event to show the image in full size
    imageElement.addEventListener('click', () => {
        const fullSizeView = document.createElement('div');
        fullSizeView.className = 'full-size-image-view';
        const fullSizeImage = imageElement.cloneNode(true);
        fullSizeView.appendChild(fullSizeImage);
        fullSizeView.addEventListener('click', () => {
            fullSizeView.remove();
        });
        document.body.appendChild(fullSizeView);
    });
    
    // Add to the visualization area
    vizArea.appendChild(graphSection);
}

//Set the UI state to reflect processing status
function setProcessingState(isActive) {
    isProcessing = isActive;
    
    if (sendButton) {
        sendButton.disabled = isActive;
    }
    
    if (messageInput) {
        messageInput.disabled = isActive;
        if (isActive)
            messageInput.placeholder = "Assistant is working...";
        else
            messageInput.placeholder = "Ask about your flight data..."
    }
    
    if (fileUploadLabel) {
        if (isActive) {
            fileUploadLabel.classList.add('processing');
        } else {
            fileUploadLabel.classList.remove('processing');
        }
    }
}

//Show or hide the thinking indicator
function showThinkingMessage(show) {
    // Get the existing indicator if any
    const existingIndicator = document.getElementById('thinking-message');
    
    if (show && chatMessages) {
        // If already showing, don't create a new one
        if (existingIndicator) return;
        
        // Create a new thinking indicator
        const thinkingIndicator = document.createElement('div');
        thinkingIndicator.id = 'thinking-message';
        thinkingIndicator.className = 'message thinking-indicator';
        
        // Create simple dots animation using text
        const dotPulse = document.createElement('div');
        dotPulse.className = 'dot-pulse';
        dotPulse.textContent = "...";
        
        // Set up animation with simple interval
        const dotsAnimation = setInterval(() => {
            if (dotPulse.textContent === ".") dotPulse.textContent = "..";
            else if (dotPulse.textContent === "..") dotPulse.textContent = "...";
            else dotPulse.textContent = ".";
        }, 500);
        
        // Store the interval ID on the element so we can clear it later
        thinkingIndicator.dataset.intervalId = dotsAnimation;
        
        thinkingIndicator.appendChild(dotPulse);
        
        // Add it to the end of the chat messages
        chatMessages.appendChild(thinkingIndicator);
        
        // Ensure we scroll to make it visible
        chatMessages.scrollTop = chatMessages.scrollHeight;
    } else if (!show) {
        // Clear any animation intervals and remove the indicator
        if (existingIndicator) {
            if (existingIndicator.dataset.intervalId) {
                clearInterval(parseInt(existingIndicator.dataset.intervalId));
            }
            existingIndicator.remove();
        }
    }
}


//calls the tool requested by the assistant, submits the tool output, and handles the run
async function handleToolCall(event) {
    showThinkingMessage(true)
    //sanity check
    if (!event.data.required_action.submit_tool_outputs || !event.data.required_action.submit_tool_outputs.tool_calls)
        throw new Error ("passed event does not require action");

    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;
    const toolOutputs = [];
    let failed = false;

    for (const toolCall of toolCalls){
        console.log("tool called", toolCall);
        
        const toolCallId = toolCall.id;
        const toolName = toolCall.function.name;
        const toolArguments = JSON.parse(toolCall.function.arguments);
        //supported function names so far, these functions are defined in HardwareReport.js and are visible within this file
        const supportedTools = new Set(["get"]);
        
        let toolOutput = {tool_call_id: toolCallId};
        //check if the tool requested is part of the supported tools
        if (supportedTools.has(toolName)){
            if (log){
                //call the tool
                fileId = await window[toolName](toolArguments.message_type);
                if (fileId===undefined){
                    failed = true
                    toolOutput.output = "failure, requested message type does not exist in message types";
                }
            }
            else{
                failed = true
                toolOutput.output = "failure, user did not upload logs file";
            }
            
            
        }
        else {
            //failure message for the assistant
            failed = true
            toolOutput.output = "failure, the function that was called is not supported";
        }
        toolOutputs.push(toolOutput);
    }
    if (failed){
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
            throw new Error ("error occurred while submitting tool outputs")
        handleRunStream(run);
        return;
    }
    
    // End current run
    await openai.beta.threads.runs.cancel(currentThreadId, event.data.id);
    

    // Create a new message in the same thread, passing the new file/output
    showThinkingMessage(true)
    const newMessage = await openai.beta.threads.messages.create(currentThreadId, {
        role: "user",
        content: `The data for the requested message has been extracted. Continue processing using the output.json file with id: ${fileId}`,
        attachments: [
            { file_id: fileId, tools: [{ type: "code_interpreter" }] }
        ]
    });

    //Start a new run
    const newRun = await openai.beta.threads.runs.create(currentThreadId, {
        assistant_id: assistantId,
        stream: true
    });

    //Handle new run stream
    if (!newRun) throw new Error("Error occurred while starting new run");
    handleRunStream(newRun);
    
}

//Handle the stream of events from a run
async function handleRunStream(runStream) {
    if (!runStream) {
        throw new Error("Run stream is not defined");
    }
    
    // Make sure thinking message is displayed at the start of streaming
    showThinkingMessage(true);
    setProcessingState(true)
    
    try {
        // Process the stream of events
        for await (const event of runStream) {
            // Handle different event types
            switch (event.event) {
                case 'thread.message.delta':
                    
                    // New message content received
                    const content = event.data.delta.content;
                    if (!content || content.length === 0) continue;
                    
                    // Only hide thinking indicator when we actually have content to display
                    
                    // Process each content item
                    for (const item of content) {
                        if (item.text) {
                            // Text content
                            showThinkingMessage(false); // Hide thinking indicator only when we have actual text to display
                            addChatMessage(item.text.value, 'assistant');
                        } else if (item.image_file) {
                            // Image/graph content
                            try {
                                showThinkingMessage(false); // Hide thinking indicator when we have a graph to display
                                
                                const imageFileId = item.image_file.file_id;
                                const response = await openai.files.content(imageFileId);
                                const blob = await response.blob();
                                const url = URL.createObjectURL(blob);
                                const image = document.createElement("img");
                                image.src = url;
                                image.className = "ai-generated-image";
                                
                                // Add to visualization area instead of chat
                                addVisualization(image);

                                
                                
                            } catch (imageError) {
                                console.error("Failed to load image:", imageError);
                                addChatMessage("Failed to load a graph for visualization. " + imageError.message, 'error');
                            }
                        }
                    }
                    break;
                    
                case 'thread.run.requires_action':
                    // Handle required actions (tool calls)
                    console.log("Run requires action:", event.data.required_action);
                    handleToolCall(event)
                    break;
                    
                case 'thread.run.completed':
                    // Run completed
                    break;
                    
                case 'thread.run.failed':
                    // Run failed
                    console.log(event);
                    
                    showThinkingMessage(false);
                    addChatMessage("Sorry, there was an error processing your request. Please try again.", 'error');
                    break;
            }
        }
    } catch (error) {
        addChatMessage("Error receiving response from assistant: " + error.message, 'error');
        showThinkingMessage(false);
    } finally {
        setProcessingState(false);
    }
}

//Handle sending a message
function handleSendMessage() {
    const message = messageInput.value.trim();
    if (!message || isProcessing) return;
    
    // Add user message to chat
    addChatMessage(message, 'user');
    
    // Clear input
    messageInput.value = '';
    
    // Process message
    processUserMessage(message);
}

//Process a user message by sending it to the OpenAI assistant
async function processUserMessage(message) {
    try {
        setProcessingState(true);
        
        // Show thinking indicator immediately
        showThinkingMessage(true);

        //make sure connection is established before creating a message
        await connectIfNeeded();
        
        // Add the user message to the thread with file attachments if available
        await openai.beta.threads.messages.create(
            currentThreadId,
            {
                role: 'user',
                content: message,
                attachments: fileId && [{
                    file_id: fileId,
                    tools: [{ type: "code_interpreter" }]
                }]
            }
        );
        
        // Create a run with the assistant and stream the response
        const runStream = openai.beta.threads.runs.stream(
            currentThreadId, 
            {
                assistant_id: assistantId
            }
        );
        
        // Process the stream of events
        await handleRunStream(runStream);
    } catch (error) {
        console.error('Error processing message:', error);
        addChatMessage('Sorry, there was an error processing your message. Please try again.', 'error');
    } finally {
        showThinkingMessage(false);
        setProcessingState(false);
    }
}

let buffer='';
//Add a message to the chat window
function addChatMessage(content, sender) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    
    // For streaming assistant messages
    if (sender === 'assistant') {
        

        // Clean up some common formatting issues
        if (typeof content === 'string') {
            
            // Look for the last assistant message to append to
            const lastAssistantMessage = messagesContainer.querySelector('.ai-message:last-of-type:not(.image-message)');
            
            // Only append to the last message if there's content
            if (lastAssistantMessage) {
                // Append to existing message for streaming effect
                buffer += content;
                const safeHtml = DOMPurify.sanitize(marked.parse(buffer));
                lastAssistantMessage.innerHTML = safeHtml;
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                return;
            }
        }
    }
    
    // For all other message types
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    if (sender === 'assistant' || sender === 'ai') {
        buffer = content
        messageElement.classList.add('ai-message');
        messageElement.classList.add('markdown');
        messageElement.textContent = content;
    } else if (sender === 'user') {
        messageElement.classList.add('user-message');
        messageElement.textContent = content;
    } else if (sender === 'system' || sender === 'error') {
        messageElement.classList.add('system-message');
        if (sender === 'error') {
            messageElement.classList.add('error-message');
        }
        messageElement.textContent = content;
    } else {
        // Default for any other sender type
        messageElement.textContent = typeof content === 'string' ? content : 'Content could not be displayed';
    }
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

//Load the system instructions file for use by the assistant
async function loadInstructions() {
    try {
        const response = await fetch('instructions.txt');
        if (!response.ok) throw new Error('Error fetching instructions file');
        return await response.text();
    } catch (error) {
        console.error("Failed to load instructions:", error);
        return "You are a helpful assistant that analyzes drone flight logs and helps troubleshoot issues.";
    }
}

//Load the assistant tools file for use by the assistant
async function loadTools(){
    const response = await fetch("assistantTools.json");
    if (!response.ok)
        throw new Error("error fetching file");
    const data = await response.json();
    if (!data)
        throw new Error("could not load assistant tools for new assistant");
    return data;
}

//Update the assistant by deleting the existing one and creating a new one
async function updateAssistant() {
    const updateBtn = document.getElementById('updateAssistantBtn');
    if (!updateBtn || !openai || !assistantId) return;
    
    try {
        // Update button state to "Updating..."
        updateBtn.textContent = "Updating...";
        updateBtn.classList.add('updating');
        updateBtn.disabled = true;
        
        // Delete the existing assistant
        await openai.beta.assistants.del(assistantId);
        console.log("Deleted assistant:", assistantId);
        
        // Reset the assistant ID
        assistantId = null;
        currentThreadId = null;
        
        // Connect again, which will create a new assistant
        await connectIfNeeded();
        
        // Update button state to "Updated"
        updateBtn.textContent = "Updated";
        updateBtn.classList.remove('updating');
        updateBtn.classList.add('updated');
        
        // Reset button after 3 seconds
        setTimeout(() => {
            updateBtn.textContent = "Update Assistant";
            updateBtn.classList.remove('updated');
            updateBtn.disabled = false;
        }, 3000);
        
    } catch (error) {
        updateBtn.textContent = "Update Failed";
        updateBtn.classList.remove('updating');
        updateBtn.classList.add('error');
        
        // Reset button after 3 seconds
        setTimeout(() => {
            updateBtn.textContent = "Update Assistant";
            updateBtn.classList.remove('error');
            updateBtn.disabled = false;
        }, 3000);
        
        addChatMessage("Failed to update the assistant: " + error.message, 'error');
    }
}

//Initialize the application once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements
    chatMessages = document.getElementById('chatMessages');
    fileInput = document.getElementById('fileInput');
    messageInput = document.getElementById('messageInput');
    sendButton = document.getElementById('sendBtn');
    fileUploadLabel = document.querySelector('.file-upload-label');
    vizArea = document.getElementById('vizArea');
    const updateBtn = document.getElementById('updateAssistantBtn');

    // Set up event listeners
    fileInput.addEventListener('change', handleFileUpload);
    sendButton.addEventListener('click', handleSendMessage);
    if (updateBtn) {
        updateBtn.addEventListener('click', updateAssistant);
    }
    messageInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });

    // Check API key and OpenAI availability
    initializeApp();
});
