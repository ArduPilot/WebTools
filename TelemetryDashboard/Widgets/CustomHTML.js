// Custom HTML widget
// Loads iframe and sends messages to it

class WidgetCustomHTML extends WidgetBase {
    constructor(options, html) {

        if (options == null) {
            options = {}
        }

        // Add info used in palette tool tip
        // This can be added manual for custom widgets by editing the JSON
        if (!("about" in options)) {
            options.about = {
                name: "Custom HTML",
                info: "Custom HTML allowing user defined HTML. User input using Formio form."
            }
        }

        super(options, true)

        // Simple example by default
        let src = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <title>Custom HTML Example</title>
</head>
<body>
    <div style="position:absolute; top:0; bottom:0; left:0; right:0; margin:10px; border:5px solid; border-radius:10px; border-color:#c8c8c8; background-color:#ffffff; padding;5px;">
        HTML Example
    </div>
</body>
<script type="module">

    let options

    function handle_MAVLink(msg) {
        // Message handling here
    }

    window.addEventListener('message', function (e) {
        const data = e.data

        // User has changed options
        if ("options" in data) {
            // Call init once we have some options
            options = data.options
        }

        // Incoming MAVLink message
        if ("MAVLink" in data) {
            handle_MAVLink(data.MAVLink)
        }

    })
</script>
</html>
`
        // Load provided html if available
        if ((options != null) && ("custom_HTML" in options)) {
            src = options.custom_HTML
        }

        // Sandboxed iframe for user content
        this.iframe = document.createElement("iframe")
        this.iframe.sandbox = 'allow-scripts'
        this.iframe.srcdoc = src
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
        options.custom_HTML = this.iframe.srcdoc
        return options
    }

    // Get edit text type
    get_edit_language() {
        return "html"
    }

    // Get text value to be edited in the editor
    get_edit_text() {
        return this.iframe.srcdoc
    }

    // Set text that has been edited by the editor
    set_edited_text(text) {
        if (this.iframe.srcdoc != text) {
            // Update change tracking
            this.changed = true
        }
        this.iframe.srcdoc = text
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
customElements.define('widget-custom-html', WidgetCustomHTML)
