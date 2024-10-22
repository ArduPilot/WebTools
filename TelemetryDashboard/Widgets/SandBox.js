// Sandbox widget
// Loads iframe and sends messages to it

class WidgetSandBox extends WidgetBase {
    constructor(options) {

        if (options == null) {
            options = {}
        }

        // Add info used in palette tool tip
        // This can be added manual for custom widgets by editing the JSON
        if (!("about" in options)) {
            options.about = {
                name: "Sandbox",
                info: "Sandboxed widget allowing user defined functionality with JavaScript. User input using Formio form."
            }
        }

        super(options, true)

        // Simple example by default
        this.script_text = `// Initialization
div.appendChild(document.createTextNode("Widget Example:"))
div.appendChild(document.createElement("br"))

message_report = document.createTextNode("No Data")
div.appendChild(message_report)

// Runtime function
handle_msg = function (msg) {
    message_report.nodeValue = "Got: " + msg._name
}
`

        // Load provided script if available
        if ((options != null) && ("sandbox" in options)) {
            this.script_text = options.sandbox
        }

        // Sandboxed iframe for user content
        this.iframe = document.createElement("iframe")
        this.iframe.sandbox = 'allow-scripts'
        this.iframe.src = 'Widgets/SandBox.html'
        this.iframe.scrolling="no"
        this.iframe.style.border = "none"
        this.iframe.style.width = "100%"
        this.iframe.style.height =  "100%"
        this.iframe.style.overflow = "hidden"

        // Send over user config as soon as iframe is loaded
        this.iframe.addEventListener("load", (e) => {
            this.init()
        })

        this.appendChild(this.iframe)

    }

    // Init the iframe with the user script and options
    init() {
        if (this.iframe.contentWindow == null) {
            return
        }

        const data = {
            script: this.script_text,
            options: this.get_form_content()
        }
        this.iframe.contentWindow.postMessage(data, '*')
    }

    MAVLink_msg_handler(msg) {
        if (this.iframe.contentWindow == null) {
            return
        }
        this.iframe.contentWindow.postMessage( { MAVLink: msg }, '*')
    }

    set_edit(b) {
        super.set_edit(b)

        // Disable pointer events when editing, this allows the boxes to be dragged
        this.iframe.style.pointerEvents = this.edit_enabled ? "none" : "auto"

    }

    get_options() {
        const options = super.get_options()
        options.sandbox = this.script_text
        return options
    }

    // Get edit text type
    get_edit_language() {
        return "javascript"
    }

    // Get text value to be edited in the editor
    get_edit_text() {
        return this.script_text
    }

    // Set text that has been edited by the editor
    set_edited_text(text) {
        if (this.script_text != text) {
            // Update change tracking
            this.changed = true
        }
        this.script_text = text
        this.init()
    }

    // Clean up
    destroy() {
        this.edit_tip.destroy()
        this.removeChild(this.iframe)
        super.destroy()
    }

    // Form changed due to user input, send to iframe
    form_changed() {
        super.form_changed()
        if (this.iframe.contentWindow == null) {
            return
        }
        const data = {
            options: this.get_form_content()
        }
        this.iframe.contentWindow.postMessage(data, '*')
    }

}
customElements.define('widget-sand-box', WidgetSandBox)
