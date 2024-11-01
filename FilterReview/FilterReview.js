// A js tool for plotting ArduPilot batch log data

var DataflashParser
const import_done = import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default })

// micro seconds to seconds helpers
const US2S = 1 / 1000000
function TimeUS_to_seconds(TimeUS) {
    return array_scale(TimeUS, US2S)
}

function DigitalBiquadFilter(freq) {
    this.target_freq = freq

    if (this.target_freq <= 0) {
        this.transfer = function(Hn, Hd, sample_freq, Z1, Z2) { }
        return this
    }

    this.transfer = function(Hn, Hd, sample_freq, Z1, Z2) {

        const fr = sample_freq/this.target_freq
        const ohm = Math.tan(Math.PI/fr)
        const c = 1.0+2.0*Math.cos(Math.PI/4.0)*ohm + ohm*ohm

        const b0 = ohm*ohm/c
        const b1 = 2.0*b0
        const b2 = b0
        const a1 = 2.0*(ohm*ohm-1.0)/c
        const a2 = (1.0-2.0*Math.cos(Math.PI/4.0)*ohm+ohm*ohm)/c

        // Build transfer function and apply to H division done at final step
        const len = Z1[0].length
        for (let i = 0; i<len; i++) {
            // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(1 + a1*z^-1 + a2*z^-2)
            const numerator_r = b0 + b1 * Z1[0][i] + b2 * Z2[0][i]
            const numerator_i =      b1 * Z1[1][i] + b2 * Z2[1][i]

            const denominator_r = 1 + a1 * Z1[0][i] + a2 * Z2[0][i]
            const denominator_i =     a1 * Z1[1][i] + a2 * Z2[1][i]

            // This is just two instances of complex multiplication
            // Reimplementing it inline here saves memory and is faster
            const numerator_ac = Hn[0][i] * numerator_r
            const numerator_bd = Hn[1][i] * numerator_i
            const numerator_ad = Hn[0][i] * numerator_i
            const numerator_bc = Hn[1][i] * numerator_r

            Hn[0][i] = numerator_ac - numerator_bd
            Hn[1][i] = numerator_ad + numerator_bc

            const denominator_ac = Hd[0][i] * denominator_r
            const denominator_bd = Hd[1][i] * denominator_i
            const denominator_ad = Hd[0][i] * denominator_i
            const denominator_bc = Hd[1][i] * denominator_r

            Hd[0][i] = denominator_ac - denominator_bd
            Hd[1][i] = denominator_ad + denominator_bc
        }

    }

    return this
}

function NotchFilter(attenuation_dB, bandwidth_hz, harmonic_mul, min_freq_fun, spread_mul) {
    this.A = 10.0**(-attenuation_dB / 40.0)

    this.transfer = function(Hn, Hd, center, sample_freq, Z1, Z2) {
        let center_freq_hz = center * harmonic_mul

        // check center frequency is in the allowable range
        if ((center_freq_hz <= 0.5 * bandwidth_hz) || (center_freq_hz >= 0.5 * sample_freq)) {
            return
        }

        const min_freq = min_freq_fun(harmonic_mul)
        let A = this.A
        if (center_freq_hz < min_freq) {
            const disable_freq = min_freq * 0.25
            if (center_freq_hz < disable_freq) {
                // Disabled
                return
            }

            // Reduce attenuation (A of 1.0 is no attenuation)
            const ratio = (center_freq_hz - disable_freq) / (min_freq - disable_freq)
            A = 1.0 + (A - 1.0) * ratio
        }
        center_freq_hz = Math.max(center_freq_hz, min_freq) * spread_mul

        const octaves = Math.log2(center_freq_hz / (center_freq_hz - bandwidth_hz / 2.0)) * 2.0
        const Q = ((2.0**octaves)**0.5) / ((2.0**octaves) - 1.0)
        const Asq = A**2

        const omega = 2.0 * Math.PI * center_freq_hz / sample_freq
        const alpha = Math.sin(omega) / (2 * Q)
        const b0 =  1.0 + alpha*Asq
        const b1 = -2.0 * Math.cos(omega)
        const b2 =  1.0 - alpha*Asq
        const a0 =  1.0 + alpha
        const a1 = b1
        const a2 =  1.0 - alpha

        // Build transfer function and apply to H division done at final step
        const len = Z1[0].length
        for (let i = 0; i<len; i++) {
            // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(a0 + a1*z^-1 + a2*z^-2)
            const numerator_r = b0 + b1 * Z1[0][i] + b2 * Z2[0][i]
            const numerator_i =      b1 * Z1[1][i] + b2 * Z2[1][i]

            const denominator_r = a0 + a1 * Z1[0][i] + a2 * Z2[0][i]
            const denominator_i =      a1 * Z1[1][i] + a2 * Z2[1][i]

            // This is just two instances of complex multiplication
            // Reimplementing it inline here saves memory and is faster
            const numerator_ac = Hn[0][i] * numerator_r
            const numerator_bd = Hn[1][i] * numerator_i
            const numerator_ad = Hn[0][i] * numerator_i
            const numerator_bc = Hn[1][i] * numerator_r

            Hn[0][i] = numerator_ac - numerator_bd
            Hn[1][i] = numerator_ad + numerator_bc

            const denominator_ac = Hd[0][i] * denominator_r
            const denominator_bd = Hd[1][i] * denominator_i
            const denominator_ad = Hd[0][i] * denominator_i
            const denominator_bc = Hd[1][i] * denominator_r

            Hd[0][i] = denominator_ac - denominator_bd
            Hd[1][i] = denominator_ad + denominator_bc
        }

    }

    return this
}

function MultiNotch(attenuation_dB, bandwidth_hz, harmonic, min_freq_fun, num, center) {

    // Calculate spread required to achieve an equivalent single notch using two notches with Bandwidth/2
    const notch_spread = bandwidth_hz / (32.0 * center)

    const bw_scaled = (bandwidth_hz * harmonic) / num

    this.notches = []
    this.notches.push(new NotchFilter(attenuation_dB, bw_scaled, harmonic, min_freq_fun, 1.0 - notch_spread))
    this.notches.push(new NotchFilter(attenuation_dB, bw_scaled, harmonic, min_freq_fun, 1.0 + notch_spread))
    if (num == 3) {
        this.notches.push(new NotchFilter(attenuation_dB, bw_scaled, harmonic, min_freq_fun, 1.0))
    }

    this.transfer = function(Hn, Hd, center, sample_freq, Z1, Z2) {
        this.notches[0].transfer(Hn, Hd, center, sample_freq, Z1, Z2)
        this.notches[1].transfer(Hn, Hd, center, sample_freq, Z1, Z2)
        if (this.notches.length == 3) {
            this.notches[2].transfer(Hn, Hd, center, sample_freq, Z1, Z2)
        }
    }

    return this
}



