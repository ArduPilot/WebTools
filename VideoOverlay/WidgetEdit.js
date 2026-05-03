
let editor = null
let model = null
let form_builder = null
let test_grid = null

function init_editor() {

    const script_tab = document.getElementById('TextEditor')
    const form_tab = document.getElementById('FormEditor')

    require.config({ paths: { 'vs': 'https://unpkg.com/monaco-editor@latest/min/vs' }});

    window.MonacoEnvironment = {
        getWorkerUrl: function(workerId, label) {
            return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
            self.MonacoEnvironment = {
                baseUrl: 'https://unpkg.com/monaco-editor@latest/min/'
            };
            importScripts('https://unpkg.com/monaco-editor@latest/min/vs/base/worker/workerMain.js');`
            )}`
        }
    }

    require(["vs/editor/editor.main"], function () {
        model = monaco.editor.createModel("", "javascript");
        editor = monaco.editor.create(script_tab, {
            model: model,
            language: 'javascript',
            theme: 'vs-dark',
            automaticLayout: true,
        })
    })

    // Test grid
    const columns = 5
    const rows = 5
    test_grid = GridStack.init({
        float: true,
        disableDrag: true,
        disableResize: true,
        column: columns,
        row: rows,
        cellHeight: (100 / rows) + "%",
        disableOneColumnMode: true,
        alwaysShowResizeHandle: true
    }, document.getElementById("TestGrid"))

    // Edit buttons
    const edit_overlay = document.getElementById("edit_overlay")
    const edit_icon = edit_overlay.querySelector(`svg[name="edit"]`)
    const lock_icon = edit_overlay.querySelector(`svg[name="lock"]`)

    // Handle edit button clicks
    function edit_click(b) {
        edit_icon.setAttribute("display", !b ? "block" : "none")
        lock_icon.setAttribute("display",  b ? "block" : "none")

        if (b) {
            test_grid.enable()
        } else {
            test_grid.disable()
        }

        for (const widget of test_grid.getGridItems()) {
            widget.set_edit(b)
        }
    }

    edit_icon.onclick = () => { edit_click(true) }
    lock_icon.onclick = () => { edit_click(false) }

    // Custom input for color
    const input_component = Formio.Components.components.input
    const input_edit_form = Formio.Components.components.input.editForm()

    class Color extends input_component {
        static schema(...extend) {
            return input_component.schema({
                type: 'color',
                label: 'color',
                key: 'color',
                inputType: 'color',
                mask: false,
                data: "#000000"
            }, ...extend)
        }

        static get builderInfo() {
            return {
                title: 'Color picker',
                icon: 'palette',
                group: 'basic',
                documentation: '/userguide/#textfield',
                weight: 0,
                schema: Color.schema()
            };
        }

        static editForm = function () {
            return input_edit_form
        }

        // Fix annoying warning about value="" being invalid for color inputs
        setValue(e) {
            if (e == "") {
                e = "#000000"
            }
            super.setValue(e)
        }

        renderElement(value, index) {
            let ret = super.renderElement(value, index)
            return ret.replace('value=""', 'value="#000000"')
        }
    }

    Formio.use({
        components: {
            color: Color
        }
    })

    // Setup FormIO
    const options = {
        noDefaultSubmitButton: true,
        builder: {
            advanced: false,
            premium: false,
            data: false,
            basic: {
                title: 'Inputs',
                default: true,
                components: {
                    password: false,
                    button: false,
                    textarea: false,
                    file: {
                        title: 'file',
                        key: 'file',
                        icon: 'file',
                        schema: {
                          label: 'Upload',
                          type: 'file',
                          key: 'file',
                          input: true,
                          storage: 'base64',
                        }
                    },
                }
            },
            layout: {
                default: true,
                components: {
                    content: false,
                    well: false,
                }
            },
        },
    }

    // Strip formio builder components to remove lots of the options
    // Only include what is given in the white list object
    function strip_component(obj, white_list, black_list) {

        function strip_array(obj, list) {
            return obj.filter(comp => list.includes(comp.key))
        }

        // Get display tab of edit form
        const item = obj.editForm()

        // Strip tabs
        const tabs = Object.keys(white_list)
        item.components[0].components = strip_array(item.components[0].components, tabs)

        // Strip items from tabs
        for (let comp of item.components[0].components) {
            if (white_list[comp.key] == null) {
                continue
            }
            comp.components = strip_array(comp.components, white_list[comp.key])
        }

        // Strip any component with a key value in the list
        function recursive_strip(obj, keys_to_remove) {
            if (!("components" in obj)) {
                return
            }
            obj.components = obj.components.filter(comp => !keys_to_remove.includes(comp.key))

            for (let comp of obj.components) {
                recursive_strip(comp, keys_to_remove)
            }
        }

        if (black_list != null) {
            recursive_strip(item, black_list)
        }

        // Replace function to return striped object
        obj.editForm = function () {
            return item
        }

    }

    strip_component(Formio.Components.components.textfield, { display: ['label', 'description', 'tooltip'], data: ["defaultValue"], api: ["key"] })
    strip_component(Formio.Components.components.number, { display: ['label', 'description', 'tooltip'], data: ["defaultValue"], api: ["key"] })
    strip_component(Formio.Components.components.checkbox, { display: ['label', 'description', 'tooltip'], data: ["defaultValue"], api: ["key"] })
    strip_component(Formio.Components.components.selectboxes, { display: ['label', 'description', 'tooltip'], data: ["defaultValue", "values"], api: ["key"] }, "shortcut")
    strip_component(Formio.Components.components.select, { display: ['label', 'description', 'tooltip'], data: ["defaultValue", "data.values"], api: ["key"] })
    strip_component(Formio.Components.components.file, { display: ['label', 'description', 'tooltip'], data: ["multiple"], api: ["key"] })
    strip_component(Formio.Components.components.radio, { display: ['label', 'description', 'tooltip'], data: ["defaultValue", "values"], api: ["key"] }, "shortcut")
    strip_component(Formio.Components.components.color, { display: ['label', 'description', 'tooltip'], data: ["defaultValue"], api: ["key"] })

    strip_component(Formio.Components.components.htmlelement, { display: ['label', 'tag', 'content'], api: ["key"] })
    strip_component(Formio.Components.components.columns, { display: ['label', 'columns', 'tooltip'], api: ["key"] })
    strip_component(Formio.Components.components.fieldset, { display: ['legend', 'tooltip'], api: ["key"] })
    strip_component(Formio.Components.components.panel, { display: ['title', 'tooltip'], api: ["key"] })
    strip_component(Formio.Components.components.table, { display: ['label', "numRows", "numCols"], api: ["key"] })
    strip_component(Formio.Components.components.tabs, { display: ['label', "components"], api: ["key"] })

    Formio.builder(form_tab, {}, options).then((builder) => { form_builder = builder } )

    // Tab buttons
    const script_tab_button = edit_overlay.querySelector(`input[name="script"]`)
    const form_tab_button = edit_overlay.querySelector(`input[name="form"]`)

    function tab_click(button) {

        // Reset everything
        script_tab.style.display = "none"
        form_tab.style.display = "none"

        script_tab_button.style.backgroundColor = "inherit"
        form_tab_button.style.backgroundColor = "inherit"

        script_tab_button.style.color = "#000"
        form_tab_button.style.color = "#000"


        // Select the correct tab
        if (button.name == "script") {
            script_tab.style.display = "block"

            // Re-enable widget tool tip
            for (const widget of test_grid.getGridItems()) {
                widget.edit_tip.setProps({
                    hideOnClick: true
                })
            }

        } else if (button.name == "form") {
            form_tab.style.display = "block"

            // Click the edit button of the test grid
            edit_icon.onclick()

            // Pop the options menu of the test widget
            for (const widget of test_grid.getGridItems()) {
                // Show widget and prevent hide
                widget.edit_tip.show()
                widget.edit_tip.setProps({
                    hideOnClick: false
                })
            }

        } else {
            throw new Error("Unknown tab")
        }

        button.style.backgroundColor = "#000"
        button.style.color = "#fff"

    }

    script_tab_button.onclick = (e) => { tab_click(e.target) }
    form_tab_button.onclick = (e) => { tab_click(e.target) }

}

