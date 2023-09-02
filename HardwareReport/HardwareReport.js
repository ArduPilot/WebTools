
var DataflashParser
import('../JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

var octokitRequest
import('https://esm.sh/@octokit/request').then((mod) => { octokitRequest = mod.request });

async function check_release(hash, paragraph) {
    paragraph.appendChild(document.createElement("br"))

    let request
    try {
        // Get all tags from AP repo
        request = await octokitRequest('GET /repos/:owner/:repo/git/refs/tags', {
            owner: 'ArduPilot',
            repo: 'ardupilot',
            headers: {
            'X-GitHub-Api-Version': '2022-11-28'
            }
        })
    }
    catch(err) {
        paragraph.appendChild(document.createTextNode("Version check failed to get whitelist"))
        return
    }

    const tags = request.data

    // Search tags for matching hash
    let found_tag = false
    for (tag of tags) {
        if (tag.object.sha.startsWith(hash)) {
            // Add link to tag
            if (found_tag) {
                paragraph.appendChild(document.createTextNode(", "))
            } else {
                paragraph.appendChild(document.createTextNode("Official release:"))
                paragraph.appendChild(document.createElement("br"))
            }
            found_tag = true

            const tag_name = tag.ref.replace(/^(refs\/tags\/)/gm,"")

            let link = document.createElement("a")
            link.href = "https://github.com/ArduPilot/ardupilot/tree/" + tag_name
            link.innerHTML = tag_name
            paragraph.appendChild(link)

        }
    }

    // On a release tag, don't search and deeper
    if (found_tag) {
        return
    }

    // Note that dev builds from master don't have tags, so will get this warning
    paragraph.appendChild(document.createTextNode("Warning: not official firmware release"))
    paragraph.appendChild(document.createElement("br"))

    // Try and find hash in AP repo, this should find dev builds
    try {
        request = await octokitRequest('GET /repos/:owner/:repo/commits/' + hash, {
            owner: 'ArduPilot',
            repo: 'ardupilot',
            headers: {
            'X-GitHub-Api-Version': '2022-11-28'
            }
        })
    }
    catch(err) {
        paragraph.appendChild(document.createTextNode("Version check failed to get commit"))
        return
    }

    const sha = request.data.sha

    paragraph.appendChild(document.createTextNode("Found commit: "))

    let link = document.createElement("a")
    link.href = request.data.html_url
    link.innerHTML = sha
    paragraph.appendChild(link)

    paragraph.appendChild(document.createElement("br"))

    // Branches with this commit as head
    try {
        request = await octokitRequest('GET /repos/{owner}/{repo}/commits/{commit_sha}/branches-where-head', {
            owner: 'ArduPilot',
            repo: 'ardupilot',
            commit_sha: sha,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          })
    }
    catch(err) {
        paragraph.appendChild(document.createTextNode("Version check failed to get branches"))
        return
    }


    if (request.data.length > 0) {
        paragraph.appendChild(document.createTextNode("Branches @ HEAD: "))

        let found_branch = false
        for (branch of request.data) {
            if (found_branch) {
                paragraph.appendChild(document.createTextNode(", "))
            }

            let link = document.createElement("a")
            link.href = "https://github.com/ArduPilot/ardupilot/tree/" + branch.name
            link.innerHTML = branch.name
            paragraph.appendChild(link)

            found_branch = true
        }

        return
    }

    // Could check if commit is in the history of some branch, maybe just master?


}

// Print device type from DEVID using two lines
function print_device(parent, id) {
    if (id == null) {
        return
    }
    if (id.bus_type_index == 3) {
        // DroneCAN
        parent.appendChild(document.createTextNode(id.bus_type + " bus: " + id.bus + " node id: " + id.address + " sensor: " + id.sensor_id))
        parent.appendChild(document.createElement("br"))
        if (can[id.address] != null) {
            parent.appendChild(document.createTextNode("Name: " + can[id.address].name))
        }
    } else {
        parent.appendChild(document.createTextNode(id.name + " via " + id.bus_type))
        parent.appendChild(document.createElement("br"))
    }
}

// Helper for Vector3 param names
function get_param_name_vector3(prefix) {
    return [prefix + "X", prefix + "Y", prefix + "Z"]
}

// Helper to get array param values in array
function get_param_array(params, names) {
    let ret = []
    for (const name of names) {
        ret.push(params[name])
    }
    return ret
}

// Helper to tell if vector value has been set
function param_array_configured(val, default_val) {
    for (let i = 0; i < val.length; i++) {
        if (val[i] != default_val) {
            return true
        }
    }
    return false
}

// Load INS params
function get_ins_param_names(index) {
    index += 1

    let prefix = "INS"
    if (index > 3) {
        prefix += index
    }

    let num = ""
    if (index < 4) {
        num = String(index)
    }
    const full_num = num
    if (index == 1) {
        num = ""
    }

    const gyro_prefix = prefix + "_GYR" + num
    let gyro = { offset: get_param_name_vector3(gyro_prefix + "OFFS_"),
                 id: gyro_prefix + "_ID",
                 cal_temp: prefix + "_GYR" + full_num + "_CALTEMP" }

    const acc_prefix = prefix + "_ACC" + num
    let accel = { offset: get_param_name_vector3(acc_prefix + "OFFS_"),
                  scale: get_param_name_vector3(acc_prefix + "SCAL_"),
                  id: acc_prefix + "_ID",
                  cal_temp: prefix + "_ACC" + full_num + "_CALTEMP" }

    const tcal_prefix = prefix + "_TCAL" + full_num + "_"
    let tcal = { enabled: tcal_prefix + "ENABLE",
                 t_min: tcal_prefix + "TMIN",
                 t_max: tcal_prefix + "TMAN",
                 accel: [ get_param_name_vector3(tcal_prefix + "ACC1_"), 
                          get_param_name_vector3(tcal_prefix + "ACC2_"),
                          get_param_name_vector3(tcal_prefix + "ACC3_")],
                 gyro: [ get_param_name_vector3(tcal_prefix + "ACC1_"), 
                         get_param_name_vector3(tcal_prefix + "ACC2_"),
                         get_param_name_vector3(tcal_prefix + "ACC3_")],
                }

    return { gyro: gyro, accel: accel, tcal: tcal,
             pos: get_param_name_vector3(prefix + "_POS" + full_num + "_"),
             use: prefix + "_USE" + num }

}

let ins
const max_num_ins = 5
function load_ins(log) {

    function get_instance(params, index) {
        const names = get_ins_param_names(index)

        if (!(names.gyro.id in params) && !(names.accel.id in params)) {
            // Could not find params for this instance
            return null
        }
        if ((params[names.gyro.id] == 0) && (params[names.accel.id] == 0)) {
            return null
        }

        const accel_offsets = get_param_array(params, names.accel.offset)
        const accel_scale = get_param_array(params, names.accel.offset)
        const gyro_offsets = get_param_array(params, names.gyro.offset)

        let accel_temp_cal = false
        let gyro_temp_cal = false
        if (params[names.tcal.enabled] > 0) {
            for (let i = 0; i < 3; i++) {
                const accel_coefficients = get_param_array(params, names.tcal.accel[i])
                accel_temp_cal |= param_array_configured(accel_coefficients, 0.0)

                const gyro_coefficients = get_param_array(params, names.tcal.gyro[i])
                gyro_temp_cal |= param_array_configured(gyro_coefficients, 0.0)
            }
        }

        return { gyro_id: params[names.gyro.id],
                 acc_id: params[names.accel.id],
                 pos: get_param_array(params, names.pos),
                 use: params[names.use],
                 acc_cal: param_array_configured(accel_offsets, 0.0) | param_array_configured(accel_scale, 1.0),
                 gyro_cal: param_array_configured(gyro_offsets, 0.0),
                 acc_temp_cal: accel_temp_cal,
                 gyro_temp_cal: gyro_temp_cal  }
    }

    for (let i = 0; i < max_num_ins; i++) {
        ins[i] = get_instance(params, i)
    }
    if (log != null) {
        log.parseAtOffset("IMU")
        let found_instance = false
        for (let i = 0; i < max_num_ins; i++) {
            if (ins[i] != null) {
                const name = "IMU[" + i + "]"
                if ((name in log.messages) && (Object.keys(log.messages[name]).length > 0)) {
                    found_instance = true
                    ins[i].acc_all_healthy = array_all_equal(log.messages[name].AH, 1)
                    ins[i].gyro_all_healthy = array_all_equal(log.messages[name].GH, 1)
                }
            }
        }
        if (!found_instance && (Object.keys(log.messages.IMU).length > 0)) {
            const instance = log.messages.IMU.I[0]
            if (ins[instance] != null) {
                ins[instance].acc_all_healthy = array_all_equal(log.messages.IMU.AH, 1)
                ins[instance].gyro_all_healthy = array_all_equal(log.messages.IMU.GH, 1)
            }
        }
    }

    function print_ins(inst, params) {
        let fieldset = document.createElement("fieldset")

        let heading = document.createElement("legend")
        heading.innerHTML = "IMU " + inst
        fieldset.appendChild(heading)

        if (params.gyro_id == params.acc_id) {
            // Combined gyro and accel
            const id = decode_devid(params.gyro_id, DEVICE_TYPE_IMU)
            print_device(fieldset, id)
        } else {
            fieldset.appendChild(document.createTextNode("Gyro: "))
            const gyro_id = decode_devid(params.gyro_id, DEVICE_TYPE_IMU)
            print_device(fieldset, gyro_id)

            fieldset.appendChild(document.createElement("br"))
            fieldset.appendChild(document.createTextNode("Accel: "))
            const accel_id = decode_devid(params.acc_id, DEVICE_TYPE_IMU)
            print_device(fieldset, accel_id)
        }

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Use: " + (params.use ? "\u2705" : "\u274C")))

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Accel calibration: " + (params.acc_cal ? "\u2705" : "\u274C")))

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Gyro calibration: " + (params.gyro_cal ? "\u2705" : "\u274C")))

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Accel temperature calibration: " + (params.acc_temp_cal ? "\u2705" : "\u274C")))

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Gyro temperature calibration: " + (params.gyro_temp_cal ? "\u2705" : "\u274C")))

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Position offset: " + (param_array_configured(params.pos, 0.0) ? "\u2705" : "\u274C")))

        if ("acc_all_healthy" in params) {
            fieldset.appendChild(document.createElement("br"))
            fieldset.appendChild(document.createTextNode("Accel health: " + (params.gyro_all_healthy ? "\u2705" : "\u274C")))
        }

        if ("acc_all_healthy" in params) {
            fieldset.appendChild(document.createElement("br"))
            fieldset.appendChild(document.createTextNode("Gyro health: " + (params.acc_all_healthy ? "\u2705" : "\u274C")))
        }

        return fieldset
    }

    let ins_section = document.getElementById("INS")

    let table = document.createElement("table")
    ins_section.appendChild(table)

    for (let i = 0; i < ins.length; i++) {
        if (ins[i] != null) {
            ins_section.hidden = false
            ins_section.previousElementSibling.hidden = false
            let colum = document.createElement("td")

            colum.appendChild(print_ins(i+1, ins[i]))
            table.appendChild(colum)
        }
    }
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
        external += index
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

let compass
function load_compass(log) {

    function get_instance(params, prio_id_name) {
        if (!(prio_id_name in params) || (params[prio_id_name] == 0)) {
            // invalid or missing id
            return null
        }
        const id = params[prio_id_name]

        // find the compass index matching this ID
        let index
        for (let i = 1; i <= 3; i++) {
            let dev_id_name = "COMPASS_DEV_ID"
            if (i != 1) {
                dev_id_name += i
            }
            if ((dev_id_name in params) && (params[dev_id_name] == id)) {
                index = i
                break
            }
        }
        if (index == null) {
            return null
        }

        const names = get_compass_param_names(index)

        const offsets = get_param_array(params, names.offsets)
        const diagonals = get_param_array(params, names.diagonals)
        const off_diagonals = get_param_array(params, names.off_diagonals)
        const motor = get_param_array(params, names.motor)

        return { id: id,
                 use: params[names.use],
                 offsets_set: param_array_configured(offsets, 0.0),
                 matrix_set: param_array_configured(diagonals, 1.0) | param_array_configured(off_diagonals, 0.0),
                 motor_set: param_array_configured(motor, 0.0),
                 full_inst: true }
    }

    compass[0] = get_instance(params, "COMPASS_PRIO1_ID")
    compass[1] = get_instance(params, "COMPASS_PRIO2_ID")
    compass[2] = get_instance(params, "COMPASS_PRIO3_ID")
    for (let i = 3; i < 7; i++) {
        const dev_id_name = "COMPASS_DEV_ID" + (i+1)
        if (dev_id_name in params) {
            const id = params[dev_id_name]
            if (id != 0) {
                compass[i] = { id: id, full_inst: false }
            }
        }
    }

    if (log != null) {
        log.parseAtOffset("MAG")
        let found_instance = false
        for (let i = 0; i < 3; i++) {
            if (compass[i] != null) {
                const name = "MAG[" + i + "]"
                if ((name in log.messages) && (Object.keys(log.messages[name]).length > 0)) {
                    found_instance = true
                    compass[i].all_healthy = array_all_equal(log.messages[name].Health, 1)
                }
            }
        }
        if (!found_instance && (Object.keys(log.messages.MAG).length > 0)) {
            const instance = log.messages.MAG.I[0]
            if (compass[instance] != null) {
                compass[instance].all_healthy = array_all_equal(log.messages.MAG.Health, 1)
            }
        }
    }

    function print_compass(inst, params) {
        let fieldset = document.createElement("fieldset")

        let heading = document.createElement("legend")
        heading.innerHTML = "Compass " + inst
        fieldset.appendChild(heading)

        const id = decode_devid(params.id, DEVICE_TYPE_COMPASS)
        print_device(fieldset, id)

        if (!params.full_inst) {
            return fieldset
        }

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Use: " + (params.use ? "\u2705" : "\u274C")))

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Calibrated: " + (params.offsets_set ? "\u2705" : "\u274C")))

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Iron calibration: " + (params.matrix_set ? "\u2705" : "\u274C")))

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Motor calibration: " + (params.motor_set ? "\u2705" : "\u274C")))

        if ("all_healthy" in params) {
            fieldset.appendChild(document.createElement("br"))
            fieldset.appendChild(document.createTextNode("Health: " + (params.all_healthy ? "\u2705" : "\u274C")))
        }

        return fieldset
    }

    let section = document.getElementById("COMPASS")

    section.appendChild(document.createTextNode("Enabled: " + (params["COMPASS_ENABLE"] ? "\u2705" : "\u274C")))
    section.appendChild(document.createElement("br"))
    section.appendChild(document.createElement("br"))

    let table = document.createElement("table")
    section.appendChild(table)
    for (let i = 0; i < compass.length; i++) {
        if (compass[i] != null) {
            section.hidden = false
            section.previousElementSibling.hidden = false
            let colum = document.createElement("td")

            colum.appendChild(print_compass(i+1, compass[i]))
            table.appendChild(colum)
        }
    }
}

// Load baro params
function get_baro_param_names(index) {
    const prefix = "BARO" + (index+1) + "_"
    const wind_cmp =  prefix + "WCF_"

    return { id: prefix + "DEVID", 
             gnd_press: prefix + "GND_PRESS",
             wind_comp: { enabled: wind_cmp + "ENABLE", 
                          coefficients: [ wind_cmp + "FWD",
                                          wind_cmp + "BCK",
                                          wind_cmp + "RGT",
                                          wind_cmp + "LFT",
                                          wind_cmp + "UP",
                                          wind_cmp + "DN"], } }
}

let baro
function load_baro(log) {

    for (let i = 0; i < 3; i++) {
        const names = get_baro_param_names(i)
        if (names.id in params) {
            const id = params[names.id]
            if (id == 0) {
                continue
            }
            let wind_comp_en = false
            if (params[names.wind_comp.enabled] > 0) {
                let wind_comp = get_param_array(names.wind_comp.coefficients)
                if (param_vector_configured(wind_comp, 0.0)) {
                    wind_comp_en = true
                }
            }
            baro[i] = { id: id, wind_cmp: wind_comp_en }
        }
    }

    if (log != null) {
        log.parseAtOffset("BARO")
        let found_instance = false
        for (let i = 0; i < 3; i++) {
            if (compass[i] != null) {
                const name = "BARO[" + i + "]"
                if ((name in log.messages) && (Object.keys(log.messages[name]).length > 0)) {
                    found_instance = true
                    baro[i].all_healthy = array_all_equal(log.messages[name].Health, 1)
                }
            }
        }
        if (!found_instance && (Object.keys(log.messages.BARO).length > 0)) {
            const instance = log.messages.BARO.I[0]
            if (baro[instance] != null) {
                baro[instance].all_healthy = array_all_equal(log.messages.BARO.Health, 1)
            }
        }
    }

    function print_baro(inst, params) {
        let fieldset = document.createElement("fieldset")

        let heading = document.createElement("legend")
        heading.innerHTML = "Barometer " + inst
        fieldset.appendChild(heading)

        const id = decode_devid(params.id, DEVICE_TYPE_BARO)
        print_device(fieldset, id)

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Wind compensation: " + (params.wind_cmp ? "\u2705" : "\u274C")))

        if ("all_healthy" in params) {
            fieldset.appendChild(document.createElement("br"))
            fieldset.appendChild(document.createTextNode("Health: " + (params.all_healthy ? "\u2705" : "\u274C")))
        }

        return fieldset
    }

    let section = document.getElementById("BARO")

    let primary = params["BARO_PRIMARY"]
    section.appendChild(document.createTextNode("Primary: " + (primary+1)))
    section.appendChild(document.createElement("br"))
    section.appendChild(document.createElement("br"))

    let table = document.createElement("table")
    section.appendChild(table)

    let have_section = false
    for (let i = 0; i < baro.length; i++) {
        if (baro[i] != null) {
            have_section = true
            let colum = document.createElement("td")

            colum.appendChild(print_baro(i+1, baro[i]))
            table.appendChild(colum)
        }
    }

    section.previousElementSibling.hidden = !have_section
    section.hidden = !have_section
}

// Load airspeed params
function get_airspeed_param_names(index) {
    let num = String(index + 1)
    let tube_order_postfix = "TUBE_ORDR"
    if (index == 0) {
        num = ""
        tube_order_postfix = "TUBE_ORDER"
    }
    const prefix = "ARSPD" + num + "_"

    return { id: prefix + "DEVID", 
             type: prefix + "TYPE",
             bus: prefix + "BUS",
             pin: prefix + "PIN",
             psi_range: prefix + "PSI_RANGE",
             tube_order: prefix + tube_order_postfix,
             skip_cal: prefix + "SKIP_CAL",
             use: prefix + "USE",
             offset: prefix + "OFFSET",
             ratio: prefix + "RATIO",
             auto_cal: prefix + "AUTOCAL"}

}

let airspeed
function load_airspeed(log) {

    for (let i = 0; i < 2; i++) {
        const names = get_airspeed_param_names(i)
        if (names.id in params) {
            const id = params[names.id]
            if (id == 0) {
                continue
            }
            airspeed[i] = { id: id, use: params[names.use] }
        }
    }

    if (log != null) {
        log.parseAtOffset("ARSP")
        let found_instance = false
        for (let i = 0; i < 2; i++) {
            if (airspeed[i] != null) {
                const name = "ARSP[" + i + "]"
                if ((name in log.messages) && (Object.keys(log.messages[name]).length > 0)) {
                    found_instance = true
                    airspeed[i].all_healthy = array_all_equal(log.messages[name].H, 1)
                }
            }
        }
        if (!found_instance && (Object.keys(log.messages.ARSP).length > 0)) {
            const instance = log.messages.ARSP.I[0]
            if (airspeed[instance] != null) {
                airspeed[instance].all_healthy = array_all_equal(log.messages.ARSP.H, 1)
            }
        }
    }

    function print_airspeed(inst, params) {
        let fieldset = document.createElement("fieldset")

        let heading = document.createElement("legend")
        heading.innerHTML = "Airspeed " + inst
        fieldset.appendChild(heading)

        const id = decode_devid(params.id, DEVICE_TYPE_AIRSPEED)
        print_device(fieldset, id)

        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Use: " + (params.use ? "\u2705" : "\u274C")))

        if ("all_healthy" in params) {
            fieldset.appendChild(document.createElement("br"))
            fieldset.appendChild(document.createTextNode("Health: " + (params.all_healthy ? "\u2705" : "\u274C")))
        }

        return fieldset
    }

    let section = document.getElementById("ARSPD")

    let primary = params["ARSPD_PRIMARY"]
    section.appendChild(document.createTextNode("Primary: " + (primary+1)))
    section.appendChild(document.createElement("br"))
    section.appendChild(document.createElement("br"))

    let table = document.createElement("table")
    section.appendChild(table)

    let have_section = false
    for (let i = 0; i < airspeed.length; i++) {
        if (airspeed[i] != null) {
            have_section = true

            let colum = document.createElement("td")

            colum.appendChild(print_airspeed(i+1, airspeed[i]))
            table.appendChild(colum)
        }
    }

    section.previousElementSibling.hidden = !have_section
    section.hidden = !have_section
}

// Load GPS
let gps
const max_num_gps = 2
function load_gps() {

    for (let i = 0; i < max_num_gps; i++) {
        let index = String(i+1)
        if (i == 0) {
            index = ""
        }
        const type_name = "GPS_TYPE" + index
        if (type_name in params) {
            const type = params[type_name]
            if (type != 0) {
                const pos_names = get_param_name_vector3("GPS_POS" + (i+1) + "_")
                gps[i] = { type: type,
                           pos: get_param_array(params, pos_names),
                           node_id: params["GPS_CAN_NODEID" + (i+1)] }
            }
        }
    }

}

// Load Rangefinder
let rangefinder
const max_num_rangefinder = 10
function load_rangefinder() {

    for (let i = 0; i < max_num_rangefinder; i++) {
        let index = String(i+1)
        if (i == 9) {
            index = "A"
        }
        const prefix = "RNGFND" + index + "_"
        const type_name = prefix + "TYPE"
        if (type_name in params) {
            const type = params[type_name]
            if (type != 0) {
                const pos_prefix = prefix + "POS"
                rangefinder[i] = { type: type,
                                   pos: get_param_vector(params, pos_prefix) }
            }
        }
    }

}

// load flow
let flow
const max_num_flow = 1
function load_flow() {

    const prefix = "FLOW_"
    const type_name = prefix + "TYPE"
    if (type_name in params) {
        const type = params[type_name]
        if (type != 0) {
            const pos_prefix = prefix + "POS"
            flow[0] = { type: type,
                        pos: get_param_vector(params, pos_prefix) }
        }
    }

}

// load VISO
let viso
const max_num_viso = 1
function load_flow() {

    const prefix = "VISO_"
    const type_name = prefix + "TYPE"
    if (type_name in params) {
        const type = params[type_name]
        if (type != 0) {
            viso[0] = { type: type,
                        pos: get_param_vector(params, pos_prefix) }
        }
    }

}


function update_pos_plot() {
    let max_offset = 0
    let plot_index = 1

    function set_plot_data(plot_data, pos_inst, max_offset) {
        if (pos_inst == null) {
            return max_offset
        }
        plot_data.x = [pos_inst.pos[0]]
        plot_data.y = [pos_inst.pos[1]]
        plot_data.z = [pos_inst.pos[2]]
        plot_data.visible = true
        return Math.max(max_offset, Math.abs(pos_inst.pos[0]), Math.abs(pos_inst.pos[1]), Math.abs(pos_inst.pos[2]))
    }

    for (let i = 0; i < max_num_ins; i++) {
        max_offset = set_plot_data(Sensor_Offset.data[plot_index], ins[i], max_offset)
        plot_index++
    }

    for (let i = 0; i < max_num_gps; i++) {
        max_offset = set_plot_data(Sensor_Offset.data[plot_index], gps[i], max_offset)
        plot_index++
    }

    for (let i = 0; i < max_num_rangefinder; i++) {
        max_offset = set_plot_data(Sensor_Offset.data[plot_index], rangefinder[i], max_offset)
        plot_index++
    }

    for (let i = 0; i < max_num_flow; i++) {
        max_offset = set_plot_data(Sensor_Offset.data[plot_index], flow[i], max_offset)
        plot_index++
    }

    for (let i = 0; i < max_num_viso; i++) {
        max_offset = set_plot_data(Sensor_Offset.data[plot_index], viso[i], max_offset)
        plot_index++
    }

    let plot = document.getElementById("POS_OFFSETS")
    const have_plot = max_offset > 0
    if (have_plot) {
        Sensor_Offset.layout.scene.xaxis.range = [ -max_offset,  max_offset ]
        Sensor_Offset.layout.scene.yaxis.range = [  max_offset, -max_offset ]
        Sensor_Offset.layout.scene.zaxis.range = [  max_offset, -max_offset ]

        Plotly.redraw(plot)
    }

    plot.previousElementSibling.hidden = !have_plot
    plot.hidden = !have_plot

}

function update_minimal_config() {

    if (Object.keys(params).length == 0) {
        return
    }
    document.forms["params"].hidden = false
    document.forms["params"].previousElementSibling.hidden = false
    document.forms["params"].previousElementSibling.previousElementSibling.hidden = false
    document.getElementById("SaveMinimalParams").hidden = false
    document.getElementById("ParametersHeading").hidden = false

    const changed = document.getElementById("param_base_changed").checked

    let inputs = document.forms["params"].getElementsByTagName("input");
    for (let input of inputs) {
        const input_params = input.getAttribute("data-params").split(',')

        let present_params = []
        for (const param of input_params) {
            if ((param in params) &&
                !(changed && (param in defaults) && (params[param] == defaults[param]))) {
                present_params.push(param)
            }
        }

        const has_params = present_params.length > 0
        input.disabled = !has_params
        if (!has_params) {
            input.checked = false
        }

        const title_string = present_params.join([separator = ', '])
        input.setAttribute('title', title_string)

        let label = input.labels[0]
        label.setAttribute('title', title_string)
    }
}

function load_params(log) {
    load_ins(log)
    load_compass(log)
    load_baro(log)
    load_airspeed(log)
    load_gps()
    load_flow()

    update_minimal_config()

    update_pos_plot()
}

function load_param_file(text) {
    var lines = text.split('\n')
    params = {}
    for (i in lines) {
        var line = lines[i];
        v = line.split(/[\s,=\t]+/)
        if (v.length >= 2) {
            var name = v[0]
            var value = v[1]
            params[name] = parseFloat(value)
        }
    }

    load_params()

}

let can
function load_can(can_msgs) {

    function add_msg(msg) {
        can[msg.NodeId] = { name: msg.Name, 
                                version: msg.Major + "." + msg.Minor }
    }

    if (Array.isArray(can_msgs)) {
        for (const can_msg of can_msgs) {
            add_msg(can_msg)
        }
    } else {
        add_msg(can_msgs)
    }

    function print_can(inst, info) {

        let fieldset = document.createElement("fieldset")

        let heading = document.createElement("legend")
        heading.innerHTML = "Node id " + inst
        fieldset.appendChild(heading)

        fieldset.appendChild(document.createTextNode("Name: " + info.name))
        fieldset.appendChild(document.createElement("br"))
        fieldset.appendChild(document.createTextNode("Firmware version: " + info.version))

        return fieldset
    }

    let section = document.getElementById("DroneCAN")
    let table = document.createElement("table")
    section.appendChild(table)

    let have_section = false
    for (let i = 0; i < can.length; i++) {
        if (can[i] != null) {
            have_section = true
            let colum = document.createElement("td")

            colum.appendChild(print_can(i, can[i]))
            table.appendChild(colum)
        }
    }

    section.previousElementSibling.hidden = !have_section
    section.hidden = !have_section
}

let params = {}
let defaults = {}
function load_log(log_file) {
    let log = new DataflashParser()
    log.processData(log_file, ['PARM', 'CAND', 'VER', 'MSG', 'HEAT', 'POWR', 'MCU', 'IMU', 'PM', 'STAK'])

    if (('CAND' in log.messages) && (Object.keys(log.messages.CAND).length > 0)) {
        load_can(log.messages.CAND)
        delete log.messages.CAND
    }

    for (let i = 0; i < log.messages.PARM.Name.length; i++) {
        params[log.messages.PARM.Name[i]] = log.messages.PARM.Value[i]
        const default_val = log.messages.PARM.Default[i]
        if (!isNaN(default_val)) {
            defaults[log.messages.PARM.Name[i]] = default_val
        }
    }
    delete log.messages.PARM

    if (Object.keys(params).length > 0) {
        document.getElementById("SaveAllParams").hidden = false
    }
    if (Object.keys(defaults).length > 0) {
        document.getElementById("SaveChangedParams").hidden = false
        document.getElementById("param_base_changed").disabled = false
        document.getElementById("param_base_changed").checked = true
    }

    load_params(log)

    const have_msg = ('MSG' in log.messages) && (Object.keys(log.messages.MSG).length > 0)
    let flight_controller = null
    let board_id = null

    if (('VER' in log.messages) && (Object.keys(log.messages.VER).length > 0)) {
        // Assume version does not change, just use first msg
        const fw_string = log.messages.VER.FWS[0]
        const hash = log.messages.VER.GH[0].toString(16)
        board_id = log.messages.VER.APJ[0]
        delete log.messages.VER

        let section = document.getElementById("VER")
        section.hidden = false
        section.previousElementSibling.hidden = false
        section.appendChild(document.createTextNode(fw_string))

        if (have_msg) {
            // Look for firmware string in MSGs, this marks the start of the log start msgs
            // The subsequent messages give more info, this is a bad way of doing it
            const len = log.messages.MSG.Message.length
            for (let i = 0; i < log.messages.MSG.Message.length - 3; i++) {
                const msg = log.messages.MSG.Message[i]
                if (fw_string != msg) {
                    continue
                }
                if (!log.messages.MSG.Message[i+3].startsWith("Param space used:")) {
                    // Check we have bracketed the messages we need
                    continue
                }
                section.appendChild(document.createElement("br"))
                section.appendChild(document.createTextNode(log.messages.MSG.Message[i+1]))
                flight_controller = log.messages.MSG.Message[i+2]
                break
            }
        }

        check_release(hash, section)

    }

    if ((flight_controller != null) || (board_id != null)) {
        let section = document.getElementById("FC")
        section.hidden = false
        section.previousElementSibling.hidden = false
        if (flight_controller != null) {
            // Print name given in log
            section.appendChild(document.createTextNode(flight_controller))
        }
        if (board_id != null) {
            // Lookup the board ID
            section.appendChild(document.createElement("br"))
            section.appendChild(document.createElement("br"))
            section.appendChild(document.createTextNode("Board ID: " + board_id))
            if (board_id in board_types) {
                section.appendChild(document.createTextNode(" " + board_types[board_id]))
            }
        }
    }

    const have_HEAT = ('HEAT' in log.messages) && (Object.keys(log.messages.HEAT).length > 0)
    const have_POWR = ('POWR' in log.messages) && (Object.keys(log.messages.POWR).length > 0)
    const have_POWR_temp = have_POWR && ('MTemp' in log.messages.POWR)
    const have_MCU = ('MCU' in log.messages) && (Object.keys(log.messages.MCU).length > 0)
    const have_IMU = ('IMU' in log.messages) && (Object.keys(log.messages.IMU).length > 0)
    if (have_HEAT || have_POWR_temp || have_MCU || have_IMU) {
        let plot = document.getElementById("Temperature")
        plot.hidden = false
        plot.previousElementSibling.hidden = false

        if (have_HEAT) {
            const time = array_scale(Array.from(log.messages.HEAT.time_boot_ms), 1 / 1000)

            Temperature.data[0].x = time
            Temperature.data[0].y = Array.from(log.messages.HEAT.Targ)

            Temperature.data[1].x =time
            Temperature.data[1].y = Array.from(log.messages.HEAT.Temp)
        }

        if (have_MCU) {
            Temperature.data[2].x = array_scale(Array.from(log.messages.MCU.time_boot_ms), 1 / 1000)
            Temperature.data[2].y = Array.from(log.messages.MCU.MTemp)

        } else if (have_POWR_temp) {
            Temperature.data[2].x = array_scale(Array.from(log.messages.POWR.time_boot_ms), 1 / 1000)
            Temperature.data[2].y = Array.from(log.messages.POWR.MTemp)

        }

        if (have_IMU) {
            let have_instance = false
            for (let i = 0; i < max_num_ins; i++) {
                const inst_name = "IMU[" + i + "]"
                if (inst_name in log.messages) {
                    have_instance = true

                    Temperature.data[3+i].x = array_scale(Array.from(log.messages[inst_name].time_boot_ms), 1 / 1000)
                    Temperature.data[3+i].y = Array.from(log.messages[inst_name].T)
                }
            }

            if (!have_instance) {
                const instance = log.messages.IMU.I[0]
                Temperature.data[3+instance].x = array_scale(Array.from(log.messages.IMU.time_boot_ms), 1 / 1000)
                Temperature.data[3+instance].y = Array.from(log.messages.IMU.T)
            }
        }

        Plotly.redraw(plot)
    }

    // Voltage plot
    if (have_POWR || have_MCU) {
        let plot = document.getElementById("Board_Voltage")
        plot.hidden = false
        plot.previousElementSibling.hidden = false

        if (have_POWR) {
            const time = array_scale(Array.from(log.messages.POWR.time_boot_ms), 1 / 1000)

            Board_Voltage.data[1].x = time
            Board_Voltage.data[1].y = Array.from(log.messages.POWR.VServo)

            Board_Voltage.data[2].x = time
            Board_Voltage.data[2].y = Array.from(log.messages.POWR.Vcc)

            if (!have_MCU && ('MVolt' in log.messages.POWR)) {
                Board_Voltage.data[3].x = time
                Board_Voltage.data[3].y = Array.from(log.messages.POWR.MVolt)

                Board_Voltage.data[0].x = [...time, ...time.toReversed()]
                Board_Voltage.data[0].y = [...Array.from(log.messages.POWR.MVmax), ...Array.from(log.messages.POWR.MVmin).toReversed()]
            }
        }

        if (have_MCU) {
            const time = array_scale(Array.from(log.messages.MCU.time_boot_ms), 1 / 1000)

            Board_Voltage.data[3].x = time
            Board_Voltage.data[3].y = Array.from(log.messages.MCU.MVolt)

            Board_Voltage.data[0].x = [...time, ...time.toReversed()]
            Board_Voltage.data[0].y = [...Array.from(log.messages.MCU.MVmax), ...Array.from(log.messages.MCU.MVmin).toReversed()]

        }

        Plotly.redraw(plot)
    }
    delete log.messages.POWR
    delete log.messages.MCU

    // Performance
    if (('PM' in log.messages) && (Object.keys(log.messages.PM).length > 0)) {
        // Load
        let plot = document.getElementById("performance_load")
        plot.hidden = false
        plot.previousElementSibling.hidden = false
        plot.previousElementSibling.previousElementSibling.hidden = false

        const time = array_scale(Array.from(log.messages.PM.time_boot_ms), 1 / 1000)

        performance_load.data[0].x = time
        performance_load.data[0].y = array_scale(Array.from(log.messages.PM.Load), 1 / 10)
        
        Plotly.redraw(plot)

        // Memory
        plot = document.getElementById("performance_mem")
        plot.hidden = false
        plot.previousElementSibling.hidden = false

        performance_mem.data[0].x = time
        performance_mem.data[0].y = Array.from(log.messages.PM.Mem)

        Plotly.redraw(plot)

        // Time
        plot = document.getElementById("performance_time")
        plot.hidden = false
        plot.previousElementSibling.hidden = false

        performance_time.data[0].x = time
        performance_time.data[0].y = array_inverse(array_scale(Array.from(log.messages.PM.MaxT), 1 / 1000000))

        performance_time.data[1].x = time
        performance_time.data[1].y = Array.from(log.messages.PM.LR)

        Plotly.redraw(plot)

    }
    delete log.messages.PM

    if (('STAK' in log.messages) && (Object.keys(log.messages.STAK).length > 0)) {
        let stack = []
        for (let i = 0; i <= 255; i++) {
            const name = "STAK[" + i + "]"
            if (name in log.messages) {
                // Assume id, priority and name do not change
                stack.push({ id: i, 
                             priority: log.messages[name].Pri[0],
                             name: log.messages[name].Name[0],
                             time: array_scale(Array.from(log.messages[name].time_boot_ms), 1 / 1000),
                             total_size: Array.from(log.messages[name].Total),
                             free: Array.from(log.messages[name].Free)})
            }
        }

        // Sort by priority, most important first
        stack.sort((a, b) => { return b.priority - a.priority })

        stack_mem.data = []
        stack_pct.data = []

        for (let i = 0; i < stack.length; i++) {
            stack_mem.data.push({ mode: 'lines', x: stack[i].time, y: stack[i].free, name: stack[i].name, meta: stack[i].name, hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} B" })

            const mem_pct = array_scale(array_div(array_sub(stack[i].total_size, stack[i].free), stack[i].total_size), 100)
            stack_pct.data.push({ mode: 'lines', x: stack[i].time, y: mem_pct, name: stack[i].name, meta: stack[i].name, hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} %" })
        }

        plot = document.getElementById("stack_mem")
        plot.hidden = false
        plot.previousElementSibling.hidden = false
        plot.previousElementSibling.previousElementSibling.hidden = false
        Plotly.purge(plot)
        Plotly.newPlot(plot, stack_mem.data, stack_mem.layout, {displaylogo: false});

        plot = document.getElementById("stack_pct")
        plot.hidden = false
        plot.previousElementSibling.hidden = false
        Plotly.purge(plot)
        Plotly.newPlot(plot, stack_pct.data, stack_pct.layout, {displaylogo: false});

    }
    delete log.messages.STAK

}

async function load(e) {
    reset()

    const file = e.files[0]
    if (file == null) {
        return
    }

    if (file.name.toLowerCase().endsWith(".bin")) {
        let reader = new FileReader()
        reader.onload = function (e) {
            load_log(reader.result)
        }
        reader.readAsArrayBuffer(file)

    } else {
        load_param_file(await file.text())
    }

}

let Sensor_Offset = {}
let Temperature = {}
let Board_Voltage = {}
let performance_load = {}
let performance_mem = {}
let performance_time = {}
let stack_mem = {}
let stack_pct = {}
function reset() {

    function setup_section(section) {
        // Remove all children
        section.replaceChildren()

        // Hide
        section.hidden = true
        section.previousElementSibling.hidden = true
    }

    setup_section(document.getElementById("VER"))
    setup_section(document.getElementById("FC"))
    setup_section(document.getElementById("INS"))
    setup_section(document.getElementById("COMPASS"))
    setup_section(document.getElementById("BARO"))
    setup_section(document.getElementById("ARSPD"))
    setup_section(document.getElementById("DroneCAN"))

    ins = []
    compass = []
    baro = []
    airspeed = []
    can = []
    gps = []
    rangefinder = []
    flow = []
    viso = []

    // Reset params
    params = {}
    defaults = {}
    document.getElementById("SaveAllParams").hidden = true
    document.getElementById("SaveChangedParams").hidden = true


    // Reset minimal param output
    function setup_minimal_param(id, params) {
        let input = document.getElementById(id)
        input.disabled = false
        input.setAttribute("data-params", params)

        const title_string = params.join([separator = ', '])
        input.setAttribute('title', title_string)

        let label = input.labels[0]
        label.setAttribute('title', title_string)
    }

    // Ins
    let ins_gyro = []
    let ins_accel = []
    let ins_use = []
    let ins_pos = []
    for (let i = 0; i < max_num_ins; i++) {
        const names = get_ins_param_names(i)
        ins_gyro.push(...names.gyro.offset, names.gyro.id, names.gyro.cal_temp)
        ins_accel.push(...names.accel.offset, ...names.accel.scale, names.accel.id, names.accel.cal_temp)
        ins_use.push(names.use)
        ins_pos.push(...names.pos)
    }
    setup_minimal_param("param_ins_gyro", ins_gyro)
    setup_minimal_param("param_ins_accel", ins_accel)
    setup_minimal_param("param_ins_use", ins_use)
    setup_minimal_param("param_ins_position", ins_pos)

    // Compass
    let compass_calibration = []
    let compass_ids = []
    let compass_use = []
    let compass_ordering = []
    for (let i = 1; i <= 3; i++) {
        const names = get_compass_param_names(i)
        compass_calibration.push(...names.offsets, ...names.diagonals, ...names.off_diagonals, ...names.motor, names.scale, names.orientation)
        compass_ids.push(names.id, names.external)
        compass_use.push(names.use)
        compass_ordering.push("COMPASS_PRIO" + i + "_ID")
    }
    for (let i = 4; i <= 8; i++) {
        compass_ids.push("COMPASS_DEV_ID" + i)
    }
    setup_minimal_param("param_compass_calibration", compass_calibration)
    setup_minimal_param("param_compass_id", compass_ids)
    setup_minimal_param("param_compass_use", compass_use)
    setup_minimal_param("param_compass_ordering", compass_ordering)
    setup_minimal_param("param_declination", ["COMPASS_DEC"])

    // Baro
    let baro_calibration = []
    let baro_id = []
    let baro_wind_comp = []
    for (let i = 0; i < 3; i++) {
        const names = get_baro_param_names(i)
        baro_calibration.push(names.gnd_press)
        baro_id.push(names.id)
        baro_wind_comp.push(names.wind_comp.enabled, ...names.wind_comp.coefficients)
    }
    setup_minimal_param("param_baro_calibration", baro_calibration)
    setup_minimal_param("param_baro_id", baro_id)
    setup_minimal_param("param_baro_wind_comp", baro_wind_comp)

    // Airspeed
    let airspeed_calibration = []
    let airspeed_type = []
    let airspeed_use = []
    for (let i = 0; i < 2; i++) {
        const names = get_airspeed_param_names(i)
        airspeed_calibration.push(names.offset, names.ratio, names.auto_cal)
        airspeed_type.push(names.type, names.id, names.bus, names.pin, names.psi_range, names.tube_order, names.skip_cal)
        airspeed_use.push(names.use)
    }
    setup_minimal_param("param_airspeed_calibration", airspeed_calibration)
    setup_minimal_param("param_airspeed_type", airspeed_type)
    setup_minimal_param("param_airspeed_use", airspeed_use)

    // AHRS
    setup_minimal_param("param_ahrs_trim", get_param_name_vector3("AHRS_TRIM_"))
    setup_minimal_param("param_ahrs_orientation", ["AHRS_ORIENTATION"])

    // RC
    let rc_calibration = []
    let rc_reversals = []
    let rc_dead_zone = []
    let rc_options = []
    for (let i = 1; i <= 16; i++) {
        const rc_prefix = "RC" + i + "_"
        rc_calibration.push(rc_prefix + "MIN", rc_prefix + "MAX", rc_prefix + "TRIM")
        rc_reversals.push(rc_prefix + "REVERSED")
        rc_dead_zone.push(rc_prefix + "DZ")
        rc_options.push(rc_prefix + "OPTION")
    }
    setup_minimal_param("param_rc_calibration", rc_calibration)
    setup_minimal_param("param_rc_reverse", rc_reversals)
    setup_minimal_param("param_rc_dz", rc_dead_zone)
    setup_minimal_param("param_rc_options", rc_options)

    let flight_modes = ["FLTMODE_CH"]
    for (let i = 1; i <= 6; i++) {
        flight_modes.push("FLTMODE" + i)
    }
    setup_minimal_param("param_rc_flightmodes", flight_modes)

    // Stream rates
    for (let i = 0; i <= 6; i++) {
        if (document.getElementById("param_stream_" + i).checked) {
            continue
        }
        const SR_prefix = "SR" + i + "_"
        const SR_names = [ SR_prefix + "RAW_SENS", 
                           SR_prefix + "EXT_STAT",
                           SR_prefix + "RC_CHAN",
                           SR_prefix + "RAW_CTRL",
                           SR_prefix + "POSITION",
                           SR_prefix + "EXTRA1",
                           SR_prefix + "EXTRA2",
                           SR_prefix + "EXTRA3",
                           SR_prefix + "PARAMS",
                           SR_prefix + "ADSB"]
        setup_minimal_param("param_stream_" + i, SR_names)
    }


    // Pos offsets plot setup
    Sensor_Offset.data = []
    const offset_hover = "<extra></extra>%{meta}<br>X: %{x:.2f} m<br>Y: %{y:.2f} m<br>Z: %{z:.2f} m"

    let name = "GC"
    Sensor_Offset.data[0] = { x: [0], y: [0], z: [0], mode: "markers", type: 'scatter3d', name: name, meta: name, marker: {color: 'rgb(0,0,0)'}, showlegend: false, hovertemplate: "<extra></extra>CG"}

    for (let i = 0; i < max_num_ins; i++) {
        name = "IMU " + (i+1)
        Sensor_Offset.data.push({ mode: "markers", type: 'scatter3d', name: name, meta: name, visible: false, hovertemplate: offset_hover })
    }

    for (let i = 0; i < max_num_gps; i++) {
        name = "GPS " + (i+1)
        Sensor_Offset.data.push({ mode: "markers", type: 'scatter3d', name: name, meta: name, visible: false, hovertemplate: offset_hover })
    }

    for (let i = 0; i < max_num_rangefinder; i++) {
        name = "Rangefinder " + (i+1)
        Sensor_Offset.data.push({ mode: "markers", type: 'scatter3d', name: name, meta: name, visible: false, hovertemplate: offset_hover })
    }

    for (let i = 0; i < max_num_flow; i++) {
        name = "FLOW " + (i+1)
        Sensor_Offset.data.push({ mode: "markers", type: 'scatter3d', name: name, meta: name, visible: false, hovertemplate: offset_hover })
    }

    for (let i = 0; i < max_num_viso; i++) {
        name = "VISO " + (i+1)
        Sensor_Offset.data.push({ mode: "markers", type: 'scatter3d', name: name, meta: name, visible: false, hovertemplate: offset_hover })
    }

    const origin_size = 0.2

    // X
    const x_color = 'rgb(0,0,255)'
    Sensor_Offset.data.push({type: "cone", x: [origin_size], y: [0], z: [0], u: [origin_size], v: [0], w: [0], sizemode: "absolute", showscale: false, hoverinfo: "none", colorscale:[[0, x_color], [1, x_color]]})
    Sensor_Offset.data.push({type: 'scatter3d', mode: 'lines', x: [0,origin_size], y: [0,0], z: [0,0], showlegend: false, hoverinfo: "none", line: {color: x_color, width: 10 }})

    // Y
    const y_color = 'rgb(255,0,0)'
    Sensor_Offset.data.push({type: "cone", x: [0], y: [origin_size], z: [0], u: [0], v: [origin_size], w: [0], sizemode: "absolute", showscale: false, hoverinfo: "none", colorscale:[[0, y_color], [1, y_color]]})
    Sensor_Offset.data.push({type: 'scatter3d', mode: 'lines', x: [0,0], y: [0,origin_size], z: [0,0], showlegend: false, hoverinfo: "none", line: {color: y_color, width: 10 }})

    // Z
    const z_color = 'rgb(0,255,0)'
    Sensor_Offset.data.push({type: "cone", x: [0], y: [0], z: [origin_size], u: [0], v: [0], w: [origin_size], sizemode: "absolute", showscale: false, hoverinfo: "none", colorscale:[[0, z_color], [1, z_color]]})
    Sensor_Offset.data.push({type: 'scatter3d', mode: 'lines', x: [0,0], y: [0,0], z: [0,origin_size], showlegend: false, hoverinfo: "none", line: {color: z_color, width: 10 }})

    Sensor_Offset.layout = {
        scene: { xaxis: {title: { text: "X offset, forward (m)" }, zeroline: false, showline: true, mirror: true, showspikes: false },
                 yaxis: {title: { text: "Y offset, right (m)" }, zeroline: false, showline: true, mirror: true, showspikes: false },
                 zaxis: {title: { text: "Z offset, down (m)" }, zeroline: false, showline: true, mirror: true, showspikes: false },
                 aspectratio: { x:0.75, y:0.75, z:0.75 },
                 camera: {eye: { x:-1.25, y:1.25, z:1.25 }}},
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    let plot = document.getElementById("POS_OFFSETS")
    Plotly.purge(plot)
    Plotly.newPlot(plot, Sensor_Offset.data, Sensor_Offset.layout, {displaylogo: false});
    plot.hidden = true
    plot.previousElementSibling.hidden = true

    // Temperature plot
    const time_scale_label = "Time (s)"
    const temp_hover_tmmplate = "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} °C"
    Temperature.data = []

    name = "heater target"
    Temperature.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: temp_hover_tmmplate })

    name = "heater actual"
    Temperature.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: temp_hover_tmmplate })

    name = "MCU"
    Temperature.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: temp_hover_tmmplate })
    for (let i = 0; i < max_num_ins; i++) {
        name = "IMU " + (i+1)
        Temperature.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: temp_hover_tmmplate })
    }

    Temperature.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Temperature (°C)" } }
                         }

    plot = document.getElementById("Temperature")
    Plotly.purge(plot)
    Plotly.newPlot(plot, Temperature.data, Temperature.layout, {displaylogo: false});
    plot.hidden = true
    plot.previousElementSibling.hidden = true

    // Voltages
    const voltage_hover_tmmplate = "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} V"
    Board_Voltage.data = []

    Board_Voltage.data.push({ line: {color: "transparent"}, fill: "toself", type: "scatter", showlegend: false, hoverinfo: 'none' })

    name = "servo"
    Board_Voltage.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: voltage_hover_tmmplate })

    name = "board"
    Board_Voltage.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: voltage_hover_tmmplate })

    name = "MCU"
    Board_Voltage.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: voltage_hover_tmmplate })

    Board_Voltage.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                             margin: { b: 50, l: 50, r: 50, t: 20 },
                             xaxis: { title: {text: time_scale_label } },
                             yaxis: { title: {text: "Voltage" }, rangemode: "tozero" } }

    plot = document.getElementById("Board_Voltage")
    Plotly.purge(plot)
    Plotly.newPlot(plot, Board_Voltage.data, Board_Voltage.layout, {displaylogo: false});
    plot.hidden = true
    plot.previousElementSibling.hidden = true

    // Performace load
    performance_load.data = [{ mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} %" }]

    performance_load.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Load (%)" } }
                         }

    plot = document.getElementById("performance_load")
    Plotly.purge(plot)
    Plotly.newPlot(plot, performance_load.data, performance_load.layout, {displaylogo: false});
    plot.hidden = true
    plot.previousElementSibling.hidden = true
    plot.previousElementSibling.previousElementSibling.hidden = true

    // Performace memory
    performance_mem.data = [{ mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} B" }]

    performance_mem.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 60, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Free memory (bytes)" } }
                         }

    plot = document.getElementById("performance_mem")
    Plotly.purge(plot)
    Plotly.newPlot(plot, performance_mem.data, performance_mem.layout, {displaylogo: false});
    plot.hidden = true
    plot.previousElementSibling.hidden = true

    // Performace time
    const performance_time_hover = "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} Hz"

    performance_time.data = []

    name = "Worst"
    performance_time.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: performance_time_hover })

    name = "Average"
    performance_time.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: performance_time_hover })

    performance_time.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Loop rate (Hz)" } }
                         }

    plot = document.getElementById("performance_time")
    Plotly.purge(plot)
    Plotly.newPlot(plot, performance_time.data, performance_time.layout, {displaylogo: false});
    plot.hidden = true
    plot.previousElementSibling.hidden = true

    // Stack
    // Memory
    stack_mem.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Free memory (bytes)" } }
                         }

    plot = document.getElementById("stack_mem")
    plot.hidden = true
    plot.previousElementSibling.hidden = true
    plot.previousElementSibling.previousElementSibling.hidden = true

    // Percentage
    stack_pct.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Memory usage (%)" } }
                         }

    plot = document.getElementById("stack_pct")
    plot.hidden = true
    plot.previousElementSibling.hidden = true
    plot.previousElementSibling.previousElementSibling.hidden = true

}