function HarmonicNotchFilter(params) {
    this.params = params

    // Find tracking source
    this.tracking = null
    for (let j=0;j<tracking_methods.length;j++) {
        if (this.params.mode == tracking_methods[j].mode_value) {
            this.tracking = tracking_methods[j]
            if ((this.params.enable > 0) && !this.tracking.have_data(this.params)) {
                this.tracking.no_data_error(this.params)
            }
            break
        }
    }

    if (this.tracking == null) {
        alert("Unsupported notch mode " + this.params.mode)
    }

    this.enabled = function() {
        return (this.params.enable > 0) && (this.tracking != null) && this.tracking.have_data(this.params)
    }

    this.static = function() {
        return this.tracking.mode_value == 0
    }

    this.harmonics = function() {
        return this.params.harmonics
    }

    if (!this.enabled()) {
        // Disabled
        this.transfer = function(Hn, Hd, instance, index, sample_freq, Z1, Z2) { }
        return this
    }

    const triple = (this.params.options & 16) != 0
    const double = (this.params.options & 1) != 0
    const single = !double && !triple

    const filter_V1 = get_filter_version() == 1
    const treat_low_freq_as_min = (this.params.options & 32) != 0

    this.get_min_freq = function(harmonic) {
        if (filter_V1) {
            return 0.0
        }
        const min_freq = this.params.freq * this.params.min_ratio
        if (treat_low_freq_as_min) {
            return min_freq * harmonic
        }
        return min_freq
    }

    this.notches = []
    for (var n=0; n<max_num_harmonics; n++) {
        if (this.params.harmonics & (1<<n)) {
            const harmonic = n + 1
            if (single) {
                this.notches.push(new NotchFilter(this.params.attenuation, this.params.bandwidth * harmonic, harmonic, (h) => { return this.get_min_freq(h) }, 1.0))
            } else {
                this.notches.push(new MultiNotch(this.params.attenuation, this.params.bandwidth, harmonic, (h) => { return this.get_min_freq(h) }, double ? 2 : 3, this.params.freq))
            }
        }
    }

    this.transfer = function(Hn, Hd, instance, index, sample_freq, Z1, Z2) {
        // Get target frequencies from target
        const freq = this.tracking.get_interpolated_target_freq(instance, index, this.params)

        if (freq != null) {
            for (let i = 0; i<this.notches.length; i++) {
                // Cycle over each notch
                for (let j=0; j<freq.length; j++) {
                    // Run each notch multiple times for multi frequency motor/esc/fft tracking
                    this.notches[i].transfer(Hn, Hd, freq[j], sample_freq, Z1, Z2)
                }
            }
        }
    }

    this.get_target_freq = function() {
        return this.tracking.get_target_freq(this.params)
    }

    this.name = function() {
        return this.tracking.name
    }

    return this
}

function run_batch_fft(data_set) {
    const num_batch = data_set.length
    const num_points = data_set[0].x.length

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

    // Average sample time
    const sample_time = sample_rate_count / sample_rate_sum


    // Hard code 50% overlap
    const window_overlap = 0.5

    var window_size
    if (Gyro_batch.type == "batch") {
        // Must have at least one window
        const window_per_batch = Math.max(parseInt(document.getElementById("FFTWindow_per_batch").value), 1)

        // Calculate window size for given number of windows and overlap
        window_size = Math.floor(num_points / (1 + (window_per_batch - 1)*(1-window_overlap)))

    } else {
        window_size = parseInt(document.getElementById("FFTWindow_size").value)

    }

    if (!Number.isInteger(Math.log2(window_size))) {
        alert('Window size must be a power of two')
        throw new Error()
    }

    const window_spacing = Math.round(window_size * (1 - window_overlap))
    const windowing_function = hanning(window_size)

    // Get windowing correction factors for use later when plotting
    const window_correction = window_correction_factors(windowing_function)

    // Get bins
    var bins = rfft_freq(window_size, sample_time)

    const fft = new FFTJS(window_size)

    var x = []
    var y = []
    var z = []

    var time = []

    for (let i=0;i<num_batch;i++) {
        if (data_set[i].x.length < window_size) {
            // Log section is too short, skip
            continue
        }
        var ret = run_fft(data_set[i], ["x", "y", "z"], window_size, window_spacing, windowing_function, fft)

        time.push(...array_offset(array_scale(ret.center, sample_time), data_set[i].sample_time))

        for (let j=0; j<ret.x.length; j++) {
            x.push(complex_abs(ret.x[j]))
            y.push(complex_abs(ret.y[j]))
            z.push(complex_abs(ret.z[j]))
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

    document.title = "ArduPilot Filter Review"

    document.getElementById("log_type_raw").checked = true
    document.getElementById("log_type_batch").disabled = false
    document.getElementById("log_type_raw").disabled = false

    document.getElementById("FFTWindow_per_batch").disabled = true
    document.getElementById("FFTWindow_size").disabled = true
    document.getElementById("TimeStart").disabled = true
    document.getElementById("TimeEnd").disabled = true
    document.getElementById("filter_version_1").disabled = true
    document.getElementById("filter_version_1").checked = true
    document.getElementById("filter_version_2").disabled = true
    document.getElementById("calculate").disabled = true
    document.getElementById("calculate_filters").disabled = true
    document.getElementById("OpenFilterTool").disabled = true
    document.getElementById("SaveParams").disabled = true
    document.getElementById("LoadParams").disabled = true

    // Disable all plot selection checkboxes
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < axis.length; j++) {
            const types = ["Pre", "Post", "PostEst"]
            for (let n = 0; n < types.length; n++) {
                let checkbox = document.getElementById("Gyro" + i + types[n] + axis[j])
                checkbox.disabled = true
                checkbox.checked = false
            }
        }
        document.getElementById("SpecGyroInst" + i).disabled = true
        document.getElementById("BodeGyroInst" + i).disabled = true

        let fieldset = document.getElementById("Gyro" + i)
        fieldset.style["border-color"] = "rgb(192, 192, 192)"
        fieldset.firstElementChild.innerHTML = "Gyro " + (i+1)

    }
    document.getElementById("SpecGyroPre").disabled = true
    document.getElementById("SpecGyroPost").disabled = true
    document.getElementById("SpecGyroEstPost").disabled = true
    for (let j = 0; j < axis.length; j++) {
        document.getElementById("SpecGyroAxis" +  axis[j]).disabled = true
    }

    // Clear extra text
    for (let i = 0; i < 3; i++) {
        document.getElementById("Gyro" + i + "_info").innerHTML = ""
        document.getElementById("Gyro" + i + "_FFT_infoA").innerHTML = "-"
        document.getElementById("Gyro" + i + "_FFT_infoB").innerHTML = "-"
    }

    // Disable all params
    parameter_set_disable("INS_GYRO_FILTER", true)
    parameter_set_disable("SCHED_LOOP_RATE", true)
    const notch_params = get_HNotch_param_names()
    for (let i = 0; i < notch_params.length; i++) {
        for (param of Object.values(notch_params[i])) {
            parameter_set_disable(param, true)
        }
    }

    // Clear all plot data
    for (let i = 0; i < fft_plot.data.length; i++) {
        fft_plot.data[i].x = []
        fft_plot.data[i].y = []
    }
    for (let i = 0; i < fft_plot.layout.shapes.length; i++) {
        fft_plot.layout.shapes[i].x0 = NaN
        fft_plot.layout.shapes[i].x1 = NaN
    }
    for (let i = 0; i < Bode.data.length; i++) {
        Bode.data[i].x = []
        Bode.data[i].y = []
    }
    for (let i = 0; i < Spectrogram.data.length; i++) {
        Spectrogram.data[i].x = []
        Spectrogram.data[i].y = []
    }

    // Reset FFT plot notch selection
    for (let i = 0; i < 2; i++) {
        let check = document.getElementById("Notch" + (i+1) + "Show")
        check.disabled = true
        check.checked = false

        check = document.getElementById("SpecNotch" + (i+1) + "Show")
        check.disabled = true
        check.checked = true
    }

    check = document.getElementById("SpecNotchShowLogged")
    check.disabled = true
    check.checked = false

    // Set param defaults that are none 0
    const defaults = [{name: "_FREQ",   value: 80},
                      {name: "_BW",     value: 40},
                      {name: "_ATT",    value: 40},
                      {name: "_HMNCS",  value: 3},
                      {name: "_MODE",   value: 1},
                      {name: "_FM_RAT", value: 1}]

    const HNotch_params = get_HNotch_param_names()
    for (let i = 0; i < HNotch_params.length; i++) {
        for (const param of Object.values(HNotch_params[i])) {
            for (const default_val of defaults) {
                if (param.endsWith(default_val.name)) {
                    parameter_set_value(param, default_val.value)
                }
            }
        }
    }

}

