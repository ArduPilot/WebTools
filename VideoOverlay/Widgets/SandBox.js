// Sandbox widget
// Loads iframe and sends messages to it

class WidgetSandBoxVideoOverlay extends WidgetSandBox {
    initDone

    constructor(options) {

        if (options == null) {
            options = {}
        }

        if (options?.sandbox == null) {
            options.sandbox = `// Initialization
div.appendChild(document.createTextNode("Widget Example:"))
div.appendChild(document.createElement("br"))

message_report = document.createTextNode("No Log")
div.appendChild(message_report)

div.appendChild(document.createElement("br"))

logTime = document.createTextNode("")
div.appendChild(logTime)

// Load function
loadLog = function (log) {
    message_report.nodeValue = "Got log starting at: " + log.extractStartTime()
}

// Runtime function
setTime = function(time) {
    logTime.nodeValue = "Log Time: " + time.toFixed(2)
}
`
        }

        super(options, true)

        // Sandboxed iframe for user content
        this.iframe.src = 'Widgets/SandBox.html'

        // Send over user config as soon as iframe is loaded
        this.initDone = new Promise((resolve) => {
            this.iframe.addEventListener("load", (e) => {
                this.init()
                resolve()
            })
        })

    }

    getContentForRender(parentsBB) {
        const BB = this.getBoundingClientRect()
        return [{
            pos: { 
                x: BB.x - parentsBB.x,
                y: BB.y - parentsBB.y,
                height: BB.height, 
                width: BB.width
            },
            content: this.iframe.contentDocument.body
        }]
    }

    loadLog() {
        if (log == null) {
            return
        }
        const data = { logData: log.buffer }
        this.initDone.then(() => {
            this.iframe.contentWindow.postMessage(data, '*')
        })
    }

    form_changed() {
        super.form_changed()
        this.loadLog(log)
    }

    set_edited_text(text) {
        super.set_edited_text(text)
        this.loadLog(log)
    }

    setTime(time) {
        if (this.iframe.contentWindow == null) {
            return Promise.resolve()
        }

        return new Promise((resolve) => {

            const contentWindow = this.iframe.contentWindow

            const messageHandler = function(event) {
                // Make sure the event is for us
                if (event.source !== contentWindow) { 
                    return
                }

                // Make sure its the correct message
                if (event.data !== "renderDone") {
                    return
                }

                // Remove self
                window.removeEventListener('message', messageHandler);

                // Done
                resolve()
            }
            window.addEventListener('message', messageHandler);

            contentWindow.postMessage({ time }, '*')
        })
    }
}
customElements.define('widget-sand-box-video-overlay', WidgetSandBoxVideoOverlay)
