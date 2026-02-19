// Helpers to return parameter values and names

// Helper for Vector3 param names
function get_param_name_vector3(prefix) {
    return [prefix + "X", prefix + "Y", prefix + "Z"]
}

// Get Compass params names for given index
function get_compass_param_names(index) {

    let use_name = "COMPASS_USE"
    let offset = "COMPASS_OFS"
    let diagonals = "COMPASS_DIA"
    let off_diagonals = "COMPASS_ODI"
    let motor = "COMPASS_MOT"
    let scale = "COMPASS_SCALE"
    let orient = "COMPASS_ORIENT"
    let external = "COMPASS_EXTERNAL"
    let id = "COMPASS_DEV_ID"

    if (index != 1) {
        use_name += index
        offset += index
        diagonals += index
        off_diagonals += index
        motor += index
        scale += index
        orient += index
        external = "COMPASS_EXTERN" + index
        id += index
    }

    return { use: use_name,
             offsets: get_param_name_vector3(offset + "_"), 
             diagonals: get_param_name_vector3(diagonals + "_"), 
             off_diagonals: get_param_name_vector3(off_diagonals + "_"), 
             motor: get_param_name_vector3(motor + "_"),
             scale: scale,
             orientation: orient,
             external: external,
             id: id }
}

// Grab param from log
function get_param_value(param_log, name, allow_change) {
    var value
    for (let i = 0; i < param_log.Name.length; i++) {
        if (param_log.Name[i] === name) {
            const new_value = param_log.Value[i]
            if ((value != null) && (value != new_value)) {
                let msg = name + " changed from " + value + " to " + new_value
                if (allow_change === false) {
                    msg = "Ignoring param change " + msg
                    alert(msg)
                    console.log(msg)
                    return value
                }
                console.log(msg)
            }
            value = new_value
        }
    }
    return value
}

// Return a string for a given param value
function param_to_string(value)
{
    // Make sure number can be represented by 32 bit float
    const float_val = Math.fround(value)

    const significant_figures = [7,8,9]
    for (figures of significant_figures) {
        // Convert to a string with the given number of figures
        // This gives the value we want, but with trailing zeros
        const string_val = float_val.toPrecision(figures)

        // Go back to number
        const number_val = Number(string_val)
        if (float_val != Math.fround(number_val)) {
            // Did not get original value, try more digits
            continue
        }

        // Convert number back to string with no trailing zeros
        return number_val.toString()
    }

    throw new Error("Could not convert " + value.toString() + " to float string")
}

// Natural sort comparator: treats embedded numbers numerically
// Matches the sort order used by MAVProxy and Mission Planner
function natural_compare(a, b) {
    const re = /(\d+)|(\D+)/g
    const a_parts = a.match(re) || []
    const b_parts = b.match(re) || []
    const len = Math.min(a_parts.length, b_parts.length)
    for (let i = 0; i < len; i++) {
        const a_part = a_parts[i]
        const b_part = b_parts[i]
        const a_num = parseInt(a_part, 10)
        const b_num = parseInt(b_part, 10)
        if (!isNaN(a_num) && !isNaN(b_num)) {
            if (a_num !== b_num) {
                return a_num - b_num
            }
        } else {
            const cmp = a_part < b_part ? -1 : a_part > b_part ? 1 : 0
            if (cmp !== 0) {
                return cmp
            }
        }
    }
    return a_parts.length - b_parts.length
}

// Return formatted text for param download
function get_param_download_text(params)
{
    // Natural sort to match MAVProxy and Mission Planner param file ordering
    const keys = Object.keys(params).sort(natural_compare)

    let text = ""
    for (const key of keys) {
        text += key + "," + param_to_string(params[key]) + "\n";
    }
    return text
}