// Setup plots with no data
var Spectrogram = {}
var fft_plot = {}
var Bode = {}
var flight_data = {}
const max_num_harmonics = 16
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
    Plotly.newPlot(plot, flight_data.data, flight_data.layout, {displaylogo: false})

    // Update start and end time based on range
    document.getElementById("FlightData").on('plotly_relayout', function(data) {

        function range_update(range) {
            document.getElementById("TimeStart").value = Math.floor(range[0])
            document.getElementById("TimeEnd").value = Math.ceil(range[1])
            if (Gyro_batch != null) {
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
        shapes: []
    }

    // Add tracking lines
    // Two harmonic notch filters each with upto 8 harmonics
    for (let i=0;i<2;i++) {
        let dash = (i == 0) ? "solid" : "dot"
        for (let j=0;j<max_num_harmonics;j++) {
            // Mean line
            fft_plot.layout.shapes.push({
                type: 'line',
                line: { dash: dash },
                yref: 'paper',
                y0: 0,
                y1: 1,
                visible: false,
            })

            // Range rectangle
            fft_plot.layout.shapes.push({
                type: 'rect',
                line: { width: 0 },
                yref: 'paper',
                y0: 0,
                y1: 1,
                visible: false,
                fillcolor: '#d3d3d3',
                opacity: 0.4
            })
        }
    }

    var plot = document.getElementById("FFTPlot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot.data, fft_plot.layout, {displaylogo: false})

    // Bode plot setup
    Bode.data = []

    Bode.data[0] = { line: {color: "transparent"},
                     fill: "toself", 
                     type: "scatter",
                     showlegend: false,
                     hoverinfo: 'none' }

    Bode.data[1] = { line: {color: "transparent"},
                     fill: "toself",
                     type: "scatter",
                     showlegend: false,
                     xaxis: 'x2',
                     yaxis: 'y2',
                     hoverinfo: 'none' }

    Bode.data[2] = { mode: "lines", showlegend: false }
    Bode.data[3] = { mode: "lines", showlegend: false, xaxis: 'x2', yaxis: 'y2' }

    Bode.layout = {
        xaxis: {type: "linear", zeroline: false, showline: true, mirror: true },
        xaxis2: {title: {text: frequency_scale.label }, type: "linear", zeroline: false, showline: true, mirror: true },
        yaxis: {title: {text: amplitude_scale.label }, zeroline: false, showline: true, mirror: true, domain: [0.52, 1] },
        yaxis2: {title: {text: "Phase (deg)"}, zeroline: false, showline: true, mirror: true, domain: [0.0, 0.48], },
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
        grid: {
            rows: 2,
            columns: 1,
            pattern: 'independent'
        }
    }

    plot = document.getElementById("Bode")
    Plotly.purge(plot)
    Plotly.newPlot(plot, Bode.data, Bode.layout, {displaylogo: false})

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
    // Two harmonic notch filters each with upto 16 harmonics
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

    // Logged notch tacking
    for (let i=0;i<2;i++) {
        let Group_name = "Logged Notch " + (i+1)
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
                legendgroup: i+2,
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
    Plotly.newPlot(plot, Spectrogram.data, Spectrogram.layout, {displaylogo: false})

    // Link all frequency axis
    link_plot_axis_range([["FFTPlot", "x", "", fft_plot],
                          ["Bode", "x", "", Bode],
                          ["Bode", "x", "2", Bode],
                          ["Spectrogram", "y", "", Spectrogram]])

    // Link all reset calls
    link_plot_reset([["FFTPlot", fft_plot],
                     ["Bode", Bode],
                     ["Spectrogram", Spectrogram]])

}

// Calculate if needed and re-draw, called from calculate button
function re_calc() {

    const start = performance.now()

    calculate()

    load_filters()

    calculate_transfer_function()

    redraw()

    const end = performance.now()
    console.log(`Re-calc took: ${end - start} ms`)
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
    let valid_count = 0
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        if (Gyro_batch[i].FFT == null) {
            Gyro_batch[i].FFT = run_batch_fft(Gyro_batch[i])
            changed = true
            valid_count += Gyro_batch[i].FFT.x.length
        }
    }
    if (!changed) {
        return
    }
    if (valid_count == 0) {
        alert("Not enough continuous IMU data available")
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

    // Update filter pre-calc values, speeds up changing the filters
    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null)) {
            continue
        }

        if (!Gyro_batch[i].post_filter) {
            // Calculate Z for transfer function
            // Z = e^jw
            const Z = exp_jw(Gyro_batch[i].FFT.bins, Gyro_batch[i].FFT.average_sample_rate)

            // Z^-1
            Gyro_batch[i].FFT.Z1 = complex_inverse(Z)

            // Z^-2
            Gyro_batch[i].FFT.Z2 = complex_inverse(complex_square(Z))
        }

        if (!Gyro_batch[i].post_filter || !Gyro_batch.have_post) {
            // Also run a higher resolution frequency to give a nicer bode plot
            // Need small steps for the phase unwrap to come out correctly
            const freq_step = 0.05
            const max_freq = Gyro_batch[i].FFT.bins[Gyro_batch[i].FFT.bins.length  - 1]

            Gyro_batch[i].FFT.bode = []
            Gyro_batch[i].FFT.bode.freq = array_from_range(0, max_freq, freq_step)

            // Calculate Z for transfer function
            // Z = e^jw
            const bode_Z = exp_jw(Gyro_batch[i].FFT.bode.freq, Gyro_batch[i].FFT.average_sample_rate)

            // Z^-1
            Gyro_batch[i].FFT.bode.Z1 = complex_inverse(bode_Z)

            // Z^-2
            Gyro_batch[i].FFT.bode.Z2 = complex_inverse(complex_square(bode_Z))


            // Interpolate tracking data to aline with FFT windows
            for (let j=0;j<tracking_methods.length;j++) {
                tracking_methods[j].interpolate(i, Gyro_batch[i].FFT.time)
            }
        }
    }
}

function calculate_transfer_function() {

    function calc(index, time, rate, Z1, Z2) {

        const Z_len = Z1[0].length
        let one = [new Array(Z_len), new Array(Z_len)]
        one[0].fill(1)
        one[1].fill(0)

        let Hn_static = [one[0].slice(), one[1].slice()]
        let Hd_static = [one[0].slice(), one[1].slice()]

        // Low pass does not change frequency in flight
        filters.static.transfer(Hn_static, Hd_static, rate, Z1, Z2)

        // Evaluate any static notch
        for (let k=0; k<filters.notch.length; k++) {
            if (filters.notch[k].enabled() && filters.notch[k].static()) {
                filters.notch[k].transfer(Hn_static, Hd_static, index, null, rate, Z1, Z2)
            }
        }

        // Evaluate dynamic notches at each time step
        const len = time.length
        let ret_H = new Array(len)
        for (let j = 0; j < len; j++) {

            let Hn = [Hn_static[0].slice(), Hn_static[1].slice()]
            let Hd = [Hd_static[0].slice(), Hd_static[1].slice()]

            for (let k=0; k<filters.notch.length; k++) {
                if (filters.notch[k].enabled() && !filters.notch[k].static()) {
                    filters.notch[k].transfer(Hn, Hd, index, j, rate, Z1, Z2)
                }
            }

            ret_H[j] = complex_div(Hn, Hd)
        }

        return ret_H
    }

    // Run to match FFT time and freq for estimating post filter
    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null)) {
            continue
        }
        if (Gyro_batch[i].FFT.Z1 != null) {
            // Calc transfer functions for post filter estimate
            Gyro_batch[i].FFT.H = calc(i, Gyro_batch[i].FFT.time, Gyro_batch[i].FFT.average_sample_rate, Gyro_batch[i].FFT.Z1, Gyro_batch[i].FFT.Z2)

        }
        if (Gyro_batch[i].FFT.bode != null) {
            // Use post filter if available

            // Higher frequency resolution for bode plot
            Gyro_batch[i].FFT.bode.H = calc(i, Gyro_batch[i].FFT.time, Gyro_batch[i].FFT.average_sample_rate, Gyro_batch[i].FFT.bode.Z1, Gyro_batch[i].FFT.bode.Z2)
        }
    }

    // Just updated, disable calc button
    document.getElementById("calculate_filters").disabled = true
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

