import OpenAI from 'https://cdn.jsdelivr.net/npm/openai@4.85.4/+esm';

  
//constants
const TARGET_ASSISTANT_NAME = "ArduPilot Vehicle Control via MAVLink";

// global variables
let openAI = null
let assistantId = null;
let currentThreadId = null;

async function connectIfNeeded(){
    const OPENAI_API_KEY = localStorage.getItem('openai-api-key');
    if (!OPENAI_API_KEY)
        throw new Error('OpenAI API key not configured.');
    if (!openAI){
        openAI = new OpenAI({apiKey: OPENAI_API_KEY, dangerouslyAllowBrowser: true});
            if (!openAI) {
                throw new Error('Could not connect to open AI')
            }
        }
    if (!assistantId){
        assistantId = await findAssistantIdByName(TARGET_ASSISTANT_NAME);
    }
    if (!currentThreadId){
        currentThreadId = await createThread();
    }
}

async function createThread(){
    if (!assistantId)
        throw new Error("cannot create thread before initializing assistant");
    const newThread = await openAI.beta.threads.create();
    if (!newThread)
        throw new Error("something went wrong while creating thread");
    return newThread.id;
}

async function findAssistantIdByName(name) {
        if (assistantId) {
            return true
        }
        const assistants_list = await openAI.beta.assistants.list({order: "desc", limit: 20});
        let assistant = assistants_list.data.find(a => a.name === name);
        if (assistant)
            return assistant.id;
        else
            throw new Error("could not find assistant with the specified name");
}

async function sendQueryToAssistant(query){
    await connectIfNeeded();
    const message = await openAI.beta.threads.messages.create(currentThreadId, { role: "user", content: query });
    if (!message)
        throw new Error("Could not send message to assistant");
    const run = openAI.beta.threads.runs
        .stream(currentThreadId, { assistant_id: assistantId, stream: true })
        .on('messageDelta', (delta, snapshot) => {addChatMessage(snapshot.content[0].text.value, "assistant");
        })
    if (!run)
        throw new Error("Could not establish run streaming")
}


document.getElementById("ai-chat-bubble").addEventListener('click', ()=>toggleChat(true))
document.getElementById("ai-chat-close-button").addEventListener('click', ()=>toggleChat(false))
document.getElementById("ai-chat-input-area").addEventListener('submit', sendMessage)
document.getElementById('save-api-key').addEventListener('click', saveAPIKey);

function saveAPIKey(){
    const apiKey = document.getElementById('openai-api-key').value.trim();
        if (apiKey)
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
    if (!messageInput) return;

    const messageText = messageInput.value.trim();
    if (messageText) {
        addChatMessage(messageText, 'user');
        messageInput.value = '';
        addChatMessage("Thinking...", 'assistant');
        sendQueryToAssistant(messageText);
    }
}

function addChatMessage(text, sender) {
    const messagesContainer = document.querySelector('#ai-chat-window .ai-chat-messages');

    if (!messagesContainer) return;

    if (sender === "assistant") {
          let last_message = messagesContainer.querySelector(`.assistant:last-of-type`);
          if (last_message) {
              last_message.textContent = text;
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