// Helper to create a "open in" buttons to pass logs between tools

// Return a div populated with buttons that can be clicked
function open_in_tippy_div(get_file_fun) {

    // Div that contains buttons for other tools
    let tippy_div = document.createElement("div")

    const destinations = [{ name:"UAV Log Viewer",  path:"https://plotbeta.ardupilot.org/#", hook_load:false },
                          { name:"Hardware Report", path:"../HardwareReport",                hook_load:true },
                          { name:"Filter Review",   path:"../FilterReview",                  hook_load:true },
                          { name:"MAGFit",          path:"../MAGFit",                        hook_load:true },
                          { name:"PID Review",      path:"../PIDReview",                     hook_load:true }]

    // Get own path
    const path_segments = window.location.pathname.split('/');
    const own_window = path_segments.pop() || path_segments.pop()

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

    }

    return tippy_div

}

function setup_open_in(button_id, file_id, load_fun, placement) {

    const button = document.getElementById(button_id)
    const input = document.getElementById(file_id)

    function get_file_fun() {
        return input.files[0]
    }

    const tippy_div = open_in_tippy_div(get_file_fun)

    // default to left placement
    if (placement == null) {
        placement = "left"
    }

    // Create tool tip
    tippy(button, {
        content: tippy_div,
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
    window.addEventListener('message', (event) => {
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

}