function get_alias_obj(FFT) {

    let obj = {}
    if (document.getElementById("Aliasing_none").checked) {
        // No aliasing, directly return passed in values
        obj.len = FFT.x[0].length
        obj.bins = FFT.bins
        obj.apply_amp = function(x) { return x }
        return obj
    }

    const nyquist = parseFloat(document.getElementById("SCHED_LOOP_RATE").value) * 0.5

    // Re-sample frequencies to make for easy folding
    // Array from 0 to sample rate, and points to end at exactly sample rate
    // Use smaller steps to maintain amplitude in interpolation
    obj.len = Math.ceil(nyquist / (0.1*(FFT.average_sample_rate/FFT.window_size))) + 1
    const re_sample_dt = (nyquist / (obj.len-1))
    obj.bins = new Array(obj.len)
    for (let i = 0; i<obj.len; i++) {
        obj.bins[i] = i * re_sample_dt
    }

    // Pre-calculate linear interpolation index's and scale factors
    const total_bins = Math.floor(FFT.bins[FFT.bins.length-1]/re_sample_dt)
    let interp = {index: new Array(total_bins), scale: new Array(total_bins)}
    let index = 0
    for (let i = 0; i<total_bins; i++) {
        const bin = i * re_sample_dt
        if (bin > FFT.bins[index+1]) {
            index += 1
        }
        interp.index[i] = index
        interp.scale[i] = (bin - FFT.bins[index]) / (FFT.bins[index+1] - FFT.bins[index])
    }

    // Interpolate to new frequency bins and fold down
    const start = document.getElementById("Aliasing_only").checked ? obj.len : 0
    obj.apply_amp = function (amp) {
        let ret = new Array(obj.len).fill(0)
        const reflect_len = (obj.len-1) * 2
        for (let i = start; i<total_bins; i++) {
            // Interpolate amplitude to new bins
            const pre_amp = amp[interp.index[i]]
            const post_amp = amp[interp.index[i]+1]
            const lerp_amp = pre_amp + (post_amp - pre_amp) * interp.scale[i]

            // fold down
            const index = Math.abs(i - reflect_len * Math.round(i/reflect_len))
            ret[index] += lerp_amp
        }
        return ret
    }

    return obj
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
    if (Gyro_batch == null) {
        return
    }

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
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null) || (Gyro_batch[i].FFT.x.length == 0)) {
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

        // Get alias helper to fold down frequencies, if enabled
        let alias = get_alias_obj(Gyro_batch[i].FFT)

        // Get indexs for the lines to be plotted
        let plot_type = Gyro_batch[i].post_filter ? 1 : 0
        let X_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, plot_type, 0)
        let Y_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, plot_type, 1)
        let Z_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, plot_type, 2)

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

    // Update freq tracking lines

    // Hide all
    for (let i=0;i<fft_plot.layout.shapes.length;i++) {
        fft_plot.layout.shapes[i].visible = false
    }

    for (let i=0;i<filters.notch.length;i++) {
        if (!filters.notch[i].enabled()) {
            continue
        }

        const fundamental = filters.notch[i].get_target_freq()

        function get_mean_and_range(time, freq_array, harmonic, lower_limit) {
            // Find the start and end index
            const start_index = find_start_index(time)
            const end_index = find_end_index(time)+1

            // Take mean and range from start to end
            var mean = 0
            var min = null
            var max = null
            for (let j=start_index;j<end_index;j++) {
                const freq = Math.max(freq_array[j] * harmonic, lower_limit)
                mean += freq
                if ((min == null) || (freq < min)) {
                    min = freq
                }
                if ((max == null) || (freq > max)) {
                    max = freq
                }
            }
            mean /= end_index - start_index

            return { mean: mean, min:min, max:max}
        }

        function get_stats(harmonic, lower_limit) {
            var mean
            var min
            var max
            if (!Array.isArray(fundamental.time[0])) {
                // Single peak
                let mean_range = get_mean_and_range(fundamental.time, fundamental.freq, harmonic, lower_limit)
                mean = mean_range.mean
                min = mean_range.min
                max = mean_range.max

            } else {
                // Combine multiple peaks
                mean = 0
                min = null
                max = null
                for (let j=0;j<fundamental.time.length;j++) {
                    let mean_range = get_mean_and_range(fundamental.time[j], fundamental.freq[j], harmonic, lower_limit)
                    mean += mean_range.mean
                    if ((min == null) || (mean_range.min < min)) {
                        min = mean_range.min
                    }
                    if ((max == null) || (mean_range.max > max)) {
                        max = mean_range.max
                    }
                }
                mean /= fundamental.time.length
            }
            return { mean, min, max }
        }

        const show_notch = document.getElementById("Notch" + (i+1) + "Show").checked
        for (let j=0;j<max_num_harmonics;j++) {
            if ((filters.notch[i].harmonics() & (1<<j)) == 0) {
                continue
            }

            const harmonic = j + 1
            const stats = get_stats(harmonic, filters.notch[i].get_min_freq(harmonic))

            const harmonic_freq = frequency_scale.fun([stats.mean])[0]

            const line_index = (i*max_num_harmonics*2) + j*2
            fft_plot.layout.shapes[line_index].visible = show_notch
            fft_plot.layout.shapes[line_index].x0 = harmonic_freq
            fft_plot.layout.shapes[line_index].x1 = harmonic_freq

            const min_freq = frequency_scale.fun([stats.min])[0]
            const max_freq = frequency_scale.fun([stats.max])[0]

            const range_index = line_index + 1
            fft_plot.layout.shapes[range_index].visible = show_notch
            fft_plot.layout.shapes[range_index].x0 = min_freq
            fft_plot.layout.shapes[range_index].x1 = max_freq
        }
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
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null) || (Gyro_batch[i].FFT.x.length == 0) || (Gyro_batch[i].FFT.H == null)) {
            continue
        }

        // Windowing amplitude correction depends on spectrum of interest and resolution
        const FFT_resolution = Gyro_batch[i].FFT.average_sample_rate/Gyro_batch[i].FFT.window_size
        const window_correction = amplitude_scale.window_correction(Gyro_batch[i].FFT.correction, FFT_resolution)

        // Scale quantization by the window correction factor so correction can be applied later
        const quantization_correction = Gyro_batch.quantization_noise * amplitude_scale.quantization_correction(window_correction)

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

        // Get indexes for the lines to be plotted
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
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null) || (Gyro_batch[i].FFT.x.length == 0) || (Gyro_batch[i].FFT.bode == null)) {
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

// Find the instance of "Gyro_batch" that matches the selection
function find_instance(gyro_instance, post_filter) {
    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null) || (Gyro_batch[i].FFT.x.length == 0)) {
            continue
        }
        if ((Gyro_batch[i].post_filter == post_filter) && (Gyro_batch[i].sensor_num == gyro_instance)) {
            return i
        }
    }
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
            count = 0
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
        const logged_offset = max_num_harmonics * 2

        // Hide all
        for (let j=0;j<max_num_harmonics;j++) {
            Spectrogram.data[plot_offset + j].visible = false
            Spectrogram.data[plot_offset + logged_offset + j].visible = false
        }

        // Filter not setup
        if (!filters.notch[i].enabled()) {
            continue
        }

        function build_plot_array(fundamental) {
            let time
            let freq
            const time_array = Array.isArray(fundamental.time[0])
            if (!Array.isArray(fundamental.freq[0])) {
                // Single peak
                time = fundamental.time
                freq = fundamental.freq

            } else {
                // Tracking multiple peaks
                time = []
                freq = []

                for (let j=0;j<fundamental.freq.length;j++) {
                    time = time.concat(time_array ? fundamental.time[j] : fundamental.time)
                    freq = freq.concat(fundamental.freq[j])

                    // Add NAN to remove line from end back to the start
                    time.push(NaN)
                    freq.push(NaN)
                }

            }
            return { time, freq }
        }

        let Group_name = "Notch " + (i+1) + ": " + filters.notch[i].name()
        let fundamental = filters.notch[i].get_target_freq()
        let plot_data = build_plot_array(fundamental)

        // Enable each harmonic
        const show_notch = document.getElementById("SpecNotch" + (i+1) + "Show").checked
        for (let j=0;j<max_num_harmonics;j++) {
            if ((filters.notch[i].harmonics() & (1<<j)) == 0) {
                continue
            }
            const harmonic = j + 1
            const harmonic_freq = array_scale(plot_data.freq, harmonic)

            const min_freq = filters.notch[i].get_min_freq(harmonic)
            for (let n=0;n<harmonic_freq.length;n++) {
                harmonic_freq[n] = Math.max(harmonic_freq[n], min_freq)
            }

            Spectrogram.data[plot_offset + j].visible = show_notch
            Spectrogram.data[plot_offset + j].x = plot_data.time
            Spectrogram.data[plot_offset + j].y = frequency_scale.fun(harmonic_freq)
            Spectrogram.data[plot_offset + j].hovertemplate = tracking_hovertemplate
            Spectrogram.data[plot_offset + j].legendgrouptitle.text = Group_name
        }

        // Enable logged notch
        if (logged_tracking[i].have_data()) {
            Group_name = "Notch " + (i+1) + ": " + logged_tracking[i].name
            fundamental = logged_tracking[i].get_target_freq()
            plot_data = build_plot_array(fundamental)

            const show_logged = document.getElementById("SpecNotchShowLogged").checked
            const logged_offset = max_num_harmonics * 2
            for (let j=0;j<max_num_harmonics;j++) {
                if ((logged_tracking[i].harmonics & (1<<j)) == 0) {
                    continue
                }
                const harmonic_freq = array_scale(plot_data.freq, j+1)

                Spectrogram.data[plot_offset + logged_offset + j].visible = show_notch && show_logged
                Spectrogram.data[plot_offset + logged_offset + j].x = plot_data.time
                Spectrogram.data[plot_offset + logged_offset + j].y = frequency_scale.fun(harmonic_freq)
                Spectrogram.data[plot_offset + logged_offset + j].hovertemplate = tracking_hovertemplate
                Spectrogram.data[plot_offset + logged_offset + j].legendgrouptitle.text = Group_name
            }
        }

    }

    Plotly.redraw("Spectrogram")
}