let board_types = {}
async function initial_load() {

    function load_board_types(text) {
        const lines = text.match(/[^\r\n]+/g)
        for (const line of lines) {
            // This could be combined with the line split if I was better at regex's
            const match = line.match(/(^[-\w]+)\s+(\d+)/)
            if (match) {
                const board_id = match[2]
                let board_name = match[1]

                // Shorten name for readability
                board_name = board_name.replace(/^TARGET_HW_/, "")
                board_name = board_name.replace(/^EXT_HW_/, "")
                board_name = board_name.replace(/^AP_HW_/, "")

                board_types[board_id] = board_name
            }
        }
    }


    fetch("board_types.txt")
        .then((res) => {
        return res.text();
    }).then((data) => load_board_types(data));
}

function save_text(text, file_postfix) {

    const log_file_name = document.getElementById("fileItem").value.replace(/.*[\/\\]/, '')
    const file_name = (log_file_name.substr(0, log_file_name.lastIndexOf('.')) || log_file_name) + file_postfix

    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    saveAs(blob, file_name);
}

function save_all_parameters() {

    if (Object.keys(params).length == 0) {
        return
    }

    let text = ""
    for (const [name, value] of Object.entries(params)) {
        text += name + "," + value + "\n";
    }

    save_text(text, ".param")

}

