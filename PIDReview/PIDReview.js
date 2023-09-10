// A js tool for plotting ArduPilot PID log data

// Use browser-cjs to load fft lib
// https://github.com/indutny/fft.js
// Much faster than math.fft!
const FFT_lib = require("https://unpkg.com/fft.js@4.0.4/lib/fft.js")

var DataflashParser
import('../JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

// return hanning window array of given length
function hanning(len) {
    let w = new Array(len)
    const scale = (2*Math.PI) / (len - 1)
    for (let i=0; i<len; i++) {
        w[i] = 0.5 - 0.5 * Math.cos(scale * i)
    }
    return w
}

// Calculate correction factors for linear and energy spectrum
// linear: 1 / mean(w)
// energy: 1 / sqrt(mean(w.^2))
function window_correction_factors(w) {
    return {
        linear: 1/math.mean(w),
        energy: 1/Math.sqrt(math.mean(array_mul(w,w)))
    }
}

// Length of real half of fft of len points
function real_length(len) {
    return Math.floor(len / 2) + 1
}

// Frequency bins for given fft length and sample period (real only)
function rfft_freq(len, d) {
    const real_len = real_length(len)
    let freq =  new Array(real_len)
    for (var i=0;i<real_len;i++) {
        freq[i] = i / (len * d)
    }
    return freq
}

function run_fft(batch, window_size, window_spacing, windowing_function, fft) {
    const num_points = batch.x.length
    const real_len = real_length(window_size)
    const num_windows = Math.floor((num_points-window_size)/window_spacing) + 1

    var fft_x = new Array(num_windows)
    var fft_y = new Array(num_windows)
    var fft_z = new Array(num_windows)

    var center_sample = new Array(num_windows)

    // Pre-allocate scale array.
    // double positive spectrum to account for discarded energy in the negative spectrum
    // Note that we don't scale the DC or Nyquist limit
    // normalize all points by the window size
    const end_scale = 1 / window_size
    const mid_scale = 2 / window_size
    var scale = new Array(real_len)
    scale[0] = end_scale
    for (var j=1;j<real_len-1;j++) {
        scale[j] = mid_scale
    }
    scale[real_len-1] = end_scale

    var result = [fft.createComplexArray(), fft.createComplexArray(), fft.createComplexArray()]
    for (var i=0;i<num_windows;i++) {
        // Calculate the start of each window
        const window_start = i * window_spacing
        const window_end = window_start + window_size

        // Take average time for window
        center_sample[i] = window_start + window_size * 0.5

        // Get data and apply windowing function
        let x_windowed = batch.x.slice(window_start, window_end)
        let y_windowed = batch.y.slice(window_start, window_end)
        let z_windowed = batch.z.slice(window_start, window_end)
        for (let j=0;j<window_size;j++) {
            x_windowed[j] *= windowing_function[j]
            y_windowed[j] *= windowing_function[j]
            z_windowed[j] *= windowing_function[j]
        }

        // Run fft
        fft.realTransform(result[0], x_windowed)
        fft.realTransform(result[1], y_windowed)
        fft.realTransform(result[2], z_windowed)

        fft_x[i] = new Array(real_len)
        fft_y[i] = new Array(real_len)
        fft_z[i] = new Array(real_len)

        // Take abs and apply scale
        // fft.js uses interleaved complex numbers, [ real0, imaginary0, real1, imaginary1, ... ]
        for (let j=0;j<real_len;j++) {
            const index = j*2
            fft_x[i][j] = ((result[0][index]**2 + result[0][index+1]**2)**0.5) * scale[j]
            fft_y[i][j] = ((result[1][index]**2 + result[1][index+1]**2)**0.5) * scale[j]
            fft_z[i][j] = ((result[2][index]**2 + result[2][index+1]**2)**0.5) * scale[j]
        }

    }

    return {x:fft_x, y:fft_y, z:fft_z, center:center_sample}
}

function run_batch_fft(data_set) {

    // Window size from user
    const window_size = parseInt(document.getElementById("FFTWindow_size").value)
    if (!Number.isInteger(Math.log2(window_size))) {
        alert('Window size must be a power of two')
        throw new Error();
    }

    // Hard code 50% overlap
    const window_overlap = 0.5
    const window_spacing = Math.round(window_size * (1 - window_overlap))


    // Get windowing function and correction factors for use later when plotting
    const windowing_function = hanning(window_size)
    const window_correction = window_correction_factors(windowing_function)

    // Get bins
    var bins = rfft_freq(window_size, sample_time)

    // FFT library
    const fft = new FFT_lib(window_size);

    for (let j=0; j<2; j++) {

        const num_batch = data_set.length

        // Calculate average sample time
        var sample_rate_sum = 0
        var sample_rate_count = 0
        for (let i=0;i<num_batch;i++) {
            if (data_set[i].x.length < window_size) {
                // Log section is too short, skip
                continue
            }
            sample_rate_count++
            sample_rate_sum += data_set[0].sample_rate
        }
        const sample_time = sample_rate_count / sample_rate_sum

        var x = []
        var y = []
        var z = []

        var time = []

        for (let i=0;i<num_batch;i++) {
            if (data_set[i].x.length < window_size) {
                // Log section is too short, skip
                continue
            }
            var ret = run_fft(data_set[i], window_size, window_spacing, windowing_function, fft)

            time.push(...array_offset(array_scale(ret.center, sample_time), data_set[i].sample_time))
            x.push(...ret.x)
            y.push(...ret.y)
            z.push(...ret.z)

        }
    }

    return { bins: bins, time: time, average_sample_rate: 1/sample_time, window_size: window_size, correction: window_correction, x: x, y: y, z: z}
}

// Get index into FFT data array
var axis = ["X" , "Y", "Z"]
var plot_types = ["Pre-filter", "Post-filter", "Estimated post"]
function get_FFT_data_index(gyro_num, plot_type, axi) {
    return gyro_num*plot_types.length*axis.length + plot_type*axis.length + axi
}

// Attempt to put page back to for a new log
function reset() {

    const types = ["PIDP", "PIDR", "PIDY",
                   "PIQP", "PIQR", "PIQY"]
    for (const type of types) {
        let ele = document.getElementById("type_" + type)
        ele.disabled = true
        ele.checked = false
    }

    // Clear all plot data
    for (let i = 0; i < time_domain.data.length; i++) {
        time_domain.data[i].x = []
        time_domain.data[i].y = []
    }
    for (let i = 0; i < fft_plot.data.length; i++) {
        fft_plot.data[i].x = []
        fft_plot.data[i].y = []
    }
    for (let i = 0; i < Spectrogram.data.length; i++) {
        Spectrogram.data[i].x = []
        Spectrogram.data[i].y = []
    }

    document.getElementById("calculate").disabled = true

}

// Setup plots with no data
var flight_data = {}
var time_domain = {}
var fft_plot = {}
var Spectrogram = {}
var Bode = {}
const max_num_harmonics = 8
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

    // Set axis to match line colors
    var default_colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728']

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
                                            color: default_colors[i] }
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
            range_update([Gyro_batch.start_time, Gyro_batch.end_time])
        }

    })

    // Time domain plot
    const pid_items = ["Target","Actual","Error","P","I","D","FF","Output"]

    time_domain.data = []
    for (const item of pid_items) {
        time_domain.data.push({ mode: "lines",
                                name: item,
                                meta: item,
                                hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f}" })
    }

    time_domain.layout = { legend: {itemclick: false, itemdoubleclick: false }, 
                                margin: { b: 50, l: 50, r: 50, t: 20 },
                                xaxis: { title: {text: time_scale_label } },
                                yaxis: { title: {text: "" } }}

    var plot = document.getElementById("TimePlot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, time_domain.data, time_domain.layout, {displaylogo: false})


    amplitude_scale = get_amplitude_scale()
    frequency_scale = get_frequency_scale()

    // FFT plot setup
    fft_plot.data = []
    for (let i=0;i<3;i++) {
        // For each gyro
        for (let n=0;n<plot_types.length;n++) {
            // Each type of plot
            for (let j=0;j<axis.length;j++) {
                // For each axis
                fft_plot.data[get_FFT_data_index(i, n, j)] = { mode: "lines",
                                                                name: axis[j] + " " + plot_types[n],
                                                                // this extra data allows us to put the name in the hover tool tip
                                                                meta: (i+1) + " " + axis[j] + " " + plot_types[n],
                                                                legendgroup: i,
                                                                legendgrouptitle: { text: "Gyro " + (i+1) } }
            }
        }
    }

    fft_plot.layout = {
        xaxis: {title: {text: frequency_scale.label }, type: "linear", zeroline: false, showline: true, mirror: true},
        yaxis: {title: {text: amplitude_scale.label }, zeroline: false, showline: true, mirror: true },
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    var plot = document.getElementById("FFTPlot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot.data, fft_plot.layout, {displaylogo: false});

    // Spectrogram setup
    // Add surface
    Spectrogram.data = [{
        type:"heatmap",
        colorbar: {title: {side: "right", text: ""}, orientation: "h"},
        transpose: true,
        zsmooth: "best",
        hovertemplate: ""
    }]

    // Add tracking lines
    // Two harmonic notch filters each with upto 8 harmonics
    for (let i=0;i<2;i++) {
        let Group_name = "Notch " + (i+1)
        let dash = (i == 0) ? "solid" : "dot"
        for (let j=0;j<max_num_harmonics;j++) {
            let name = (j == 0) ? "Fundamental" : "Harmonic " + (j+1)
            Spectrogram.data.push({
                type:"scatter",
                mode: "lines",
                line: { width: 4, dash: dash },
                visible: false,
                name: name,
                meta: Group_name + "<br>" + name,
                legendgroup: i,
                legendgrouptitle: { text: "" }
            })
        }
    }

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

    // Link axes ranges
    function link_plot_axis_range(link) {
        for (let i = 0; i<link.length; i++) {
            const this_plot = link[i][0]
            const this_axis_key = link[i][1]
            const this_axis_index = link[i][2]
            const this_index = i
            document.getElementById(this_plot).on('plotly_relayout', function(data) {
                // This is seems not to be recursive because the second call sets with array rather than a object
                const axis_key = this_axis_key + 'axis' + this_axis_index
                const range_keys = [axis_key + '.range[0]', axis_key + '.range[1]']
                if ((data[range_keys[0]] !== undefined) && (data[range_keys[1]] !== undefined)) {
                    var freq_range = [data[range_keys[0]], data[range_keys[1]]]
                    for (let i = 0; i<link.length; i++) {
                        if (i == this_index) {
                            continue
                        }
                        link[i][3].layout[link[i][1] + "axis" + link[i][2]].range = freq_range
                        link[i][3].layout[link[i][1] + "axis" + link[i][2]].autorange = false
                        Plotly.redraw(link[i][0])
                    }
                }
            })
        }
    }

    // Link all frequency axis
    link_plot_axis_range([["FFTPlot", "x", "", fft_plot],
                          ["Spectrogram", "y", "", Spectrogram]])

    // Link all reset calls
    const reset_link = [["FFTPlot", fft_plot],
                        ["Spectrogram", Spectrogram]]

    for (let i = 0; i<reset_link.length; i++) {
        const this_plot = reset_link[i][0]
        const this_index = i
        document.getElementById(this_plot).on('plotly_relayout', function(data) {
            // This is seems not to be recursive because the second call sets with array rather than a object
            const axis = ["xaxis","yaxis","xaxis2","yaxis2"]
            var reset = false
            for (let i = 0; i<axis.length; i++) {
                const key = axis[i] + '.autorange'
                if ((data[key] !== undefined) && (data[key] == true)) {
                    reset = true
                    break
                }
            }
            if (reset) {

                for (let i = 0; i<reset_link.length; i++) {
                    if (i == this_index) {
                        continue
                    }
                    var redraw = false
                    for (let j = 0; j<axis.length; j++) {
                        if (reset_link[i][1].layout[axis[j]] == null) {
                            continue
                        }
                        if (!reset_link[i][1].layout[axis[j]].fixedrange) {
                            reset_link[i][1].layout[axis[j]].autorange = true
                            redraw = true
                        }
                    }
                    if (redraw) {
                        Plotly.redraw(reset_link[i][0])
                    }
                }
            }
        })
    }
}

// Calculate if needed and re-draw, called from calculate button
function re_calc() {

    const start = performance.now()

    calculate()

    load_filters()

    calculate_transfer_function()

    redraw()

    const end = performance.now();
    console.log(`Re-calc took: ${end - start} ms`);
}

// Force full re-calc on next run, on window size change
function clear_calculation() {
    if (Gyro_batch == null) {
        return
    }
    // Enable button to fix
    document.getElementById("calculate").disabled = false

    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        Gyro_batch[i].FFT = null
    }
}

// Re-run all FFT's
function calculate() {
    // Disable button, calculation is now upto date
    document.getElementById("calculate").disabled = true

    let changed = false
    for (let i = 0; i < PID_log_messages.length; i++) {
        if (!PID_log_messages[i].have_data) {
            continue
        }
        if (PID_log_messages[i].FFT == null) {
            PID_log_messages[i].FFT = run_batch_fft(PID_log_messages[i])
            changed = true
        }
    }
    if (!changed) {
        return
    }

    // Set FFT info
    var set_batch_len_msg = false
    for (let i = 0; i < 3; i++) {
        let sample_rate = 0
        let window_size = 0
        let count = 0
        for (let j = 0; j < Gyro_batch.length; j++) {
            if ((Gyro_batch[j] == null) || (Gyro_batch[j].sensor_num != i) || (Gyro_batch[j].FFT == null)) {
                continue
            }
            sample_rate += Gyro_batch[j].FFT.average_sample_rate
            window_size += Gyro_batch[j].FFT.window_size
            count++
        }
        if (count == 0) {
            continue
        }
        sample_rate /= count
        window_size /= count

        document.getElementById("Gyro" + i + "_FFT_infoA").innerHTML = (sample_rate).toFixed(2)
        document.getElementById("Gyro" + i + "_FFT_infoB").innerHTML = (sample_rate/window_size).toFixed(2)

        if (set_batch_len_msg == false) {
            set_batch_len_msg = true
            document.getElementById("FFTWindow_size").value = window_size
        }
    }
}

// Get configured amplitude scale
function get_amplitude_scale() {

    const use_DB = document.getElementById("ScaleLog").checked;
    const use_PSD = document.getElementById("ScalePSD").checked;

    var ret = {}
    if (use_PSD) {
        ret.fun = function (x) { return array_mul(x,x) } // x.^2
        ret.scale = function (x) { return array_scale(array_log10(x), 10.0) } // 10 * log10(x)
        ret.label = "PSD (dB/Hz)"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} dB/Hz" }
        ret.window_correction = function(correction, resolution) { return ((correction.energy**2) * 0.5) / resolution }
        ret.quantization_correction = function(correction) { return 1 / (correction.energy * Math.SQRT1_2) }

    } else if (use_DB) {
        ret.fun = function (x) { return x }
        ret.scale = function (x) { return array_scale(array_log10(x), 20.0) } // 20 * log10(x)
        ret.label = "Amplitude (dB)"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} dB" }
        ret.correction_scale = 1.0
        ret.window_correction = function(correction, resolution) { return correction.linear }
        ret.quantization_correction = function(correction) { return 1 / correction.linear }

    } else {
        ret.fun = function (x) { return x }
        ret.scale = function (x) { return x }
        ret.label = "Amplitude"
        ret.hover = function (axis) { return "%{" + axis + ":.2f}" }
        ret.window_correction = function(correction, resolution) { return correction.linear }
        ret.quantization_correction = function(correction) { return 1 / correction.linear }

    }

    return ret
}