// update lines show on spectrogram
function update_hidden_spec(source) {

    const notch_num = parseFloat(source.id.match(/\d+/g)) - 1

    // Offset by the total number of lines over
    const show_logged = document.getElementById("SpecNotchShowLogged").checked
    const logged_offset = max_num_harmonics * 2

    const plot_offset = notch_num * max_num_harmonics + 1

    // Hide all
    for (let j=0;j<max_num_harmonics;j++) {
        Spectrogram.data[plot_offset + j].visible = false
        Spectrogram.data[plot_offset + logged_offset + j].visible = false
    }

    if (source.checked) {
        // Show those that are enabled
        for (let j=0;j<max_num_harmonics;j++) {
            if ((filters.notch[notch_num].harmonics() & (1<<j)) != 0) {
                Spectrogram.data[plot_offset + j].visible = true
            }
            if (show_logged && (logged_tracking[notch_num].harmonics & (1<<j)) != 0) {
                Spectrogram.data[plot_offset + logged_offset + j].visible = true
            }
        }
    }

    Plotly.redraw("Spectrogram")

}

// update lines show on spectrogram
function update_logged_notch_hidden_spec(source) {

    // Offset by the total number of lines over
    const show_logged = source.checked
    const logged_offset = max_num_harmonics * 2

    for (let i=0;i<filters.notch.length;i++) {
        const plot_offset = i * max_num_harmonics + 1

        // Hide all
        for (let j=0;j<max_num_harmonics;j++) {
            Spectrogram.data[plot_offset + j].visible = false
            Spectrogram.data[plot_offset + logged_offset + j].visible = false
        }

        const show_notch = document.getElementById("SpecNotch" + (i+1) + "Show").checked
        if (show_notch) {
            // Show those that are enabled
            for (let j=0;j<max_num_harmonics;j++) {
                if ((filters.notch[i].harmonics() & (1<<j)) != 0) {
                    Spectrogram.data[plot_offset + j].visible = true
                }
                if (show_logged && (logged_tracking[i].harmonics & (1<<j)) != 0) {
                    Spectrogram.data[plot_offset + logged_offset + j].visible = true
                }
            }
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

        } else {
            // fft notch tracking
            const notch_num = parseFloat(source.id.match(/\d+/g)) - 1

            // Hide all
            for (let j=0;j<max_num_harmonics;j++) {
                const line_index = (notch_num*max_num_harmonics*2) + j*2
                const range_index = line_index + 1
                fft_plot.layout.shapes[line_index].visible = false
                fft_plot.layout.shapes[range_index].visible = false
            }

            if (source.checked) {
                // Show those that are enabled
                for (let j=0;j<max_num_harmonics;j++) {
                    if ((filters.notch[notch_num].harmonics() & (1<<j)) == 0) {
                        continue
                    }
                    const line_index = (notch_num*max_num_harmonics*2) + j*2
                    const range_index = line_index + 1
                    fft_plot.layout.shapes[line_index].visible = true
                    fft_plot.layout.shapes[range_index].visible = true
                }
            }
        }

    }

    Plotly.redraw("FFTPlot")

}

function get_HNotch_param_names() {
    let prefix = ["INS_HNTCH_", "INS_HNTC2_"]
    let ret = []
    for (let i = 0; i < prefix.length; i++) {
        ret[i] = {enable: prefix[i] + "ENABLE",
                  mode: prefix[i] + "MODE",
                  freq: prefix[i] + "FREQ",
                  bandwidth: prefix[i] + "BW",
                  attenuation: prefix[i] + "ATT",
                  ref: prefix[i] + "REF",
                  min_ratio: prefix[i] + "FM_RAT",
                  harmonics: prefix[i] + "HMNCS",
                  options: prefix[i] + "OPTS"}
    }
    return ret
}

function load_filters() {

    update_filter_version()

    filters = []
    const HNotch_params = get_HNotch_param_names()

    // Load static
    filters.static = new DigitalBiquadFilter(parseFloat(document.getElementById("INS_GYRO_FILTER").value))

    // Load harmonic notches
    filters.notch = []
    for (let i = 0; i < HNotch_params.length; i++) {
        params = []
        for (const [key, value] of Object.entries(HNotch_params[i])) {
            params[key] = parameter_get_value(value)
        }
        filters.notch.push(new HarmonicNotchFilter(params))

        document.getElementById("Notch" + (i+1) + "Show").disabled = !filters.notch[i].enabled()
        document.getElementById("SpecNotch" + (i+1) + "Show").disabled = !filters.notch[i].enabled()
    }
}

