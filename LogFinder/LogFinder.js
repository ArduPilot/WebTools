
var DataflashParser
import('../JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

var dirHandle
async function get_dir_then_load() {

    if (typeof(window.showDirectoryPicker) != "function") {
        alert("This browser does not support directory opening.")
        return
    }

    dirHandle = await window.showDirectoryPicker().catch(() => { })

    await load_from_dir()

    // Enable reload if valid dir
    document.getElementById("reload").disabled = dirHandle == null
}

async function load_from_dir() {
    if (dirHandle == null) {
        return
    }

    const start = performance.now()

    reset()

    async function get_logs() {
        async function* getFilesRecursively(entry, path) {
            let relativePath
            if (path == null) {
                relativePath = entry.name
            } else {
                relativePath = path + "/" + entry.name
            }
            if (entry.kind === "file") {
                const file = await entry.getFile()
                if ((file !== null) && (file.name.toLowerCase().endsWith(".bin"))) {
                    file.relativePath = relativePath
                    yield file
                }
            } else if (entry.kind === "directory") {
                for await (const handle of entry.values()) {
                    try {
                        yield* getFilesRecursively(handle, relativePath)
                    } catch {
                        if (handle.kind === "directory") {
                            console.log("Opening " + handle.name + " in " + relativePath + " failed")
                        }
                    }
                }
            }
        }

        // Have handle, get logs
        let logs = {}
        for await (const fileHandle of getFilesRecursively(dirHandle)) {

            // Helper to allow waiting for file to load
            const wait_for_load = () => {
                const reader = new FileReader()
                return new Promise((resolve, reject) => {
                    reader.onerror = () => {
                        reader.abort()
                        reject(new DOMException("Problem parsing input file."))
                    }

                    reader.onload = () => {
                        let info = load_log(reader.result)
                        if (info == null) {
                            console.log("Load failed: " + fileHandle.relativePath)
                        } else {
                            info.name = fileHandle.name
                            info.rel_path = fileHandle.relativePath
                            logs[fileHandle.relativePath] = { info, fileHandle}
                        }
                        resolve()
                    }
                    reader.readAsArrayBuffer(fileHandle)
                })
            }

            await wait_for_load()
        }
        return logs
    }

    let logs = await get_logs()

    setup_table(logs)

    const end = performance.now();
    console.log(`Loaded ${Object.values(logs).length} logs in: ${end - start} ms`);
}

function setup_table(logs) {

    // Sort in to sections based on hardware ID
    let boards = {}
    for (const log of Object.values(logs)) {
        let key = "Unknown"
        if (log.info.fc_string != null) {
            key = log.info.fc_string
        }
        if (!(key in boards)) {
            boards[key] = []
        }
        boards[key].push(log)
    }

    const tables_div = document.getElementById("tables")

    for (const [board_id, board_logs] of Object.entries(boards)) {

        const board_details = document.createElement("details")
        board_details.setAttribute("open", true);
        tables_div.appendChild(board_details)

        const board_summary = document.createElement("summary")
        board_summary.appendChild(document.createTextNode(board_id))
        board_summary.style.fontSize = " 1.17em"
        board_summary.style.fontWeight = "bold"
        board_details.style.marginBottom = "15px"
        board_details.appendChild(board_summary)

        board_details.appendChild(document.createElement("br"))

        const table_div = document.createElement("div")
        table_div.style.width = "1200px"
        board_details.appendChild(table_div)

        // custom formatter to add a param download button
        function param_download_button(cell, formatterParams, onRendered) {

            function save_parameters() {
                const log = cell.getRow().getData()
                const params = log.info.params

                if (Object.keys(params).length == 0) {
                    return
                }

                let text = ""
                for (const [name, value] of Object.entries(params)) {
                    text += name + "," + value + "\n";
                }

                // make sure there are no slashes
                let log_file_name = log.info.name.replace(/.*[\/\\]/, '')

                // Replace the file extension
                const file_name = (log_file_name.substr(0, log_file_name.lastIndexOf('.')) || log_file_name) + ".param"

                // Save
                var blob = new Blob([text], { type: "text/plain;charset=utf-8" })
                saveAs(blob, file_name)
            }

            let button = document.createElement("input")
            button.setAttribute('value', 'Parameters')
            button.setAttribute('type', 'button')
            button.addEventListener("click", save_parameters)
            button.disabled = Object.keys(cell.getRow().getData().info.params).length == 0

            // Dynamically update tool tip to show param diff
            function tippy_show(instance) {
                const prev_row = cell.getRow().getPrevRow()
                if (prev_row === false) {
                    // Don't show if there is no previous row
                    return false
                }

                const prev_params = prev_row.getData().info.params
                const params = cell.getRow().getData().info.params

                // Superset of param names from both files
                const names = new Set([...Object.keys(prev_params), ...Object.keys(params)])

                // Do param diff
                let added = {}
                let missing = {}
                let changed = {}
                for (const name of names) {
                    const have_old = name in prev_params
                    const have_new = name in params
                    if (have_new && !have_old) {
                        // Only in new
                        added[name] = params[name]

                    } else if (!have_new && have_old) {
                        // Only in old
                        missing[name] = prev_params[name]

                    } else if (prev_params[name] != params[name]) {
                        // In both with different value
                        changed[name] = { from: prev_params[name], to: params[name]}
                    }
                }

                let tippy_div = document.createElement("div")
                tippy_div.style.width = '500px';
                tippy_div.style.maxHeight = '90vh';
                tippy_div.style.overflow = 'auto';

                const have_added = Object.keys(added).length > 0
                const have_missing = Object.keys(missing).length > 0
                const have_changed = Object.keys(changed).length > 0

                if (!have_added && !have_missing && !have_changed) {
                    tippy_div.appendChild(document.createTextNode("No change"))
                    return
                }

                if (have_added) {
                    const details = document.createElement("details")
                    details.setAttribute("open", true);
                    details.style.marginBottom = "5px"
                    tippy_div.appendChild(details)

                    const summary = document.createElement("summary")
                    summary.appendChild(document.createTextNode("New:"))
                    details.appendChild(summary)

                    for (const [name, value] of Object.entries(added)) {
                        const text = name + ": " + value.toString()
                        details.appendChild(document.createTextNode(text))
                        details.appendChild(document.createElement("br"))
                    }
                }

                if (have_missing) {
                    const details = document.createElement("details")
                    details.setAttribute("open", true);
                    details.style.marginBottom = "5px"
                    tippy_div.appendChild(details)

                    const summary = document.createElement("summary")
                    summary.appendChild(document.createTextNode("Missing:"))
                    details.appendChild(summary)

                    for (const [name, value] of Object.entries(missing)) {
                        const text = name + ": " + value.toString()
                        details.appendChild(document.createTextNode(text))
                        details.appendChild(document.createElement("br"))
                    }
                }

                if (have_changed) {
                    const details = document.createElement("details")
                    details.setAttribute("open", true);
                    details.style.marginBottom = "5px"
                    tippy_div.appendChild(details)

                    const summary = document.createElement("summary")
                    summary.appendChild(document.createTextNode("Changed:"))
                    details.appendChild(summary)

                    for (const [name, values] of Object.entries(changed)) {
                        const text = name + ": " + values.from.toString() + " => " + values.to.toString()
                        details.appendChild(document.createTextNode(text))
                        details.appendChild(document.createElement("br"))
                    }
                }

                instance.setContent(tippy_div)
            }

            tippy(button, {
                maxWidth: '750px',
                placement: 'left',
                interactive: true,
                appendTo: () => document.body,
                onShow: tippy_show
            })

            return button
        }

        // custom formatter to add a open in button
        function open_in_button(cell, formatterParams, onRendered) {

            // Button to hold tool tip
            let button = document.createElement("input")
            button.setAttribute('value', 'Open In')
            button.setAttribute('type', 'button')

            // Div that contains buttons for other tools
            let tippy_div = document.createElement("div")

            const destinations = [["UAV Log Viewer", "https://plotbeta.ardupilot.org/#"],
                                  ["Hardware Report", "../HardwareReport"],
                                  ["Filter Review","../FilterReview"],
                                  ["MAGFit", "../MAGFit"],
                                  ["PID Review", "../PIDReview"]]

            // Add button for each tool
            for (const dest of destinations) {
                // Add button
                let dest_button = document.createElement("input")
                dest_button.setAttribute('value', dest[0])
                dest_button.setAttribute('type', 'button')
                dest_button.style.margin  = "3px 0px"
                tippy_div.appendChild(dest_button)

                function open_in(e) {
                    const file = cell.getRow().getData().fileHandle
                    if (file == null) {
                        return
                    }

                    const reader = new FileReader()
                    reader.onload = function(e) {
                        const arrayBuffer = e.target.result

                        // Open the new page and keep a reference to it
                        const newWindow = window.open(dest[1])

                        // Wait a bit to ensure the new page is fully loaded
                        setTimeout(() => {
                            // Send the ArrayBuffer to the new window using postMessage
                            newWindow.postMessage({ type: 'arrayBuffer', data: arrayBuffer}, '*')
                        }, 2000)
                    }

                    // Load file
                    reader.readAsArrayBuffer(file)
                }

                // Add click callback
                dest_button.addEventListener("click", open_in)

                // New line
                tippy_div.appendChild(document.createElement("br"))

            }

            tippy(button, {
                content: tippy_div,
                placement: 'left',
                interactive: true,
                appendTo: () => document.body,
            })
            return button
        }

        // Formatter to add custom buttons
        function buttons(cell, formatterParams, onRendered) {
            let div = document.createElement("div")
            div.appendChild(param_download_button(cell, formatterParams, onRendered))
            div.appendChild(document.createTextNode(" "))
            div.appendChild(open_in_button(cell, formatterParams, onRendered))
            return div
        }

        // Name formatter to add path on tooltip
        function name_format(cell, formatterParams, onRendered) {
            let div = document.createElement("div")
            const file = cell.getRow().getData().fileHandle
            if (file == null) {
                return
            }
            div.appendChild(document.createTextNode(file.name))

            tippy(div, {
                content: file.relativePath,
                appendTo: () => document.body,
            })

            return div
        }

        // Make file size a nice string with units
        function size_format(cell, formatterParams, onRendered) {
            const size = cell.getRow().getData().info.size
            const unit_array = ['B', 'kB', 'MB', 'GB', 'TB']
            const unit_index = (size == 0) ? 0 : Math.floor(Math.log(size) / Math.log(1024))
            const scaled_size = size / Math.pow(1024, unit_index)
            return scaled_size.toFixed(2) + " " + unit_array[unit_index]
        }

        // Make flight time a nice string with units
        function flight_time_format(cell, formatterParams, onRendered) {
            const flight_time = cell.getRow().getData().info.flight_time
            if (flight_time == null) {
                return "Unknown"
            }

            // Try human readable
            if (flight_time == 0) {
                return "-"
            }
            const dur = luxon.Duration.fromMillis(flight_time * 1000)
            return dur.rescale().toHuman({listStyle: 'narrow', unitDisplay: 'short'})

            // Might like this better, not sure
            //return dur.toFormat("hh:mm:ss")
        }

        new Tabulator(table_div, {
            height: "fit-content",
            data: board_logs,
            index: "info.rel_path",
            layout: "fitColumns",
            columns: [
                {
                    title: "Date",
                    field: "info.time_stamp",
                    width: 160,
                    formatter:"datetime",
                    formatterParams: {
                        outputFormat: "dd/MM/yyyy hh:mm:ss a",
                        invalidPlaceholder: "No GPS",
                    },
                    sorter:"datetime",
                },
                { title: "Name", field: "info.name", formatter:name_format },
                { title: "Size", field: "info.size", formatter:size_format },
                { title: "Firmware Version", field:"info.fw_string" },
                { title: "Flight Time", field:"info.flight_time", formatter:flight_time_format },
                { title: "" , headerSort:false, formatter:buttons, width: 160 },
            ],
            initialSort: [
                { column:"info.time_stamp", dir:"asc"},
            ]
        })

    }

}

function load_log(log_file) {

    let log = new DataflashParser()
    try {
        log.processData(log_file, [])
    } catch {
        return
    }

    if (!('VER' in log.messageTypes)) {
        return
    }

    let fw_string
    let git_hash
    let board_id
    let fc_string
    let os_string
    let board_name
    let vehicle_type

    const VER = log.get("VER")

    // Assume version does not change, just use first msg
    fw_string = VER.FWS[0]
    git_hash = VER.GH[0].toString(16)
    if (VER.APJ[0] != 0) {
        board_id = VER.APJ[0]
    }
    if ("BU" in VER) {
        vehicle_type = VER.BU[0]
    }

    if ('MSG' in log.messageTypes) {
        const MSG = log.get("MSG")
        // Look for firmware string in MSGs, this marks the start of the log start msgs
        // The subsequent messages give more info, this is a bad way of doing it
        const len = MSG.Message.length
        for (let i = 0; i < len - 3; i++) {
            const msg = MSG.Message[i]
            if (fw_string != msg) {
                continue
            }
            if (!MSG.Message[i+3].startsWith("Param space used:")) {
                // Check we have bracketed the messages we need
                continue
            }
            os_string = MSG.Message[i+1]
            fc_string = MSG.Message[i+2]
            break
        }
    }

    // Populate the board name from boards lookup
    if ((board_id != null) && (board_id in board_types)) {
        board_name = board_types[board_id]
    }

    // Get params, extract flight time
    const PARM = log.get("PARM")
    let params = {}
    let start_flight_time
    let end_flight_time
    for (let i = 0; i < PARM.Name.length; i++) {
        const name = PARM.Name[i]
        const value = PARM.Value[i]
        params[name] = value

        // Check for cumulative flight time, get first and last value
        if (name == "STAT_FLTTIME") {
            if (start_flight_time == null) {
                start_flight_time = value
            }
            end_flight_time = value
        }
    }

    let flight_time
    if (start_flight_time != null) {
        flight_time = end_flight_time - start_flight_time
    }

    // Get start time, convert to luxon format to work with table
    const time_stamp = luxon.DateTime.fromJSDate(log.extractStartTime())

    return {
        size: log_file.byteLength,
        fw_string,
        git_hash,
        board_id,
        fc_string,
        os_string,
        board_name,
        vehicle_type,
        params,
        time_stamp,
        flight_time
    }
}

function reset() {

    // Remove all tables
    document.getElementById("tables").replaceChildren()

}

let board_types = {}
async function initial_load() {

    document.getElementById("reload").disabled = true

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

    if (typeof(window.showDirectoryPicker) != "function") {
        alert("This browser does not support directory opening.")
    }

}