// Get configured frequency scale object
function get_frequency_scale() {

    const use_RPM = document.getElementById("freq_Scale_RPM").checked;

    var ret = {}
    if (use_RPM) {
        ret.fun = function (x) { return array_scale(x, 60.0) }
        ret.label = "RPM"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} RPM" }

    } else {
        ret.fun = function (x) { return x }
        ret.label = "Frequency (Hz)"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} Hz" }
    }

    ret.type = document.getElementById("freq_ScaleLog").checked ? "log" : "linear"

    return ret
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

function get_phase(H) {

    let phase = array_scale(complex_phase(H), 180/Math.PI)
    const len = phase.length

    // Notches result in large positive phase changes, bias the unwrap to do a better job
    const neg_threshold = 45
    const pos_threshold = 360 - neg_threshold

    let unwrapped = new Array(len)

    unwrapped[0] = phase[0]
    for (let i = 1; i < len; i++) {
        let phase_diff = phase[i] - phase[i-1]
        if (phase_diff >= pos_threshold) {
            phase_diff -= 360
        } else if (phase_diff <= -neg_threshold) {
            phase_diff += 360
        }
        unwrapped[i] = unwrapped[i-1] + phase_diff
    }

    return unwrapped
}

function phase_scale(phase) {

    if (!document.getElementById("ScaleWrap").checked) {
        return phase
    }

    // Wrap all arrays based on first
    const arrays = phase.length
    const len = phase[0].length
    for (let i = 1; i < len; i++) {
        if (phase[0][i] > 180) {
            for (let j = 0; j < arrays; j++) {
                phase[j][i] -= 360
            }
        } else if (phase[0][i] < -180) {
            for (let j = 0; j < arrays; j++) {
                phase[j][i] += 360
            }
        }
        if (Math.abs(phase[0][i]) > 180) {
            i--
        }
    }

    return phase
}

