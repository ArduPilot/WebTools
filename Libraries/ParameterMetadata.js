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

// Get parma value, converting bitmasks as required
function parameter_get_value(name) {
    let param = document.getElementById(name)
    if (param == null) {
        return
    }

    let value = parseFloat(param.value)

    // Convert to uint32 value if bitmask
    if ("type" in param.dataset) {
        const type = parseFloat(param.dataset.type)
        if (type < 32) {
            if (value < 0) {
                value += (1 << type)

                const sign_mask = 1 << (type-1)
                value |= sign_mask
            }

            const max = 0xFFFFFFFF >>> (32 - type)
            value &= max
        }
    }

    return value
}

// Set size of bitmask parameter, this allows conversion to and from values correctly and hides any unused bits
function set_bitmask_size(name, size) {
    let param = document.getElementById(name)
    if (param == null) {
        return
    }

    if (!("type" in param.dataset)) {
        error("Cannot set size of none bitmask param type: " + name)
        return
    }

    if (param.dataset.type == size) {
        // Already correct size
        return
    }

    // Bits of bitmask
    let items = param.parentElement.querySelectorAll("input[type=checkbox]")
     for (let item of items) {
        const hide = (parseFloat(item.dataset.bit) >= size) ? "none" : "inline"

        // Hide checkbox and label
        item.style.display = hide
        item.labels[0].style.display = hide

        // Hide line breaks
        let br = item.labels[0].nextSibling
        if ((br != null) && (br.nodeName == "BR")) {
            br.style.display = hide
        }
    }

    param.dataset.type = size

}

async function load_param_inputs(param_doc, param_names) {

    function layout_for_param(name, metadata) {
        // Grab param object
        let param = document.getElementById(name)
        if (param == null) {
            return
        }
        let paragraph = param.parentElement

        // label with name linking to input
        let label = document.createElement("label")
        label.style.display = "inline-block"
        label.style.width = "165px"
        label.style.margin  = "5px 0px"

        label.setAttribute('for', param.id)
        label.innerHTML = name

        // Add description in hover over to both input and label
        if ("Description" in metadata) {
            label.setAttribute('title', metadata.Description)
            param.setAttribute('title', metadata.Description)
        }

        // Label comes before parameter
        paragraph.insertBefore(label, param)

        let allow_values = "Values" in metadata
        if (allow_values && ("paramvalues" in param.dataset) && (param.dataset.paramvalues === 'false')) {
            allow_values = false
        }

        // Add units
        if (("Units" in metadata) && !allow_values) {
            paragraph.appendChild(document.createTextNode(metadata.Units))
        }

         // use class="constrain" to constrain input to range
        if (
            param.type === "number" &&
            param.classList.contains("constrain") &&
            "Range" in metadata &&
            metadata.Range.low !== undefined &&
            metadata.Range.high !== undefined
        ) {
            param.setAttribute("min", metadata.Range.low);
            param.setAttribute("max", metadata.Range.high);
        }

        if ("Bitmask" in metadata) {
            // Add checkboxes for each bit
            param.setAttribute('step', 1)

            // Assume 32 bit bitmask
            param.setAttribute('data-type', 32)

            let read_bits = function(event) {
                let paragraph = event.currentTarget.parentElement

                // read bits in bitmask
                let items = paragraph.querySelectorAll("input[type=checkbox]")
                let value = 0
                for (let item of items) {
                    if (item.checked) {
                        value |= 1<<parseFloat(item.dataset.bit)
                    }
                }
                let param = event.currentTarget.parentElement.querySelectorAll("input[type=number]")[0]

                // Convert to set type
                if ("type" in param.dataset) {
                    const type = parseFloat(param.dataset.type)
                    if (type < 32) {
                        const max = 0xFFFFFFFF >>> (32 - type)
                        value &= max

                        const sign_mask = 1 << (type-1)
                        if ((value & sign_mask) != 0) {
                            value -= (1 << type)
                        }
                    }
                }

                param.value = value
                if (typeof param.onchange === 'function') {
                    param.onchange()
                }
            }

            paragraph.appendChild(document.createElement('br'))
            let bit_count = 0
            for (const [bit, desc] of Object.entries(metadata.Bitmask)) {
                if (bit_count > 2) {
                    // New line after 3 items
                    paragraph.appendChild(document.createElement('br'))
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

                paragraph.appendChild(check)
                paragraph.appendChild(label)
            }

            let set_bits = function(event) {
                const value = parameter_get_value(event.currentTarget.id)

                // Set bits in bitmask
                let items = param.parentElement.querySelectorAll("input[type=checkbox]")
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
                list_item.innerHTML = value + ':' + desc
                value_list.appendChild(list_item)
            }
            value_list.name = param.name
            value_list.value = param.value
            value_list.disabled = param.disabled
            value_list.onchange = param.onchange

            paragraph.appendChild(value_list)
            paragraph.removeChild(param)
        }

    }

    function load(data) {

        function recursive_search(obj, param) {
            for (const [key, value] of Object.entries(obj)) {
                if (!param.startsWith(key)) {
                    continue
                }
                if (param === key) {
                    return value
                }
                let found = recursive_search(value, param)
                if (found != null) {
                    return found
                }
            }
        }


        for (param of param_names) {
            let metadata = recursive_search(data, param)
            if (metadata == null) {
                console.log(`No metadata for ${param}`)
            } else {
                layout_for_param(param, metadata)
            }
        }

    }

    fetch(param_doc)
        .then((res) => {
        return res.json();
    }).then((data) => load(data));
}