// Update filter params extra info
function filter_param_read() {
    const HNotch_params = get_HNotch_param_names()

    for (let i = 0; i < HNotch_params.length; i++) {
        // Enable all params in group if enable is set
        const enable_input = parseFloat(document.getElementById(HNotch_params[i].enable).value) > 0
        for (const [key, value] of Object.entries(HNotch_params[i])) {
            if (key != "enable") {
                parameter_set_disable(value, !enable_input)
            }
        }
    }

    document.getElementById('calculate_filters').disabled = false

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

// build url and query string for current params and open filter tool in new window
function open_in_filter_tool() {

    // Assume same base
    let url =  new URL(window.location.href)
    url.pathname = url.pathname.replace('FilterReview','FilterTool')

    // Add all params
    function add_from_tags(url, items) {
        for (let item of items) {
            if (item.id.startsWith("INS_")) {
                url.searchParams.append(item.name, item.value)
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
            url.searchParams.append("GYRO_SAMPLE_RATE", Math.round(Gyro_batch[i].gyro_rate))
            break
        }
    }

    // Get values for tracking
    const mean_throttle = tracking_methods[1].get_mean()
    if (mean_throttle != undefined) {
        url.searchParams.append("Throttle", mean_throttle)
    }

    const mean_rpm1 = tracking_methods[2].get_mean()
    if (mean_rpm1 != undefined) {
        url.searchParams.append("RPM1", mean_rpm1)
    }

    const mean_esc = tracking_methods[3].get_mean()
    if (mean_esc != undefined) {
        url.searchParams.append("ESC_RPM", mean_esc)
        url.searchParams.append("NUM_MOTORS", tracking_methods[3].get_num_motors())
    }

    // Filter tool does not support FFT tracking (4)

    const mean_rpm2 = tracking_methods[5].get_mean()
    if (mean_rpm2 != undefined) {
        url.searchParams.append("RPM2", mean_rpm2)
    }


    window.open(url.toString())

}

function save_parameters() {

    function save_from_elements(inputs) {
        var params = ""
        for (const v in inputs) {
            var name = "" + inputs[v].id
            if (name.startsWith("INS_")) {
                var value = inputs[v].value
                params += name + "," + param_to_string(value) + "\n"
            }
        }
        return params
    }

    var params = save_from_elements(document.getElementsByTagName("input"))
    params += save_from_elements(document.getElementsByTagName("select"))

    var blob = new Blob([params], { type: "text/plain;charset=utf-8" })
    saveAs(blob, "filter.param")
}

async function load_parameters(file) {
    var text = await file.text()
    var lines = text.split('\n')
    for (i in lines) {
        var line = lines[i]
        v = line.split(/[\s,=\t]+/)
        if (v.length >= 2) {
            var vname = v[0]
            var value = v[1]
            if (parameter_set_value(vname, value)) {
                console.log("set " + vname + "=" + value)
            }
        }
    }

    filter_param_read()
    re_calc()
}

// Get selected filter version
let filter_version
function get_filter_version() {
    return filter_version
}

// Update the filter vesion from user buttons
function update_filter_version() {
    const versions = [1, 2]
    for (const version of versions) {
        const version_radio_button = document.getElementById("filter_version_" + version)
        if (version_radio_button.checked) {
            filter_version = version
            return
        }
    }
}

// Load from batch logging messages
function load_from_batch(log, num_gyro, gyro_rate, get_param) {
    Gyro_batch = []
    Gyro_batch.type = "batch"

    // white noise noise model
    // https://en.wikipedia.org/wiki/Quantization_(signal_processing)#Quantization_noise_model
    // See also Analog Devices:
    // "Taking the Mystery out of the Infamous Formula, "SNR = 6.02N + 1.76dB," and Why You Should Care"
    // The 16 here is the number of bits in the batch log
    Gyro_batch.quantization_noise = 1 / (Math.sqrt(3) * 2**(16-0.5))

    // Assign batches to each sensor
    // Only interested in gyro here
    const IMU_SENSOR_TYPE_GYRO = 1
    let data_index = 0
    let max_instance = 0

    const ISBH = log.get("ISBH")
    const ISBD = log.get("ISBD")

    for (let i = 0; i < ISBH.N.length; i++) {
        // Parse headers
        if (ISBH.type[i] != IMU_SENSOR_TYPE_GYRO) {
            continue
        }

        const instance = ISBH.instance[i]
        if (Gyro_batch[instance] == null) {
            Gyro_batch[instance] = []
            max_instance = Math.max(max_instance, instance)
        }

        let decode_complete = false

        // Advance data index until sequence match
        const seq_num = ISBH.N[i]
        while (ISBD.N[data_index] != seq_num) {
            data_index++
            if (data_index >= ISBD.N.length) {
                // This is expected at the end of a log, no more msgs to add, break here
                console.log("Could not find next sequence " + i + " of " + ISBH.N.length-1)
                decode_complete = true
                break
            }
        }
        if (decode_complete) {
            break
        }

        let x = []
        let y = []
        let z = []
        const num_samples = ISBH.smp_cnt[i]
        const num_data_msg = num_samples / 32
        for (let j = 0; j < num_data_msg; j++) {
            // Read in expected number of samples
            if ((ISBD.N[data_index] != seq_num) || (ISBD.seqno[data_index] != j)) {
                console.log("Missing or extra data msg")
                return
            }

            // Accumulate data for this batch
            x.push(...ISBD.x[data_index])
            y.push(...ISBD.y[data_index])
            z.push(...ISBD.z[data_index])

            data_index++
            if (data_index >= ISBD.N.length) {
                console.log("Sequence incomplete " + i + " of " + (ISBH.N.length-1) + ", Got " + (j+1) + " batches out of " + num_data_msg)
                decode_complete = true
                break
            }
        }
        if (decode_complete) {
            break
        }

        if ((x.length != num_samples) || (y.length != num_samples) || (z.length != num_samples)) {
            console.log("sample length wrong")
            return
        }

        // Remove logging scale factor
        const mul = 1 / ISBH.mul[i]
        x = array_scale(x, mul)
        y = array_scale(y, mul)
        z = array_scale(z, mul)

        // Add to batches for this instance
        Gyro_batch[instance].push({ sample_time: ISBH.SampleUS[i] * US2S,
                                    sample_rate: ISBH.smp_rate[i],
                                    x: x,
                                    y: y,
                                    z: z })
    }

    // Work out if logging is pre/post from param value
    const INS_LOG_BAT_OPT = get_param("INS_LOG_BAT_OPT", false)
    const _doing_sensor_rate_logging = (INS_LOG_BAT_OPT & (1 << 0)) != 0
    const _doing_post_filter_logging = (INS_LOG_BAT_OPT & (1 << 1)) != 0
    const _doing_pre_post_filter_logging = (INS_LOG_BAT_OPT & (1 << 2)) != 0
    let use_instance_offset = _doing_pre_post_filter_logging || (_doing_post_filter_logging && _doing_sensor_rate_logging)

    if (!use_instance_offset && (max_instance >= num_gyro)) {
        alert("Got pre-post instances without INS_LOG_BAT_OPT set, assuming pre-post")
        use_instance_offset = true
    }

    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        if (use_instance_offset && (i >= num_gyro)) {
            Gyro_batch[i].sensor_num = i - num_gyro
            Gyro_batch[i].post_filter = true
        } else {
            Gyro_batch[i].sensor_num = i
            Gyro_batch[i].post_filter = _doing_post_filter_logging && !_doing_pre_post_filter_logging
        }

        // Only support 3 IMUs for now
        if (Gyro_batch[i].sensor_num >= 3) {
            Gyro_batch[i] = null
        }
    }

    // Assume sample rate is always higher than logging rate
    var max_logging_rate = []
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        for (let j = 0; j < Gyro_batch[i].length; j++) {
            if ((max_logging_rate[Gyro_batch[i].sensor_num] == null) || (Gyro_batch[i][j].sample_rate > max_logging_rate[Gyro_batch[i].sensor_num])) {
                max_logging_rate[Gyro_batch[i].sensor_num] = Gyro_batch[i][j].sample_rate
            }
        }
    }
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        Gyro_batch[i].gyro_rate = max_logging_rate[Gyro_batch[i].sensor_num]
        if (gyro_rate[Gyro_batch[i].sensor_num] != null) {
            // Make sure rate is at least the reported sampling rate
            Gyro_batch[i].gyro_rate = Math.max(gyro_rate[Gyro_batch[i].sensor_num], Gyro_batch[i].gyro_rate)
        }
    }

    // Grab full time range of batches
    var start_time
    var end_time
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }

        const batch_start = Gyro_batch[i][0].sample_time
        if ((start_time == null) || (batch_start < start_time)) {
            start_time = batch_start
        }

        const batch_end = Gyro_batch[i][Gyro_batch[i].length - 1].sample_time
        if ((end_time == null) || (batch_end > end_time)) {
            end_time = batch_end
        }
    }
    if ((start_time != null) && (end_time != null)) {
        Gyro_batch.start_time = start_time
        Gyro_batch.end_time = end_time
    }
}