var amplitude_scale
var frequency_scale
function redraw() {
    if ((PID_log_messages == null) || !PID_log_messages.have_data) {
        return
    }

    const PID = PID_log_messages[0]

    // Time domain plot
    for (let i = 0; i < time_domain.data.length; i++) {
        time_domain.data[i].x = []
        time_domain.data[i].y = []
    }
    for (const set of PID.sets) {
        for (let i = 0; i < set.length; i++) {
            if (i > 0) {
                // Push NaN to show gap in data
                for (let j = 0; j < time_domain.data.length; j++) {
                    time_domain.data[j].x.push(NaN)
                    time_domain.data[j].y.push(NaN)
                }
            }
            // Same x axis for all
            for (let j = 0; j < time_domain.data.length; j++) {
                time_domain.data[j].x.push(...set[i].time)
            }
            time_domain.data[0].y.push(...set[i].Tar)
            time_domain.data[1].y.push(...set[i].Act)
            time_domain.data[2].y.push(...set[i].Err)
            time_domain.data[3].y.push(...set[i].P)
            time_domain.data[4].y.push(...set[i].I)
            time_domain.data[5].y.push(...set[i].D)
            time_domain.data[6].y.push(...set[i].FF)
        }
    }
    Plotly.redraw("TimePlot")

    return

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

    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null)) {
            continue
        }

        // Find the start and end index
        const start_index = find_start_index(Gyro_batch[i].FFT.time)
        const end_index = find_end_index(Gyro_batch[i].FFT.time)+1

        // Take mean from start to end
        const fft_len = Gyro_batch[i].FFT.x[0].length
        var fft_mean_x = (new Array(fft_len)).fill(0)
        var fft_mean_y = (new Array(fft_len)).fill(0)
        var fft_mean_z = (new Array(fft_len)).fill(0)
        for (let j=start_index;j<end_index;j++) {
            // Add to mean sum
            fft_mean_x = array_add(fft_mean_x, amplitude_scale.fun(Gyro_batch[i].FFT.x[j]))
            fft_mean_y = array_add(fft_mean_y, amplitude_scale.fun(Gyro_batch[i].FFT.y[j]))
            fft_mean_z = array_add(fft_mean_z, amplitude_scale.fun(Gyro_batch[i].FFT.z[j]))
        }

        // Number of windows averaged
        const mean_length = end_index - start_index

        // Windowing amplitude correction depends on spectrum of interest and resolution
        const FFT_resolution = Gyro_batch[i].FFT.average_sample_rate/Gyro_batch[i].FFT.window_size
        const window_correction = amplitude_scale.window_correction(Gyro_batch[i].FFT.correction, FFT_resolution)

        // Apply window correction and divide by lenght to take mean
        const corrected_x = array_scale(fft_mean_x, window_correction / mean_length)
        const corrected_y = array_scale(fft_mean_y, window_correction / mean_length)
        const corrected_z = array_scale(fft_mean_z, window_correction / mean_length)

        // Apply aliasing and selected scale, set to y axis
        fft_plot.data[X_plot_index].y = amplitude_scale.scale(corrected_x)
        fft_plot.data[Y_plot_index].y = amplitude_scale.scale(corrected_y)
        fft_plot.data[Z_plot_index].y = amplitude_scale.scale(corrected_z)

        // Set scaled x data
        const scaled_bins = frequency_scale.fun(Gyro_batch[i].FFT.bins)
        fft_plot.data[X_plot_index].x = scaled_bins
        fft_plot.data[Y_plot_index].x = scaled_bins
        fft_plot.data[Z_plot_index].x = scaled_bins

    }

    Plotly.redraw("FFTPlot")

    redraw_post_estimate_and_bode()

    redraw_Spectrogram()

}

