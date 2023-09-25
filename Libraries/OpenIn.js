// Helper to create a "open in" drop down to pass logs between tools

function setup_open_in(div_id, file_id, load_fun) {

    // Setup main div
    let div = document.getElementById(div_id)
    div.style = "display: inline-block; position: relative;"

    const width = "125px"

    // Add button
    let button = document.createElement("button")
    button.innerHTML = "Open In"
    button.style.width = width
    button.disabled = true
    div.appendChild(button)

    // Add drop down div
    let dropdown = document.createElement("div")
    dropdown.style = "display: none; position: absolute; width: 100%; overflow: auto; box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);"
    div.appendChild(dropdown)

    // Show and hide drop down
    div.addEventListener("mouseover", () => {
        // only show if button is enabled
        if (!button.disabled) {
            dropdown.style.display = "block"
        }
    });

    // Always hide
    div.addEventListener("mouseout", () => { dropdown.style.display = "none" });

    const destinations = [["UAV Log Viewer", "https://plotbeta.ardupilot.org/#"],
                          ["Hardware Report", "/HardwareReport"],
                          ["Filter Review","/FilterReview"], 
                          ["PID Review", "/PIDReview"]]

    const own_window = window.location.pathname
    for (const dest of destinations) {
        if (own_window.startsWith(dest[1])) {
            // Don't link back to self
            continue
        }

        // Button for each
        let link = document.createElement("button")
        link.innerHTML = dest[0]
        link.style = "display: block; color: #000000; padding: 5px; text-decoration: none;"
        link.style.width = width
        dropdown.appendChild(link)

        link.addEventListener('click', function() {
            // Get current file
            const file = document.getElementById(file_id).files[0]
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

        })
 
    }

    // Add callback to auto enable button when log is added
    const file_input = document.getElementById(file_id)
    file_input.addEventListener('change', function() {
        const file = document.getElementById(file_id).files[0]
        button.disabled = (file == null) || !file.name.toLowerCase().endsWith(".bin")
    })

    // Load from "open in" button on other pages
    window.addEventListener('message', (event) => {
        if (event.data.type === 'arrayBuffer') {
            load_fun(event.data.data)
        }
    })

}
