// A js tool for plotting ArduPilot PID log data

var DataflashParser
const import_done = import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

// Keys in data object to run FFT of
const fft_keys = ["Tar", "Act", "Err", "P", "I", "D", "FF", "Out"]

function run_batch_fft(data_set) {

    // Window size from user
    const window_size = parseInt(document.getElementById("FFTWindow_size").value)
    if (!Number.isInteger(Math.log2(window_size))) {
        alert('Window size must be a power of two')
        throw new Error()
    }

    const num_sets = data_set.length

    // Hard code 50% overlap
    const window_overlap = 0.5
    const window_spacing = Math.round(window_size * (1 - window_overlap))

    // Get windowing function and correction factors for use later when plotting
    const windowing_function = hanning(window_size)
    const window_correction = window_correction_factors(windowing_function)

    // FFT library
    const fft = new FFTJS(window_size);

    // Calculate average sample time
    var sample_rate_sum = 0
    var sample_rate_count = 0
    for (let j=0; j<num_sets; j++) {
        if (data_set[j] == null) {
            continue
        }
        const num_batch = data_set[j].length
        for (let i=0;i<num_batch;i++) {
            if (data_set[j][i][fft_keys[0]].length < window_size) {
                // Log section is too short, skip
                continue
            }
            sample_rate_count++
            sample_rate_sum += data_set[j][i].sample_rate
        }
    }

    if (sample_rate_sum == 0) {
        // Not enough data to make up a window
        return
    }

    const sample_time = sample_rate_count / sample_rate_sum

    for (let j=0; j<num_sets; j++) {
        if (data_set[j] == null) {
            continue
        }
        let have_data = false
        const num_batch = data_set[j].length
        for (let i=0;i<num_batch;i++) {
            if (data_set[j][i].Tar.length < window_size) {
                // Log section is too short, skip
                continue
            }
            var ret = run_fft(data_set[j][i], fft_keys, window_size, window_spacing, windowing_function, fft)

            // Initialize arrays
            if (!have_data) {
                have_data = true
                data_set[j].FFT = { time: [] }
                for (const key of fft_keys) {
                    data_set[j].FFT[key] = []
                }
            }

            data_set[j].FFT.time.push(...array_offset(array_scale(ret.center, sample_time), data_set[j][i].time[0]))
            for (const key of fft_keys) {
                data_set[j].FFT[key].push(...ret[key])
            }
        }
    }

    // Get bins and other useful stuff
    data_set.FFT = { bins: rfft_freq(window_size, sample_time),
                     average_sample_rate: 1/sample_time,
                     window_size: window_size,
                     correction: window_correction }

}

// Get index into FFT data array
function get_axis_index() {
    for (let i = 0; i < PID_log_messages.length; i++) {
        if (document.getElementById("type_" + PID_log_messages[i].id.join("_")).checked) {
            return i
        }
    }
}

// Attempt to put page back to for a new log
function reset() {

    document.title = "ArduPilot PID Review"

    const types = ["PIDP",   "PIDR",   "PIDY",
                   "PIQP",   "PIQR",   "PIQY",
                   "RATE_R", "RATE_P", "RATE_Y"]
    for (const type of types) {
        let ele = document.getElementById("type_" + type)
        ele.disabled = true
        ele.checked = false
    }

    // Clear all plot data
    for (let i = 0; i < TimeInputs.data.length; i++) {
        TimeInputs.data[i].x = []
        TimeInputs.data[i].y = []
    }
    for (let i = 0; i < TimeOutputs.data.length; i++) {
        TimeOutputs.data[i].x = []
        TimeOutputs.data[i].y = []
    }
    for (let i = 0; i < fft_plot.data.length; i++) {
        fft_plot.data[i].x = []
        fft_plot.data[i].y = []
    }
    for (let i = 0; i < step_plot.data.length; i++) {
        step_plot.data[i].x = []
        step_plot.data[i].y = []
    }
    for (let i = 0; i < Spectrogram.data.length; i++) {
        Spectrogram.data[i].x = []
        Spectrogram.data[i].y = []
    }

    document.getElementById("calculate").disabled = true

    // Disable key checkboxes by default
    for (const key of fft_keys) {
        const FFT_checkbox = document.getElementById("PIDX_" + key)
        FFT_checkbox.checked = false
        FFT_checkbox.disabled = true

        const Spec_checkbox = document.getElementById("Spec_" + key)
        Spec_checkbox.checked = false
        Spec_checkbox.disabled = true
    }

    // Check target and actual
    document.getElementById("PIDX_Tar").checked = true
    document.getElementById("PIDX_Act").checked = true

    // Show output on spectrogram by default
    document.getElementById("Spec_Out").checked = true

}

