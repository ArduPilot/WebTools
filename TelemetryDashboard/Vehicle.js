// Handles multiple vehicles and storing them

// Create global map vehicleMap and function to add vehicle to it
window.vehicleMap = new Map()
window.createVehicle = function (vehicle, vehicleID) {
    if (!window.vehicleMap.has(vehicleID)) {
        window.vehicleMap.set(vehicleID, vehicle)
    }
}

// Create mavVehicle class to hold vehicle info, websocket connection and handlers, and MAVLink parser
class mavVehicle {
    constructor(rowEl, id) {
        this.rowEl = rowEl; // Row element in UI which user inputs WebSocket, vehicle name and buttons
        this.id = id; // Unique vehicle ID, separate to sysID, used for vehicle and message tracking across widgets
        this.set_querySelectors();
        this.MAVLink = new MAVLink20Processor(); // Creates MAVLink processor
        this.expecting_close = false; // Triggered when user clicks disconnect
        this.been_connected = false; // Prevents multiple connections
        this.target = null; // Target WebSocket
        this.ws = null; // WebSocket
        this.colour = null; // Vehicle colour, initially randomly generated
        this.type = null; // Vehicle type set with first message
    }
    
    // Set vehicle name according to user input
    set_name() {
        this.name = this.userVehicleName.value;
    }

    // Points query selectors to respective elements in row
    set_querySelectors() {
        this.webSocketURL = this.rowEl.querySelector(`input[id="url${this.id}"]`);
        this.userVehicleName = this.rowEl.querySelector(`input[id="name${this.id}"]`);
        this.removeBtn = this.rowEl.querySelector(`input[id="remove${this.id}"]`);
        this.connectBtn = this.rowEl.querySelector(`input[id="connect${this.id}"]`);
        this.disconnectBtn = this.rowEl.querySelector(`input[id="disconnect${this.id}"]`);
    }

    // Sets the websocket to the value at the input
    set_ws() {
        this.target = this.webSocketURL.value;
        this.ws = new WebSocket(this.target);
        this.ws.binaryType = "arraybuffer";
        this.handlers();
    }

    // Defines what should happen with websocket handlers
    handlers() {

        this.ws.onopen = () => {
            console.log('ws.onopen called ' + this.target)
        }

        this.ws.onerror = (e) => {
            console.error('ws.onerror called ' + this.target, e)
            this.ws.close()
        }

        this.ws.onclose = (e) => {
            // create custom event for widgets to listen for disconnect
            const evt = new CustomEvent('vehicleDisconnect', {
                detail: { vehicleID: this.id }
            })
            
            window.dispatchEvent(evt)

            console.error('ws.onclosed called ' + this.target, e.code, e.reason)
        }

        this.ws.onmessage = (msg) => {
            // Feed data to MAVLink parser and forward messages
            for (const char of new Uint8Array(msg.data)) {
                const m = this.MAVLink.parseChar(char)
                if ((m != null) && (m._id != -1)) {
                    m._timeStamp = Date.now()
                    m._vehicleID = this.id; // Tags message with vehicleID to compare on widgets for selection
                    m._colour = this.colour; // Current vehicle colour
                    mavlinkChannel.postMessage({ MAVLink: m })
                    if (this.type == null && m._id === 0) {
                        this.type = m.type // Sets vehicle type from first message only once
                    }
                }
            }
        }
    }

    // Removing the vehicle
    remove_ws() {
        // Remove handlers and close WebSocket
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.removeEventListener('open', null);
            this.ws.removeEventListener('close', null);
            this.ws.close();
            this.ws = null;
        }

        // Remove row element from UI
        if (this.rowEl) {
            this.rowEl.remove();
            this.rowEl = null;
        }

    }

}