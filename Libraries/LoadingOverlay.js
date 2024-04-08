// Helper to add a loading overlay to a page and show/hide it

function init_loading_overlay() {

    let div = document.createElement("div")
    div.id = "loading"
    div.style.position = "fixed"
    div.style.top = 0
    div.style.left = 0
    div.style.width = "100%"
    div.style.height = "100%"
    div.style.opacity = 0.7
    div.style.backgroundColor = "#fff"
    div.style.zIndex = 99
    div.style.visibility = "hidden"

    let text = document.createElement("h1")
    text.style.position = "absolute"
    text.style.top = "50%"
    text.style.left = "50%"
    text.style.transform = "translate(-50%, -50%)"
    text.innerHTML = "Loading"

    div.appendChild(text)
    document.body.appendChild(div)

}

async function loading_call(fun) {

    // Show loading screen
    let overlay = document.getElementById("loading")
    overlay.style.visibility = 'visible'

    // https://forum.freecodecamp.org/t/how-to-make-js-wait-until-dom-is-updated/122067/2

    // this double requestAnimationFrame ensures that the loading screen is rendered before the load starts
    async function run() {
        // Call the passed in function
        await fun()

        // Hide loading screen
        overlay.style.visibility = 'hidden'
    }

    async function intermediate() {
        window.requestAnimationFrame(run)
    }

    window.requestAnimationFrame(intermediate)

}