function redraw_post_estimate_and_bode() {
    if (Gyro_batch == null) {
        return
    }

    // Post filter estimate
    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null) || (Gyro_batch[i].FFT.H == null)) {
            continue
        }

        // Windowing amplitude correction depends on spectrum of interest and resolution
        const FFT_resolution = Gyro_batch[i].FFT.average_sample_rate/Gyro_batch[i].FFT.window_size
        const window_correction = amplitude_scale.window_correction(Gyro_batch[i].FFT.correction, FFT_resolution)

        // Scale quantization by the window correction factor so correction can be applyed later
        const quantization_correction = Gyro_batch.quantization_noise * amplitude_scale.quantization_correction(Gyro_batch[i].FFT.correction)

        // Find the start and end index
        const start_index = find_start_index(Gyro_batch[i].FFT.time)
        const end_index = find_end_index(Gyro_batch[i].FFT.time)+1

        // Estimate filtered from pre-filter data
        const fft_len = Gyro_batch[i].FFT.x[0].length
        let fft_mean_x = (new Array(fft_len)).fill(0)
        let fft_mean_y = (new Array(fft_len)).fill(0)
        let fft_mean_z = (new Array(fft_len)).fill(0)
        for (let j=start_index;j<end_index;j++) {
            const attenuation = complex_abs(Gyro_batch[i].FFT.H[j])

            // Subtract noise, apply transfer function, re-apply noise
            // Strictly we need not bother with noise, it makes the estimate less accurate
            // However it does result in a good match to logged post filter data making it easy to verify the estimates
            const filtered_x = array_offset(array_mul(array_offset(Gyro_batch[i].FFT.x[j], -quantization_correction), attenuation), quantization_correction)
            const filtered_y = array_offset(array_mul(array_offset(Gyro_batch[i].FFT.y[j], -quantization_correction), attenuation), quantization_correction)
            const filtered_z = array_offset(array_mul(array_offset(Gyro_batch[i].FFT.z[j], -quantization_correction), attenuation), quantization_correction)

            // Add to mean sum
            fft_mean_x = array_add(fft_mean_x, amplitude_scale.fun(filtered_x))
            fft_mean_y = array_add(fft_mean_y, amplitude_scale.fun(filtered_y))
            fft_mean_z = array_add(fft_mean_z, amplitude_scale.fun(filtered_z))
        }

        // Number of windows averaged
        const mean_length = end_index - start_index

        const corrected_x = array_scale(fft_mean_x, window_correction / mean_length)
        const corrected_y = array_scale(fft_mean_y, window_correction / mean_length)
        const corrected_z = array_scale(fft_mean_z, window_correction / mean_length)

        // Get alias helper to fold down frequencies, if enabled
        let alias = get_alias_obj(Gyro_batch[i].FFT)

        // Get indexs for the lines to be plotted
        X_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, 2, 0)
        Y_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, 2, 1)
        Z_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, 2, 2)

        // Apply aliasing and selected scale, set to y axis
        fft_plot.data[X_plot_index].y = amplitude_scale.scale(alias.apply_amp(corrected_x))
        fft_plot.data[Y_plot_index].y = amplitude_scale.scale(alias.apply_amp(corrected_y))
        fft_plot.data[Z_plot_index].y = amplitude_scale.scale(alias.apply_amp(corrected_z))

        // Set scaled x data
        const scaled_bins = frequency_scale.fun(alias.bins)
        fft_plot.data[X_plot_index].x = scaled_bins
        fft_plot.data[Y_plot_index].x = scaled_bins
        fft_plot.data[Z_plot_index].x = scaled_bins

    }

    Plotly.redraw("FFTPlot")

    // Graph config
    Bode.layout.xaxis.type = frequency_scale.type
    Bode.layout.xaxis2.type = frequency_scale.type
    Bode.layout.xaxis2.title.text = frequency_scale.label

    Bode.layout.yaxis.title.text = amplitude_scale.label

    if (document.getElementById("ScaleWrap").checked) {
        Bode.layout.yaxis2.range = [-180, 180]
        Bode.layout.yaxis2.autorange = false
        Bode.layout.yaxis2.fixedrange = true
    } else {
        Bode.layout.yaxis2.fixedrange = false
        Bode.layout.yaxis2.autorange = true
    }

    const bode_amp_hovertemplate = "<extra></extra>" + frequency_scale.hover("x") + "<br>" + amplitude_scale.hover("y")
    //Bode.data[0].hovertemplate = bode_amp_hovertemplate
    Bode.data[2].hovertemplate = bode_amp_hovertemplate

    const bode_phase_hovertemplate = "<extra></extra>" + frequency_scale.hover("x") + "<br>%{y:.2f} deg"
    //Bode.data[1].hovertemplate = bode_phase_hovertemplate
    Bode.data[3].hovertemplate = bode_phase_hovertemplate

    // Work out which index to plot
    var gyro_instance
    if (document.getElementById("BodeGyroInst0").checked) {
        gyro_instance = 0
    } else if (document.getElementById("BodeGyroInst1").checked) {
        gyro_instance = 1
    } else {
        gyro_instance = 2
    }

    var index
    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null) || (Gyro_batch[i].FFT.bode == null)) {
            continue
        }
        if (Gyro_batch[i].sensor_num == gyro_instance) {
            index = i
        }
    }
    if (index == null) {
        return
    }

    // Find the start and end index
    const start_index = find_start_index(Gyro_batch[index].FFT.time)
    const end_index = find_end_index(Gyro_batch[index].FFT.time)+1

    // Scale factor to get mean from accumulated samples
    const mean_scale = 1 / (end_index - start_index)

    const H_len = Gyro_batch[index].FFT.bode.H[0][0].length
    let Amp_mean = (new Array(H_len)).fill(0)
    let Phase_mean = (new Array(H_len)).fill(0)
    let Amp_max
    let Amp_min
    let Phase_max
    let Phase_min
    for (let j=start_index;j<end_index;j++) {
        const H = Gyro_batch[index].FFT.bode.H[j]
        const HR_att = complex_abs(H)
        const HR_phase = get_phase(H)
        Amp_mean = array_add(Amp_mean, HR_att)
        Phase_mean = array_add(Phase_mean, HR_phase)

        if (j > start_index) {
            Amp_max = array_max(Amp_max, HR_att)
            Amp_min = array_min(Amp_min, HR_att)
            Phase_max = array_max(Phase_max, HR_phase)
            Phase_min = array_min(Phase_min, HR_phase)
        } else {
            Amp_max = HR_att
            Amp_min = HR_att
            Phase_max = HR_phase
            Phase_min = HR_phase
        }
    }

    Amp_mean = array_scale(Amp_mean, mean_scale)
    Phase_mean = array_scale(Phase_mean, mean_scale)

    const scaled_bode_freq = frequency_scale.fun(Gyro_batch[index].FFT.bode.freq)
    Bode.data[2].x = scaled_bode_freq
    Bode.data[3].x = scaled_bode_freq

    const scaled_phase = phase_scale([Phase_mean, Phase_max, Phase_min])
    Bode.data[2].y = amplitude_scale.scale(Amp_mean)
    Bode.data[3].y = scaled_phase[0]

    const area_freq = [...scaled_bode_freq, ...scaled_bode_freq.toReversed()]
    Bode.data[0].x = area_freq
    Bode.data[0].y = amplitude_scale.scale([...Amp_max, ...Amp_min.toReversed()])

    Bode.data[1].x = area_freq
    Bode.data[1].y = [...scaled_phase[1], ...scaled_phase[2].toReversed()]

    Plotly.redraw("Bode")

}

