// Light/dark theme
// Follows the system setting until the toggle is used, then the choice is remembered
// Loaded in the page head so the theme is applied before the page is drawn

(function () {

    const root = document.documentElement
    const system_dark = window.matchMedia("(prefers-color-scheme: dark)")

    function get_saved() {
        try {
            return localStorage.getItem("theme")
        } catch {
            return null
        }
    }

    function is_dark() {
        const saved = get_saved()
        return (saved != null) ? (saved == "dark") : system_dark.matches
    }

    let button

    function apply() {
        const dark = is_dark()
        if (dark) {
            root.dataset.theme = "dark"
        } else {
            delete root.dataset.theme
        }
        if (button != null) {
            button.textContent = dark ? "Light theme" : "Dark theme"
        }
    }

    apply()
    system_dark.addEventListener("change", apply)

    // Add the toggle beside the GitHub links in the page header
    window.addEventListener("DOMContentLoaded", function () {
        const cell = document.querySelector("table.header td:last-child")
        if (cell == null) {
            return
        }
        button = document.createElement("button")
        button.className = "theme-toggle"
        button.addEventListener("click", function () {
            try {
                localStorage.setItem("theme", is_dark() ? "light" : "dark")
            } catch {
                // Storage not available, theme will not be remembered
            }
            apply()
        })
        cell.appendChild(button)
        apply()
    })

})()
