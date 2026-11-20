// Light/dark theme
// Follows the system setting until the toggle is used, then the choice is remembered in local storage. This is a
// user interface preference set by the user, it is not used for tracking.
// Loaded in the page head so the theme is applied before the page is drawn. Plotly plots get a dark template, so
// this must also be loaded before Plotly.

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

    // Plotly

    // Plot colours for the dark theme, only defaults are changed, colours set by the tools are kept
    const foreground = "#e0e0e0"
    const grid = "#3a3a3a"
    const axis_line = "#888888"
    const axis = { gridcolor: grid, zerolinecolor: axis_line, linecolor: axis_line }
    const scene_axis = Object.assign({ color: foreground, backgroundcolor: "rgba(0,0,0,0)" }, axis)
    const dark_template = {
        layout: {
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { color: foreground },
            xaxis: axis,
            yaxis: axis,
            scene: { xaxis: scene_axis, yaxis: scene_axis, zaxis: scene_axis },
            polar: { bgcolor: "rgba(0,0,0,0)", radialaxis: axis, angularaxis: axis },
            legend: { bgcolor: "rgba(0,0,0,0)" },
            modebar: { bgcolor: "rgba(0,0,0,0)", color: "#999999", activecolor: foreground },
            shapedefaults: { line: { color: foreground } },
            annotationdefaults: { arrowcolor: foreground },
        }
    }

    // Some traces are drawn in black, swap them to the foreground colour in the dark theme
    function is_black(color) {
        return (typeof color == "string") && ["#000", "#000000", "black", "rgb(0,0,0)"].includes(color.replace(/\s/g, "").toLowerCase())
    }
    const color_paths = [["line"], ["marker"], ["marker", "line"]]
    function theme_trace(trace, dark) {
        for (const path of color_paths) {
            let obj = trace
            for (const key of path) {
                obj = (obj != null) ? obj[key] : null
            }
            if ((obj == null) || (obj.color == null)) {
                continue
            }
            if (dark && is_black(obj.color)) {
                obj.color = foreground
                obj.theme_black = true
            } else if (!dark && obj.theme_black) {
                obj.color = "#000000"
                delete obj.theme_black
            }
        }
    }

    // Shapes filled in a light grey, such as shaded ranges, are filled in the matching dark grey in the dark theme
    function light_grey(color) {
        const match = (typeof color == "string") ? color.match(/^#([0-9a-f]{2})\1\1$/i) : null
        return (match != null) && (parseInt(match[1], 16) >= 0xc0) ? parseInt(match[1], 16) : null
    }
    function theme_shape(shape, dark) {
        if (dark && (light_grey(shape.fillcolor) != null)) {
            shape.theme_fillcolor = shape.fillcolor
            const value = (255 - light_grey(shape.fillcolor)).toString(16).padStart(2, "0")
            shape.fillcolor = "#" + value + value + value
        } else if (!dark && (shape.theme_fillcolor != null)) {
            shape.fillcolor = shape.theme_fillcolor
            delete shape.theme_fillcolor
        }
    }

    function theme_plot(data, layout, dark) {
        if (layout != null) {
            if (dark) {
                layout.template = dark_template
            } else if (layout.template == dark_template) {
                delete layout.template
            }
            for (const shape of (Array.isArray(layout.shapes) ? layout.shapes : [])) {
                theme_shape(shape, dark)
            }
        }
        for (const trace of (Array.isArray(data) ? data : [])) {
            theme_trace(trace, dark)
        }
    }

    // Apply the theme to every new plot
    function wrap_plotly(Plotly) {
        for (const name of ["newPlot", "react"]) {
            const original = Plotly[name]
            Plotly[name] = function (gd, data, layout, config) {
                if ((data != null) && !Array.isArray(data) && (typeof data == "object")) {
                    // Called with a figure object
                    if (data.layout == null) {
                        data.layout = {}
                    }
                    theme_plot(data.data, data.layout, is_dark())
                } else {
                    if (layout == null) {
                        layout = {}
                    }
                    theme_plot(data, layout, is_dark())
                }
                return original.call(this, gd, data, layout, config)
            }
        }
    }

    // Plotly sets window.Plotly when it loads, wrap it then
    if (window.Plotly != null) {
        wrap_plotly(window.Plotly)
    } else {
        let plotly
        Object.defineProperty(window, "Plotly", {
            configurable: true,
            get: function () {
                return plotly
            },
            set: function (value) {
                plotly = value
                if (value != null) {
                    wrap_plotly(value)
                }
            }
        })
    }

    // Redraw existing plots in the new theme
    function update_plots(dark) {
        if (window.Plotly == null) {
            return
        }
        for (const gd of document.querySelectorAll(".js-plotly-plot")) {
            theme_plot(gd.data, gd.layout, dark)
            window.Plotly.redraw(gd)
        }
    }

    // Tooltips

    // The browser draws title tooltips in the system colours, so in the dark theme they are drawn by the page
    let tooltip
    let tooltip_target
    function hide_tooltip() {
        if (tooltip_target != null) {
            tooltip_target.setAttribute("title", tooltip_target.dataset.themeTitle)
            delete tooltip_target.dataset.themeTitle
            tooltip_target = null
        }
        if (tooltip != null) {
            tooltip.hidden = true
        }
    }
    function show_tooltip(event) {
        if (root.dataset.theme != "dark") {
            return
        }
        const target = event.target.closest("[title]")
        if ((target == null) || (target == tooltip_target) || (target.getAttribute("title") == "")) {
            return
        }
        hide_tooltip()
        // Move the title so the browser does not also show it
        tooltip_target = target
        target.dataset.themeTitle = target.getAttribute("title")
        target.removeAttribute("title")
        if (tooltip == null) {
            tooltip = document.createElement("div")
            tooltip.className = "theme-tooltip"
            document.body.appendChild(tooltip)
        }
        tooltip.textContent = target.dataset.themeTitle
        tooltip.hidden = false
        move_tooltip(event)
    }
    function move_tooltip(event) {
        if ((tooltip == null) || tooltip.hidden) {
            return
        }
        const margin = 12
        const x = Math.min(event.clientX + margin, window.innerWidth - tooltip.offsetWidth - margin)
        let y = event.clientY + margin * 2
        if (y + tooltip.offsetHeight > window.innerHeight) {
            y = event.clientY - tooltip.offsetHeight - margin
        }
        tooltip.style.left = (Math.max(0, x) + window.scrollX) + "px"
        tooltip.style.top = (y + window.scrollY) + "px"
    }
    document.addEventListener("mouseover", show_tooltip)
    document.addEventListener("mousemove", move_tooltip)
    document.addEventListener("mouseout", function (event) {
        if ((tooltip_target != null) && !tooltip_target.contains(event.relatedTarget)) {
            hide_tooltip()
        }
    })
    document.addEventListener("mousedown", hide_tooltip)

    // Toggle

    function apply() {
        const dark = is_dark()
        const changed = (root.dataset.theme == "dark") != dark
        hide_tooltip()
        if (dark) {
            root.dataset.theme = "dark"
        } else {
            delete root.dataset.theme
        }
        const toggle = document.getElementById("theme_toggle")
        if (toggle != null) {
            toggle.querySelector("span").textContent = dark ? "Light" : "Dark"
            toggle.title = dark ? "Switch to the light theme" : "Switch to the dark theme"
        }
        if (changed) {
            update_plots(dark)
        }
    }

    apply()
    system_dark.addEventListener("change", apply)

    // The toggle button is in the page header
    window.addEventListener("DOMContentLoaded", function () {
        const toggle = document.getElementById("theme_toggle")
        if (toggle == null) {
            return
        }
        toggle.addEventListener("click", function () {
            try {
                localStorage.setItem("theme", is_dark() ? "light" : "dark")
            } catch {
                // Storage not available, theme will not be remembered
            }
            apply()
        })
        apply()
    })

})()