// Log from raw sensor logging
function load_from_raw_log(log, num_gyro, gyro_rate, get_param) {
    Gyro_batch = []
    Gyro_batch.type = "raw"

    // Quatisation noise for 32 bit float is the same as a 24 bit integer, this is the length of the mantissa.
    // However that noise is relative to the signal level.
    // Because we don't know the signal level we can't estimate the noise.
    // Could run over the whole data and take the max or similar, but for now we just assume 0 noise.
    Gyro_batch.quantization_noise = 0.0

    // Work out if logging is pre/post from param value
    const INS_RAW_LOG_OPT = get_param("INS_RAW_LOG_OPT", false)
    let post_filter = (INS_RAW_LOG_OPT != null) && ((INS_RAW_LOG_OPT & (1 << 2)) != 0)
    const pre_post_filter = (INS_RAW_LOG_OPT != null) && ((INS_RAW_LOG_OPT & (1 << 3)) != 0)
    if (post_filter && pre_post_filter) {
        alert("Both post and pre+post logging option selected")
        post_filter = false
    }

    // Load in a one massive batch, split for large gaps in log
    for (const inst of Object.keys(log.messageTypes.GYR.instances)) {
        const i = parseFloat(inst)

        Gyro_batch[i] = []

        if (pre_post_filter && (i >= num_gyro)) {
            Gyro_batch[i].sensor_num = i - num_gyro
            Gyro_batch[i].post_filter = true
        } else {
            Gyro_batch[i].sensor_num = i
            Gyro_batch[i].post_filter = post_filter
        }

        // Only support 3 IMUs for now
        if (Gyro_batch[i].sensor_num >= 3) {
            Gyro_batch[i] = null
            continue
        }

        const time = log.get_instance("GYR", inst, "SampleUS")
        const GyrX = log.get_instance("GYR", inst, "GyrX")
        const GyrY = log.get_instance("GYR", inst, "GyrY")
        const GyrZ = log.get_instance("GYR", inst, "GyrZ")

        let sample_rate_sum = 0
        let sample_rate_count = 0
        let batch_start = 0
        let count = 0
        const len = time.length
        for (let j = 1; j < len; j++) {
            // Take running average of sample time, split into batches for gaps
            // Use threshold of 5 times the avarage gap seen so far.
            // This should mean we get a new batch after two missed meassages
            count++
            if (((time[j] - time[j-1])*count) > ((time[j] - time[batch_start]) * 5) || (j == (len - 1))) {
                if (count >= 64) {
                    // Must have at least 64 samples in each batch
                    const sample_rate = 1000000 / ((time[j-1] - time[batch_start]) / count)
                    sample_rate_sum += sample_rate
                    sample_rate_count++

                    Gyro_batch[i].push({ sample_time: time[batch_start] * US2S,
                                        sample_rate: sample_rate,
                                        x: GyrX.slice(batch_start, j-i),
                                        y: GyrY.slice(batch_start, j-i),
                                        z: GyrZ.slice(batch_start, j-i) })
                }

                // Start the next batch from this point
                batch_start = j
                count = 0
            }

        }

        if (Gyro_batch[i].length == 0) {
            // No valid batches, remove
            delete Gyro_batch[i]
            continue
        }

        // Assume a constant sample rate for the FFT
        const sample_rate = sample_rate_sum / sample_rate_count
        Gyro_batch[i].gyro_rate = sample_rate
        if (gyro_rate[i] != null) {
            // Make sure rate is at least the reported sampling rate
            Gyro_batch[i].gyro_rate = Math.max(gyro_rate[i], Gyro_batch[i].gyro_rate)
        }

    }

    var start_time
    var end_time
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        const batch_start = Gyro_batch[i][0].sample_time
        if ((start_time == null) || (batch_start < start_time)) {
            start_time = batch_start
        }

        const last_batch = Gyro_batch[i].length - 1
        const batch_end = Gyro_batch[i][last_batch].sample_time + (Gyro_batch[i][last_batch].x.length / Gyro_batch[i][last_batch].sample_rate)
        if ((end_time == null) || (batch_end > end_time)) {
            end_time = batch_end
        }
    }
    if ((start_time != null) && (end_time != null)) {
        Gyro_batch.start_time = start_time
        Gyro_batch.end_time = end_time
    }
}

