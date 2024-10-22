// Base class for widget
// Adds form in tool tip

class WidgetBase extends HTMLElement {

    constructor(options, editable) {
        super()

        // Stash info used for widget palette
        this.about = null
        if ((options != null) && ("about" in options)) {
            this.about = options.about
        } else {
            this.about = { name: this.constructor.name }
        }

        let form_definition = {}
        let form_content = {}

        if ((options != null) && ("form" in options)) {
            form_definition = options.form
            if ("form_content" in options) {
                form_content = options.form_content
            }
        }

        this.style.display = "flex"
        this.edit_enabled = false

        // Bool to track changes, used to prompt user to save
        this.changed = false

        // Popup to show on double click when edit is enabled
        this.tippy_div = document.createElement("div")
        this.tippy_div.appendChild(document.importNode(document.getElementById('widget_tip_template').content, true))

        // Add name
        this.tippy_div.querySelector(`span[id="NameSpan"]`).innerHTML = this.about.name

        // Copy button
        this.tippy_div.querySelector(`svg[id="Copy"]`).onclick = () => {
            const copy = add_widget(this.gridstackNode.grid, get_widget_object(this))
            if (copy != null) {
                copy.init()
            }
        }

        // Remove button
        this.tippy_div.querySelector(`svg[id="Delete"]`).onclick = () => {
            const text = "This widget has not been downloaded!\n Click OK to delete anyway."
            if (this.changed && (confirm(text) != true)) {
                return
            }
            this.destroy()
            this.gridstackNode.grid.removeWidget(this)
        }

        // Close button
        this.tippy_div.querySelector(`svg[id="Close"]`).onclick = () => {
            this.edit_tip.hide()
        }

        // Edit button
        let edit_button = this.tippy_div.querySelector(`svg[id="Edit"]`)
        if (editable) {
            edit_button.onclick = () => {
                this.edit_tip.hide()
                load_editor(this)
            }
        } else {
            edit_button.style.display = "none"
        }

        // Save button
        let save_button = this.tippy_div.querySelector(`svg[id="Save"]`)
        if (editable) {
            save_button.onclick = () => {
                this.edit_tip.hide()
                save_widget(this)

                // Reset change tracking
                this.saved()
            }
        } else {
            save_button.style.display = "none"
        }

        // Add form
        const form_div = this.tippy_div.querySelector(`div[id="form"]`)
        Formio.createForm(form_div, form_definition).then((form) => {
            // Populate form object and add changed callback
            this.form = form

            // Load form
            this.form.setForm(form_definition).then(() => {

                // If there is no item in the form it can be hidden
                this.#check_form_hide()

                // Set data
                this.form.setSubmission( { data: form_content } ).then(() => {

                    // Trigger initial callback for first load
                    this.form_changed()

                    // Clear changed flag
                    this.changed = false

                    // Add change callback
                    this.last_content = JSON.stringify(this.form.submission.data)
                    this.form.on('change', (e) => {
                        if (e.changed == null) {
                            // No changes
                            return
                        }
                        if (!this.form.checkValidity(this.form.submission.data)) {
                            // Invalid value
                            return
                        }
                        const JSON_data = JSON.stringify(this.form.submission.data)
                        if (this.last_content == JSON_data) {
                            // No change from last submission
                            return
                        }
                        this.last_content = JSON_data
                        this.form_changed()
                    })
                })
            })
        })

        this.edit_tip = tippy(this, {
            content: this.tippy_div,
            interactive: true,
            trigger: 'manual',
            maxWidth: "500px",
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

        this.ondblclick = (e) => {
            if (this.edit_enabled) {
                this.edit_tip.show()
            }

            // Don't propagate events, this prevents triggering the a sub grid event
            e.stopPropagation()
        }

    }

    // Handle incoming MAVLink message
    MAVLink_msg_handler(msg) {}

    // Enable or disable editing
    set_edit(b) {
        this.edit_enabled = b

        // Show "move" pointer to user on hover over
        this.style.cursor = b ? "move" : "auto"
    }

    get_about() {
        return this.about
    }

    
    // Get edit text type
    get_edit_language() { }

    // Get text value to be edited in the editor
    get_edit_text() {}

    // Set text that has been edited by the editor
    set_edited_text(text) {}

    // Don't want all buttons to work in the editor
    disable_buttons_for_edit() {
        this.tippy_div.querySelector(`svg[id="Delete"]`).style.display = "none"
        this.tippy_div.querySelector(`svg[id="Copy"]`).style.display = "none"
        this.tippy_div.querySelector(`svg[id="Save"]`).style.display = "none"
        this.tippy_div.querySelector(`svg[id="Edit"]`).style.display = "none"
    }

    // Clean up
    destroy() {
        this.edit_tip.destroy()
    }

    // Hide form with no content
    #check_form_hide() {
        const content = this.form.form

        let have_content = true
        if ((Object.values(content).length == 0) ||
            !("components" in content) ||
            (content.components.length == 0)) {
            have_content = false
        }

        this.tippy_div.querySelector(`div[id="form"]`).style.display = have_content ? "block" : "none"

    }


    // Update form definition
    set_form_definition(new_def) {
        if (JSON.stringify(this.form.form) != JSON.stringify(new_def)) {
            // Update change tracking
            this.changed = true
        }

        this.form.setForm(new_def)

        this.#check_form_hide()
    }

    // Get current form definition
    get_form_definition() {
        if (this.form == null) {
            return
        }

        return this.form.form
    }

    // Get options to save
    get_options() {
        return { form: this.get_form_definition(), form_content: this.get_form_content(), about: this.about }
    }

    // Form changed due to user input
    form_changed() {
        // Update change tracking
        this.changed = true
    }

    // Get the user submission to the form
    get_form_content() {
        if (this.form == null) {
            return {}
        }

        return this.form.submission.data
    }

    // Called after the widget has been added its parent main grid
    init() {}

    // Changed and saved functions used to warn user about leaving the page
    get_changed() {
        return this.changed
    }

    saved() {
        this.changed = false
    }

}
customElements.define('widget-base', WidgetBase)