function save_changed_parameters() {

    if (Object.keys(params).length == 0) {
        return
    }

    let text = ""
    for (const [name, value] of Object.entries(params)) {
        if ((name in defaults) && (value == defaults[name])) {
            continue
        }
        text += name + "," + value + "\n";
    }

    save_text(text, "_changed.param")

}

function save_minimal_parameters() {

    if (Object.keys(params).length == 0) {
        return
    }

    const changed = document.getElementById("param_base_changed").checked

    let skip_params = []

    // Never save stats
    skip_params.push("STAT_BOOTCNT", "STAT_FLTTIME", "STAT_RUNTIME", "STAT_RESET", "SYS_NUM_RESETS")

    // Some read only params that should never be changed
    skip_params.push("FORMAT_VERSION", "MIS_TOTAL", "FENCE_TOTAL", "RALLY_TOTAL")

    let inputs = document.forms["params"].getElementsByTagName("input");
    for (let input of inputs) {
        if (input.checked == false) {
            skip_params.push(...input.getAttribute("data-params").split(','))
        }
    }

    let text = ""
    for (const [name, value] of Object.entries(params)) {
        if (changed && (name in defaults) && (value == defaults[name])) {
            continue
        }
        if (skip_params.includes(name)) {
            continue
        }
        text += name + "," + value + "\n";
    }

    save_text(text, "_minimal.param")

}

