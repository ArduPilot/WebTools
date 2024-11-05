// Useful functions that are used by multiple tools

// Get firmware version and board details
function get_version_and_board(log) {

    let flight_controller
    let board_id
    let fw_string
    let fw_hash
    let os_string
    let build_type
    let filter_version

    if ('VER' in log.messageTypes) {
        const VER = log.get("VER")

        // Assume version does not change, just use first msg
        fw_string = VER.FWS[0]
        fw_hash = VER.GH[0].toString(16).padStart(8, '0')
        if (VER.APJ[0] != 0) {
            board_id = VER.APJ[0]
        }
        if ("BU" in VER) {
            build_type = VER.BU[0]
        }
        if ("FV" in VER) {
            filter_version = VER.FV[0]
        }
    }

    if ('MSG' in log.messageTypes) {
        const MSG = log.get("MSG")
        // Look for firmware string in MSGs, this marks the start of the log start msgs
        // The subsequent messages give more info, this is a bad way of doing it
        const len = MSG.Message.length
        for (let i = 0; i < len - 3; i++) {
            const msg = MSG.Message[i]
            if ((fw_string != null) && (fw_string != msg)) {
                continue
            }
            if (!MSG.Message[i+3].startsWith("Param space used:")) {
                // Check we have bracketed the messages we need
                continue
            }
            if (fw_string == null) {
                const build_types = {
                    ArduRover: 1,
                    ArduCopter: 2,
                    ArduPlane: 3,
                    AntennaTracker: 4,
                    ArduSub: 7,
                    Blimp: 12,
                }
                let types = []
                for (const type of Object.keys(build_types)) {
                    types.push("(?:" + type + ")")
                }
                const regex = new RegExp("(" + types.join("|") + ").+\\((.+)\\)", 'g')
                const found = regex.exec(MSG.Message[i])
                if (found == null) {
                    continue
                }
                fw_string = found[0]
                build_type = build_types[found[1]]
                fw_hash = found[2]
            }
            os_string = MSG.Message[i+1]
            flight_controller = MSG.Message[i+2]
            break
        }
    }

    return {
        flight_controller,
        board_id,
        fw_string,
        fw_hash,
        os_string,
        build_type,
        filter_version
    }
}

// Take all log and return array of available base message types (no instances)
function get_base_log_message_types(log) {
    let all_types = Object.keys(log.messageTypes)
    let base_types = []
    for (const type of all_types) {
        if (/.+\[.+\]/gm.test(type) ) {
            // Discard instance messages
            continue
        }
        base_types.push(type)
    }
    return base_types
}