function redraw_Spectrogram() {

    // Work out which index to plot
    var gyro_instance
    if (document.getElementById("SpecGyroInst0").checked) {
        gyro_instance = 0
    } else if (document.getElementById("SpecGyroInst1").checked) {
        gyro_instance = 1
    } else {
        gyro_instance = 2
    }
    const post_filter = document.getElementById("SpecGyroPost").checked
    const estimated = document.getElementById("SpecGyroEstPost").checked

    const batch_instance = find_instance(gyro_instance, post_filter)
    if (batch_instance == null) {
        console.log("Could not find matching dataset")
        return
    }

    var axis
    if (document.getElementById("SpecGyroAxisX").checked) {
        axis = "x"
    } else if (document.getElementById("SpecGyroAxisY").checked) {
        axis = "y"
    } else {
        axis = "z"
    }

    // Setup axes
    Spectrogram.layout.yaxis.type = frequency_scale.type
    Spectrogram.layout.yaxis.title.text = frequency_scale.label
    Spectrogram.layout.xaxis.autorange = false
    Spectrogram.layout.xaxis.range = [ parseFloat(document.getElementById("TimeStart").value),
                                       parseFloat(document.getElementById("TimeEnd").value)]

    Spectrogram.data[0].hovertemplate = "<extra></extra>" + "%{x:.2f} s<br>" + frequency_scale.hover("y") + "<br>" + amplitude_scale.hover("z")
    Spectrogram.data[0].colorbar.title.text = amplitude_scale.label

    // Get alias helper to fold down frequencies, if enabled
    let alias = get_alias_obj(Gyro_batch[batch_instance].FFT) 

    // Setup xy data (x and y swapped because transpose flag is set)
    Spectrogram.data[0].y = frequency_scale.fun(alias.bins)
    Spectrogram.data[0].x = []

    // look for gaps and add null
    const time_len = Gyro_batch[batch_instance].FFT.time.length
    let count = 0
    let last_time = Gyro_batch[batch_instance].FFT.time[0]
    let section_start = Gyro_batch[batch_instance].FFT.time[0]
    let skip_flag = []
    for (let j = 0; j < time_len; j++) {
        count++
        const this_time = Gyro_batch[batch_instance].FFT.time[j]
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

    // Windowing amplitude correction depends on spectrum of interest
    const FFT_resolution = Gyro_batch[batch_instance].FFT.average_sample_rate/Gyro_batch[batch_instance].FFT.window_size
    const window_correction = amplitude_scale.window_correction(Gyro_batch[batch_instance].FFT.correction, FFT_resolution)

    // Setup z data
    const len = Spectrogram.data[0].x.length
    const num_bins = Spectrogram.data[0].y.length
    Spectrogram.data[0].z = new Array(len)
    let index = 0
    for (j = 0; j<len; j++) {
        if (skip_flag[j] == true) {
            // Add null Z values, this results in a blank section in the plot
            Spectrogram.data[0].z[j] = new Array(num_bins)
            continue
        }

        var amplitude = array_scale(Gyro_batch[batch_instance].FFT[axis][index], window_correction)
        if (estimated) {
            const attenuation = complex_abs(Gyro_batch[batch_instance].FFT.H[index])
            amplitude = array_offset(array_mul(array_offset(amplitude, -Gyro_batch.quantization_noise), attenuation), Gyro_batch.quantization_noise)
        }
        Spectrogram.data[0].z[j] = amplitude_scale.scale(amplitude_scale.fun(alias.apply_amp(amplitude)))
        index++
    }

    // Setup tracking lines
    const tracking_hovertemplate = "<extra></extra>%{meta}<br>" +  "%{x:.2f} s<br>" + frequency_scale.hover("y")
    for (let i=0;i<filters.notch.length;i++) {
        // Plus one for the spectrogram plot
        const plot_offset = i * max_num_harmonics + 1

        // Hide all
        for (let j=0;j<max_num_harmonics;j++) {
            Spectrogram.data[plot_offset + j].visible = false
        }

        // Filter not setup
        if (!filters.notch[i].enabled()) {
            continue
        }

        const Group_name = "Notch " + (i+1) + ": " + filters.notch[i].name()
        const fundamental = filters.notch[i].get_target_freq()

        let time
        let freq
        if (!Array.isArray(fundamental.time[0])) {
            // Single peak
            time = fundamental.time
            freq = fundamental.freq

        } else {
            // Tracking multiple peaks
            time = []
            freq = []

            for (let j=0;j<fundamental.time.length;j++) {
                time.push(...fundamental.time[j])
                freq.push(...fundamental.freq[j])

                // Add NAN to remove line from end back to the start
                time.push(NaN)
                freq.push(NaN)
            }

        }

        // Enable each harmonic
        const show_notch = document.getElementById("SpecNotch" + (i+1) + "Show").checked
        for (let j=0;j<max_num_harmonics;j++) {
            if ((filters.notch[i].harmonics() & (1<<j)) == 0) {
                continue
            }
            const harmonic_freq = array_scale(freq, j+1)

            Spectrogram.data[plot_offset + j].visible = show_notch
            Spectrogram.data[plot_offset + j].x = time
            Spectrogram.data[plot_offset + j].y = frequency_scale.fun(harmonic_freq)
            Spectrogram.data[plot_offset + j].hovertemplate = tracking_hovertemplate
            Spectrogram.data[plot_offset + j].legendgrouptitle.text = Group_name
        }

    }

    Plotly.redraw("Spectrogram")
}

// update lines show on spectrogram
function update_hidden_spec(source) {

    const notch_num = parseFloat(source.id.match(/\d+/g)) - 1
    const plot_offset = notch_num * max_num_harmonics + 1

    // Hide all
    for (let j=0;j<max_num_harmonics;j++) {
        Spectrogram.data[plot_offset + j].visible = false
    }

    if (source.checked) {
        // Show those that are enabled
        for (let j=0;j<max_num_harmonics;j++) {
            if ((filters.notch[notch_num].harmonics() & (1<<j)) == 0) {
                continue
            }
            Spectrogram.data[plot_offset + j].visible = true
        }
    }

    Plotly.redraw("Spectrogram")

}

// Update lines that are shown in FFT plot
function update_hidden(source) {

    function get_index_from_id(id) {
        const gyro_instance = parseFloat(id.match(/\d+/g))

        const post_filter = id.includes("Post")
        const post_estimate = id.includes("PostEst")
    
        var pre_post_index = 0
        if (post_estimate) {
            pre_post_index = 2
        } else if (post_filter) {
            pre_post_index = 1
        }
    
        const axi = id.substr(id.length - 1)
    
        let axi_index
        for (let j=0;j<3;j++) {
            if (axis[j] == axi) {
                axi_index = j
                break
            }
        }

        if ((gyro_instance == null) || (axi_index == null)) {
            return
        }

        return get_FFT_data_index(gyro_instance, pre_post_index, axi_index)
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
            if (checkboxes[i].disabled == false) {
                checkboxes[i].checked = check
                fft_plot.data[get_index_from_id(checkboxes[i].id)].visible = check
            }
        }

    } else {
        const index = get_index_from_id(source.id)
        if (index != null) {
            // fft line checkbox
            fft_plot.data[index].visible = source.checked

        }
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
    document.getElementById('calculate_filters').disabled = false
}

var last_window_size
function window_size_inc(event) {
    if (last_window_size == null) {
        last_window_size = parseFloat(event.target.defaultValue)
    }
    const new_value = parseFloat(event.target.value)
    const change = parseFloat(event.target.value) - last_window_size
    if (Math.abs(change) != 1) {
        // Assume a change of one is comming from the up down buttons, ignore angthing else
        last_window_size = new_value
        return
    }
    var new_exponent = Math.log2(last_window_size)
    if (!Number.isInteger(new_exponent)) {
        // Move to power of two in the selected direction
        new_exponent = Math.floor(new_exponent)
        if (change > 0) {
            new_exponent += 1
        }

    } else if (change > 0) {
        // Move up one
        new_exponent += 1

    } else {
        // Move down one
        new_exponent -= 1

    }
    event.target.value = 2**new_exponent
    last_window_size = event.target.value
}

// build url and query string for current params and open filter tool in new window
function open_in_filter_tool() {

    // Assume same base
    let url =  new URL(window.location.href);
    url.pathname = url.pathname.replace('FilterReview','FilterTool')

    // Add all params
    function add_from_tags(url, items) {
        for (let item of items) {
            if (item.id.startsWith("INS_")) {
                url.searchParams.append(item.name, item.value);
            }
        }
    }
    add_from_tags(url, document.getElementsByTagName("input"))
    add_from_tags(url, document.getElementsByTagName("select"))

    // Add sample rate for sensor show in bode plot
    let gyro_instance
    if (document.getElementById("BodeGyroInst0").checked) {
        gyro_instance = 0
    } else if (document.getElementById("BodeGyroInst1").checked) {
        gyro_instance = 1
    } else {
        gyro_instance = 2
    }

    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        if (Gyro_batch[i].sensor_num == gyro_instance) {
            url.searchParams.append("GYRO_SAMPLE_RATE", Math.round(Gyro_batch[i].gyro_rate));
            break
        }
    }

    // Get values for tracking
    const mean_throttle = tracking_methods[1].get_mean()
    if (mean_throttle != undefined) {
        url.searchParams.append("Throttle", mean_throttle);
    }

    const mean_rpm1 = tracking_methods[2].get_mean()
    if (mean_rpm1 != undefined) {
        url.searchParams.append("RPM1", mean_rpm1);
    }

    const mean_esc = tracking_methods[3].get_mean()
    if (mean_esc != undefined) {
        url.searchParams.append("ESC_RPM", mean_esc);
        url.searchParams.append("NUM_MOTORS", tracking_methods[3].get_num_motors());
    }

    // Filter tool does not support FFT tracking (4)

    const mean_rpm2 = tracking_methods[5].get_mean()
    if (mean_rpm2 != undefined) {
        url.searchParams.append("RPM2", mean_rpm2);
    }


    window.open(url.toString());

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

var PID_log_messages = []
function load(log_file) {

    const start = performance.now()

    // Reset buttons and labels
    reset()

    // Reset log object                           Copter          Plane
    PID_log_messages = [ {id: "PIDR", prefixes: [ "ATC_RAT_RLL_", "RLL_RATE_"]},
                         {id: "PIDP", prefixes: [ "ATC_RAT_PIT_", "PTCH_RATE_"]},
                         {id: "PIDY", prefixes: [ "ATC_RAT_YAW_", "YAW_RATE_"]},
                         {id: "PIQR", prefixes: [                 "Q_A_RAT_RLL_"]},
                         {id: "PIQP", prefixes: [                 "Q_A_RAT_PIT_"]},
                         {id: "PIQR", prefixes: [                 "Q_A_RAT_YAW_"]} ]

    // Set flags for no data
    PID_log_messages.have_data = false
    for (let i = 0; i < PID_log_messages.length; i++) {
        PID_log_messages[i].have_data = false
    }

    let log = new DataflashParser()
    log.processData(log_file , ['PARM'])

    // Load params, split for any changes
    for (let i = 0; i < PID_log_messages.length; i++) {
        PID_log_messages[i].params = { prefix: null, sets: [] }
        for (const prefix of PID_log_messages[i].prefixes) {

            const names = get_PID_param_names(prefix)

            let param_values = { time: 0 }
            for (const name in names) {
                param_values[name] = null
            }

            let found_param =- false
            for (let j = 0; j < log.messages.PARM.Name.length; j++) {
                const param_name = log.messages.PARM.Name[j]
                for (const [name, param_string] of Object.entries(names)) {
                    if (param_name !== param_string) {
                        continue
                    }
                    found_param = true
                    if (param_values[name] != null) {
                        // Param change store all values to this point as a batch
                        PID_log_messages[i].params.sets.push(param_values)

                        // Record start time for new set
                        param_values.time = log.messages.PARM.time_boot_ms[j] / 1000
                    }
                    param_values[name] = log.messages.PARM.Value[j]
                    break
                }
            }
            if (found_param) {
                // Push the final set
                PID_log_messages[i].params.sets.push(param_values)
                PID_log_messages[i].params.prefix = prefix
                // could lock onto a set of param prefixes per vehicle to speed up the search
                break
            }
        }
    }

    // Don't need params any more
    delete log.messages.PARM

    // Load each log msg type
    PID_log_messages.start_time = null
    PID_log_messages.end_time = null
    for (let i = 0; i < PID_log_messages.length; i++) {
        const id = PID_log_messages[i].id
        if (!(id in log.messageTypes)) {
            // Dont have log message
            continue
        }
        log.parseAtOffset(id)

        const have_msg = Object.keys(log.messages[id]).length > 0
        if (!have_msg) {
            // Do have log, but nothing in it
            continue
        }

        const time = array_scale(Array.from(log.messages[id].time_boot_ms), 1/1000)
        const len = time.length

        // Record start and end time
        PID_log_messages[i].start_time = time[0]
        PID_log_messages[i].end_time = time[len - 1]
        if ((PID_log_messages.start_time == null) || (PID_log_messages[i].start_time < PID_log_messages.start_time)) {
            PID_log_messages.start_time = PID_log_messages[i].start_time
        }
        if ((PID_log_messages.end_time == null) || (PID_log_messages[i].end_time > PID_log_messages.end_time)) {
            PID_log_messages.end_time = PID_log_messages[i].end_time
        }

        PID_log_messages[i].sets = [[]]

        let sample_rate_sum = 0
        let sample_rate_count = 0
        let batch_start = 0
        let count = 0
        let param_set = 0
        let set_end = (PID_log_messages[i].params.sets.length > 1) ? PID_log_messages[i].params.sets[1].time : null
        let have_data = false
        for (let j = 1; j < len; j++) {
            // Take running average of sample time, split into batches for gaps
            // Use threshold of 5 times the average gap seen so far.
            // This should mean we get a new batch after two missed messages
            count++
            const past_set_end = (set_end != null) && (time[j] > set_end)
            if (((time[j] - time[j-1])*count) > ((time[j] - time[batch_start]) * 5) || (j == (len - 1)) || past_set_end) {
                if (count >= 64) {
                    // Must have at least 64 samples in each batch
                    const sample_rate = 1 / ((time[j-1] - time[batch_start]) / count)
                    sample_rate_sum += sample_rate
                    sample_rate_count++

                    PID_log_messages[i].sets[param_set].push({ time: time.slice(batch_start, j-i),
                                                               sample_rate: sample_rate,
                                                               Tar: Array.from(log.messages[id].Tar.slice(batch_start, j-i)),
                                                               Act: Array.from(log.messages[id].Act.slice(batch_start, j-i)),
                                                               Err: Array.from(log.messages[id].Err.slice(batch_start, j-i)),
                                                               P:   Array.from(log.messages[id].P.slice(batch_start, j-i)),
                                                               I:   Array.from(log.messages[id].I.slice(batch_start, j-i)),
                                                               D:   Array.from(log.messages[id].D.slice(batch_start, j-i)),
                                                               FF:  Array.from(log.messages[id].FF.slice(batch_start, j-i))})

                    have_data = true
                }
                if (past_set_end) {
                    // Move on to next set
                    param_set++
                    set_end = (PID_log_messages[i].params.sets.length < param_set) ? PID_log_messages[i].params.sets[1].time : null
                }

                // Start the next batch from this point
                batch_start = j
                count = 0
            }

        }
        delete log.messages[id]

        if (have_data) {
            document.getElementById("type_" + id).disabled = false
            PID_log_messages[i].have_data = true
            PID_log_messages.have_data = true
        }
    }

    if (!PID_log_messages.have_data) {
        alert("No PID logs found")
        return
    }

    // Plot flight data from log
    log.parseAtOffset("ATT")
    log.parseAtOffset("RATE")
    log.parseAtOffset("POS")

    if (Object.keys(log.messages.ATT).length > 0) {
        const ATT_time = array_scale(Array.from(log.messages.ATT.time_boot_ms), 1 / 1000)
        flight_data.data[0].x = ATT_time
        flight_data.data[0].y = Array.from(log.messages.ATT.Roll)

        flight_data.data[1].x = ATT_time
        flight_data.data[1].y = Array.from(log.messages.ATT.Pitch)
    }

    if (Object.keys(log.messages.RATE).length > 0) {
        flight_data.data[2].x = array_scale(Array.from(log.messages.RATE.time_boot_ms), 1 / 1000)
        flight_data.data[2].y = Array.from(log.messages.RATE.AOut)
    }

    log.parseAtOffset("POS")
    if (Object.keys(log.messages.POS).length > 0) {
        flight_data.data[3].x = array_scale(Array.from(log.messages.POS.time_boot_ms), 1 / 1000)
        flight_data.data[3].y = Array.from(log.messages.POS.RelHomeAlt)
    }

    Plotly.redraw("FlightData")

    // Were now done with the log, delete it to save memory before starting calculations
    delete log.buffer
    delete log.data
    delete log.messages
    log_file = null
    log = null

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
    //calculate()

    // Plot
    redraw()

    const end = performance.now();
    console.log(`Load took: ${end - start} ms`);
}
