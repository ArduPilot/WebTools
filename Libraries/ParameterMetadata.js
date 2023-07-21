// This script reads ArduPilot parameter metadata in json format and builds a layout for param

function parameter_set_value(name, value) {
    let param = document.getElementById(name)
    if (param == null) {
        return false
    }

    // set main input
    param.value = value

    // Set bits in bitmask
    let items = param.parentElement.querySelectorAll("input[type=checkbox]")
    for (let item of items) {
        item.checked = value & (1<<parseFloat(item.dataset.bit))
    }

    return true
}

function parameter_set_disable(name, disable) {
    let param = document.getElementById(name)
    if (param == null) {
        return
    }
    // set main input
    param.disabled = disable

    // Set bits in bitmask
    let items = param.parentElement.querySelectorAll("input[type=checkbox]")
    for (let item of items) {
        item.disabled = disable
    }
}

async function load_param_inputs(param_doc, param_names) {

    function layout_for_param(name, metadata) {
        // Grab pram object
        let param = document.getElementById(name)
        if (param == null) {
            return
        }
        let paragaph = param.parentElement

        // label with name linking to input
        let label = document.createElement("label")
        label.setAttribute('class', 'parameter_input_label')
        label.setAttribute('for', param.id)
        label.innerHTML = name

        // Add discription in hover over to both input and label
        if ("Description" in metadata) {
            label.setAttribute('title', metadata.Description)
            param.setAttribute('title', metadata.Description)
        }

        // Label comes before parameter
        paragaph.insertBefore(label, param)

        let allow_values = "Values" in metadata
        if (allow_values && ("paramvalues" in param.dataset) && (param.dataset.paramvalues === 'false')) {
            allow_values = false
        }

        // Add uints
        if (("Units" in metadata) && !allow_values) {
            paragaph.appendChild(document.createTextNode(metadata.Units))
        }


        if ("Bitmask" in metadata) {
            // Add checkboxes for each bit
            param.setAttribute('step', 1)

            let read_bits = function(event) {
                let paragaph = event.currentTarget.parentElement

                // read bits in bitmask
                let items = paragaph.querySelectorAll("input[type=checkbox]")
                let value = 0
                for (let item of items) {
                    if (item.checked) {
                        value |= 1<<parseFloat(item.dataset.bit)
                    }
                }
                let param = event.currentTarget.parentElement.querySelectorAll("input[type=number]")
                param[0].value = value
                param[0].onchange()
            }

            paragaph.appendChild(document.createElement('br'))
            let bit_count = 0
            for (const [bit, desc] of Object.entries(metadata.Bitmask)) {
                if (bit_count > 2) {
                    // New line after 3 items
                    paragaph.appendChild(document.createElement('br'))
                    bit_count = 0
                }
                bit_count++

                const bit_name =  'bit_' + bit + '_' + name
                let check = document.createElement("input")
                check.setAttribute('type', 'checkbox')
                check.setAttribute('id', bit_name)
                check.setAttribute('data-bit', bit)
                check.disabled = param.disabled
                check.checked = parseFloat(param.value) & (1<<bit)
                check.addEventListener('change', read_bits)

                let label = document.createElement("label")
                label.setAttribute('for', bit_name)
                label.innerHTML = desc + '&nbsp'

                paragaph.appendChild(check)
                paragaph.appendChild(label)
            }

            let set_bits = function(event) {
                let param = event.currentTarget
                // Set bits in bitmask
                let items = param.parentElement.querySelectorAll("input[type=checkbox]")
                const value = parseFloat(param.value)
                for (let item of items) {
                    item.checked = value & (1<<parseFloat(item.dataset.bit))
                }
            }
            param.addEventListener('change', set_bits)

        } else if (allow_values) {
            // Replace input with select drop down
            let value_list = document.createElement("select")
            value_list.setAttribute('id', name)
            for (const [value, desc] of Object.entries(metadata.Values)) {
                let list_item = document.createElement("option")
                list_item.setAttribute('value', value)
                list_item.innerHTML = value + ': ' + desc
                value_list.appendChild(list_item)
            }
            value_list.name = param.name
            value_list.value = param.value
            value_list.disabled = param.disabled
            value_list.onchange = param.onchange

            paragaph.appendChild(value_list)
            paragaph.removeChild(param)
        }

    }

    function load(data) {

        function recursive_serch(obj, param) {
            for (const [key, value] of Object.entries(obj)) {
                if (!param.startsWith(key)) {
                    continue
                }
                if (param === key) {
                    return value
                }
                let found = recursive_serch(value, param)
                if (found != null) {
                    return found
                }
            }
        }


        for (param of param_names) {
            let metadata = recursive_serch(data, param)
            if (metadata != null) {
                layout_for_param(param, metadata)
            }
        }

    }

    fetch(param_doc)
        .then((res) => {
        return res.json();
    }).then((data) => load(data));
}
