// setup connection to vehicle given a url and connection/disconnection callback function
// this handles WebSocket and incoming MAVLink
function setup_connect(url_input, connection_callback_fn) {

    // websocket object
    let ws = null
    let expecting_close = false
    let been_connected = false

    // Connect to WebSocket server
    function connect(target, auto_connect) {
        // Make sure we are not connected to something else
        disconnect()

        // temporarily show connected
        connection_callback_fn(true)

        // True if we have ever been connected
        been_connected = false

        ws = new WebSocket(target)
        ws.binaryType = "arraybuffer"

        expecting_close = false

        ws.onopen = () => {
            // have been connected
            been_connected = true
            connection_callback_fn(true)
        }

        ws.onclose = () => {
            // set disconnectded
            connection_callback_fn(false)
        }

        ws.onerror = (e) => {
            console.log(e)
            ws.close()
        }

        ws.onmessage = (msg) => {
            // Feed data to MAVLink parser and forward messages
            for (const char of new Uint8Array(msg.data)) {
                const m = MAVLink.parseChar(char)
                if ((m != null) && (m._id != -1)) {
                    // Got message with known ID
                    // Sent to each Widget
                    for (const widget of grid.getGridItems()) {
                        widget.MAVLink_msg_handler(m)
                    }
                    for (const widget of test_grid.getGridItems()) {
                        widget.MAVLink_msg_handler(m)
                    }
                }
            }
        }

    }

    // Disconnect from WebSocket server
    function disconnect() {
        // close socket
        if (ws != null) {
            expecting_close = true
            ws.close()
        }

        // enable connect
        connection_callback_fn(false)
    }

    connect_button.onclick = () => {
        const in_progress = (ws != null) && ((ws.readyState == WebSocket.CONNECTING) || (ws.readyState == WebSocket.CLOSING))
        if (in_progress) {
            // Don't do anything if the socket is connecting or closing a connection
            return
        }

        if (!url_input.checkValidity()) {
            // invalid address, re-fire the tip and focus the url
            // url_input.focus()
            return
        }

        connect(url_input)
    }

    // Try auto connecting to MissionPlanner
    connect("ws://127.0.0.1:56781", true)
}
