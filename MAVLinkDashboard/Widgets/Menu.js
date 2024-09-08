// Menu widget
// Sub grid containing clickable icons

class WidgetMenu extends WidgetBase {
    constructor(options) {

        if (options == null) {
            options = {}
        }

        // Add a predefined form, color input for border and background
        options.form = {
            components: 
            [{
                label: "Border color",
                key: "borderColor",
                type: "color",
                input: true,
                tableView: false,
                widget: { type: "input" },
                inputType: "color",
                mask: false,
                data: "#000000",
                defaultValue: "#c8c8c8",
                id: "ebao4j",
                placeholder: "",
                prefix: "",
                customClass: "",
                suffix: "",
                multiple: false,
                protected: false,
                unique: false,
                persistent: true,
                hidden: false,
                clearOnHide: true,
                refreshOn: "",
                redrawOn: "",
                modalEdit: false,
                dataGridLabel: false,
                labelPosition: "top",
                description: "",
                errorLabel: "",
                tooltip: "",
                hideLabel: false,
                tabindex: "",
                disabled: false,
                autofocus: false,
                dbIndex: false,
                customDefaultValue: "",
                calculateValue: "",
                calculateServer: false,
                attributes: {},
                validateOn: "change",
                validate: {
                    required: false,
                    custom: "",
                    customPrivate: false,
                    strictDateValidation: false,
                    multiple: false,
                    unique: false
                },
                conditional: {
                    show: null,
                    when: null,
                    eq: ""
                },
                overlay: {
                    style: "",
                    left: "",
                    top: "",
                    width: "",
                    height: ""
                },
                allowCalculateOverride: false,
                encrypted: false,
                showCharCount: false,
                showWordCount: false,
                properties: {},
                allowMultipleMasks: false,
                addons: []
            },
            {
                label: "Background color",
                tooltip: "Note that the icons may not show up if the background is too dark.",
                key: "backgroundColor",
                type: "color",
                input: true,
                tableView: false,
                widget: { type: "input" },
                inputType: "color",
                mask: false,
                data: "#000000",
                defaultValue: "#ffffff",
                id: "e6byhel",
                placeholder: "",
                prefix: "",
                customClass: "",
                suffix: "",
                multiple: false,
                protected: false,
                unique: false,
                persistent: true,
                hidden: false,
                clearOnHide: true,
                refreshOn: "",
                redrawOn: "",
                modalEdit: false,
                dataGridLabel: false,
                labelPosition: "top",
                description: "",
                errorLabel: "",
                hideLabel: false,
                tabindex: "",
                disabled: false,
                autofocus: false,
                dbIndex: false,
                customDefaultValue: "",
                calculateValue: "",
                calculateServer: false,
                attributes: {},
                validateOn: "change",
                validate: {
                    required: false,
                    custom: "",
                    customPrivate: false,
                    strictDateValidation: false,
                    multiple: false,
                    unique: false
                },
                conditional: {
                    show: null,
                    when: null,
                    eq: ""
                },
                overlay: {
                    style: "",
                    left: "",
                    top: "",
                    width: "",
                    height: ""
                },
                allowCalculateOverride: false,
                encrypted: false,
                showCharCount: false,
                showWordCount: false,
                properties: {},
                allowMultipleMasks: false,
                addons: []
            }]
        }

        super(options, false)

        this.classList.add("grid-stack-item")
        this.classList.add("grid-stack-draggable-item")
        this.classList.add("grid-stack-sub-grid")

        this.widget_div = document.createElement("div")
        this.widget_div.style.border = "5px solid"
        this.widget_div.style.borderRadius = "10px"
        this.widget_div.style.borderColor = "#c8c8c8"
        this.widget_div.style.padding = "5px"
        this.widget_div.style.flex = 1
        this.widget_div.style.overflow = "hidden"

        this.widget_div.classList.add("grid-stack-item-content")
        this.appendChild(this.widget_div)

        this.size_div = document.createElement("div")
        this.size_div.style.position = "absolute"
        this.size_div.style.top = 0
        this.size_div.style.left = 0
        this.size_div.style.bottom = 0
        this.size_div.style.right = 0
        this.widget_div.appendChild(this.size_div)

        this.grid_div = document.createElement("div")
        this.grid_div.style.border = "none"
        this.grid_div.style.width = "100%"
        this.grid_div.style.height =  "100%"
        this.grid_div.style.overflow = "hidden"

        this.size_div.appendChild(this.grid_div)

        this.grid = GridStack.init({
            float: true,
            disableOneColumnMode: true,
            staticGrid: true
        }, this.grid_div)

    }