var Gyro_batch
var tracking_methods
var logged_tracking
var filters
async function load(log_file) {

    // Make sure imports are fully loaded before starting
    // This is needed when called from "open in"
    await import_done

    const start = performance.now()

    // Reset buttons and labels
    reset()

    let log = new DataflashParser()
    log.processData(log_file, [])

    open_in_update(log)

    if (!("PARM" in log.messageTypes)) {
        alert("No params in log")
        return
    }
    const PARM = log.get("PARM")
    function get_param(name, allow_change) {
        return get_param_value(PARM, name, allow_change)
    }

    // Try and decode device IDs and rate
    var num_gyro = 0
    var gyro_rate = []
    for (let i = 0; i < 3; i++) {
        const ID_param = i == 0 ? "INS_GYR_ID" : "INS_GYR" + (i + 1) + "_ID"
        const ID = get_param(ID_param)
        if ((ID != null) && (ID > 0)) {
            const decoded = decode_devid(ID, DEVICE_TYPE_IMU)

            if (("IMU" in log.messageTypes) && ("instances" in log.messageTypes.IMU) && (i in log.messageTypes.IMU.instances)) {
                // Assume constant rate, this is not actually true, but variable rate breaks FFT averaging.
                gyro_rate[i] = array_mean(log.get_instance("IMU", i, "GHz"))
            }

            if (decoded != null) {
                const rate = (gyro_rate[i] == null) ? "?" : Math.round(gyro_rate[i])
                document.getElementById("Gyro" + i + "_info").innerHTML = decoded.name + " via " + decoded.bus_type + " at " + rate + " Hz"
            }
            num_gyro++
        }
    }

    // Check for some data that we can use
    const have_batch_log = ("ISBH" in log.messageTypes) && ("ISBD" in log.messageTypes)
    const have_raw_log = ("GYR" in log.messageTypes)

    if (!have_batch_log && !have_raw_log) {
        alert("No batch data or raw IMU found in log")
        return
    }

    // Update interface and work out which log type to use
    var use_batch
    if (have_batch_log && !have_raw_log) {
        // Only have batch log
        document.getElementById("log_type_batch").checked = true
        use_batch = true

    } else if (have_raw_log && !have_batch_log) {
        // Only have raw log
        document.getElementById("log_type_raw").checked = true
        use_batch = false

    } else {
        // Have both, use selected
        use_batch = document.getElementById("log_type_batch").checked
    }

    // Cannot change log type after the log has been loaded, disable both buttons
    document.getElementById("log_type_batch").disabled = true
    document.getElementById("log_type_raw").disabled = true

    document.getElementById("FFTWindow_size").disabled = use_batch
    document.getElementById("FFTWindow_per_batch").disabled = !use_batch


    if (use_batch) {
        load_from_batch(log, num_gyro, gyro_rate, get_param)

    } else {
        load_from_raw_log(log, num_gyro, gyro_rate, get_param)

    }

    // Populate filter version
    if (('VER' in log.messageTypes) && log.messageTypes.VER.expressions.includes("FV")) {
        // Version should be constant for whole log
        const version = log.get("VER", "FV")[0]
        const version_radio_button = document.getElementById("filter_version_" + version)
        if (version_radio_button != null) {
            version_radio_button.checked = true
        }
    }
    document.getElementById("filter_version_1").disabled = false
    document.getElementById("filter_version_2").disabled = false

    // Load potential sources of notch tracking targets
    tracking_methods = [new StaticTarget(),
                        new ThrottleTarget(log),
                        new RPMTarget(log, 1, 2),
                        new ESCTarget(log),
                        new FFTTarget(log),
                        new RPMTarget(log, 2, 5)]

    // Load logged notch fequencies for comparison
    logged_tracking = [ new LoggedNotch(log, 0),
                        new LoggedNotch(log, 1) ]

    // If log data is present allow user to show it
    let show_logged_notch = false
    for (let i = 0; i < logged_tracking.length; i++) {
        if (logged_tracking[i].have_data()) {
            show_logged_notch = true
        }
    }
    document.getElementById("SpecNotchShowLogged").disabled = !show_logged_notch

    // Use presence of raw log options param to work out if 8 or 16 harmonics are avalable
    const have_16_harmonics = get_param("INS_RAW_LOG_OPT") != null

    // Read from log into HTML box
    const HNotch_params = get_HNotch_param_names()
    for (let i = 0; i < HNotch_params.length; i++) {
        for (const param of Object.values(HNotch_params[i])) {
            // Set harmonic bitmask size
            if (param.endsWith("HMNCS")) {
                // Although only 16 harmonic are supported the underlying param type was changed to 32bit
                set_bitmask_size(param, have_16_harmonics ? 32 : 8)
            }
            const value = get_param(param)
            if (value != null) {
                parameter_set_value(param, value)
            }
        }
    }

    const other_params = ["INS_GYRO_FILTER", "SCHED_LOOP_RATE"]
    for (const param of other_params) {
        const value = get_param(param)
        if (value != null) {
            parameter_set_value(param, value)
        }
    }

    // Plot flight data from log
    if ("ATT" in log.messageTypes) {
        const ATT_time = TimeUS_to_seconds(log.get("ATT", "TimeUS"))
        flight_data.data[0].x = ATT_time
        flight_data.data[0].y = log.get("ATT", "Roll")

        flight_data.data[1].x = ATT_time
        flight_data.data[1].y = log.get("ATT", "Pitch")
    }

    let first_throttle_time
    let last_throttle_time
    if ("RATE" in log.messageTypes) {
        // Get values
        const RATE_time = TimeUS_to_seconds(log.get("RATE", "TimeUS"))
        const throttle = log.get("RATE", "AOut")

        // Plot
        flight_data.data[2].x = RATE_time
        flight_data.data[2].y = throttle

        // Find first and last throttle for auto-zoom of plot
        function positive_throttle(x) {
            return x > 0.0
        }
        const first_index = throttle.findIndex(positive_throttle)
        const last_index = throttle.findLastIndex(positive_throttle)
        if (first_index) {
            first_throttle_time = RATE_time[first_index]
        }
        if (last_index) {
            last_throttle_time = RATE_time[last_index]
        }
    }

    if ("POS" in log.messageTypes) {
        flight_data.data[3].x = TimeUS_to_seconds(log.get("POS", "TimeUS"))
        flight_data.data[3].y = log.get("POS", "RelHomeAlt")
    }

    // Try and work out which is the primary sensor
    let primary_gyro = 0
    const AHRS_EKF_TYPE = get_param("AHRS_EKF_TYPE")
    const EK3_PRIMARY = get_param("EK3_PRIMARY")
    if ((AHRS_EKF_TYPE == 3) && (EK3_PRIMARY != null)) {
        primary_gyro = EK3_PRIMARY

        // Add label to primary
        let fieldset = document.getElementById("Gyro" + primary_gyro)
        fieldset.style["border-color"] = "rgb(0, 255, 0)"
        fieldset.firstElementChild.innerHTML += " - Primary"
    }

    // Make sure we have data for the primary sensor
    let have_primary = false
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        if (Gyro_batch[i].sensor_num == primary_gyro) {
            have_primary = true
            break
        }
    }
    if (!have_primary) {
        primary_gyro = null
    }

    // Enable top level filter params
    parameter_set_disable("INS_GYRO_FILTER", false)
    parameter_set_disable("SCHED_LOOP_RATE", false)
    parameter_set_disable("INS_HNTCH_ENABLE", false)
    parameter_set_disable("INS_HNTC2_ENABLE", false)

    // Load filters from params
    filter_param_read()
    load_filters()

    // Use orginal harmonics value for logged notches
    for (let i = 0; i < filters.notch.length; i++) {
        logged_tracking[i].harmonics = filters.notch[i].harmonics()
    }

    // Update ranges of start and end time
    let data_start_time = Math.floor(Gyro_batch.start_time)
    let data_end_time = Math.ceil(Gyro_batch.end_time)

    // If found use zoom to none zero throttle
    let calc_start_time = data_start_time
    let calc_end_time = data_end_time
    if ((first_throttle_time != null) && (last_throttle_time != null)) {
        // Round throttle points to center and add 1 second. This trys to crop out the throttle rising from 0 and dropping back to 0
        calc_start_time = Math.max(calc_start_time, Math.ceil(first_throttle_time) + 1.0)
        calc_end_time = Math.min(calc_end_time, Math.floor(last_throttle_time) - 1.0)

        flight_data.layout.xaxis.range = [calc_start_time, calc_end_time]
        flight_data.layout.xaxis.autorange = false
    }

    Plotly.redraw("FlightData")

    var start_input = document.getElementById("TimeStart")
    start_input.disabled = false
    start_input.min = data_start_time
    start_input.value = calc_start_time
    start_input.max = data_end_time

    var end_input = document.getElementById("TimeEnd")
    end_input.disabled = false
    end_input.min = data_start_time
    end_input.value = calc_end_time
    end_input.max = data_end_time

    // Enable checkboxes for sensors which are present
    var first_gyro
    Gyro_batch.have_pre = false
    Gyro_batch.have_post = false
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        let show_batch = true
        if ((primary_gyro != null) && (Gyro_batch[i].sensor_num != primary_gyro)) {
            show_batch = false
        }
        const prepost = Gyro_batch[i].post_filter ? "Post" : "Pre"
        for (let j = 0; j < 3; j++) {
            var fft_check = document.getElementById("Gyro" + Gyro_batch[i].sensor_num + prepost + axis[j])
            fft_check.disabled = false
            fft_check.checked = show_batch
            fft_plot.data[get_FFT_data_index(Gyro_batch[i].sensor_num, Gyro_batch[i].post_filter ? 1 : 0, j)].visible = show_batch
        }

        // Track which sensors are present for spectrogram
        if (first_gyro == null || (Gyro_batch[i].sensor_num < first_gyro)) {
            first_gyro = Gyro_batch[i].sensor_num
        }
        if (Gyro_batch[i].post_filter == false) {
            document.getElementById("SpecGyroPre").disabled = false
            Gyro_batch.have_pre = true
        } else {
            document.getElementById("SpecGyroPost").disabled = false
            Gyro_batch.have_post = true
        }
        document.getElementById("SpecGyroInst" + Gyro_batch[i].sensor_num).disabled = false
        document.getElementById("BodeGyroInst" + Gyro_batch[i].sensor_num).disabled = false
    }

    // Enable estimated post filter if there is pre filter data
    if (Gyro_batch.have_pre) {
        for (let i = 0; i < Gyro_batch.length; i++) {
            if (Gyro_batch[i] == null) {
                continue
            }
            let show_batch = !Gyro_batch.have_post
            if ((primary_gyro != null) && (Gyro_batch[i].sensor_num != primary_gyro)) {
                show_batch = false
            }
            for (let j = 0; j < 3; j++) {
                let fft_check = document.getElementById("Gyro" + Gyro_batch[i].sensor_num + "PostEst" + axis[j])
                fft_check.disabled = false
                // Show estimated by default if there is no post filter data
                fft_check.checked = show_batch
                fft_plot.data[get_FFT_data_index(Gyro_batch[i].sensor_num, 2, j)].visible = show_batch
            }
        }
    }

    // If no primary display the first sensor the is data for in spectogram
    if (primary_gyro == null) {
        primary_gyro = first_gyro
    }

    // Default spectrograph to primary sensor, pre if available and X axis
    document.getElementById("SpecGyroInst" + primary_gyro).checked = true
    document.getElementById("BodeGyroInst" + primary_gyro).checked = true

    document.getElementById("SpecGyro" + (Gyro_batch.have_pre ? "Pre" : "Post")).checked = true
    document.getElementById("SpecGyroEstPost").disabled = !Gyro_batch.have_pre
    document.getElementById("SpecGyroAxisX").checked = true
    document.getElementById("SpecGyroAxisX").disabled = false
    document.getElementById("SpecGyroAxisY").disabled = false
    document.getElementById("SpecGyroAxisZ").disabled = false

    // Calculate FFT
    calculate()

    // Update transfer function from filter setting
    calculate_transfer_function()

    // Plot
    redraw()

    document.getElementById("OpenFilterTool").disabled = false
    document.getElementById("SaveParams").disabled = false
    document.getElementById("LoadParams").disabled = false

    const end = performance.now()
    console.log(`Load took: ${end - start} ms`)
}