function load_editor(widget) {

    if ((editor == null) || (test_grid == null)) {
        return
    }

    // Show editor
    let edit_overlay = document.getElementById("edit_overlay")
    edit_overlay.style.display = "block"

    // Select script tab
    edit_overlay.querySelector(`input[name="script"]`).click()

    // Reset test grid
    test_grid.removeAll()
    test_grid.disable()
    edit_overlay.querySelector(`svg[name="edit"]`).setAttribute("display", "block")
    edit_overlay.querySelector(`svg[name="lock"]`).setAttribute("display", "none")

    // Load a copy of the widget onto the test grid
    const obj = get_widget_object(widget)
    const pos_opts =  {
        autoPosition: true,
        w: obj.w,
        h: obj.h
    }

    if (!test_grid.willItFit(pos_opts)) {
        // If the item won't fit at original size then allow any size
        pos_opts.w = null
        pos_opts.h = null
    }

    let test_widget = new_widget(obj.type, obj.options)

    // Don't allow delete, copy, save or edit in the editor
    test_widget.disable_buttons_for_edit()

    test_grid.addWidget(test_widget, pos_opts)

    // Set editor for correct language
    monaco.editor.setModelLanguage(monaco.editor.getModel(model.uri), test_widget.get_edit_language());

    // Load edit text into editor
    editor.setValue(test_widget.get_edit_text())

    // Update test widget in real time
    editor.onDidChangeModelContent(() => {
        test_widget.set_edited_text(editor.getValue())
    })

    // Load form into builder, note that we use the original widget here as the form may not have loaded yet in the new one
    form_builder.setForm(widget.get_form_definition())

    // Update test widget form in real time
    form_builder.on('updateComponent', function() {
        test_widget.set_form_definition(form_builder.schema)
    })
    form_builder.on('removeComponent', function() {
        test_widget.set_form_definition(form_builder.schema)
    })


    // Close edit button
    edit_overlay.querySelector(`svg[id="Close"]`).onclick = () => {

        // Call the destroy method on each widget being removed
        for (const widget of test_grid.getGridItems()) {
            widget.destroy()
            test_grid.removeWidget(widget)
        }

        // Make sure nothing is left
        test_grid.removeAll()

        // Hide overlay
        edit_overlay.style.display = "none"

        // Update original widget
        widget.set_edited_text(editor.getValue())
        widget.set_form_definition(form_builder.schema)

    }

}