    init() {

        // AP link
        let AP_div = document.createElement("div")
        AP_div.appendChild(document.importNode(document.getElementById('AP_link').content, true))
        this.grid.addWidget(AP_div)

        // Github repo link
        let GH_div = document.createElement("div")
        GH_div.appendChild(document.importNode(document.getElementById('GH_link').content, true))
        this.grid.addWidget(GH_div)

        // Connect button
        let Connect_div = document.createElement("div")
        Connect_div.appendChild(document.importNode(document.getElementById('Connect_icon_template').content, true))
        this.grid.addWidget(Connect_div)

        // Setting button
        let settings_div = document.createElement("div")
        settings_div.appendChild(document.importNode(document.getElementById('settings_icon_template').content, true))
        this.grid.addWidget(settings_div)

        // Tip for settings
        const settings_icon = settings_div.querySelector(`svg[name="gear"]`)
        settings_icon.id = "MenuSettingsIcon"
        const settings_tip_div = document.createElement("div")
        settings_tip_div.id = "settings_tip_div"
        settings_tip_div.appendChild(document.importNode(document.getElementById('settings_tip_template').content, true))
        const settings_tip = tippy(settings_icon, {
            content: settings_tip_div,
            interactive: true,
            trigger: 'manual',
            maxWidth: "1000px",
            appendTo: () => document.body,
            popperOptions: {
                strategy: 'fixed',
                modifiers: [
                    {
                      name: 'flip',
                      options: {
                        fallbackPlacements: ['bottom', 'right'],
                      },
                    },
                    {
                      name: 'preventOverflow',
                      options: {
                        altAxis: true,
                        tether: false,
                      },
                    },
                  ],
            },
        })
        settings_icon.onclick = () => { settings_tip.show() }

        // Close button
        settings_tip_div.querySelector(`svg[id="Close"]`).onclick = () => {
            settings_tip.hide()
        }

        // Edit checkbox
        const edit_checkbox = settings_tip_div.querySelector(`input[id="edit_enabled"]`)
        edit_checkbox.onclick = () => {
            const b = edit_checkbox.checked
            grid_set_edit(grid, b)
        }

        // Grid dimension inputs
        const num_columns = settings_tip_div.querySelector(`input[id="num_columns"]`)
        num_columns.value = grid.opts.column
        num_columns.onchange = () => {
            grid.column(parseInt(num_columns.value), 'list')
            this.changed = true
        }

        const num_rows = settings_tip_div.querySelector(`input[id="num_rows"]`)
        num_rows.value = grid.opts.maxRow
        num_rows.onchange = () => {
            // Can't dynamically change the number of rows, get layout, update rows and re-load
            const layout = get_layout()
            layout.grid.rows = num_rows.value
            load_layout(layout.grid, layout.widgets)
            this.changed = true
        }

        // Background color input
        const background_color = settings_tip_div.querySelector(`input[id="background_color"]`)

        // Helper to go from RGB to hex as used by input value
        function rgbToHex(rgb) {
            const sep = rgb.indexOf(",") > -1 ? "," : " "
            rgb = rgb.substr(4).split(")")[0].split(sep)

            function componentToHex(c) {
                const hex = c.toString(16);
                return hex.length == 1 ? "0" + hex : hex
            }
            return "#" + componentToHex(+rgb[0]) + componentToHex(+rgb[1]) + componentToHex(+rgb[2])
        }

        const dashboard_div = document.getElementById("dashboard")
        background_color.value = rgbToHex(dashboard_div.style.backgroundColor)
        background_color.onchange = () => {
            dashboard_div.style.backgroundColor = background_color.value
            this.changed = true
        }

        // Save button
        settings_tip_div.querySelector(`input[id="save_button"]`).onclick = () => {
            save_layout()
        }

        // Load button
        settings_tip_div.querySelector(`input[id="loadBase"]`).onchange = (e) => {
            settings_tip.hide()
            load_file(e.target)
        }

        // Pass the path to be used as the button for connection
        let connect_icon = Connect_div.querySelector('svg')
        let connect_path = connect_icon.querySelector('path')
        let set_color = function(c) {
            connect_path.setAttribute("fill", c)
        }
        setup_connect(connect_icon, set_color)

        // watch for size changes
        new ResizeObserver(() => { this.#update_size() }).observe(this)

        // Don't show edit buttons on tool tip
        this.disable_buttons_for_edit()

    }

    #update_size() {
        if (this.grid == null) {
            return
        }

        const height = this.size_div.clientHeight
        const width = this.size_div.clientWidth

        const max_ar = 1.5
        const min_ar = 1 / max_ar

        const ar = height / width
        let columns
        if (ar < min_ar) {
            // Wide and thin
            columns = 4
        } else if (ar > max_ar) {
            // Tall and narrow
            columns = 1
        } else {
            // Square ish
            columns = 2
        }

        // Set number of columns and row height
        this.grid.column(columns)
        this.grid.cellHeight(Math.floor((height * columns) / 4) + "px")

        // Place each item
        const widgets = this.grid.getGridItems()
        for (let i = 0; i<widgets.length; i++) {
            this.grid.update(widgets[i], { x:i % columns, y:Math.floor(i / columns) })
        }
    }

    get_options() {
        return { form_content: this.get_form_content() }
    }

    // Form changed due to user input
    form_changed() {
        super.form_changed()
        const options = this.get_form_content()
        this.widget_div.style.borderColor = options.borderColor
        this.widget_div.style.backgroundColor = options.backgroundColor
    }

    destroy() {
        this.grid.destroy()
        this.grid = null
        super.destroy()
    }

}
customElements.define('widget-menu', WidgetMenu)
