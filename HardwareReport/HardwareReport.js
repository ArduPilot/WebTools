
let import_done = []
var DataflashParser
import_done[0] = import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default })

// This is the one package we do get from a CDN.
// If we are offline the GitHub API will not work, so there is no need for a local copy for offline use.
// Catch the error for the offline case, the version request will report that it failed because its offline.
var octokitRequest
import_done[1] = import('https://esm.sh/@octokit/request')
    .then((mod) => { octokitRequest = mod.request })
    .catch(error => console.log(error))

// Make sure whole page is loaded
import_done[2] = new Promise((resolve) => {
    window.addEventListener('load', () => {
        initial_load().then(() => {
            load()
            resolve()
        })
    })
})

function configurePlotlyCanvas() {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(contextType, contextAttributes) {
    if (contextType === '2d') {
      contextAttributes = contextAttributes || {};
      contextAttributes.willReadFrequently = true;
    }
    return originalGetContext.call(this, contextType, contextAttributes);
  };
}
configurePlotlyCanvas()


let ArduPilot_GitHub_tags
let octokitRequest_ratelimit_reset
async function check_release(hash, paragraph) {
    paragraph.appendChild(document.createElement("br"))

    if (octokitRequest == null) {
        paragraph.appendChild(document.createTextNode("Version check failed, offline (" + hash + ")"))
        return
    }

    function log_rate_reset(now) {
        const wait = octokitRequest_ratelimit_reset - now
        const wait_m = Math.floor(wait / 60)
        const wait_s = Math.floor(wait % 60)
        console.log("GitHub API rate limit exceeded, try again in " + wait_m + "m " + wait_s + "s" )
    }

    if (octokitRequest_ratelimit_reset) {
        const now = Date.now() / 1000
        if (now < octokitRequest_ratelimit_reset) {
            log_rate_reset(now)
            return
        }
        octokitRequest_ratelimit_reset = null
    }

    function api_error(err) {
        if ((err.status == 403) || (err.status == 429)) {
            octokitRequest_ratelimit_reset = parseInt(err.response.headers["x-ratelimit-reset"])
            log_rate_reset(Date.now() / 1000)
            return
        }

        console.log(err)
    }

    if (ArduPilot_GitHub_tags == null) {
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
            paragraph.appendChild(document.createTextNode("Version check failed to get whitelist (" + hash + ")"))
            api_error(err)
            return
        }
        ArduPilot_GitHub_tags = request.data
    }

    // Search tags for matching hash
    let found_tag = false
    for (tag of ArduPilot_GitHub_tags) {
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
    paragraph.appendChild(document.createTextNode("Warning: not official firmware release."))
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
        paragraph.appendChild(document.createTextNode("Version check failed to get commit (" + hash + ")"))
        api_error(err)
        return
    }

    const sha = request.data.sha

    paragraph.appendChild(document.createTextNode("Found commit: "))

    let link = document.createElement("a")
    link.href = request.data.html_url
    link.innerHTML = hash
    paragraph.appendChild(link)

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
        paragraph.appendChild(document.createElement("br"))
        paragraph.appendChild(document.createTextNode("Version check failed to get branches."))
        api_error(err)
        return
    }


    if (request.data.length > 0) {
        paragraph.appendChild(document.createElement("br"))
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

function show_watchdog(log) {

    if (!('WDOG' in log.messageTypes)) {
        return
    }

    const WDOG = log.get("WDOG")

    // The dev-team want to hear about watchdogs dumps.
    const content = document.createElement("div")
    content.appendChild(document.createTextNode("Watchdog reboot detected, see Watchdog section."))
    content.appendChild(document.createElement("br"))
    content.appendChild(document.createTextNode("For more information see ArduPilot "))

    const link = document.createElement("a")
    link.href = "https://ardupilot.org/copter/docs/common-watchdog.html#independent-watchdog-and-crash-dump"
    link.appendChild(document.createTextNode("documentation"))

    content.appendChild(link)
    content.appendChild(document.createTextNode("."))

    add_warning("exclamation-triangle-red", content)

    let watchdogs = []
    for (let i = 0; i < WDOG.TimeUS.length; i++) {
        let watchdog = { 
            scheduler_task: WDOG.Tsk[i],
            internal_errors: WDOG.IE[i],
            internal_error_count: WDOG.IEC[i],
            internal_error_last_line: WDOG.IEL[i],
            last_mavlink_msgid: WDOG.MvMsg[i],
            last_mavlink_cmd: WDOG.MvCmd[i],
            semaphore_line: WDOG.SmLn[i],
            fault_line: WDOG.FL[i],
            fault_type: WDOG.FT[i],
            fault_addr: WDOG.FA[i],
            fault_thd_prio: WDOG.FP[i],
            fault_icsr: WDOG.ICSR[i],
            fault_lr: WDOG.LR[i],
            thread_name: WDOG.TN[i]
        }

        function item_compare(A, B) {
            if ((A == null) || (B == null)) {
                return false
            }
            return A.scheduler_task === B.scheduler_task &&
                A.internal_errors === B.internal_errors &&
                A.internal_error_count === B.internal_error_count &&
                A.internal_error_last_line === B.internal_error_last_line &&
                A.last_mavlink_msgid === B.last_mavlink_msgid &&
                A.last_mavlink_cmd === B.last_mavlink_cmd &&
                A.semaphore_line === B.semaphore_line &&
                A.fault_line === B.fault_line &&
                A.fault_type === B.fault_type &&
                A.fault_addr === B.fault_addr &&
                A.fault_thd_prio === B.fault_thd_prio &&
                A.fault_icsr === B.fault_icsr &&
                A.fault_lr === B.fault_lr &&
                A.thread_name === B.thread_name
        }

        // Check if this has been seen before
        if (item_compare(watchdogs[watchdogs.length-1], watchdog)) {
            continue
        }

        watchdogs.push(watchdog)
    }

    const num_watchdogs = watchdogs.length
    if (num_watchdogs == 0) {
        return
    }

    let para = document.getElementById("WDOG")
    para.hidden = false
    para.previousElementSibling.hidden = false

    for (let i = 0; i < num_watchdogs; i++) {
        if (i > 0) {
            para.appendChild(document.createElement("br"))
        }

        if (num_watchdogs > 1) {
            let heading = document.createElement("h4")
            heading.appendChild(document.createTextNode("Watchdog " + (i+1)))
            para.appendChild(heading)
        }

        let task_name
        switch (watchdogs[i].scheduler_task) {
            case -3:
                task_name = "Waiting for sample"
                break
            case -1:
                task_name = "Pre loop"
                break
            case -2:
                task_name = "Fast loop"
                break
        }

        let extra = (task_name == null) ? "" : " (" + task_name + ")"
        para.appendChild(document.createTextNode("Scheduler Task: " + watchdogs[i].scheduler_task + extra))

        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Internal Error Mask: " + watchdogs[i].internal_errors))

        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Internal Error Count: " + watchdogs[i].internal_error_count))

        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Internal Error Line: " + watchdogs[i].internal_error_last_line))

        extra = (watchdogs[i].last_mavlink_msgid == 0) ? " (none)" : ""
        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Last MAVLink Message: " + watchdogs[i].last_mavlink_msgid + extra))

        extra = (watchdogs[i].last_mavlink_cmd == 0) ? " (none)" : ""
        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Last MAVLink Command: " + watchdogs[i].last_mavlink_cmd + extra))

        extra = (watchdogs[i].semaphore_line == 0) ? " (not waiting)" : ""
        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Semaphore Line: " + watchdogs[i].semaphore_line + extra))

        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Fault Line: " + watchdogs[i].fault_line))

        let fault_name
        switch (watchdogs[i].fault_type) {
            case 1:
                fault_name = "Reset"
                break
            case 2:
                fault_name = "NMI"
                break
            case 3:
                fault_name = "HardFault"
                break
            case 4:
                fault_name = "MemManage"
                break
            case 4:
                fault_name = "BusFault"
                break
            case 4:
                fault_name = "UsageFault"
                break
        }

        extra = (fault_name == null) ? "" : " (" + fault_name + ")"
        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Fault Type: " + watchdogs[i].fault_type + extra))

        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Fault Address: 0x" + watchdogs[i].fault_addr.toString(16)))

        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Fault Thread Priority: " + watchdogs[i].fault_thd_prio))

        function decode_ICSR(ICSR, section) {

            function decoder_m4_vectactive(value) {
                const exceptions = {
                    0: "Thread mode",
                    1: "Reserved",
                    2: "NMI",
                    3: "Hard fault",
                    4: "Memory management fault",
                    5: "Bus fault",
                    6: "Usage fault",
                    7: "Reserved....",
                    10: "Reserved",
                    11: "SVCall",
                    12: "Reserved for Debug",
                    13: "Reserved",
                    14: "PendSV",
                    15: "SysTick",
                }
                let exception
                if (value in exceptions) {
                    exception = exceptions[value]
                } else {
                    exception = "IRQ" + (value - 16)
                }
                return " (" + exception + ")"
            }

            function decoder_m4_retobase(value) {
                let out
                if (value) {
                    out = "no (or no more) active exceptions"
                } else {
                    out = "preempted active exceptions"
                }
                return " (" + out + ")"
            }

            function decoder_m4_vectpending(value) {
                return decoder_m4_vectactive(value)
            }

            function decoder_m4_isrpending(value) {
                let out
                if (value) {
                    out = "Interrupt pending"
                } else {
                    out = "No pending interrupt"
                }
                return " (" + out + ")"
            }

            function decoder_m4_pendstclr(value) {
                return " (WO clears SysTick exception)"
            }

            function decoder_m4_pendstset(value) {
                let out
                if (value) {
                    out = "SysTick pending"
                } else {
                    out = "SysTick not pending"
                }
                return " (" + out + ")"
            }

            function decoder_m4_pendsvclr(value) {
                return " (WO clears pendsv exception)"
            }

            function decoder_m4_pendsvset(value) {
                let out
                if (value) {
                    out = "PendSV pending"
                } else {
                    out = "PendSV not pending"
                }
                return " (" + out + ")"
            }

            function decoder_m4_nmipendset(value) {
                let out
                if (value) {
                    out = "NMI pending"
                } else {
                    out = "NMI not pending"
                }
                return " (" + out + ")"
            }

            // this ICSR-bit-assignment-table table also looks valid for M7
            // - page 195 of
            // dm00237416-stm32f7-series-and-stm32h7-series-cortexm7-processor-programming-manual-stmicroelectronics.pdf
            const M4_BITS = [
                ["0-8", "VECTACTIVE", decoder_m4_vectactive],
                ["9-10", "RESERVED1", null],
                ["11", "RETOBASE", decoder_m4_retobase],
                ["12-18", "VECTPENDING", decoder_m4_vectpending],
                ["19-21", "RESERVED2", null],
                ["22", "ISRPENDING", decoder_m4_isrpending],
                ["23-24", "RESERVED3", null],
                ["25", "PENDSTCLR", decoder_m4_pendstclr],
                ["26", "PENDSTSET", decoder_m4_pendstset],
                ["27", "PENDSVCLR", decoder_m4_pendsvclr],
                ["28", "PENDSVSET", decoder_m4_pendsvset],
                ["29-30", "RESERVED4", null],
                ["31", "NMIPENDSET", decoder_m4_nmipendset],
            ]

            for (const bit of M4_BITS) {
                let bits = bit[0]
                let name = bit[1]
                let decoder = bit[2]

                let start_bit
                let stop_bit
                if (bits.includes("-")) {
                    const start_stop = bits.split("-")
                    start_bit = parseInt(start_stop[0])
                    stop_bit = parseInt(start_stop[1])
                } else {
                    start_bit = parseInt(bits)
                    stop_bit = parseInt(bits)
                }
                let mask = 0
                for (let i = start_bit; i < stop_bit+1; i++) {
                    mask |= (1 << i)
                }
                let value = (ICSR & mask) >> start_bit
                let text  = name + ": 0x" + value.toString(16)
                if (decoder != null) {
                    text += " " + decoder(value)
                }
                section.appendChild(document.createTextNode(text))
                section.appendChild(document.createElement("br"))

            }
        }

        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Fault ICS Register: "))

        let details = document.createElement("details")
        details.style.display = "inline"
        details.style.verticalAlign = "top"
        para.appendChild(details)

        let summary = document.createElement("summary")
        summary.appendChild(document.createTextNode("0x" + watchdogs[i].fault_icsr.toString(16)))
        details.appendChild(summary)
        decode_ICSR(watchdogs[i].fault_icsr, details)

        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Fault Long Return Address: 0x" + watchdogs[i].fault_lr.toString(16)))

        para.appendChild(document.createElement("br"))
        para.appendChild(document.createTextNode("Fault Thread name: " + watchdogs[i].thread_name))

        // This format can be pasted into https://github.com/ArduPilot/ardupilot/blob/master/Tools/scripts/decode_watchdog.py
        console.log("\"WDOG, 0, " +
            watchdogs[i].scheduler_task + ", " +
            watchdogs[i].internal_errors + ", " +
            watchdogs[i].internal_error_count + ", " +
            watchdogs[i].internal_error_last_line + ", " +
            watchdogs[i].last_mavlink_msgid + ", " +
            watchdogs[i].last_mavlink_cmd + ", " +
            watchdogs[i].semaphore_line + ", " +
            watchdogs[i].fault_line + ", " +
            watchdogs[i].fault_type + ", " +
            watchdogs[i].fault_addr + ", " +
            watchdogs[i].fault_thd_prio + ", " +
            watchdogs[i].fault_icsr + ", " +
            watchdogs[i].fault_lr + ", " +
            watchdogs[i].thread_name + "\""
        )
    }

}

function show_internal_errors(log) {

    let internal_errors = []

    // Add from PM
    if ('PM' in log.messageTypes) {
        const errorField = 
            log.messageTypes.PM.expressions.includes("IntE") ? "IntE" :
            log.messageTypes.PM.expressions.includes("InE") ? "InE" : undefined

        const errorCount = 
            log.messageTypes.PM.expressions.includes("ErrC") ? "ErrC" :
            log.messageTypes.PM.expressions.includes("ErC") ? "ErC" : undefined

        if (log.messageTypes.PM.expressions.includes("ErrL") && (errorField != undefined) && (errorCount != undefined)) {
            const PM = log.get("PM")
            const len = PM.TimeUS.length
            for (let i = 0; i < len; i++) {
                internal_errors.push({
                    time: PM.TimeUS[i],
                    mask: PM[errorField][i],
                    line: PM.ErrL[i],
                    count: PM[errorCount][i]
                })
            }
        }
    }

    // Add from MON
    if ('MON' in log.messageTypes) {
        const MON = log.get("MON")
        const len = MON.TimeUS.length
        for (let i = 0; i < len; i++) {
            internal_errors.push({
                time: MON.TimeUS[i],
                mask: MON.IErr[i],
                line: MON.IErrLn[i],
                count: MON.IErrCnt[i]
            })
        }
    }

    if (internal_errors.length == 0) {
        // Nothing logged
        return
    }

    // Sort by time, this allows combination from the two messages
    internal_errors.sort((a, b) => { return a.time - b.time })

    // Only keep changes, first item is always unique
    let unique_errors = [internal_errors[0]]
    for (let i = 1; i < internal_errors.length; i++) {
        const error = internal_errors[i]

        const last_error_index = unique_errors.length - 1
        const last_error = unique_errors[last_error_index]

        if ((error.mask != last_error.mask) ||
            (error.line != last_error.line)) {
            // Change in mask or line, add to list
            unique_errors.push(error)

        } else if (error.count > last_error.count) {
            // Mask and line the same, update count only
            unique_errors[last_error_index].count = error.count
        }

    }

    // Calculate the change in mask and count
    unique_errors[0].mask_change = unique_errors[0].mask
    unique_errors[0].count_change = unique_errors[0].count
    for (let i = 1; i < unique_errors.length; i++) {
        unique_errors[i].mask_change = unique_errors[i].mask & (~unique_errors[i-1].mask)
        unique_errors[i].count_change = unique_errors[i].count - unique_errors[i-1].count
    }


    let para = document.getElementById("InternalError")

    // Print
    let lines = 0
    for (const error of unique_errors) {
        if (error.mask == 0) {
            // No error
            continue
        }

        const error_string = [
            "logging map failure",
            "logging missing structure",
            "logging write missing format",
            "logging  too many deletes",
            "logging bad get file name",
            "panic",
            "logging flush without semaphore",
            "logging bad current block",
            "logging bad block count",
            "logging dequeue failure",
            "Constraining NaN",
            "Watchdog reset",
            "IOMCU reset",
            "IOMCU fail",
            "SPI fail",
            "main loop stuck",
            "gcs bad link",
            "bitmask range",
            "gcs offset",
            "i2c isr",
            "flow of control",
            "sfs recursion",
            "bad rotation",
            "stack overflow",
            "imu reset",
            "gpio isr",
            "mem guard",
            "dma fail",
            "params restored",
            "invalid arguments",
        ]

        function get_string(val) {
            let ret = ""
            for (let i = 0; i < 32; i++) {
                if ((val & (1 << i)) != 0) {
                    if (ret.length > 0) {
                        ret += ", "
                    }
                    ret += error_string[i]
                }
            }
            return ret
        }

        function pop_count_32(val) {
            let count = 0
            for (let i = 0; i < 32; i++) {
                if ((val & (1 << i)) != 0) {
                    count++
                }
            }
            return count
        }

        if (lines > 0) {
            para.appendChild(document.createElement("br"))
        }

        para.appendChild(document.createTextNode("0x" + error.mask_change.toString(16) + ": " + get_string(error.mask_change)))

        const new_errors = pop_count_32(error.mask_change)
        const existing_errors = pop_count_32(error.mask)
        const have_line = error.line > 0
        const single_error = (existing_errors == 0) && (new_errors == 1)
        if (single_error || (new_errors != error.count_change)) {
            // Only one error, must all be of this type no matter the count
            // Multiple errors, not sure which the count belongs to
            const multiple = error.count_change > 1

            if (multiple || have_line) {
                para.appendChild(document.createTextNode(" ("))
                if (multiple) {
                    para.appendChild(document.createTextNode(error.count_change + " times"))
                    if (have_line) {
                        para.appendChild(document.createTextNode(", "))
                    }
                }
                if (have_line) {
                    para.appendChild(document.createTextNode("line " + error.line))
                }
                para.appendChild(document.createTextNode(")"))
            }

        } else {
            // Got the same number of changes in mask as errors, must be 1 to 1
            if (have_line) {
                para.appendChild(document.createTextNode(" (line " + error.line + ")" ))
            }
        }
        lines++
    }

    if (lines > 0) {
        // Show section
        para.hidden = false
        para.previousElementSibling.hidden = false
    }

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
        let can_device
        if ((id.bus in can) && (id.address in can[id.bus])) {
            can_device = can[id.bus][id.address][0]
        } else if (("all" in can) && (id.address in can.all)) {
            can_device = can.all[id.address][0]
        }

        if (can_device != null) {
            parent.appendChild(document.createTextNode("Name: " + can_device.name))
        }
    } else {
        parent.appendChild(document.createTextNode(id.name + " via " + id.bus_type))
        parent.appendChild(document.createElement("br"))
    }
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
    if ((log != null) && ("IMU" in log.messageTypes)) {
        if ("instances" in log.messageTypes.IMU) {
            for (const inst of Object.keys(log.messageTypes.IMU.instances)) {
                const i = parseFloat(inst)
                if (ins[i] != null) {
                    ins[i].acc_all_healthy = array_all_equal(log.get_instance("IMU", inst, "AH"), 1)
                    ins[i].gyro_all_healthy = array_all_equal(log.get_instance("IMU", inst, "GH"), 1)
                }
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
                 external: params[names.external],
                 offsets_set: param_array_configured(offsets, 0.0),
                 matrix_set: param_array_configured(diagonals, 1.0) | param_array_configured(off_diagonals, 0.0),
                 motor_set: param_array_configured(motor, 0.0),
                 full_inst: true }
    }

    let dev_id_start = 0
    for (let i = 0; i < 3; i++) {
        const prio = get_instance(params, "COMPASS_PRIO" + (i+1) + "_ID")
        if (prio != null) {
            compass[i] = prio
            dev_id_start = i + 1
        }
    }
    for (let i = dev_id_start; i < 7; i++) {
        const inst_num = (i == 0) ? "" : String(i+1)
        const dev_id_name = "COMPASS_DEV_ID" + inst_num
        if (dev_id_name in params) {
            const id = params[dev_id_name]
            if (id != 0) {
                compass[i] = { id: id, full_inst: false }
            }
        }
    }

    if ((log != null) && ("MAG" in log.messageTypes)) {
        if ("instances" in log.messageTypes.MAG) {
            for (const inst of Object.keys(log.messageTypes.MAG.instances)) {
                const i = parseFloat(inst)
                if (compass[i] != null) {
                    compass[i].all_healthy = array_all_equal(log.get_instance("MAG", inst, "Health"), 1)
                }
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
        fieldset.appendChild(document.createTextNode("External: " + ((params.external > 0) ? "\u2705" : "\u274C")))

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
                let wind_comp = get_param_array(params, names.wind_comp.coefficients)
                if (!array_all_equal(wind_comp, 0.0)) {
                    wind_comp_en = true
                }
            }
            baro[i] = { id: id, wind_cmp: wind_comp_en }
        }
    }

    if ((log != null) && ("BARO" in log.messageTypes)) {
        if ("instances" in log.messageTypes.BARO) {
            for (const inst of Object.keys(log.messageTypes.BARO.instances)) {
                const i = parseFloat(inst)
                if (baro[i] != null) {
                    if (log.messageTypes.BARO.expressions.includes("Health")) {
                        baro[i].all_healthy = array_all_equal(log.get_instance("BARO", inst, "Health"), 1)

                    } else if (log.messageTypes.BARO.expressions.includes("H")) {
                        baro[i].all_healthy = array_all_equal(log.get_instance("BARO", inst, "H"), 1)

                    }
                }
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

    for (let i = 0; i < 6; i++) {
        const names = get_airspeed_param_names(i)
        if (names.id in params) {
            const id = params[names.id]
            if (id == 0) {
                continue
            }
            airspeed[i] = { id: id, use: params[names.use] }
        }
    }
    if ((log != null) && ("ARSP" in log.messageTypes)) {
        if ("instances" in log.messageTypes.ARSP) {
            for (const inst of Object.keys(log.messageTypes.ARSP.instances)) {
                const i = parseFloat(inst)
                if (airspeed[i] != null) {
                    airspeed[i].all_healthy = array_all_equal(log.get_instance("ARSP", inst, "H"), 1)
                }
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
function load_gps(log) {

    function get_moving_base(prefix) {
        const type_name = prefix + "TYPE"
        if (!(type_name in params)) {
            // Not found
            return
        }

        if (params[type_name] != 1) {
            // Must be type 1 to be using offsets
            return
        }

        const names = get_param_name_vector3(prefix + "OFS_")
        return get_param_array(params, names)
    }

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
                           node_id: params["GPS_CAN_NODEID" + (i+1)],
                           moving_base: get_moving_base("GPS_MB" + (i+1) + "_" ) }
            }
            continue
        }
        const new_prefix = "GPS" + (i+1)
        const new_type_name = new_prefix + "_TYPE"
        if (new_type_name in params) {
            // New per-instance params for 4.6+
            const type = params[new_type_name]
            if (type != 0) {
                const pos_names = get_param_name_vector3(new_prefix + "_POS_")
                gps[i] = { type: type,
                           pos: get_param_array(params, pos_names),
                           node_id: params[new_prefix + "_CAN_NODEID"],
                           moving_base: get_moving_base(new_prefix + "_MB_") }
            }
        }
    }

    if ((log != null) && ('MSG' in log.messageTypes)) {
        const messages = log.get("MSG").Message

        // This regular expression is used to get the word after "as" to get the GPS device name.
        // (?<=as\s) will exclude the "as" and a whitespace from the regex and then (\S+) will match the next word.
        const regex_gps_device = /(?<=as\s)(\S+)/i;
        const regex_gps_number = /(?<=GPS\s)(\S)/
        for (const message of messages) {
            if (message.startsWith("GPS")) {
                const num_match = message.match(regex_gps_number)
                const device_match = message.match(regex_gps_device)
                if ((num_match != null) && (device_match != null)) {
                    const gps_num = parseInt(num_match[0]) - 1
                    gps[gps_num].device = device_match[0]
                }
            }
        }
    }

    function print_gps(inst, gps_info) {
        let fieldset = document.createElement("fieldset")

        let heading = document.createElement("legend")
        heading.innerHTML = "GPS " + (inst+1)
        fieldset.appendChild(heading)

        // Try and decode the type param
        let types = []
        types[0] = "None"
        types[1] = "AUTO"
        types[2] = "uBlox"
        types[5] = "NMEA"
        types[6] = "SiRF"
        types[7] = "HIL"
        types[8] = "SwiftNav"
        types[9] = "DroneCAN"
        types[10] = "SBF"
        types[11] = "GSOF"
        types[13] = "ERB"
        types[14] = "MAV"
        types[15] = "NOVA"
        types[16] = "HemisphereNMEA"
        types[17] = "uBlox-MovingBaseline-Base"
        types[18] = "uBlox-MovingBaseline-Rover"
        types[19] = "MSP"
        types[20] = "AllyStar"
        types[21] = "ExternalAHRS"
        types[22] = "DroneCAN-MovingBaseline-Base"
        types[23] = "DroneCAN-MovingBaseline-Rover"
        types[24] = "UnicoreNMEA"
        types[25] = "UnicoreMovingBaselineNMEA"
        types[26] = "SBF-DualAntenna"

        if (types[gps_info.type] != null) {
            fieldset.appendChild(document.createTextNode("Type " + gps_info.type + ": " + types[gps_info.type]))
            fieldset.appendChild(document.createElement("br"))
        }

        fieldset.appendChild(document.createTextNode(gps_info.device))
        fieldset.appendChild(document.createElement("br"))

        // If DroneCAN type we can print the node name
        if ((gps_info.type == 9) || (gps_info.type == 22) || (gps_info.type == 23)) {

            // Can't tell which bus, so give up if the node ID is found on both
            let can_device
            let can_count = 0
            for (const [driver_num, can_driver] of Object.entries(can)) {
                if (gps_info.node_id in can_driver) {
                    can_device = can_driver[gps_info.node_id][0]
                    can_count++
                }
            }

            if ((can_device != null) && (can_count == 1)) {
                fieldset.appendChild(document.createTextNode("Name: " + can_device.name))
                fieldset.appendChild(document.createElement("br"))
            }
        }

        return fieldset
    }

    let section = document.getElementById("GPS")
    let table = document.createElement("table")
    section.appendChild(table)

    let have_section = false
    for (let i = 0; i < gps.length; i++) {
        if ((gps[i] != null) && ("device" in gps[i])) {
            have_section = true
            let colum = document.createElement("td")

            colum.appendChild(print_gps(i, gps[i]))
            table.appendChild(colum)
        }
    }

    section.previousElementSibling.hidden = !have_section
    section.hidden = !have_section
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
                const pos_prefix = prefix + "POS_"
                rangefinder[i] = { type: type,
                                   pos: get_param_array(params, get_param_name_vector3(pos_prefix)) }
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
            const pos_prefix = prefix + "POS_"
            flow[0] = { type: type,
                        pos: get_param_array(params, get_param_name_vector3(pos_prefix)) }
        }
    }

}

// load VISO
let viso
const max_num_viso = 1
function load_viso() {

    const prefix = "VISO_"
    const type_name = prefix + "TYPE"
    if (type_name in params) {
        const type = params[type_name]
        if (type != 0) {
            const pos_prefix = prefix + "POS_"
            viso[0] = { type: type,
                        pos: get_param_array(params, get_param_name_vector3(pos_prefix)) }
        }
    }

}


function update_pos_plot() {
    let max_offset = 0
    let plot_index = 1

    function pos_valid(pos) {
        return (pos[0] != null) && (pos[1] != null) && (pos[2] != null)
    }

    function set_plot_data(plot_data, pos) {
        plot_data.x = [pos[0]]
        plot_data.y = [pos[1]]
        plot_data.z = [pos[2]]
        plot_data.visible = true
        max_offset = Math.max(max_offset, Math.abs(pos[0]), Math.abs(pos[1]), Math.abs(pos[2]))
    }

    function set_plot_data_if_valid(plot_data, pos_inst) {
        if ((pos_inst != null) && pos_valid(pos_inst.pos)) {
            set_plot_data(plot_data, pos_inst.pos)
        }
    }

    for (let i = 0; i < max_num_ins; i++) {
        set_plot_data_if_valid(Sensor_Offset.data[plot_index], ins[i])
        plot_index++
    }

    for (let i = 0; i < max_num_gps; i++) {
        set_plot_data_if_valid(Sensor_Offset.data[plot_index], gps[i])
        if ((gps[i] != null) && pos_valid(gps[i].pos) && (gps[i].moving_base != null) && pos_valid(gps[i].moving_base)) {
            Sensor_Offset.data[plot_index].name += " Master"
            Sensor_Offset.data[plot_index].meta += " Master"
            Sensor_Offset.data[plot_index + 1].name += " Slave"
            Sensor_Offset.data[plot_index + 1].meta += " Slave"

            // Slave position is relative to master
            const slave_pos = array_sub(gps[i].pos, gps[i].moving_base)

            set_plot_data(Sensor_Offset.data[plot_index + 1], slave_pos)
        }
        plot_index += 2
    }

    for (let i = 0; i < max_num_rangefinder; i++) {
        set_plot_data_if_valid(Sensor_Offset.data[plot_index], rangefinder[i])
        plot_index++
    }

    for (let i = 0; i < max_num_flow; i++) {
        set_plot_data_if_valid(Sensor_Offset.data[plot_index], flow[i])
        plot_index++
    }

    for (let i = 0; i < max_num_viso; i++) {
        set_plot_data_if_valid(Sensor_Offset.data[plot_index], viso[i])
        plot_index++
    }

    let plot = document.getElementById("POS_OFFSETS")
    const have_plot = max_offset > 0
    if (have_plot) {
        Sensor_Offset.layout.scene.xaxis.range = [ -max_offset,  max_offset ]
        Sensor_Offset.layout.scene.yaxis.range = [  max_offset, -max_offset ]
        Sensor_Offset.layout.scene.zaxis.range = [  max_offset, -max_offset ]

        Plotly.redraw(plot)

        plot_visibility(plot, false)
    }


}

function show_param_changes(param_changes) {

    let para = document.getElementById("ParameterChanges")

    // Remove anything already in section
    para.replaceChildren()

    let added = 0
    for (const [name, changes] of Object.entries(param_changes)) {

        if (name.startsWith("STAT_")) {
            // Stats are set automatically and expected to change, don't report
            continue
        }
        added += 1

        // Create collapsable details element
        let details = document.createElement("details")
        details.style.marginBottom = "5px"
        para.appendChild(details)

        // Add name
        let summary = document.createElement("summary")
        summary.appendChild(document.createTextNode(name))
        details.appendChild(summary)

        // Table to show changes
        let table = document.createElement("table")
        table.style.borderCollapse = "collapse"
        table.style.marginTop = "5px"
        table.style.marginLeft = "10px"
        details.appendChild(table)

        // Add headers
        let header = document.createElement("tr")
        table.appendChild(header)

        // table formatting helper
        function set_cell_style(cell) {
            cell.style.border = "1px solid #000"
            cell.style.padding = "8px"
        }

        // Time
        let time = document.createElement("th")
        header.appendChild(time)
        time.appendChild(document.createTextNode("Time (s)"))
        set_cell_style(time)

        // Value
        let value = document.createElement("th")
        header.appendChild(value)
        value.appendChild(document.createTextNode("Value"))
        set_cell_style(value)

        // Add each change
        for (const change of changes) {
            let row = document.createElement("tr")
            table.appendChild(row)

            time = document.createElement("td")
            row.appendChild(time)
            time.appendChild(document.createTextNode(change.time.toFixed(2)))
            set_cell_style(time)

            value = document.createElement("td")
            row.appendChild(value)
            value.appendChild(document.createTextNode(change.value))
            set_cell_style(value)
        }
    }

    if (added == 0) {
        // Nothing interesting changed, don't show
        return
    }

    para.hidden = false
    para.previousElementSibling.hidden = false
}

function update_minimal_config() {

    if (Object.keys(params).length == 0) {
        return
    }
    document.forms["params"].hidden = false
    document.forms["params"].previousElementSibling.hidden = false
    document.getElementById("SaveMinimalParams").hidden = false

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
    load_gps(log)
    load_rangefinder()
    load_flow()
    load_viso()


    if (Object.keys(params).length > 0) {
        // Show param save
        let ParametersContent = document.getElementById("ParametersContent")
        ParametersContent.hidden = false
        ParametersContent.previousElementSibling.hidden = false
    }

    update_minimal_config()

    update_pos_plot()

    // Add warning if arming checks are disabled
    if ((("ARMING_SKIP" in params) && params.ARMING_SKIP > 0) || (("ARMING_CHECK" in params) && params.ARMING_CHECK === 0)) {
        add_warning("exclamation-triangle-orange", document.createTextNode("Arming checks disabled"))
    }

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
function load_can(log) {

    if (!('CAND' in log.messageTypes)) {
        return
    }

    const have_driver_num = log.messageTypes.CAND.expressions.includes("Driver")
    for (const inst of Object.keys(log.messageTypes.CAND.instances)) {
        const CAND = log.get_instance("CAND", inst)
        const node_id = parseFloat(inst)

        for (let i = 0; i < CAND.Name.length; i++) {
            let driver = "all"
            if (have_driver_num) {
                driver = CAND.Driver[i]
            }
            if (can[driver] == null) {
                can[driver] = []
            }

            if (can[driver][node_id] == null) {
                can[driver][node_id] = []
            }

            // New obj
            let can_obj = { 
                name: CAND.Name[i],
                version: CAND.Major[i] + "." + CAND.Minor[i],
                UID1: CAND.UID1[i],
                UID2: CAND.UID2[i],
                hash: CAND.Version[i].toString(16).padStart(8, '0')
            }

            // Check for duplicates
            let found = false
            for (const existing of can[driver][node_id]) {
                if ((existing.name == can_obj.name) && 
                    (existing.version == can_obj.version) &&
                    (existing.UID1 == can_obj.UID1) &&
                    (existing.UID2 == can_obj.UID2) &&
                    (existing.hash == can_obj.hash)) {
                    found = true
                    break
                }
            }

            if (!found) {
                // Add if not found
                can[driver][node_id].push(can_obj)
            }
        }
    }

    function print_can(inst, info) {

        let fieldset = document.createElement("fieldset")

        let heading = document.createElement("legend")
        heading.innerHTML = "Node id " + inst
        fieldset.appendChild(heading)

        fieldset.appendChild(document.createTextNode("Name: " + info.name))
        fieldset.appendChild(document.createElement("br"))

        fieldset.appendChild(document.createTextNode("Firmware version: " + info.version))

        const version_div = document.createElement("div")
        version_div.style.display = "inline"
        fieldset.appendChild(version_div)
        if (info.name.startsWith("org.ardupilot")) {
            check_release(info.hash, version_div)
        }

        fieldset.appendChild(document.createElement("br"))

        fieldset.appendChild(document.createTextNode("UID1: 0x" + info.UID1.toString(16)))
        fieldset.appendChild(document.createElement("br"))

        fieldset.appendChild(document.createTextNode("UID2: 0x" + info.UID2.toString(16)))

        return fieldset
    }

    let section = document.getElementById("DroneCAN")

    let have_section = false
    for (const [driver_num, can_driver] of Object.entries(can)) {
        if (have_driver_num) {
            let heading = document.createElement("h4")
            heading.appendChild(document.createTextNode("Driver " + driver_num + ":"))
            section.appendChild(heading)
        }

        let table = document.createElement("table")
        section.appendChild(table)
        for (let i = 0; i < can_driver.length; i++) {
            if (can_driver[i] != null) {
                for (let j = 0; j < can_driver[i].length; j++) {
                    have_section = true
                    let colum = document.createElement("td")

                    colum.appendChild(print_can(i, can_driver[i][j]))
                    table.appendChild(colum)
                }
            }
        }
    }

    section.previousElementSibling.hidden = !have_section
    section.hidden = !have_section
}

function load_waypoints(log) {

    function item_compare(A, B) {
        if ((A == null) || (B == null)) {
            return true
        }
        return A.command_total === B.command_total &&
            A.sequence === B.sequence &&
            A.command === B.command &&
            A.param1 === B.param1 &&
            A.param2 === B.param2 &&
            A.param3 === B.param3 &&
            A.param4 === B.param4 &&
            A.latitude === B.latitude &&
            A.longitude === B.longitude &&
            A.altitude === B.altitude &&
            A.frame === B.frame
    }

    function get_download_link(mission_name, mission) {
        let link = document.createElement("a")
        link.title = "download file"
        link.innerHTML = mission_name
        link.href = "#"
        link.addEventListener('click', function() {
            let text = "QGC WPL 110\n"

            let count = 0
            for (let j = 0; j < mission.length; j++) {
                if (mission[j] == null) {
                    continue
                }
                count++
    
                text += mission[j].sequence + "\t"
                text += "0\t"
                text += mission[j].frame + "\t"
                text += mission[j].command + "\t"
                text += mission[j].param1.toFixed(8) + "\t"
                text += mission[j].param2.toFixed(8) + "\t"
                text += mission[j].param3.toFixed(8) + "\t"
                text += mission[j].param4.toFixed(8) + "\t"
                text += (mission[j].latitude / 10**7).toFixed(8) + "\t"
                text += (mission[j].longitude / 10**7).toFixed(8) + "\t"
                text += (mission[j].altitude).toFixed(6) + "\t"
                text += "1\n"
            }
    
            if (mission.command_total != count) {
                alert("Mission incomplete")
            }
    
            var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            saveAs(blob, mission_name)
        })
        return link
    }

    // Load missions
    if ('CMD' in log.messageTypes) {
        const CMD = log.get("CMD")

        let missions = []
        let mission_inst = 0
        for (let i = 0; i < CMD.CTot.length; i++) {
            const item = { 
                command_total : CMD.CTot[i],
                sequence      : CMD.CNum[i],
                command       : CMD.CId[i],
                param1        : CMD.Prm1[i],
                param2        : CMD.Prm2[i],
                param3        : CMD.Prm3[i],
                param4        : CMD.Prm4[i],
                latitude      : CMD.Lat[i],
                longitude     : CMD.Lng[i],
                altitude      : CMD.Alt[i],
                frame         : CMD.Frame[i]
            }

            const index = item.sequence
            if ((missions[mission_inst] != null) && 
                ((item.command_total != missions[mission_inst].command_total) || !item_compare(item, missions[mission_inst][index]))) {
                // Item does not match existing mission, start a new one
                mission_inst++
            }
            if (missions[mission_inst] == null) {
                missions[mission_inst] = []
                missions[mission_inst].command_total = item.command_total
            }
            missions[mission_inst][index] = item
        }

        let para = document.getElementById("WAYPOINTS")
        para.hidden = false
        para.previousElementSibling.hidden = false

        // add heading
        let heading = document.createElement("h4")
        heading.innerHTML = "Mission"
        para.appendChild(heading)

        let para2 = document.createElement("p")
        para.appendChild(para2)

        for (let i = 0; i < missions.length; i++) {
            if (i > 0) {
                para2.appendChild(document.createTextNode(", "))
            }
            para2.appendChild(get_download_link("waypoints_" + i + ".txt", missions[i]))
        }
    }

    // Load fence
    if ('FNCE' in log.messageTypes) {
        const FNCE = log.get("FNCE")

        let fences = []
        let fence_inst = 0
        for (let i = 0; i < FNCE.Tot.length; i++) {

            let command
            let p1
            switch (FNCE.Type[i]) {
                case 98:
                    command = 5001
                    p1 = FNCE.Count[i]
                    break

                case 97:
                    command = 5002
                    p1 = FNCE.Count[i]
                    break

                case 95:
                    command = 5000
                    p1 = 0
                    break

                case 93:
                    command = 5004
                    p1 = FNCE.Radius[i]
                    break

                case 92:
                    command = 5003
                    p1 = FNCE.Radius[i]
                    break

                default:
                    // Unknown type
                    continue
            }

            const item = { 
                command_total : FNCE.Tot[i],
                sequence      : FNCE.Seq[i] + 1, // Offset by 1 since home it not included
                command       : command,
                param1        : p1,
                param2        : 0,
                param3        : 0,
                param4        : 0,
                latitude      : FNCE.Lat[i],
                longitude     : FNCE.Lng[i],
                altitude      : 0,
                frame         : 0
            }

            const index = item.sequence
            if ((fences[fence_inst] != null) && 
                ((item.command_total != fences[fence_inst].command_total) || !item_compare(item,fences[fence_inst][index]))) {
                // Item does not match existing fence, start a new one
                fence_inst++
            }
            if (fences[fence_inst] == null) {
                fences[fence_inst] = []
                fences[fence_inst].command_total = item.command_total
            }
            fences[fence_inst][index] = item
        }

        let para = document.getElementById("WAYPOINTS")
        para.hidden = false
        para.previousElementSibling.hidden = false

        // add heading
        let heading = document.createElement("h4")
        heading.innerHTML = "Polygon fence"
        para.appendChild(heading)

        let para2 = document.createElement("p")
        para.appendChild(para2)

        for (let i = 0; i < fences.length; i++) {
            if (i > 0) {
                para2.appendChild(document.createTextNode(", "))
            }
            para2.appendChild(get_download_link("fence_" + i + ".txt", fences[i]))
        }
    }

    // Load rally points
    if ('RALY' in log.messageTypes) {
        const RALY = log.get("RALY")

        let rallypoints = []
        let rallyinst = 0
        for (let i = 0; i < RALY.Tot.length; i++) {

            let alt_frame = 3 // MAV_FRAME_GLOBAL_RELATIVE_ALT

            // Decode flags if available
            if ("Flags" in RALY) {
                const flags = RALY.Flags[i]
                const alt_frame_valid = (flags & 0b0000100) != 0
                const AP_alt_frame = (flags & 0b00011000) >> 3

                if (alt_frame_valid) {
                    switch(AP_alt_frame) {
                        case 0: // Location::AltFrame::ABSOLUTE
                            alt_frame = 0 // MAV_FRAME_GLOBAL
                            break

                        case 1: // Location::AltFrame::ABOVE_HOME
                            alt_frame = 3 // MAV_FRAME_GLOBAL_RELATIVE_ALT
                            break

                        case 2: // Location::AltFrame::ABOVE_ORIGIN
                            // invalid
                            continue

                        case 3: // Location::AltFrame::ABOVE_TERRAIN
                            alt_frame = 10 // MAV_FRAME_GLOBAL_TERRAIN_ALT
                            break
                    }
                }
            }

            const item = { 
                command_total : RALY.Tot[i],
                sequence      : RALY.Seq[i] + 1, // Offset by 1 since home it not included
                command       : 5100, // MAV_CMD_NAV_RALLY_POINT
                param1        : 0,
                param2        : 0,
                param3        : 0,
                param4        : 0,
                latitude      : RALY.Lat[i],
                longitude     : RALY.Lng[i],
                altitude      : RALY.Alt[i],
                frame         : alt_frame
            }

            const index = item.sequence
            if ((rallypoints[rallyinst] != null) && 
                ((item.command_total != rallypoints[rallyinst].command_total) || !item_compare(item, rallypoints[rallyinst][index]))) {
                // Item does not match existing points, start a new set
                rallyinst++
            }
            if (rallypoints[rallyinst] == null) {
                rallypoints[rallyinst] = []
                rallypoints[rallyinst].command_total = item.command_total
            }
            rallypoints[rallyinst][index] = item
        }

        let para = document.getElementById("WAYPOINTS")
        para.hidden = false
        para.previousElementSibling.hidden = false

        // add heading
        let heading = document.createElement("h4")
        heading.innerHTML = "Rally points"
        para.appendChild(heading)

        let para2 = document.createElement("p")
        para.appendChild(para2)

        for (let i = 0; i < rallypoints.length; i++) {
            if (i > 0) {
                para2.appendChild(document.createTextNode(", "))
            }
            para2.appendChild(get_download_link("rally_" + i + ".txt", rallypoints[i]))
        }

    }

}

function plot_visibility(plot, hide) {
    plot.parentElement.hidden = hide
}

function plot_data_rate(log) {

    function add_datarate(name) {
        const section = document.getElementById("DataRates")

        section.hidden = false
        section.previousElementSibling.hidden = false

        const div = document.createElement("div")
        section.appendChild(div)

        const title = document.createElement("h4")
        title.innerHTML = name
        div.appendChild(title)

        const plot = document.createElement("div")
        plot.style = "width:800px; height:400px"
        div.appendChild(plot)
        return plot
    }

    // UART data rates
    if ('UART' in log.messageTypes) {

        // Iterate over each instance
        for (const inst of Object.keys(log.messageTypes.UART.instances)) {

            // convert baud rate param value into baudrate
            function map_baudrate(rate)
            {
                if (rate == null) {
                    return
                }
                rate = parseInt(rate)

                if (rate <= 0) {
                    rate = 57
                }
                switch (rate) {
                    case 1:    return 1200
                    case 2:    return 2400
                    case 4:    return 4800
                    case 9:    return 9600
                    case 19:   return 19200
                    case 38:   return 38400
                    case 57:   return 57600
                    case 100:  return 100000
                    case 111:  return 111100
                    case 115:  return 115200
                    case 230:  return 230400
                    case 256:  return 256000
                    case 460:  return 460800
                    case 500:  return 500000
                    case 921:  return 921600
                    case 1500:  return 1500000
                    case 2000:  return 2000000
                }
            
                if (rate > 2000) {
                    // assume it is a direct baudrate. This allows for users to
                    // set an exact baudrate as long as it is over 2000 baud
                    return rate
                }
            
                // otherwise allow any other kbaud rate
                return rate * 1000
            }

            const serial_protocols = {
                "-1": "None",
                 "0": "None",
                 "1": "MAVLink1",
                 "2": "MAVLink2",
                 "3": "Frsky D",
                 "4": "Frsky SPort",
                 "5": "GPS",
                 // SerialProtocol_GPS2
                 "7": "Alexmos Gimbal Serial",
                 "8": "Gimbal",
                 "9": "Rangefinder",
                "10": "FrSky SPort Passthrough (OpenTX)",
                "11": "Lidar360",
                // SerialProtocol_Aerotenna_USD1
                "13": "Beacon",
                "14": "Volz servo out",
                "15": "SBus servo out",
                "16": "ESC Telemetry",
                "17": "Devo Telemetry",
                "18": "OpticalFlow",
                "19": "RobotisServo",
                "20": "NMEA Output",
                "21": "WindVane",
                "22": "SLCAN",
                "23": "RCIN",
                "24": "EFI Serial",
                "25": "LTM",
                "26": "RunCam",
                "27": "HottTelem",
                "28": "Scripting",
                "29": "Crossfire VTX",
                "30": "Generator",
                "31": "Winch",
                "32": "MSP",
                "33": "DJI FPV",
                "34": "AirSpeed",
                "35": "ADSB",
                "36": "AHRS",
                "37": "SmartAudio",
                "38": "FETtecOneWire",
                "39": "Torqeedo",
                "40": "AIS",
                "41": "CoDevESC",
                "42": "DisplayPort",
                "43": "MAVLink High Latency",
                "44": "IRC Tramp",
                "45": "DDS XRCE",
                "46": "IMUDATA",
                // Reserving Serial Protocol 47 for SerialProtocol_IQ
                "48": "PPP",
                "49": "i-BUS Telemetry",
                "50": "IOMCU",
            }

            let title
            let baud

            function getProtocolName(num) {
                if (num in serial_protocols) {
                    return serial_protocols[num]
                }
                return "protocol " + num
            }

            function SerialTitle() {
                const param_prefix = "SERIAL" + inst + "_"
                const protocol_num = params[param_prefix + "PROTOCOL"]
                if (protocol_num == undefined) {
                    // Not a serial port
                    return false
                }
                const name = getProtocolName(protocol_num)
                title = `Serial ${inst}: ` + getProtocolName(protocol_num)

                if (name == "IOMCU") {
                    baud = 1500000
                } else {
                    baud = map_baudrate(params[param_prefix + "BAUD"])
                    if (baud != null) {
                        title += ", " + baud + " baud"
                    }
                }

                return true
            }

            function NetTitle() {
                const netInst = inst - 20
                if (netInst < 1) {
                    // Not a networking serial port
                    return false
                }
                const param_prefix = "NET_P" + netInst + "_"
                const protocol_num = params[param_prefix + "PROTOCOL"]
                if (protocol_num == undefined) {
                    // Not a networking serial port
                    return false
                }
                title = `Networking Port ${netInst}: ` + getProtocolName(protocol_num)

                const type = params[param_prefix + "TYPE"]
                const types = {
                    "1": "UDP client",
                    "2": "UDP server",
                    "3": "TCP client",
                    "4": "TCP server",
                }
                if (type in types) {
                    title += " " + types[type]
                }

                const IP0 = params[param_prefix + "IP0"]
                const IP1 = params[param_prefix + "IP1"]
                const IP2 = params[param_prefix + "IP2"]
                const IP3 = params[param_prefix + "IP3"]
                const PORT = params[param_prefix + "PORT"]

                if (IP0 != undefined && IP1 != undefined && IP2 != undefined && IP3 != undefined && PORT != undefined) {
                    title += ` ${IP0}.${IP1}.${IP2}.${IP3}:${PORT}`
                }

                return true
            }

            function DroneCANTitle(driverIst) {
                const offset = driverIst == 1 ? 40 : 50
                const DCInst = inst - offset
                if (DCInst < 1) {
                    // Not a DroneCAN serial port
                    return false
                }
                const param_prefix = `CAN_D${driverIst}_UC_S${DCInst}_`
                const protocol_num = params[param_prefix + "PRO"]
                if (protocol_num == undefined) {
                    // Not a DroneCAN serial port
                    return false
                }
                title = `DroneCAN Driver ${driverIst} Port ${DCInst}: `

                const node = params[param_prefix + "NOD"]
                const index = params[param_prefix + "IDX"]
                if (node != undefined && index != undefined) {
                    title += `NodeID: ${node} Port: ${index} `
                }

                title += getProtocolName(protocol_num)

                baud = map_baudrate(params[param_prefix + "BD"])
                if (node != undefined && index != undefined) {
                    title += " " + baud + " baud"
                }

                return true
            }

            function IOMCUTitle() {
                if (inst != 100) {
                    // Not IOMCU
                    return false
                }
                baud = 1500000
                title = "IMUCU, " + baud + " baud"
                return true
            }


            if (!SerialTitle() && !NetTitle() && !DroneCANTitle(1) && !DroneCANTitle(2) && !IOMCUTitle()) {
                // Generic title
                title = "UART " + inst
            }

            const UART_inst = log.get_instance("UART", inst)
            const time = TimeUS_to_seconds(UART_inst.TimeUS)

            const Tx_name = "Transmit"
            const Rx_name = "Receive"
            const data = [
                { x: time, y: UART_inst.Rx, name: Rx_name, meta: Rx_name, mode: 'lines', hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} B/s" },
                { x: time, y: UART_inst.Tx, name: Tx_name, meta: Tx_name, mode: 'lines', hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} B/s" }
            ]

            if (baud != null) {
                // 10 bits per byte, 8 + start + stop
                const bytes_per_sec = baud / 10

                const limit_name = "Baud limit"
                const limit_x = [time[0], time[time.length-1]]
                const limit_y = [bytes_per_sec, bytes_per_sec]

                data.push({ x: limit_x, y: limit_y, name: limit_name, meta: limit_name, mode: 'lines', hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} B/s", line: { dash: "dot", color: "#000000" },})
            }

            const layout = { 
                legend: {itemclick: false, itemdoubleclick: false }, 
                margin: { b: 50, l: 60, r: 50, t: 20 },
                xaxis: { title: {text: "Time (s)" } },
                yaxis: { title: {text: "Data rate (bytes/second)"}}
            }

            const plot_div = add_datarate(title)
            Plotly.newPlot(plot_div, data, layout, {displaylogo: false});

        }
    }

    // CAN data rates
    if ('CANS' in log.messageTypes) {

        // Iterate over each instance
        for (const inst of Object.keys(log.messageTypes.CANS.instances)) {
            const driver_inst = parseInt(inst) + 1

            const options = params["CAN_D" + driver_inst + "_UC_OPTION"]
            let FD = false
            if ((options != null) && ((options & (1<<2)) != 0)) {
                FD = true
            }

            let bitrate
            for (let i = 1; i < 10; i++) {
                const driver = params["CAN_P" + i + "_DRIVER"]
                if (driver == driver_inst) {
                    if (!FD) { 
                        bitrate = parseInt(params["CAN_P" + i + "_BITRATE"])
                    } else {
                        bitrate = parseInt(params["CAN_P" + i + "_FDBITRATE"]) * 1000000
                    }
                    break
                }
            }

            let title = "DroneCAN " + inst
            if (bitrate != null) {
                title += ": " + (bitrate/1000000) + "Mbit/s"
            }

            // Converting bitrate into a frame rate is a bit complicated.
            // CANFD is even worse
            let max_frame_limit
            if ((bitrate != null) && !FD) {
                // Give a worst case value by assumeing max size frames and worst bit stuffing.
                // Bit stuffing gives a worst case frame length of 157 bits
                // https://en.wikipedia.org/wiki/CAN_bus#Bit_stuffing
                // There is also a 3 bit gap required between frames
                // https://en.wikipedia.org/wiki/CAN_bus#Interframe_spacing
                max_frame_limit = Math.floor(bitrate / (157 + 3))

                // In relity not all frames will be max lenght and less bit stuffing will be required.
                // Could add a less pessimistic estimate too...
            }

            const CANS_inst = log.get_instance("CANS", inst)
            let time = TimeUS_to_seconds(CANS_inst.TimeUS)

            // Convert cumulative counts into data rates
            const len = time.length
            let tx = new Array(len - 1)
            let rx = new Array(len - 1)
            let total = new Array(len - 1)
            for (let i = 0; i<(len - 1); i++) {
                const dt = time[i+1] - time[i]
                tx[i] = (CANS_inst.T[i+1] - CANS_inst.T[i]) / dt
                rx[i] = (CANS_inst.R[i+1] - CANS_inst.R[i]) / dt
                total[i] = tx[i] + rx[i]
            }

            // Taking the diff means we have one less point
            time.shift()

            const Tx_name = "Transmit"
            const Rx_name = "Receive"
            const Total_name = "Total"
            const data = [
                { x: time, y: rx, name: Rx_name, meta: Rx_name, mode: 'lines', hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} f/s" },
                { x: time, y: tx, name: Tx_name, meta: Tx_name, mode: 'lines', hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} f/s" },
                { x: time, y: total, name: Total_name, meta: Total_name, mode: 'lines', hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} f/s" }
            ]

            if (max_frame_limit != null) {
                const limit_name = "Worst case limit"
                const limit_x = [time[0], time[time.length-1]]
                const limit_y = [max_frame_limit, max_frame_limit]

                data.push({ x: limit_x, y: limit_y, name: limit_name, meta: limit_name, mode: 'lines', hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} f/s", line: { dash: "dot", color: "#000000" },})
            }

            const layout = { 
                legend: {itemclick: false, itemdoubleclick: false }, 
                margin: { b: 50, l: 60, r: 50, t: 20 },
                xaxis: { title: {text: "Time (s)" } },
                yaxis: { title: {text: "Data rate (CAN frames/second)"}}
            }

            const plot_div = add_datarate(title)
            Plotly.newPlot(plot_div, data, layout, {displaylogo: false});

            if (max_frame_limit != null) {
                // Add a note to make the limit less scary
                const txt = "Limit is a very pessimistic worst case. It assumes max length frames and worst data. The best case is more than twice as many frames, the reality will be somewhere in between."
                const para = document.createElement("p")
                para.style = "width:600px"
                para.appendChild(document.createTextNode(txt))
                plot_div.parentElement.insertBefore(para, plot_div)
            }
        }
    }
}

// Add a new warning to the top of the page
function add_warning(image, content) {
    const warning_section = document.getElementById("warnings")
    warning_section.hidden = false
    warning_section.previousElementSibling.hidden = false

    const table = document.createElement("table")
    warning_section.appendChild(table)

    const row = document.createElement("tr")
    table.appendChild(row)

    const icon_cell = document.createElement("td")
    row.appendChild(icon_cell)

    const img = document.createElement("img")
    img.style.width = "40px"
    img.style.verticalAlign = "bottom"
    img.src = "../images/" + image + ".svg"
    icon_cell.appendChild(img)

    const content_cell = document.createElement("td")
    row.appendChild(content_cell)

    content_cell.appendChild(content)
}

// micro seconds to seconds helpers
const US2S = 1 / 1000000
function TimeUS_to_seconds(TimeUS) {
    return array_scale(TimeUS, US2S)
}

let params = {}
let defaults = {}
async function load_log(log_file) {

    // Make sure imports are fully loaded before starting
    // This is needed when called from "open in"
    await Promise.allSettled(import_done)

    const start = performance.now()

    let log = new DataflashParser()
    log.processData(log_file, [])

    open_in_update(log)

    if (!('PARM' in log.messageTypes)) {
        // The whole tool assumes it has param values
        alert("No parameter values found in log")
        return
    }

    // Loading CAN first allows Driver IDs to be anotated with node name when params are loaded
    load_can(log)

    const PARM = log.get("PARM")
    let param_changes = {}
    let param_time = {}
    for (let i = 0; i < PARM.Name.length; i++) {
        const name = PARM.Name[i]
        const time = PARM.TimeUS[i] * US2S
        const value = PARM.Value[i]

        if ((name in params) && (params[name] != value)) {
            // Already seen this param with a different value record change
            if (!(name in param_changes)) {
                // Add original value
                param_changes[name] = [{time: param_time[name], value: params[name]}]
            }
            param_changes[name].push({time, value})
        }

        params[name] = value
        param_time[name] = time
        if ("Default" in PARM) {
            const default_val = PARM.Default[i]
            if (!isNaN(default_val)) {
                defaults[name] = default_val
            }
        }
    }

    show_param_changes(param_changes)

    if (Object.keys(defaults).length > 0) {
        document.getElementById("SaveChangedParams").hidden = false
        document.getElementById("param_base_changed").disabled = false
        document.getElementById("param_base_changed").checked = true
    }

    load_params(log)

    const version = get_version_and_board(log)

    if (version.fw_string != null) {
        let section = document.getElementById("VER")
        section.hidden = false
        section.previousElementSibling.hidden = false
        section.appendChild(document.createTextNode(version.fw_string))

        if (version.os_string != null) {
            section.appendChild(document.createElement("br"))
            section.appendChild(document.createTextNode(version.os_string))
        }

        if (version.fw_hash != null) {
            check_release(version.fw_hash, section)
        }
    }

    const haveFlightController = version.flight_controller != null
    const haveBoardId = version.board_id != null
    if (haveFlightController || haveBoardId) {
        let section = document.getElementById("FC")
        section.hidden = false
        section.previousElementSibling.hidden = false
        if (haveFlightController) {
            // Print name given in log
            section.appendChild(document.createTextNode(version.flight_controller))
        }
        if (haveBoardId) {
            if (haveFlightController) {
                section.appendChild(document.createElement("br"))
                section.appendChild(document.createElement("br"))
            }

            // Lookup the board ID
            section.appendChild(document.createTextNode("Board ID: " + version.board_id))
            if (version.board_id in board_types) {
                section.appendChild(document.createTextNode(" " + board_types[version.board_id]))
            }
        }
    }

    // Look for watchdog
    show_watchdog(log)

    // Look for internal errors
    show_internal_errors(log)

    // IOMCU
    if ('IOMC' in log.messageTypes) {
        const IOMC = log.get("IOMC")

        let para = document.getElementById("IOMCU")
        para.hidden = false
        para.previousElementSibling.hidden = false

        if ("RSErr" in IOMC) {
            const read_satus_error = Math.max(...IOMC.RSErr)
            para.appendChild(document.createTextNode("Status read errors: " + read_satus_error + " " + (read_satus_error == 0 ? "\u2705" : "\u274C")))
            para.appendChild(document.createElement("br"))
        }

        const total_errors =  Math.max(...IOMC.Nerr)
        para.appendChild(document.createTextNode("Flight Controller errors: " + total_errors + " " + (total_errors == 0 ? "\u2705" : "\u274C")))
        para.appendChild(document.createElement("br"))

        const IOMCU_total_errors =  Math.max(...IOMC.Nerr2)
        para.appendChild(document.createTextNode("IOMCU errors: " + IOMCU_total_errors + " " + (IOMCU_total_errors == 0 ? "\u2705" : "\u274C")))
        para.appendChild(document.createElement("br"))

        const delayed_packets =  Math.max(...IOMC.NDel)
        para.appendChild(document.createTextNode("Delayed packets: " + delayed_packets + " " + (delayed_packets == 0 ? "\u2705" : "\u274C")))
    }

    const have_HEAT = 'HEAT' in log.messageTypes
    const have_POWR = 'POWR' in log.messageTypes
    const have_POWR_temp = have_POWR && log.messageTypes.POWR.expressions.includes('MTemp')
    const have_MCU = 'MCU' in log.messageTypes
    const have_IMU = 'IMU' in log.messageTypes
    if (have_HEAT || have_POWR_temp || have_MCU || have_IMU) {
        let plot = document.getElementById("Temperature")
        plot_visibility(plot, false)

        if (have_HEAT) {
            const time = TimeUS_to_seconds(log.get("HEAT", "TimeUS"))

            Temperature.data[0].x = time
            Temperature.data[0].y = log.get("HEAT", "Targ")

            Temperature.data[1].x = time
            Temperature.data[1].y = log.get("HEAT", "Temp")
        }

        if (have_MCU) {
            Temperature.data[2].x = TimeUS_to_seconds(log.get("MCU", "TimeUS"))
            Temperature.data[2].y = log.get("MCU", "MTemp")

        } else if (have_POWR_temp) {
            Temperature.data[2].x = TimeUS_to_seconds(log.get("POWR", "TimeUS"))
            Temperature.data[2].y = log.get("POWR", "MTemp")

        }

        if (have_IMU) {
            if ("instances" in log.messageTypes.IMU) {
                for (const inst of Object.keys(log.messageTypes.IMU.instances)) {
                    const i = parseFloat(inst)
                    Temperature.data[3+i].x = TimeUS_to_seconds(log.get_instance("IMU", inst, "TimeUS"))
                    Temperature.data[3+i].y = log.get_instance("IMU", inst, "T")
                }
            }
        }

        Plotly.redraw(plot)
    }

    // Voltage plot
    if (have_POWR || have_MCU) {
        let showPlot = false

        if (have_POWR) {
            const time = TimeUS_to_seconds(log.get("POWR", "TimeUS"))

            const servo = log.get("POWR", "VServo")
            if (!array_all_NaN(servo)) {
                Board_Voltage.data[1].x = time
                Board_Voltage.data[1].y = servo
                showPlot = true
            }


            const vcc = log.get("POWR", "Vcc")
            if (!array_all_NaN(vcc)) {
                Board_Voltage.data[2].x = time
                Board_Voltage.data[2].y = vcc
                showPlot = true
            }


            if (!have_MCU && log.messageTypes.POWR.expressions.includes('MVolt')) {
                Board_Voltage.data[3].x = time
                Board_Voltage.data[3].y = log.get("POWR", "MVolt")

                Board_Voltage.data[0].x = [...time, ...time.toReversed()]
                Board_Voltage.data[0].y = [...log.get("POWR", "MVmax"), ...log.get("POWR", "MVmin").toReversed()]

                showPlot = true
            }
        }

        if (have_MCU) {
            const time = TimeUS_to_seconds(log.get("MCU", "TimeUS"))

            Board_Voltage.data[3].x = time
            Board_Voltage.data[3].y = log.get("MCU", "MVolt")

            Board_Voltage.data[0].x = [...time, ...time.toReversed()]
            Board_Voltage.data[0].y = [...log.get("MCU", "MVmax"), ...log.get("MCU", "MVmin").toReversed()]

            showPlot = true
        }

        if (showPlot) {
            let plot = document.getElementById("Board_Voltage")
            plot_visibility(plot, false)
            Plotly.redraw(plot)
        }
    }

    // Power flags
    if (have_POWR) {

        // Bitmask values for flags
        const MAV_POWER_STATUS = {
            BRICK_VALID: 1 << 0,
            SERVO_VALID: 1 << 1,
            USB_CONNECTED: 1 << 2,
            PERIPH_OVERCURRENT: 1 << 3,
            PERIPH_HIPOWER_OVERCURRENT: 1 << 4,
            CHANGED: 1 << 5,
        }

        // Helper to decode bitmask to 0 or 1 array
        function array_bit_set(A, val) {
            const len = A.length
            let ret = new Array(len)
            for (let i = 0; i<len; i++) {
                ret[i] = ((A[i] & val) != 0) ? 1 : 0
            }
            return ret
        }

        // Deal with log field name hange
        let AccFlags_name
        if (log.messageTypes.POWR.expressions.includes("AccFlags")) {
            AccFlags_name = "AccFlags"
        } else {
            AccFlags_name = "AccFlg"
        }

        let flag_name
        if (log.messageTypes.POWR.expressions.includes("Flags")) {
            flag_name = "Flags"
        } else {
            flag_name = "Flg"
        }

        // Only plot if there is some change
        let show_flags = log.messageTypes.POWR.expressions.includes(flag_name)
        if (show_flags && log.messageTypes.POWR.expressions.includes(AccFlags_name) && array_all_equal(array_bit_set(log.get("POWR", AccFlags_name), MAV_POWER_STATUS.CHANGED), 0)) {
            show_flags = false
        }

        if (show_flags) {
            let plot = document.getElementById("power_flags")
            plot_visibility(plot, false)

            const flags = log.get("POWR", flag_name)
            const time = TimeUS_to_seconds(log.get("POWR", "TimeUS"))

            power_flags.data[0].x = time
            power_flags.data[0].y = array_bit_set(flags, MAV_POWER_STATUS.BRICK_VALID)

            power_flags.data[1].x = time
            power_flags.data[1].y = array_bit_set(flags, MAV_POWER_STATUS.SERVO_VALID)

            power_flags.data[2].x = time
            power_flags.data[2].y = array_bit_set(flags, MAV_POWER_STATUS.USB_CONNECTED)

            power_flags.data[3].x = time
            power_flags.data[3].y = array_bit_set(flags, MAV_POWER_STATUS.PERIPH_OVERCURRENT)

            power_flags.data[4].x = time
            power_flags.data[4].y = array_bit_set(flags, MAV_POWER_STATUS.PERIPH_HIPOWER_OVERCURRENT)

            Plotly.redraw(plot)
        }
    }

    // Performance
    if ('PM' in log.messageTypes) {
        const PM = log.get("PM")

        document.getElementById("CPU").hidden = false

        // Load
        let plot = document.getElementById("performance_load")
        plot_visibility(plot, false)

        const time = TimeUS_to_seconds(PM.TimeUS)

        performance_load.data[0].x = time
        performance_load.data[0].y = array_scale(PM.Load, 1 / 10)
        
        Plotly.redraw(plot)

        // Memory
        plot = document.getElementById("performance_mem")
        plot_visibility(plot, false)

        performance_mem.data[0].x = time
        performance_mem.data[0].y = PM.Mem

        Plotly.redraw(plot)

        // Time
        plot = document.getElementById("performance_time")
        plot_visibility(plot, false)

        performance_time.data[0].x = time
        performance_time.data[0].y = array_inverse(array_scale(PM.MaxT, 1 / 1000000))

        if ("LR" in PM) {
            performance_time.data[1].x = time
            performance_time.data[1].y = PM.LR
        }

        Plotly.redraw(plot)

    }

    plot_data_rate(log)

    if ('STAK' in log.messageTypes) {
        let stack = []
        for (const inst of Object.keys(log.messageTypes.STAK.instances)) {
            // Assume id, priority and name do not change
            const STAK_inst = log.get_instance("STAK", inst)
            stack.push({ id: parseFloat(inst), 
                         priority: STAK_inst.Pri[0],
                         name: STAK_inst.Name[0],
                         time: TimeUS_to_seconds(STAK_inst.TimeUS),
                         total_size: STAK_inst.Total,
                         free: STAK_inst.Free})
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

        document.getElementById("Stack").hidden = false

        plot = document.getElementById("stack_mem")
        plot_visibility(plot, false)
        Plotly.purge(plot)
        Plotly.newPlot(plot, stack_mem.data, stack_mem.layout, {displaylogo: false});

        plot = document.getElementById("stack_pct")
        plot_visibility(plot, false)
        Plotly.purge(plot)
        Plotly.newPlot(plot, stack_pct.data, stack_pct.layout, {displaylogo: false});

    }

    // Add download link for missions, fence and rally points
    load_waypoints(log)

    // Add download link for embedded files
    if ('FILE' in log.messageTypes) {
        log.parseAtOffset("FILE")
        log.processFiles()
        if (Object.keys(log.files).length > 0) {
            let para = document.getElementById("FILES")
            para.hidden = false
            para.previousElementSibling.hidden = false

            let first_item = true
            for (const [name, contents] of Object.entries(log.files)) {
                if (!first_item) {
                    para.appendChild(document.createTextNode(", "))
                }
                first_item = false


                let link = document.createElement("a")
                link.title = "download file"
                link.innerHTML = name
                link.href = "#"
                link.addEventListener('click', function() { saveAs(new Blob([contents]), name) })

                para.appendChild(link)

                if (name.endsWith("crash_dump.bin")) {
                    // The dev-team want to hear about crash dumps.
                    const content = document.createElement("div")
                    content.appendChild(document.createTextNode("Crash dump file detected."))
                    content.appendChild(document.createElement("br"))
                    content.appendChild(document.createTextNode("For more information see ArduPilot "))

                    const link = document.createElement("a")
                    link.href = "https://ardupilot.org/copter/docs/common-watchdog.html#crash-dump"
                    link.appendChild(document.createTextNode("documentation"))

                    content.appendChild(link)
                    content.appendChild(document.createTextNode("."))

                    add_warning("exclamation-triangle-red", content)
                }

            }
        }
        log.messages.FILE = null
        log.files = null
    }

    // Logging dropped packets and free buffer
    if ('DSF' in log.messageTypes) {
        const DSF = log.get("DSF")

        document.getElementById("log_stats_header").hidden = false

        const time = TimeUS_to_seconds(DSF.TimeUS)

        // Dropped packets
        plot = document.getElementById("log_dropped")
        plot_visibility(plot, false)

        log_dropped.data[0].x = time
        log_dropped.data[0].y = DSF.Dp

        Plotly.redraw(plot)

        // Buffer space
        plot = document.getElementById("log_buffer")
        plot_visibility(plot, false)

        log_buffer.data[0].x = time
        log_buffer.data[0].y = DSF.FMx

        log_buffer.data[1].x = time
        log_buffer.data[1].y = DSF.FAv

        log_buffer.data[2].x = time
        log_buffer.data[2].y = DSF.FMn

        Plotly.redraw(plot)
    }

    // Plot stats
    let stats = log.stats()
    if (stats) {
        document.getElementById("log_stats_header").hidden = false

        plot = document.getElementById("log_stats")
        plot_visibility(plot, false)

        log_stats.data[0].labels = []
        log_stats.data[0].values = []
        for (const [key, value] of Object.entries(stats)) {
            log_stats.data[0].labels.push(key)
            log_stats.data[0].values.push(value.size)
        }

        Plotly.redraw(plot)

        document.getElementById("LOGSTATS").replaceChildren(
            document.createTextNode("Total size: " + log.data.byteLength + " Bytes")
        )
    }

    // Plot clock drift
    if (('GPS' in log.messageTypes) && ("instances" in log.messageTypes.GPS)) {

        let start_us
        let end_us
        let max_drift

        for (const inst of Object.keys(log.messageTypes.GPS.instances)) {
            // Check each instance
            if (inst == 2) {
                // Ignore blended instance
                continue
            } 

            const time_us = log.get_instance("GPS", inst, "TimeUS")
            const status = log.get_instance("GPS", inst, "Status")
            const weeks = log.get_instance("GPS", inst, "GWk")
            const ms = log.get_instance("GPS", inst, "GMS")

            const len = time_us.length
            const drift_ms = new Array(len).fill(NaN)
            let first
            let have_drift = false
            for (let i = 0; i<len; i++) {
                if (status[i] < 3) {
                    // Fix not good enough for valid time
                    continue
                }

                if ((weeks[i] <= 1000) || (ms[i] == 0)) {
                    // Invalid timestamp
                    continue
                }

                // Calculate GPS time in milli seconds
                const ms_per_week = 7 * 24 * 60 * 60 * 1000
                const GPS_ms = (weeks[i] * ms_per_week) + ms[i]

                if (first == null) {
                    // sync at first point
                    drift_ms[i] = 0
                    first = { GPS_ms, time_us: time_us[i] }
                    continue
                }

                const GPS_dt = GPS_ms - first.GPS_ms
                const clock_dt = (time_us[i] - first.time_us) * 0.001

                drift_ms[i] = GPS_dt - clock_dt
                have_drift = true;

                if ((start_us == null) || (first.time_us < start_us)) {
                    start_us = first.time_us
                }
                if ((end_us == null) || (time_us[i] > end_us)) {
                    end_us = time_us[i]
                }
                const abs_drift = Math.abs(drift_ms[i])
                if ((max_drift == null) || (abs_drift > max_drift)) {
                    max_drift = abs_drift
                }
            }

            if (!have_drift) {
                // nothing to plot
                continue
            }

            const name = "GPS " + inst

            clock_drift.data.push({
                mode: 'lines',
                x: TimeUS_to_seconds(time_us),
                y: drift_ms,
                name: name,
                meta: name,
                hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} ms"
            })
        }

        if (clock_drift.data.length > 0) {
            plot = document.getElementById("clock_drift")

            // Set range such that only bad drift will show
            const time_range_ms = (end_us - start_us) * 0.001

            // Set full scale to +-1000ppm so expected jitter does not look bad
            const min_drift = time_range_ms * 1000 * 10**-6
            if (max_drift < min_drift) {
                plot.layout.yaxis.range = [ -min_drift,  min_drift ]
                plot.layout.yaxis.autorange = false
            }

            plot_visibility(plot, false)
            Plotly.redraw(plot)
        }
    }

    const end = performance.now()
    console.log(`Load took: ${end - start} ms`)
}

function load() {
    reset()

    const button = document.getElementById("fileItem")
    const file = button.files[0]
    if (file == null) {
        return
    }

    document.title = "Hardware Report: " + file.name

    if (file.name.toLowerCase().endsWith(".bin")) {
        let reader = new FileReader()
        reader.onload = function (e) {
            loading_call(() => { load_log(reader.result) })
        }
        reader.readAsArrayBuffer(file)

    } else {
        load_param_file(file.text())
    }

}

let Sensor_Offset = {}
let Temperature = {}
let Board_Voltage = {}
let power_flags = {}
let performance_load = {}
let performance_mem = {}
let performance_time = {}
let stack_mem = {}
let stack_pct = {}
let log_dropped = {}
let log_buffer = {}
let log_stats = {}
let clock_drift = {}
function reset() {

    document.title = "ArduPilot Hardware Report"

    function setup_section(section) {
        // Remove all children
        section.replaceChildren()

        // Hide
        section.hidden = true
        section.previousElementSibling.hidden = true
    }

    setup_section(document.getElementById("warnings"))
    setup_section(document.getElementById("VER"))
    setup_section(document.getElementById("FC"))
    setup_section(document.getElementById("WDOG"))
    setup_section(document.getElementById("InternalError"))
    setup_section(document.getElementById("IOMCU"))
    setup_section(document.getElementById("INS"))
    setup_section(document.getElementById("COMPASS"))
    setup_section(document.getElementById("BARO"))
    setup_section(document.getElementById("ARSPD"))
    setup_section(document.getElementById("DroneCAN"))
    setup_section(document.getElementById("WAYPOINTS"))
    setup_section(document.getElementById("FILES"))
    setup_section(document.getElementById("GPS"))
    setup_section(document.getElementById("DataRates"))

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

    let ParametersContent = document.getElementById("ParametersContent")
    ParametersContent.hidden = true
    ParametersContent.previousElementSibling.hidden = true
    document.getElementById("SaveChangedParams").hidden = true
    document.getElementById("param_base_changed").disabled = true
    document.getElementById("param_base_all").checked = true
    let ParameterChanges = document.getElementById("ParameterChanges")
    ParameterChanges.hidden = true
    ParameterChanges.previousElementSibling.hidden = true

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
        // Push two point for each GPS to allow ploting of master and slave
        name = "GPS " + (i+1)
        Sensor_Offset.data.push({ mode: "markers", type: 'scatter3d', name: name, meta: name, visible: false, hovertemplate: offset_hover })
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
    const cone_size = origin_size * 2.0

    // X
    const x_color = 'rgb(0,0,255)'
    Sensor_Offset.data.push({type: "cone", x: [origin_size], y: [0], z: [0], u: [origin_size], v: [0], w: [0], sizemode: "raw", sizeref: cone_size, showscale: false, hoverinfo: "none", colorscale:[[0, x_color], [1, x_color]]})
    Sensor_Offset.data.push({type: 'scatter3d', mode: 'lines', x: [0,origin_size], y: [0,0], z: [0,0], showlegend: false, hoverinfo: "none", line: {color: x_color, width: 10 }})

    // Y
    const y_color = 'rgb(255,0,0)'
    Sensor_Offset.data.push({type: "cone", x: [0], y: [origin_size], z: [0], u: [0], v: [origin_size], w: [0], sizemode: "raw", sizeref: cone_size, showscale: false, hoverinfo: "none", colorscale:[[0, y_color], [1, y_color]]})
    Sensor_Offset.data.push({type: 'scatter3d', mode: 'lines', x: [0,0], y: [0,origin_size], z: [0,0], showlegend: false, hoverinfo: "none", line: {color: y_color, width: 10 }})

    // Z
    const z_color = 'rgb(0,255,0)'
    Sensor_Offset.data.push({type: "cone", x: [0], y: [0], z: [origin_size], u: [0], v: [0], w: [origin_size], sizemode: "raw", sizeref: cone_size, showscale: false, hoverinfo: "none", colorscale:[[0, z_color], [1, z_color]]})
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
    plot_visibility(plot, true)

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
    plot_visibility(plot, true)


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
    plot_visibility(plot, true)

    // Power flags
    const power_flags_hover_tmmplate = "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f}"
    power_flags.data = []

    name = "Primary<br>power supply"
    power_flags.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: power_flags_hover_tmmplate })

    name = "Secondary<br>power supply"
    power_flags.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: power_flags_hover_tmmplate })

    name = "USB power"
    power_flags.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: power_flags_hover_tmmplate })

    name = "Peripheral<br>overcurrent"
    power_flags.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: power_flags_hover_tmmplate })

    name = "Peripheral<br>high power<br>overcurrent"
    power_flags.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: power_flags_hover_tmmplate })

    power_flags.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                                margin: { b: 50, l: 50, r: 50, t: 20 },
                                xaxis: { title: {text: time_scale_label } },
                                yaxis: { title: {text: "Power flags" }, rangemode: "tozero" } }

    plot = document.getElementById("power_flags")
    Plotly.purge(plot)
    Plotly.newPlot(plot, power_flags.data, power_flags.layout, {displaylogo: false});
    plot_visibility(plot, true)

    // Performace load
    document.getElementById("CPU").hidden = true

    performance_load.data = [{ mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} %" }]

    performance_load.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Load (%)" } }
                         }

    plot = document.getElementById("performance_load")
    Plotly.purge(plot)
    Plotly.newPlot(plot, performance_load.data, performance_load.layout, {displaylogo: false});
    plot_visibility(plot, true)

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
    plot_visibility(plot, true)

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
    plot_visibility(plot, true)

    // Stack
    document.getElementById("Stack").hidden = true

    // Memory
    stack_mem.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Free memory (bytes)" } }
                         }

    plot = document.getElementById("stack_mem")
    plot_visibility(plot, true)

    // Percentage
    stack_pct.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Memory usage (%)" } }
                         }

    plot = document.getElementById("stack_pct")
    plot_visibility(plot, true)

    // Log stats
    document.getElementById("log_stats_header").hidden = true

    // Log dropped packets
    log_dropped.data = [{ mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f}" }]

    log_dropped.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                           margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Dropped messages" } }
                         }

    plot = document.getElementById("log_dropped")
    Plotly.purge(plot)
    Plotly.newPlot(plot, log_dropped.data, log_dropped.layout, {displaylogo: false});
    plot_visibility(plot, true)

    // Log free buffer space
    log_buffer.data = []

    const log_buffer_hover = "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} B"

    name = "Maximum"
    log_buffer.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: log_buffer_hover })

    name = "Average"
    log_buffer.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: log_buffer_hover })

    name = "Minimum"
    log_buffer.data.push({ mode: 'lines', name: name, meta: name, hovertemplate: log_buffer_hover })

    log_buffer.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                          margin: { b: 50, l: 50, r: 50, t: 20 },
                           xaxis: { title: {text: time_scale_label } },
                           yaxis: { title: {text: "Free Buffer Space (bytes)" } }
                        }

    plot = document.getElementById("log_buffer")
    Plotly.purge(plot)
    Plotly.newPlot(plot, log_buffer.data, log_buffer.layout, {displaylogo: false});
    plot_visibility(plot, true)

    // Log Composition
    log_stats.data = [ { type: 'pie', textposition: 'inside', textinfo: "label+percent",
                         hovertemplate: '%{label}<br>%{value:,i} Bytes<br>%{percent}<extra></extra>'} ]
    log_stats.layout = { showlegend: false,
                         margin: { b: 10, l: 50, r: 50, t: 10 },
                         }

    plot = document.getElementById("log_stats")
    Plotly.purge(plot)
    Plotly.newPlot(plot, log_stats.data, log_stats.layout, {displaylogo: false});
    plot_visibility(plot, true)

    // Clock drift
    clock_drift.data = []
    clock_drift.layout = { 
        legend: { itemclick: false, itemdoubleclick: false }, 
        margin: { b: 50, l: 50, r: 50, t: 20 },
        xaxis: { title: { text: time_scale_label } },
        yaxis: { title: { text: "Clock drift (ms)" } }
    }

    plot = document.getElementById("clock_drift")
    Plotly.purge(plot)
    Plotly.newPlot(plot, clock_drift.data, clock_drift.layout, {displaylogo: false});
    plot_visibility(plot, true)

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

    return new Promise((resolve) => {
        fetch("board_types.txt")
            .then((res) => {
            return res.text()
        }).then((data) => {
            load_board_types(data)
            resolve()
        });
    })
}

function save_text(text, file_postfix) {

    let log_file_name = document.getElementById("fileItem").value.replace(/.*[\/\\]/, '')
    if (log_file_name.length == 0) {
        // May not have a file name if loaded with "open in"
        log_file_name = "log"
    }

    const file_name = (log_file_name.substr(0, log_file_name.lastIndexOf('.')) || log_file_name) + file_postfix

    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    saveAs(blob, file_name);
}

function save_all_parameters() {

    if (Object.keys(params).length == 0) {
        return
    }

    save_text(get_param_download_text(params), ".param")

}

function save_changed_parameters() {

    if (Object.keys(params).length == 0) {
        return
    }

    let changed = {}
    for (const [name, value] of Object.entries(params)) {
        if ((name in defaults) && (value == defaults[name])) {
            continue
        }
        changed[name] = value
    }

    save_text(get_param_download_text(changed), "_changed.param")

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

    let minimal = {}
    for (const [name, value] of Object.entries(params)) {
        if (changed && (name in defaults) && (value == defaults[name])) {
            continue
        }
        if (skip_params.includes(name)) {
            continue
        }
        minimal[name] = value
    }

    save_text(get_param_download_text(minimal), "_minimal.param")

}

