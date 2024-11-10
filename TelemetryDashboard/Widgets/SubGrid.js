// SubGrid widget
// Adds sub grid

class WidgetSubGrid extends WidgetBase {
    constructor(options) {

        if (options == null) {
            options = {}
        }

        // Add a predefined form, grid size and color input for border and background
        options.form = {
            components:
            [{
                label: "Rows",
                tooltip: "Number of rows in this subgrid.",
                applyMaskOn: "change",
                mask: false,
                tableView: false,
                delimiter: false,
                requireDecimal: false,
                inputFormat: "plain",
                truncateMultipleSpaces: false,
                validate: {
                    min: 1,
                    max: 12
                },
                validateWhenHidden: false,
                key: "rows",
                type: "number",
                input: true,
                defaultValue: 2,
                decimalLimit: 0
            },
            {
                label: "Columns",
                tooltip: "Number of columns in this subgrid.",
                applyMaskOn: "change",
                mask: false,
                tableView: false,
                delimiter: false,
                requireDecimal: false,
                inputFormat: "plain",
                truncateMultipleSpaces: false,
                validate: {
                    min: 1,
                    max: 12
                },
                validateWhenHidden: false,
                key: "columns",
                type: "number",
                input: true,
                defaultValue: 2,
                decimalLimit: 0
            },
            {
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
                tooltip: "",
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
            },
            {
                label: "Background image",
                tooltip: "The sub grid will take on the aspect ratio of the image so sub grid widgets hold position relative to the image as the dashboard is re-sized.",
                storage: "base64",
                key: "backgroundImage",
                type: "file",
                input: true
            }]
        }

        // Add info used in palette tool tip
        options.about = {
            name: "Subgrid",
            info: "Nestable sub grid widget"
        }

        super(options, true)

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

        // Don't show edit button on tool tip
        this.tippy_div.querySelector(`svg[id="Edit"]`).style.display = "none"

        // Load grid if size options given
        this.widgets_to_load = null
        if (("form_content" in options) && ("rows" in options.form_content) && ("columns" in options.form_content)) {
            this.grid_rows = options.form_content.rows
            this.grid_columns = options.form_content.columns
            this.load_grid()

            // Load provided widgets
            if ("widgets" in options) {
                this.widgets_to_load = options.widgets
            }
        }

        this.grid_changed = false
    }

    init() {
        super.init()
        // Widgets are loaded after this widget has been loaded into its grid
        // This guarantees this widget has some size which the the sub widgets can inherit
        if (this.widgets_to_load != null) {
            load_widgets(this.grid, this.widgets_to_load)
            this.widgets_to_load = null

            // Clear changed flag
            this.grid_changed = false
        }
    }

    MAVLink_msg_handler(msg) {
        if (this.grid == null) {
            return
        }

        // Forward message on to sub widgets
        for (const widget of this.grid.getGridItems()) {
            widget.MAVLink_msg_handler(msg)
        }
    }

    load_grid() {

        // Stash widgets for reload after resize
        let widgets
        if (this.grid != null) {
            widgets = get_widgets(this.grid)
        }

        // Clear existing grid
        clear_grid(this.grid)

        // Remove grid div
        if (this.grid_div != null) {
            this.size_div.removeChild(this.grid_div)
        }

        // Replace grid div
        this.grid_div = document.createElement("div")
        this.grid_div.style.border = "none"
        this.grid_div.style.width = "100%"
        this.grid_div.style.height =  "100%"
        this.grid_div.style.overflow = "hidden"
        this.size_div.appendChild(this.grid_div)

        // Create new grid
        this.grid = GridStack.init({
            float: true,
            disableDrag: true,
            disableResize: true,
            column: this.grid_columns,
            row: this.grid_rows,
            cellHeight: (100 / this.grid_rows) + "%",
            disableOneColumnMode: true,
            alwaysShowResizeHandle: true,
            acceptWidgets: function(widget) {
                const name = widget.constructor.name
                if (name == "WidgetMenu") {
                    // Don't allow the menu to be moved into sub grid
                    return false
                }
                return true
            }
        }, this.grid_div)

        // Replace widgets
        if (widgets != null) {
            load_widgets(this.grid, widgets)
        }

        // Re-apply edit to grid and widgets
        this.set_edit(this.edit_enabled)

        // Bind dropped callback
        this.grid.on('dropped', widget_dropped)

        // Bind changed callback
        this.grid.on('change added removed', () => { 
            this.grid_changed = true
        })

        // Clear changed flag
        this.grid_changed = false
    }

    // Set edit enable / disable
    set_edit(b) {
        super.set_edit(b)
        grid_set_edit(this.grid, b)
    }

    get_options() {
        return { 
            form_content: this.get_form_content(),
            widgets: get_widgets(this.grid)
        }
    }

    // Resize subgrid to match image, this means the widgets hold position relative to the image as it is resized
    resize() {
        if (this.image == null) {
            return
        }

        const bb = this.image.getBoundingClientRect()

        // Work out the scale factor for the image to fit while maintaining the original aspect ratio
        const width_scale = bb.width / this.image.naturalWidth
        const height_scale = bb.height / this.image.naturalHeight
        const scale = Math.min(width_scale, height_scale)

        // True width and height of the image can be found
        const true_width = this.image.naturalWidth * scale
        const true_height = this.image.naturalHeight * scale

        // The difference is applied evenly to each side
        const width_diff = ((bb.width - true_width) * 0.5) + "px"
        const height_diff = ((bb.height - true_height) * 0.5) + "px"

        this.size_div.style.top = height_diff
        this.size_div.style.bottom = height_diff
        this.size_div.style.left = width_diff
        this.size_div.style.right = width_diff
    }

    // Form changed due to user input
    form_changed() {
        super.form_changed()
        const options = this.get_form_content()
        this.widget_div.style.borderColor = options.borderColor
        this.widget_div.style.backgroundColor = options.backgroundColor

        if (("backgroundImage" in options) && (options.backgroundImage != null) && (options.backgroundImage.length > 0) ) {
            if (this.image == null) {
                this.image = document.createElement("img")
                this.image.setAttribute("width", "100%")
                this.image.setAttribute("height", "100%")
                this.image.style.objectFit = "contain"
                this.widget_div.appendChild(this.image)
            }
            this.image.src = options.backgroundImage[0].url

            // Fit sub grid to image and watch for size changes
            this.resize()
            new ResizeObserver(() => { this.resize() }).observe(this.image)
        }

        // Reload grid if size changed
        if (("rows" in options) && ("columns" in options) && ((options.rows != this.grid_rows) || (options.columns != this.grid_columns))) {
            this.grid_rows = options.rows
            this.grid_columns = options.columns
            this.load_grid()
        }
    }

    destroy() {
        clear_grid(this.grid)
        super.destroy()
    }

    // Changed function, check each sub widget
    get_changed() {
        if (super.get_changed() || this.grid_changed) {
            return true
        }

        for (const widget of this.grid.getGridItems()) {
            if (widget.get_changed()) {
                return true
            }
        }

        return false
    }

    // Saved function, set on each sub widget
    saved() {
        super.saved()
        this.grid_changed = false
        if (this.grid == null) {
            return
        }

        for (const widget of this.grid.getGridItems()) {
            widget.saved()
        }
    }

}
customElements.define('widget-subgrid', WidgetSubGrid)
