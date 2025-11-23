// Helper to create a "open in" buttons to pass logs between tools

// Return a div populated with buttons that can be clicked
function get_open_in(get_file_fun) {

    // Div that contains buttons for other tools
    let tippy_div = document.createElement("div")

    // Helper functions return true if a particular tool can open a given log
    function enable_hardware_report(msgs) {
        return msgs.includes("PARM")
    }

    function enable_filter_review(msgs) {
        const filt_log = ["GYR", "ISBD"]
        return filt_log.some(item => msgs.includes(item));
    }

    function enable_magfit(msgs) {
        return msgs.includes("MAG")
    }

    function enable_pid_review(msgs) {
        const pid_log = ["RATE", "PIDR", "PIDP", "PIDY", "PIQR", "PIQP", "PIQY"]
        return pid_log.some(item => msgs.includes(item));
    }

    // If not provided with list of available messages allow all tools
    function enable_all(msgs) {
        return msgs == null
    }

    const destinations = [{ name:"UAV Log Viewer",  path:"https://plotbeta.ardupilot.org/#", hook_load:false, enable: (msgs) => { return true } },
                          { name:"Hardware Report", path:"../HardwareReport",                hook_load:true,  enable: (msgs) => { return enable_all(msgs) || enable_hardware_report(msgs)} },
                          { name:"Filter Review",   path:"../FilterReview",                  hook_load:true,  enable: (msgs) => { return enable_all(msgs) || enable_filter_review(msgs)} },
                          { name:"MAGFit",          path:"../MAGFit",                        hook_load:true,  enable: (msgs) => { return enable_all(msgs) || enable_magfit(msgs)} },
                          { name:"PID Review",      path:"../PIDReview",                     hook_load:true,  enable: (msgs) => { return enable_all(msgs) || enable_pid_review(msgs)} }]

    // Get own path
    const path_segments = window.location.pathname.split('/');
    const own_window = path_segments.pop() || path_segments.pop()

    // Array of enable functions to call, one for each button
    const enable_fun = []

    // Add button for each tool
    for (const dest of destinations) {
        if (dest.path.includes(own_window)) {
            // Don't link back to self
            continue
        }

        // Add button
        let dest_button = document.createElement("input")
        dest_button.setAttribute('value', dest.name)
        dest_button.setAttribute('type', 'button')
        dest_button.style.margin  = "3px 0px"
        tippy_div.appendChild(dest_button)

        async function open_in(e) {
            const file = get_file_fun()
            if (file == null) {
                return
            }

            if (dest.hook_load) {
                // Open the new page and keep a reference to it
                const newWindow = window.open(dest.path)

                // For WebTools with the same origin we can hook the load and send the file handle
                // This means they get the file name and can recursively "open in"
                newWindow.addEventListener('load', () => { newWindow.postMessage({ type: 'file', data: file}, '*') })
                return
            }

            // Not allowed to listen for load cross domains, wait a bit and then try
            const reader = new FileReader()
            reader.onload = function(e) {
                const arrayBuffer = e.target.result

                // Open the new page and keep a reference to it
                const newWindow = window.open(dest.path)

                setTimeout(() => { newWindow.postMessage({ type: 'arrayBuffer', data: arrayBuffer}, '*') }, 2000)
            }

            // Load file
            reader.readAsArrayBuffer(file)
        }

        // Add click callback
        dest_button.addEventListener("click", open_in)

        // New line
        tippy_div.appendChild(document.createElement("br"))

        // Add function to update enabled
        enable_fun.push((msgs) => { dest_button.disabled = !dest.enable(msgs) })

    }

    // Run all enable functions
    function update_enable(msgs) {
        for (const fun of enable_fun) {
            fun(msgs)
        }
    }

    return { tippy_div, update_enable }

}

function setup_open_in(button_id, file_id, load_fun, pageLoadDone, placement) {

    const button = document.getElementById(button_id)
    const input = document.getElementById(file_id)

    function get_file_fun() {
        return input.files[0]
    }

    const open_in = get_open_in(get_file_fun)

    // default to left placement
    if (placement == null) {
        placement = "left"
    }

    // Create tool tip
    tippy(button, {
        content: open_in.tippy_div,
        placement,
        interactive: true,
        appendTo: () => document.body,
    })

    // Add callback to auto enable button when log is added
    input.addEventListener('change', function() {
        const file = input.files[0]
        button.disabled = (file == null) || !file.name.toLowerCase().endsWith(".bin")
    })

    // Load from "open in" button on other pages
    window.addEventListener('message', async (event) => {
        if (pageLoadDone != null) {
            await pageLoadDone()
        }

        if (event.data.type === 'arrayBuffer') {
            load_fun(event.data.data)

        } else if (event.data.type === 'file') {
            // Trick to populate file input button
            const dataTransfer = new DataTransfer()
            dataTransfer.items.add(event.data.data)
            input.files = dataTransfer.files

            // "Click" button
            input.dispatchEvent(new Event('change'))
        }
    })

    function update(log) {
        const msgs = get_base_log_message_types(log)
        open_in.update_enable(msgs)
    }

    return update
}