// Setup plots with no data
var flight_data = {}
var TimeInputs = {}
var TimeOutputs = {}
var fft_plot = {}
var step_plot = {}
var Spectrogram = {}
function setup_plots() {

    const time_scale_label = "Time (s)"

    // Setup flight data plot
    const flight_data_plot = ["Roll", "Pitch", "Throttle", "Altitude"]
    const flight_data_unit = ["deg",  "deg",   "",         "m"]
    flight_data.data = []
    for (let i=0;i<flight_data_plot.length;i++) {
        let axi = "y"
        if (i > 0) {
            axi += (i+1)
        }
        flight_data.data[i] = { mode: "lines",
                                name: flight_data_plot[i],
                                meta: flight_data_plot[i],
                                yaxis: axi,
                                hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} " + flight_data_unit[i] }
    }

    flight_data.layout = {
        xaxis: { title: {text: time_scale_label },
                 domain: [0.07, 0.93],
                 type: "linear", 
                 zeroline: false, 
                 showline: true, 
                 mirror: true,
                 rangeslider: {} },
        showlegend: false,
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    const flight_data_axis_pos = [0, 0.06, 0.94, 1]
    for (let i=0;i<flight_data_plot.length;i++) {
        let axi = "yaxis"
        if (i > 0) {
            axi += (i+1)
        }
        const side = i < 2 ? "left" : "right"
        flight_data.layout[axi] = {title: { text: flight_data_plot[i] },
                                            zeroline: false,
                                            showline: true,
                                            mirror: true,
                                            side: side,
                                            position: flight_data_axis_pos[i],
                                            color: plot_default_color(i) }
        if (i > 0) {
            flight_data.layout[axi].overlaying = 'y'
        }
    }

    var plot = document.getElementById("FlightData")
    Plotly.purge(plot)
    Plotly.newPlot(plot, flight_data.data, flight_data.layout, {displaylogo: false});

    // Update start and end time based on range
    document.getElementById("FlightData").on('plotly_relayout', function(data) {

        function range_update(range) {
            document.getElementById("TimeStart").value = Math.floor(range[0])
            document.getElementById("TimeEnd").value = Math.ceil(range[1])
            if ((PID_log_messages != null) && PID_log_messages.have_data) {
                // If we have data then enable re-calculate on updated range
                document.getElementById("calculate").disabled = false
            }
        }

        if ((data['xaxis.range'] !== undefined)) {
            range_update(data['xaxis.range'])
            return
        }

        const range_keys = ['xaxis.range[0]', 'xaxis.range[1]']
        if ((data[range_keys[0]] !== undefined) && (data[range_keys[1]] !== undefined)) {
            range_update([data[range_keys[0]], data[range_keys[1]]])
            return
        }

        const auto_range_key = 'xaxis.autorange'
        if ((data[auto_range_key] !== undefined) && (data[auto_range_key] == true)) {
            range_update([PID_log_messages.start_time, PID_log_messages.end_time])
        }

    })

    // Time domain plot
    const pid_inputs = ["Target","Actual","Error"]

    TimeInputs.data = []
    for (const item of pid_inputs) {
        TimeInputs.data.push({ mode: "lines",
                                name: item,
                                meta: item,
                                showlegend: true,
                                hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f}" })
    }

    TimeInputs.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                                margin: { b: 50, l: 50, r: 50, t: 20 },
                                xaxis: { title: {text: time_scale_label } },
                                yaxis: { title: {text: "deg / s" } }}

    var plot = document.getElementById("TimeInputs")
    Plotly.purge(plot)
    Plotly.newPlot(plot, TimeInputs.data, TimeInputs.layout, {displaylogo: false})


    const pid_outputs = ["P","I","D","FF","Output"]
    TimeOutputs.data = []
    for (const item of pid_outputs) {
        TimeOutputs.data.push({ mode: "lines",
                                name: item,
                                meta: item,
                                showlegend: true,
                                hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f}" })
    }

    TimeOutputs.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                                margin: { b: 50, l: 50, r: 50, t: 20 },
                                xaxis: { title: {text: time_scale_label } },
                                yaxis: { title: {text: "" } }}

    plot = document.getElementById("TimeOutputs")
    Plotly.purge(plot)
    Plotly.newPlot(plot, TimeOutputs.data, TimeOutputs.layout, {displaylogo: false})


    amplitude_scale = get_amplitude_scale()
    frequency_scale = get_frequency_scale()

    // FFT plot setup
    fft_plot.data = []
    fft_plot.layout = {
        xaxis: {title: {text: frequency_scale.label }, type: "linear", zeroline: false, showline: true, mirror: true},
        yaxis: {title: {text: amplitude_scale.label }, zeroline: false, showline: true, mirror: true },
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    plot = document.getElementById("FFTPlot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot.data, fft_plot.layout, {displaylogo: false});

    // Step response setup
    step_plot.data = []
    step_plot.layout = {
        xaxis: {title: {text: "Time (s)" }, zeroline: false, showline: true, mirror: true},
        yaxis: {title: {text: "Response" }, zeroline: false, showline: true, mirror: true },
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    // Step response 1.0 line
    step_plot.layout.shapes = [{ type: 'line',
                                line: { dash: "dot" },
                                xref: 'paper',
                                x0: 0,
                                x1: 1,
                                y0: 1,
                                y1: 1 }]

    plot = document.getElementById("step_plot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, step_plot.data, step_plot.layout, {displaylogo: false});

    // Spectrogram setup
    // Add surface
    Spectrogram.data = [{
        type:"heatmap",
        colorbar: {title: {side: "right", text: ""}, orientation: "h"},
        transpose: true,
        zsmooth: "best",
        hovertemplate: ""
    }]

    // Define Layout
    Spectrogram.layout = {
        xaxis: {title: {text: time_scale_label}, zeroline: false, showline: true, mirror: true },
        yaxis: {title: {text: frequency_scale.label }, type: "linear", zeroline: false, showline: true, mirror: true },
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 }
    }

    plot = document.getElementById("Spectrogram")
    Plotly.purge(plot)
    Plotly.newPlot(plot, Spectrogram.data, Spectrogram.layout, {displaylogo: false});

    link_plots()
} 

function link_plots() {

    // Clear listeners
    document.getElementById("TimeInputs").removeAllListeners("plotly_relayout");
    document.getElementById("TimeOutputs").removeAllListeners("plotly_relayout");
    document.getElementById("FFTPlot").removeAllListeners("plotly_relayout");
    document.getElementById("Spectrogram").removeAllListeners("plotly_relayout");
    document.getElementById("step_plot").removeAllListeners("plotly_relayout");


    // Link all frequency axis
    link_plot_axis_range([["FFTPlot", "x", "", fft_plot],
                          ["Spectrogram", "y", "", Spectrogram]])

    // Link time axis
    link_plot_axis_range([["TimeInputs", "x", "", TimeInputs],
                          ["TimeOutputs", "x", "", TimeOutputs],
                          ["Spectrogram", "x", "", Spectrogram]])


    // Link all reset calls
    link_plot_reset([["TimeInputs", TimeInputs],
                     ["TimeOutputs", TimeOutputs],
                     ["FFTPlot", fft_plot],
                     ["step_plot", step_plot],
                     ["Spectrogram", Spectrogram]])

}

// Add data sets to FFT plot
const plot_types = ["Target", "Actual", "Error", "P", "I", "D", "FF", "Output"]
function get_FFT_data_index(set_num, plot_type) {
    return set_num*plot_types.length + plot_type
}

function setup_FFT_data() {

    const PID = PID_log_messages[get_axis_index()]

    // Clear existing data
    TimeInputs.layout.shapes = []
    TimeOutputs.layout.shapes = []
    fft_plot.data = []
    step_plot.data = []


    // Add group for each param set
    const num_sets = PID.params.sets.length
    for (let i = 0; i < num_sets; i++) {
        for (let j = 0; j < plot_types.length; j++) {
            const index = get_FFT_data_index(i, j)

            // Add set number if multiple sets
            var meta_prefix = ""
            if (num_sets > 1) {
                meta_prefix = (i+1) + " "
            }

            // For each axis
            fft_plot.data[index] = { mode: "lines",
                                     name: plot_types[j],
                                     meta: meta_prefix + plot_types[j],
                                     hovertemplate: "" }

            // Add legend groups if multiple sets
            if (num_sets > 1) {
                fft_plot.data[index].legendgroup = i
                fft_plot.data[index].legendgrouptitle =  { text: "Test " + (i+1) }
            }
        }

        const color = plot_default_color(i)

        // Each set gets mean step response and individual
        const name = "Test " + (i+1)
        const step_index = i*2
        step_plot.data[step_index] = { mode: "lines",
                                       line: {color: "rgba(100, 100, 100, 0.2)"},
                                       hoverinfo: 'none',
                                       showlegend: false }

        step_plot.data[step_index + 1] = { mode: "lines",
                                           line: { width: 4, color: color },
                                           name: name,
                                           meta: name,
                                           hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f}",
                                           showlegend: num_sets > 1 }

        // Add rectangle for each param set to time domain plots
        const rect = {
            type: 'rect',
            line: { width: 0 },
            yref: 'paper',
            y0: 0,   y1: 1,
            fillcolor: color,
            opacity: 0.4,
            label: {
                text: i+1,
                textposition: 'top left',
            },
            layer: "below",
            visible: false
        }

        TimeInputs.layout.shapes.push(Object.assign({}, rect))
        TimeOutputs.layout.shapes.push(Object.assign({}, rect))

    }

    let plot = document.getElementById("TimeInputs")
    Plotly.purge(plot)
    Plotly.newPlot(plot, TimeInputs.data, TimeInputs.layout, {displaylogo: false})

    plot = document.getElementById("TimeOutputs")
    Plotly.purge(plot)
    Plotly.newPlot(plot, TimeOutputs.data, TimeOutputs.layout, {displaylogo: false})

    plot = document.getElementById("FFTPlot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot.data, fft_plot.layout, {displaylogo: false});

    plot = document.getElementById("step_plot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, step_plot.data, step_plot.layout, {displaylogo: false});

    link_plots()

}

// Calculate if needed and re-draw, called from calculate button
function re_calc() {

    const start = performance.now()

    calculate()

    redraw()

    const end = performance.now();
    console.log(`Re-calc took: ${end - start} ms`);
}

// Force full re-calc on next run, on window size change
function clear_calculation() {
    if (PID_log_messages == null) {
        return
    }
    // Enable button to fix
    document.getElementById("calculate").disabled = false

    for (let i = 0; i < PID_log_messages.length; i++) {
        if ((PID_log_messages[i] == null) || (PID_log_messages[i].sets == null)) {
            continue
        }
        for (const set of PID_log_messages[i].sets) {
            if (set != null) {
                set.FFT = null
            }
        }
        PID_log_messages[i].sets.FFT = null
    }
}

// Re-run all FFT's
function calculate() {
    // Disable button, calculation is now upto date
    document.getElementById("calculate").disabled = true

    for (let i = 0; i < PID_log_messages.length; i++) {
        if (!PID_log_messages[i].have_data) {
            continue
        }
        run_batch_fft(PID_log_messages[i].sets)
    }

}

// Get configured amplitude scale
function get_amplitude_scale() {
    const use_DB = document.getElementById("ScaleLog").checked
    const use_PSD = document.getElementById("ScalePSD").checked

    return fft_amplitude_scale(use_DB, use_PSD)
}


// Get configured frequency scale object
function get_frequency_scale() {
    const use_RPM = document.getElementById("freq_Scale_RPM").checked
    const log_scale = document.getElementById("freq_ScaleLog").checked

    return fft_frequency_scale(use_RPM, log_scale)
}

// Look through time array and return first index before start time
function find_start_index(time) {
    const start_time = parseFloat(document.getElementById("TimeStart").value)

    var start_index = 0
    for (j = 0; j<time.length; j++) {
        // Move forward start index while time is less than start time
        if (time[j] < start_time) {
            start_index = j
        }
    }
    return start_index
}

// Look through time array and return first index after end time
function find_end_index(time) {
    const end_time = parseFloat(document.getElementById("TimeEnd").value)

    var end_index = 0
    for (j = 0; j<time.length-1; j++) {
        // Move forward end index while time is less than end time
        if (time[j] <= end_time) {
            end_index = j + 1
        }
    }
    return end_index
}

function add_param_sets() {
    let fieldset = document.getElementById("test_sets")

    // Remove all children
    fieldset.replaceChildren(fieldset.children[0])

    const PID = PID_log_messages[get_axis_index()]

    // Add table
    let table = document.createElement("table")
    table.style.borderCollapse = "collapse"

    fieldset.appendChild(table)

    // Add headers
    let header = document.createElement("tr")
    table.appendChild(header)

    function set_cell_style(cell, color) {
        cell.style.border = "1px solid #000"
        cell.style.padding = "8px"
        if (color != null) {
            // add alpha, 40%
            cell.style.backgroundColor = color + '66'
        }
    }

    let index = document.createElement("th")
    header.appendChild(index)
    index.appendChild(document.createTextNode("Num"))
    set_cell_style(index)

    let item = document.createElement("th")
    header.appendChild(item)
    item.appendChild(document.createTextNode("Show"))
    set_cell_style(item)

    const names = get_PID_param_names(PID.params.prefix)
    for (const [name, param_string] of Object.entries(names)) {
        let item = document.createElement("th")
        header.appendChild(item)
        set_cell_style(item)

        item.appendChild(document.createTextNode(name.replace("_", " ")))
        item.setAttribute('title', param_string)
    }

    // Add line for each param set
    const num_sets = PID.params.sets.length

    // See how many sets are valid, if only one then the checkbox is disabled
    var valid_sets = 0
    for (let i = 0; i < num_sets; i++) {
        if ((PID.sets[i] == null) || (PID.sets[i].FFT == null)) {
            continue
        }
        valid_sets += 1
    }

    // Add line
    for (let i = 0; i < num_sets; i++) {
        const color = num_sets > 1 ? plot_default_color(i) : null
        const valid = (PID.sets[i] != null) && (PID.sets[i].FFT != null)

        const set = PID.params.sets[i]

        let row = document.createElement("tr")
        table.appendChild(row)

        let index = document.createElement("td")
        row.appendChild(index)
        set_cell_style(index, color)
        index.appendChild(document.createTextNode(i + 1))


        let item = document.createElement("td")
        row.appendChild(item)
        set_cell_style(item, color)

        let checkbox = document.createElement("input")
        checkbox.setAttribute('type', "checkbox")
        checkbox.setAttribute('id', "set_selection_" + i)
        checkbox.setAttribute('onchange', "update_hidden(this)")
        checkbox.checked = valid
        checkbox.disabled = (valid_sets == 1) || !valid
        item.appendChild(checkbox)

        for (const name of Object.keys(names)) {
            let item = document.createElement("td")
            row.appendChild(item)
            set_cell_style(item, color)

            const value = set[name]
            if (value == null) {
                continue
            }

            const text = document.createTextNode(value.toFixed(4))

            let changed = false
            if (i > 0) {
                const last_value = PID.params.sets[i-1][name]
                if (value != last_value) {
                    changed = true
                }
            }
            if (changed) {
                // Make text bold
                let bold = document.createElement("b")
                bold.appendChild(text)
                item.appendChild(bold)

            } else {
                // Just add text
                item.appendChild(text)
            }
        }
    }

    // Enable/Disable plot types as required

    // Always have target, actual and output
    document.getElementById("PIDX_Tar").disabled = false
    document.getElementById("PIDX_Act").disabled = false
    document.getElementById("PIDX_Out").disabled = false

    document.getElementById("Spec_Tar").disabled = false
    document.getElementById("Spec_Act").disabled = false
    document.getElementById("Spec_Out").disabled = false

    // Only have others from a full PID log
    const have_all = PID.id[0] !== "RATE"
    document.getElementById("PIDX_Err").disabled = !have_all
    document.getElementById("PIDX_P").disabled = !have_all
    document.getElementById("PIDX_I").disabled = !have_all
    document.getElementById("PIDX_D").disabled = !have_all
    document.getElementById("PIDX_FF").disabled = !have_all

    document.getElementById("Spec_Err").disabled = !have_all
    document.getElementById("Spec_P").disabled = !have_all
    document.getElementById("Spec_I").disabled = !have_all
    document.getElementById("Spec_D").disabled = !have_all
    document.getElementById("Spec_FF").disabled = !have_all

    // Uncheck any that are disabled
    if (!have_all) {
        document.getElementById("PIDX_Err").checked = false
        document.getElementById("PIDX_P").checked = false
        document.getElementById("PIDX_I").checked = false
        document.getElementById("PIDX_D").checked = false
        document.getElementById("PIDX_FF").checked = false

        // Change to Out on spectrogram if disabled option is set
        const disabled_checked = document.getElementById("Spec_Err").checked ||
                                 document.getElementById("Spec_P").checked ||
                                 document.getElementById("Spec_I").checked ||
                                 document.getElementById("Spec_D").checked ||
                                 document.getElementById("Spec_FF").checked
        if (disabled_checked) {
            document.getElementById("Spec_Out").checked = true
        }
    
    }


}

var amplitude_scale
var frequency_scale
function redraw() {
    if ((PID_log_messages == null) || !PID_log_messages.have_data) {
        return
    }

    const PID = PID_log_messages[get_axis_index()]

    // Time domain plots
    for (let i = 0; i < TimeInputs.data.length; i++) {
        TimeInputs.data[i].x = []
        TimeInputs.data[i].y = []
    }
    for (let i = 0; i < TimeOutputs.data.length; i++) {
        TimeOutputs.data[i].x = []
        TimeOutputs.data[i].y = []
    }
    for (const set of PID.sets) {
        if (set == null) {
            continue
        }
        for (let i = 0; i < set.length; i++) {
            if (i > 0) {
                // Push NaN to show gap in data
                for (let j = 0; j < TimeInputs.data.length; j++) {
                    TimeInputs.data[j].x.push(NaN)
                    TimeInputs.data[j].y.push(NaN)
                }
                for (let j = 0; j < TimeOutputs.data.length; j++) {
                    TimeOutputs.data[j].x.push(NaN)
                    TimeOutputs.data[j].y.push(NaN)
                }
            }
            // Same x axis for all
            for (let j = 0; j < TimeInputs.data.length; j++) {
                TimeInputs.data[j].x = TimeInputs.data[j].x.concat(set[i].time)
            }
            TimeInputs.data[0].y = TimeInputs.data[0].y.concat(set[i].Tar)
            TimeInputs.data[1].y = TimeInputs.data[1].y.concat(set[i].Act)
            if ("Err" in set[i]) {
                TimeInputs.data[2].y = TimeInputs.data[2].y.concat(set[i].Err)
            }

            for (let j = 0; j < TimeOutputs.data.length; j++) {
                TimeOutputs.data[j].x = TimeOutputs.data[j].x.concat(set[i].time)
            }
            if ("P" in set[i]) {
                TimeOutputs.data[0].y = TimeOutputs.data[0].y.concat(set[i].P)
            }
            if ("I" in set[i]) {
                TimeOutputs.data[1].y = TimeOutputs.data[1].y.concat(set[i].I)
            }
            if ("D" in set[i]) {
                TimeOutputs.data[2].y = TimeOutputs.data[2].y.concat(set[i].D)
            }
            if ("FF" in set[i]) {
                TimeOutputs.data[3].y = TimeOutputs.data[3].y.concat(set[i].FF)
            }
            TimeOutputs.data[4].y = TimeOutputs.data[4].y.concat(set[i].Out)
        }
    }

    // Set X axis to selected time range
    const time_range = [ parseFloat(document.getElementById("TimeStart").value), parseFloat(document.getElementById("TimeEnd").value) ]

    TimeInputs.layout.xaxis.autorange = false
    TimeInputs.layout.xaxis.range = time_range

    TimeOutputs.layout.xaxis.autorange = false
    TimeOutputs.layout.xaxis.range = time_range

    // Rectangles to show param changes
    if (PID.params.sets.length > 1) {
        for (let i = 0; i < PID.params.sets.length; i++) {
            const set_start = Math.max(time_range[0], PID.params.sets[i].start_time)
            const set_end = Math.min(time_range[1], PID.params.sets[i].end_time)

            TimeInputs.layout.shapes[i].x0 = set_start
            TimeInputs.layout.shapes[i].x1 = set_end
            TimeInputs.layout.shapes[i].visible = true

            TimeOutputs.layout.shapes[i].x0 = set_start
            TimeOutputs.layout.shapes[i].x1 = set_end
            TimeOutputs.layout.shapes[i].visible = true
        }
    }

    Plotly.redraw("TimeInputs")
    Plotly.redraw("TimeOutputs")

    if (PID.sets.FFT == null) {
        return
    }

    // Populate logging rate and frequency resolution
    document.getElementById("FFT_infoA").innerHTML = (PID.sets.FFT.average_sample_rate).toFixed(2)
    document.getElementById("FFT_infoB").innerHTML = (PID.sets.FFT.average_sample_rate / PID.sets.FFT.window_size).toFixed(2)

    // Graph config
    amplitude_scale = get_amplitude_scale()
    frequency_scale = get_frequency_scale()

    // Setup axes
    fft_plot.layout.xaxis.type = frequency_scale.type
    fft_plot.layout.xaxis.title.text = frequency_scale.label
    fft_plot.layout.yaxis.title.text = amplitude_scale.label

    const fft_hovertemplate = "<extra></extra>%{meta}<br>" + frequency_scale.hover("x") + "<br>" + amplitude_scale.hover("y")
    for (let i = 0; i < fft_plot.data.length; i++) {
        fft_plot.data[i].hovertemplate = fft_hovertemplate
    }

    // Windowing amplitude correction depends on spectrum of interest and resolution
    const FFT_resolution = PID.sets.FFT.average_sample_rate/PID.sets.FFT.window_size
    const window_correction = amplitude_scale.window_correction(PID.sets.FFT.correction, FFT_resolution)

     // Set scaled x data
    const scaled_bins = frequency_scale.fun(PID.sets.FFT.bins)

    const num_sets = PID.sets.length
    for (let i = 0; i < num_sets; i++) {
        const set = PID.sets[i]
        if ((set == null) || (set.FFT == null)) {
            continue
        }
        const show_set = document.getElementById("set_selection_" + i).checked

        // Find the start and end index
        const start_index = find_start_index(set.FFT.time)
        const end_index = find_end_index(set.FFT.time)+1

        // Number of windows averaged
        const mean_length = end_index - start_index

        for (let j = 0; j < fft_keys.length; j++) {
            const key = fft_keys[j]
            if (!(key in set.FFT) || (set.FFT[key][0] == null)) {
                continue
            }

            var mean = (new Array(set.FFT[key][0][0].length)).fill(0)
            for (let k=start_index;k<end_index;k++) {
                // Add to mean sum
                mean = array_add(mean, amplitude_scale.fun(complex_abs(set.FFT[key][k])))
            }

            // Apply window correction and divide by length to take mean
            const corrected = array_scale(mean, window_correction / mean_length)

            // Find the plot index
            const plot_index = get_FFT_data_index(i, j)

            // Apply selected scale, set to y axis
            fft_plot.data[plot_index].y = amplitude_scale.scale(corrected)

            // Set bins
            fft_plot.data[plot_index].x = scaled_bins

            // Work out if we should show this line
            const show_key = document.getElementById("PIDX_" + key).checked
            fft_plot.data[plot_index].visible = show_set && show_key

        }
    }

    Plotly.redraw("FFTPlot")

    redraw_Spectrogram()

    redraw_step()
}

function redraw_Spectrogram() {
    if ((PID_log_messages == null) || !PID_log_messages.have_data) {
        return
    }

    const PID = PID_log_messages[get_axis_index()]

    // Work which to plot
    var plot_key
    for (const key of fft_keys) {
        if (document.getElementById("Spec_" + key).checked) {
            plot_key = key
            break
        }
    }

    // Setup axes
    Spectrogram.layout.yaxis.type = frequency_scale.type
    Spectrogram.layout.yaxis.title.text = frequency_scale.label
    Spectrogram.layout.xaxis.autorange = false
    Spectrogram.layout.xaxis.range = [ parseFloat(document.getElementById("TimeStart").value),
                                       parseFloat(document.getElementById("TimeEnd").value)]

    Spectrogram.data[0].hovertemplate = "<extra></extra>" + "%{x:.2f} s<br>" + frequency_scale.hover("y") + "<br>" + amplitude_scale.hover("z")
    Spectrogram.data[0].colorbar.title.text = amplitude_scale.label

    // Setup xy data (x and y swapped because transpose flag is set)
    Spectrogram.data[0].y = frequency_scale.fun(PID.sets.FFT.bins)
    Spectrogram.data[0].x = []
    Spectrogram.data[0].z = []

    // Windowing amplitude correction depends on spectrum of interest
    const FFT_resolution = PID.sets.FFT.average_sample_rate/PID.sets.FFT.window_size
    const window_correction = amplitude_scale.window_correction(PID.sets.FFT.correction, FFT_resolution)

    const num_bins = Spectrogram.data[0].y.length
    const num_sets = PID.sets.length
    for (let i = 0; i < num_sets; i++) {
        const set = PID.sets[i]
        if ((set == null) || (set.FFT == null)) {
            continue
        }

        // look for gaps and add null
        const time_len = set.FFT.time.length
        let count = 0
        let last_time = set.FFT.time[0]
        let section_start = set.FFT.time[0]
        let skip_flag = []
        for (let j = 0; j < time_len; j++) {
            count++
            const this_time = set.FFT.time[j]
            const this_dt = this_time - last_time
            const average_dt = (this_time - section_start) / count

            if (this_dt > average_dt * 2.5) {
                // Add a gap
                count = 0;
                // start gap where next sample would have been expected
                Spectrogram.data[0].x.push(last_time + average_dt)
                skip_flag.push(true)

                // End gap when previous sample would be expected
                Spectrogram.data[0].x.push(this_time - average_dt)
                skip_flag.push(true)

                section_start = this_time
            }

            Spectrogram.data[0].x.push(this_time)
            skip_flag.push(false)
            last_time = this_time
        }

        // Setup z data
        const len = skip_flag.length
        let index = 0
        for (j = 0; j<len; j++) {
            if (skip_flag[j] == true) {
                // Add null Z values, this results in a blank section in the plot
                Spectrogram.data[0].z.push(new Array(num_bins))

            } else {
                const amplitude = array_scale(complex_abs(set.FFT[plot_key][index]), window_correction)
                Spectrogram.data[0].z.push(amplitude_scale.scale(amplitude_scale.fun(amplitude)))
                index++
            }
        }
    }

    Plotly.redraw("Spectrogram")
}

// Redraw step response
function redraw_step() {
    if ((PID_log_messages == null) || !PID_log_messages.have_data) {
        return
    }

    const PID = PID_log_messages[get_axis_index()]

    // Although we re-calculate the FFT, because were just using larger window overlap the original FFT can still be checked for validity
    const num_sets = PID.sets.length
    var valid_sets = 0
    for (let i = 0; i < num_sets; i++) {
        if ((PID.sets[i] != null) && (PID.sets[i].FFT != null)) {
            valid_sets += 1
        }

        // Clear plot
        const plot_index = i*2
        step_plot.data[plot_index].x = []
        step_plot.data[plot_index].y = []
    }
    if (valid_sets == 0) {
        Plotly.redraw("step_plot")
        return
    }

    // FFT library, use window size and sample rate from original FFT
    const window_size = PID.sets.FFT.window_size
    const real_len = real_length(window_size)
    const fft = new FFTJS(window_size);
    var transfer_function = fft.createComplexArray()
    var impulse_response = fft.createComplexArray()

    // Get windowing function
    const windowing_function = hanning(window_size)

    // Large overlap to maximize data, 50% must be used to get valid amplitude over data set
    // Amplitude is not used here so larger overlap is OK
    const window_spacing = Math.round(window_size / 16)

    // Only plot the first 0.5s of the step
    const sample_time = 1 / PID.sets.FFT.average_sample_rate
    const step_end_index = Math.min(Math.ceil(0.5 / sample_time), window_size)

    // Create time array
    var time = new Array(step_end_index)
    for (let j=0;j<step_end_index;j++) {
        time[j] = j * sample_time
    }

    // Create noise estimate
    // Size gaussian based on 25 Hz cutoff freq
    const cutfreq = 25
    var len_lpf = PID.sets.FFT.bins.findIndex((x) => x > cutfreq)
    len_lpf += len_lpf - 2 // account for double sided spectrum, DC and Niquist are not copied
    const radius = Math.ceil(len_lpf * 0.5)
    const sigma = len_lpf / 6.0

    // convolution of gaussian and unit step is integral
    var sn = (new Array(real_len)).fill(1.0)
    var last_sn = 0
    for (let j=0;j<len_lpf;j++) {
        sn[j] = last_sn + Math.exp((-0.5/sigma**2) * (j-radius)**2)
        last_sn = sn[j]
    }
    // Normalize to 1
    for (let j=0;j<len_lpf;j++) {
        sn[j] /= last_sn
    }
    // Reflect for full spectrum
    sn = [...sn, ...sn.slice(1,real_len-1).reverse()]

    // Scale
    sn = array_scale(array_offset(array_scale(sn, -1.0), 1+1e-9), 10.0)

    // Pre-calculate inverse
    sn = array_inverse(sn)

    // For each data set
    for (let j = 0; j < num_sets; j++) {
        if (PID.sets[j] == null) {
            continue
        }
        const num_batch = PID.sets[j].length
        const plot_index = j*2

        var Step_mean = (new Array(step_end_index)).fill(0)
        var mean_count = 0
        for (let i=0;i<num_batch;i++) {
            if (PID.sets[j][i].Tar.length < window_size) {
                // Log section is too short, skip
                continue
            }

            // FFT of target and actual
            const FFT_res = run_fft(PID.sets[j][i], ["Tar", "Act"], window_size, window_spacing, windowing_function, fft, true)
            const fft_time = array_offset(array_scale(FFT_res.center, sample_time), PID.sets[j][i].time[0])

            // Find the start and end index
            const start_index = find_start_index(fft_time)
            const end_index = find_end_index(fft_time)+1

            for (let k=start_index;k<end_index;k++) {

                // Skip any window with low input amplitude
                // 20 deg/s threshold
                if (FFT_res.TarMax[k] < 20.0) {
                    continue
                }

                // Step response calculation taken from PID-Analyzer/PIDtoolbox
                // https://github.com/Plasmatree/PID-Analyzer
                // https://github.com/bw1129/PIDtoolbox
                // Some other links that might be useful:
                // https://en.wikipedia.org/wiki/Wiener_filter
                // https://en.wikipedia.org/wiki/Ridge_regression#Relation_to_singular-value_decomposition_and_Wiener_filter
                // Numerical Recipes, Linear Regularization Methods, http://numerical.recipes/
                // Impact force reconstruction using the regularized Wiener filter method, https://www.tandfonline.com/doi/full/10.1080/17415977.2015.1101760

                const X = to_double_sided(FFT_res.Tar[k])
                const Y = to_double_sided(FFT_res.Act[k])

                const Xcon = complex_conj(X)
                const Pyx = complex_mul(Y, Xcon)
                var Pxx = complex_mul(X, Xcon)

                // Add SNR estimate
                Pxx[0] = array_add(Pxx[0], sn)

                const H = complex_div(Pyx, Pxx)

                // Populate transfer function in fft.js interleaved complex format
                to_fft_format(transfer_function, H)

                // Run inverse FFT
                fft.inverseTransform(impulse_response, transfer_function)

                // Integrate impulse to get step response
                var step = new Array(step_end_index)
                step[0] = impulse_response[0]
                for (let l=1;l<step_end_index;l++) {
                    // Just real component
                    step[l] = step[l - 1] + impulse_response[l*2]
                }

                // Add to mean
                mean_count += 1
                Step_mean = array_add(Step_mean, step)

                // add to plot of all
                step_plot.data[plot_index].x.push(...time)
                step_plot.data[plot_index].y.push(...step)

                // Add NaN to remove line back to start
                step_plot.data[plot_index].x.push(NaN)
                step_plot.data[plot_index].y.push(NaN)
            }

            if (mean_count <= 0) {
                // No good steps, skip this set
                continue
            }

            // Plot mean
            step_plot.data[plot_index+1].x = time
            step_plot.data[plot_index+1].y = array_scale(Step_mean, 1 / mean_count)
            step_plot.data[plot_index+1].visible = true

            // Show all estimates by default for single set
            step_plot.data[plot_index].visible = (valid_sets == 1)
        }

    }

    step_plot.layout.yaxis.range = [0, 2]
    step_plot.layout.yaxis.autorange = false

    Plotly.redraw("step_plot")

} 

// Update lines that are shown in FFT plot
function update_hidden(source) {

    function set_all_from_id(id, set_to) {

        var index
        for (let j = 0; j < fft_keys.length; j++) {
            const key = fft_keys[j]
            if (id.endsWith(key)) {
                index = j
                break
            }
        }

        var i = index
        var set = 0
        while (i < fft_plot.data.length) {
            const show_set = document.getElementById("set_selection_" + set).checked
            fft_plot.data[i].visible = set_to && show_set
            i += fft_keys.length
            set += 1
        }

    }

    if (source.constructor.name == "HTMLLegendElement") {
        // Enable/disable multiple
        // Get all child checkboxes
        let checkboxes = source.parentElement.querySelectorAll("input[type=checkbox]")
        var checked = 0
        var enabled = 0
        for (let i=0; i<checkboxes.length; i++) {
            if (checkboxes[i].checked) {
                checked++
            }
            if (checkboxes[i].disabled == false) {
                enabled++
            }
        }
        // Invert the majority
        const check = checked < (enabled * 0.5)
        for (let i=0; i<checkboxes.length; i++) {
            set_all_from_id(checkboxes[i].id, check)
            checkboxes[i].checked = check
        }

    } else if (source.id.startsWith("set_selection_")) {
        const set = parseFloat(source.id.match(/\d+/g))
        const check = source.checked
        for (let j = 0; j < fft_keys.length; j++) {
            const show_key = document.getElementById("PIDX_" + fft_keys[j]).checked
            fft_plot.data[get_FFT_data_index(set, j)].visible = check && show_key
        }

        const set_index = set*2

        // Set mean plot
        step_plot.data[set_index+1].visible = check

        // See how many mean lines are showing and hide plot of all
        let visible_mean = 0
        let visible_set
        let j = 0
        while (j < step_plot.data.length) {
            step_plot.data[j].visible = false
            if (step_plot.data[j+1].visible) {
                visible_mean++
                visible_set = j
            }
            j += 2
        }

        // If only one mean line is shown then show all estimates for the mean
        if (visible_mean == 1) {
            step_plot.data[visible_set].visible = true
        }

        Plotly.redraw("step_plot")


    } else {
        set_all_from_id(source.id, source.checked)
    }

    Plotly.redraw("FFTPlot")

}

// Update flight data range and enable calculate when time range inputs are updated
function time_range_changed() {

    flight_data.layout.xaxis.range = [ parseFloat(document.getElementById("TimeStart").value),
                                       parseFloat(document.getElementById("TimeEnd").value)]
    flight_data.layout.xaxis.autorange = false
    Plotly.redraw("FlightData")

    document.getElementById('calculate').disabled = false
}

function get_PID_param_names(prefix) {
    return { KP:            prefix + "P",
             KI:            prefix + "I",
             KD:            prefix + "D",
             FF:            prefix + "FF",
             I_max:         prefix + "IMAX",
             Target_filter: prefix + "FLTT",
             Error_filter:  prefix + "FLTE",
             D_filter:      prefix + "FLTD",
             Slew_max:      prefix + "SMAX"}
}

// Split use the given time array to return split points in log data
// Split at any change in parameters
// Split at any dropped data
function split_into_batches(PID_log_messages, index, time) {

    let ret = []
    const len = time.length

    // Record start and end time
    PID_log_messages[index].start_time = time[0]
    PID_log_messages[index].end_time = time[len - 1]
    if ((PID_log_messages.start_time == null) || (PID_log_messages[index].start_time < PID_log_messages.start_time)) {
        PID_log_messages.start_time = PID_log_messages[index].start_time
    }
    if ((PID_log_messages.end_time == null) || (PID_log_messages[index].end_time > PID_log_messages.end_time)) {
        PID_log_messages.end_time = PID_log_messages[index].end_time
    }

    let sample_rate_sum = 0
    let sample_rate_count = 0
    let batch_start = 0
    let count = 0
    let param_set = 0
    let set_start = PID_log_messages[index].params.sets[0].start_time
    let set_end = PID_log_messages[index].params.sets[0].end_time
    for (let j = 1; j < len; j++) {
        if (time[j] < set_start) {
            continue
        }
        // Take running average of sample time, split into batches for gaps
        // Use threshold of 5 times the average gap seen so far.
        // This should mean we get a new batch after two missed messages
        count++
        const past_set_end = time[j] > set_end
        if (((time[j] - time[j-1])*count) > ((time[j] - time[batch_start]) * 5) || (j == (len - 1)) || past_set_end) {
            if (count >= 64) {
                // Must have at least 64 samples in each batch
                const sample_rate = 1 / ((time[j-1] - time[batch_start]) / count)
                sample_rate_sum += sample_rate
                sample_rate_count++

                // Add to batch
                ret.push({param_set: param_set, sample_rate: sample_rate, batch_start: batch_start, batch_end: j-1})
            }
            if (past_set_end) {
                // Move on to next set
                param_set++
                set_start = PID_log_messages[index].params.sets[param_set].start_time
                set_end = PID_log_messages[index].params.sets[param_set].end_time
            }

            // Start the next batch from this point
            batch_start = j
            count = 0
        }

    }

    return ret
}

var PID_log_messages = []
async function load(log_file) {

    // Make sure imports are fully loaded before starting
    // This is needed when called from "open in"
    await import_done

    const start = performance.now()

    // Reset buttons and labels
    reset()

    // Reset log object                                  Copter          Plane
    PID_log_messages = [ {id: ["PIDR"],      prefixes: [ "ATC_RAT_RLL_", "RLL_RATE_"]},
                         {id: ["PIDP"],      prefixes: [ "ATC_RAT_PIT_", "PTCH_RATE_"]},
                         {id: ["PIDY"],      prefixes: [ "ATC_RAT_YAW_", "YAW_RATE_"]},
                         {id: ["PIQR"],      prefixes: [                 "Q_A_RAT_RLL_"]},
                         {id: ["PIQP"],      prefixes: [                 "Q_A_RAT_PIT_"]},
                         {id: ["PIQY"],      prefixes: [                 "Q_A_RAT_YAW_"]},
                         {id: ["RATE", "R"], prefixes: [ "ATC_RAT_RLL_", "Q_A_RAT_RLL_"]},
                         {id: ["RATE", "P"], prefixes: [ "ATC_RAT_PIT_", "Q_A_RAT_PIT_"]},
                         {id: ["RATE", "Y"], prefixes: [ "ATC_RAT_YAW_", "Q_A_RAT_YAW_"]} ]

    // Set flags for no data
    PID_log_messages.have_data = false
    for (let i = 0; i < PID_log_messages.length; i++) {
        PID_log_messages[i].have_data = false
    }

    let log = new DataflashParser()
    log.processData(log_file , [])

    open_in_update(log)

    // micro seconds to seconds helpers
    const US2S = 1 / 1000000
    function TimeUS_to_seconds(TimeUS) {
        return array_scale(TimeUS, US2S)
    }

    // Load params, split for any changes
    const PARM = log.get('PARM')
    for (let i = 0; i < PID_log_messages.length; i++) {
        PID_log_messages[i].params = { prefix: null, sets: [] }
        for (const prefix of PID_log_messages[i].prefixes) {

            const names = get_PID_param_names(prefix)

            let param_values = { start_time: 0 }
            for (const name in names) {
                param_values[name] = null
            }

            let found_param = false
            let last_set_end
            for (let j = 0; j < PARM.Name.length; j++) {
                const param_name = PARM.Name[j]
                for (const [name, param_string] of Object.entries(names)) {
                    if (param_name !== param_string) {
                        continue
                    }
                    const time = PARM.TimeUS[j] * US2S
                    const value = PARM.Value[j]
                    found_param = true
                    if (param_values[name] != null  && (param_values[name] != value)) {
                        if ((last_set_end == null) || (time - last_set_end > 1.0)) {
                            // First param change for a second
                            last_set_end = time

                            // Param change store all values to this point as a batch
                            PID_log_messages[i].params.sets.push(Object.assign({}, param_values, {end_time: last_set_end}))

                            // Record start time for new set
                            param_values.start_time = time

                        } else {
                            // Very recent param change, combine with latest set, this leaves gap between sets
                            param_values[name] = value
                            param_values.start_time = time

                        }
                    }
                    param_values[name] = value
                    break
                }
            }
            if (found_param) {
                // Push the final set
                PID_log_messages[i].params.sets.push(Object.assign({}, param_values, {end_time: Infinity}))
                PID_log_messages[i].params.prefix = prefix
                // could lock onto a set of param prefixes per vehicle to speed up the search
                break
            }
        }
    }

    // Load each log msg type
    PID_log_messages.start_time = null
    PID_log_messages.end_time = null
    for (let i = 0; i < PID_log_messages.length; i++) {
        if (PID_log_messages[i].params.prefix == null) {
            // Don't load if we don't have params
            continue
        }
        const id = PID_log_messages[i].id[0]
        if (!(id in log.messageTypes)) {
            // Dont have log message
            continue
        }
        const log_msg = log.get(id)

        const is_RATE_msg = id === "RATE"

        const time = TimeUS_to_seconds(log_msg.TimeUS)

        const batches = split_into_batches(PID_log_messages, i, time)

        if (batches.length > 0) {
            // load from batches
            PID_log_messages[i].sets = []
            for (const batch of batches) {
                if (PID_log_messages[i].sets[batch.param_set] == null) {
                    PID_log_messages[i].sets[batch.param_set] = []
                }
                if (is_RATE_msg) {
                    const axis_prefix = PID_log_messages[i].id[1]
                    // Note that is not quite the same, PID logs report the filtered target value where as RATE gets the raw
                    PID_log_messages[i].sets[batch.param_set].push({ time: time.slice(batch.batch_start, batch.batch_end),
                                                                     sample_rate: batch.sample_rate,
                                                                     Tar: Array.from(log_msg[axis_prefix + "Des"].slice(batch.batch_start, batch.batch_end)),
                                                                     Act: Array.from(log_msg[axis_prefix        ].slice(batch.batch_start, batch.batch_end)),
                                                                     Out: Array.from(log_msg[axis_prefix + "Out"].slice(batch.batch_start, batch.batch_end))})

                } else {
                    // Convert radians to degress
                    const rad2deg = 180.0 / Math.PI
                    PID_log_messages[i].sets[batch.param_set].push({ time: time.slice(batch.batch_start, batch.batch_end),
                                                                     sample_rate: batch.sample_rate,
                                                                     Tar: array_scale(Array.from(log_msg.Tar.slice(batch.batch_start, batch.batch_end)), rad2deg),
                                                                     Act: array_scale(Array.from(log_msg.Act.slice(batch.batch_start, batch.batch_end)), rad2deg),
                                                                     Err: array_scale(Array.from(log_msg.Err.slice(batch.batch_start, batch.batch_end)), rad2deg),
                                                                     P:   Array.from(log_msg.P.slice(batch.batch_start, batch.batch_end)),
                                                                     I:   Array.from(log_msg.I.slice(batch.batch_start, batch.batch_end)),
                                                                     D:   Array.from(log_msg.D.slice(batch.batch_start, batch.batch_end)),
                                                                     FF:  Array.from(log_msg.FF.slice(batch.batch_start, batch.batch_end))})
                }
            }


            // Enable UI elements
            let ele = document.getElementById("type_" + PID_log_messages[i].id.join("_"))
            ele.disabled = false
            if (!PID_log_messages.have_data) {
                // This is the first item to have data, select it
                ele.checked = true
            }

            // Set valid data flags
            PID_log_messages[i].have_data = true
            PID_log_messages.have_data = true
        }
    }

    if (!PID_log_messages.have_data) {
        alert("No PID or RATE log messages found")
        return
    }

    // Plot flight data from log
    if ("ATT" in log.messageTypes) {
        const ATT_time = TimeUS_to_seconds(log.get("ATT", "TimeUS"))
        flight_data.data[0].x = ATT_time
        flight_data.data[0].y = log.get("ATT", "Roll")

        flight_data.data[1].x = ATT_time
        flight_data.data[1].y = log.get("ATT", "Pitch")
    }


    if ("RATE" in log.messageTypes) {
        flight_data.data[2].x = TimeUS_to_seconds(log.get("RATE", "TimeUS"))
        flight_data.data[2].y = log.get("RATE", "AOut")
    }

    if ("POS" in log.messageTypes) {
        flight_data.data[3].x = TimeUS_to_seconds(log.get("POS", "TimeUS"))
        flight_data.data[3].y = log.get("POS", "RelHomeAlt")
    }

    Plotly.redraw("FlightData")

    // Caculate output
    for (var PID of PID_log_messages) {
        if (!PID.have_data) {
            continue
        }
        for (var set of PID.sets) {
            if (set == null) {
                // No data for this set
                continue
            }
            for (var batch of set) {
                if ("Out" in batch) {
                    // Have output directly from log when using RATE msg
                    continue
                }
                const len = batch.P.length
                batch.Out = new Array(len)
                for (let i = 0; i<len; i++) {
                    batch.Out[i] = batch.P[i] + batch.I[i] + batch.D[i] + batch.FF[i]
                }
            }
        }
    }

    // Update ranges of start and end time
    start_time = Math.floor(PID_log_messages.start_time)
    end_time = Math.ceil(PID_log_messages.end_time)

    var start_input = document.getElementById("TimeStart")
    start_input.disabled = false;
    start_input.min = start_time
    start_input.value = start_time
    start_input.max = end_time

    var end_input = document.getElementById("TimeEnd")
    end_input.disabled = false;
    end_input.min = start_time
    end_input.value = end_time
    end_input.max = end_time

    // Calculate FFT
    calculate()

    // Setup the selected axis
    setup_axis()

    const end = performance.now();
    console.log(`Load took: ${end - start} ms`);
}

// Setup the selected axis
function setup_axis() {

    // Show param values
    add_param_sets()

    // Setup FFT data
    setup_FFT_data()

    // Plot
    redraw()
}
