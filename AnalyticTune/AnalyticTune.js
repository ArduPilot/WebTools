// Import log parser
var DataflashParser
import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default })
const fft_keys = ["in", "out"]

function PID(sample_rate,kP,kI,kD,filtE,filtD) {
    this.sample_rate = sample_rate

    this._kP = kP;
    this._kI = kI;
    this._kD = kD;

    this.E_filter = new LPF_1P(sample_rate, filtE)
    this.D_filter = new LPF_1P(sample_rate, filtD)

    this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
        const E_trans = this.E_filter.transfer(Z, Z1, Z2)
        const D_trans = complex_mul(E_trans, this.D_filter.transfer(Z, Z1, Z2))

        // I term is k*z / (z - 1)
        const Z_less_one = [array_offset(Z[0], -1), Z[1].slice()]
        const I_comp = complex_mul(complex_div(Z,Z_less_one), E_trans)
        const kI = this._kI/this.sample_rate

        // D term is k * (1 - Z^-1)
        const one_less_Z1 = [array_offset(array_scale(Z1[0],-1), 1), array_scale(Z1[1],-1)]
        const D_comp =  complex_mul(one_less_Z1, D_trans)
        const kD = this._kD*this.sample_rate


        const len = Z1[0].length
        let ret = [new Array(len), new Array(len)]
        let P = [new Array(len), new Array(len)]
        let I = [new Array(len), new Array(len)]
        let D = [new Array(len), new Array(len)]
        for (let i = 0; i<len; i++) {

            // Store components
            P[0][i] = E_trans[0][i] * this._kP
            P[1][i] = E_trans[1][i] * this._kP

            I[0][i] = I_comp[0][i] * kI
            I[1][i] = I_comp[1][i] * kI

            D[0][i] = D_comp[0][i] * kD
            D[1][i] = D_comp[1][i] * kD

            // Sum of components
            ret[0][i] = P[0][i] + I[0][i] + D[0][i]
            ret[1][i] = P[1][i] + I[1][i] + D[1][i]

        }


        this.attenuation = complex_abs(ret)
        this.P_attenuation = complex_abs(P)
        this.I_attenuation = complex_abs(I)
        this.D_attenuation = complex_abs(D)

        this.phase = array_scale(complex_phase(ret), 180/Math.PI)
        this.P_phase = array_scale(complex_phase(P), 180/Math.PI)
        this.I_phase = array_scale(complex_phase(I), 180/Math.PI)
        this.D_phase = array_scale(complex_phase(D), 180/Math.PI)

        if (use_dB) {
            this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
            this.P_attenuation = array_scale(array_log10(this.P_attenuation), 20.0)
            this.I_attenuation = array_scale(array_log10(this.I_attenuation), 20.0)
            this.D_attenuation = array_scale(array_log10(this.D_attenuation), 20.0)
        }
        if (unwrap_phase) {
            this.phase = unwrap(this.phase)
            this.P_phase = unwrap(this.P_phase)
            this.I_phase = unwrap(this.I_phase)
            this.D_phase = unwrap(this.D_phase)
        }

        return ret
    }
    return this;
}

function LPF_1P(sample_rate,cutoff) {
    // Helper function to get alpha
    function calc_lowpass_alpha_dt(dt, cutoff_freq) {
        if (dt <= 0.0 || cutoff_freq <= 0.0) {
            return 1.0;
        }
        var rc = 1.0/(Math.PI*2*cutoff_freq);
        return dt/(dt+rc);
    }

    if (cutoff <= 0) {
        this.transfer = function(Z, Z1, Z2) {
            const len = Z1[0].length
            return [new Array(len).fill(1), new Array(len).fill(0)]
        }
        return this;
    }
    this.alpha = calc_lowpass_alpha_dt(1.0/sample_rate,cutoff)
    this.transfer = function(Z, Z1, Z2) {
        // H(z) = a/(1-(1-a)*z^-1)
        const len = Z1[0].length

        const numerator = [new Array(len).fill(this.alpha), new Array(len).fill(0)]
        const denominator = [array_offset(array_scale(Z1[0], this.alpha-1),1), 
                                          array_scale(Z1[1], this.alpha-1)]

        return complex_div(numerator, denominator)
    }
    return this;
}

function DigitalBiquadFilter(sample_freq, cutoff_freq) {
    this.sample_rate = sample_freq

    if (cutoff_freq <= 0) {
        this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
            const len = Z1[0].length
            return [new Array(len).fill(1), new Array(len).fill(0)]
        }
        this.enabled = false
        return this;
    }
    this.enabled = true

    var fr = sample_freq/cutoff_freq;
    var ohm = Math.tan(Math.PI/fr);
    var c = 1.0+2.0*Math.cos(Math.PI/4.0)*ohm + ohm*ohm;

    this.b0 = ohm*ohm/c;
    this.b1 = 2.0*this.b0;
    this.b2 = this.b0;
    this.a1 = 2.0*(ohm*ohm-1.0)/c;
    this.a2 = (1.0-2.0*Math.cos(Math.PI/4.0)*ohm+ohm*ohm)/c;

    this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {

        const len = Z1[0].length
        let numerator =  [new Array(len), new Array(len)]
        let denominator =  [new Array(len), new Array(len)]
        for (let i = 0; i<len; i++) {
            // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(a0 + a1*z^-1 + a2*z^-2)
            numerator[0][i] =   this.b0 + this.b1 * Z1[0][i] + this.b2 * Z2[0][i]
            numerator[1][i] =             this.b1 * Z1[1][i] + this.b2 * Z2[1][i]

            denominator[0][i] =       1 + this.a1 * Z1[0][i] + this.a2 * Z2[0][i]
            denominator[1][i] =           this.a1 * Z1[1][i] + this.a2 * Z2[1][i]
        }

        const H = complex_div(numerator, denominator)

        this.attenuation = complex_abs(H)
        this.phase = array_scale(complex_phase(H), 180/Math.PI)
        if (use_dB) {
            this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
        }
        if (unwrap_phase) {
            this.phase = unwrap(this.phase)
        }

        return H
    }

    return this;
}

function NotchFilter(sample_freq,center_freq_hz,bandwidth_hz,attenuation_dB) {
    this.sample_freq = sample_freq;
    this.center_freq_hz = center_freq_hz;
    this.bandwidth_hz = bandwidth_hz;
    this.attenuation_dB = attenuation_dB;
    this.initialised = false;

    this.calculate_A_and_Q = function() {
        this.A = Math.pow(10.0, -this.attenuation_dB / 40.0);
        if (this.center_freq_hz > 0.5 * this.bandwidth_hz) {
            var octaves = Math.log2(this.center_freq_hz / (this.center_freq_hz - this.bandwidth_hz / 2.0)) * 2.0;
            this.Q = Math.sqrt(Math.pow(2.0, octaves)) / (Math.pow(2.0, octaves) - 1.0);
        } else {
            this.Q = 0.0;
        }
    }

    this.init_with_A_and_Q = function() {
        if ((this.center_freq_hz > 0.0) && (this.center_freq_hz < 0.5 * this.sample_freq) && (this.Q > 0.0)) {
            var omega = 2.0 * Math.PI * this.center_freq_hz / this.sample_freq;
            var alpha = Math.sin(omega) / (2 * this.Q);
            this.b0 =  1.0 + alpha*(this.A**2);
            this.b1 = -2.0 * Math.cos(omega);
            this.b2 =  1.0 - alpha*(this.A**2);
            this.a0_inv =  1.0/(1.0 + alpha);
            this.a1 = this.b1;
            this.a2 =  1.0 - alpha;
            this.initialised = true;
        } else {
            this.initialised = false;
        }
    }

    // check center frequency is in the allowable range
    if ((center_freq_hz > 0.5 * bandwidth_hz) && (center_freq_hz < 0.5 * sample_freq)) {
        this.calculate_A_and_Q();
        this.init_with_A_and_Q();
    } else {
        this.initialised = false;
    }

    this.transfer = function(Z, Z1, Z2) {
        if (!this.initialised) {
            const len = Z1[0].length
            return [new Array(len).fill(1), new Array(len).fill(0)]
        }

        const a0 = 1 / this.a0_inv

        const len = Z1[0].length
        let numerator =  [new Array(len), new Array(len)]
        let denominator =  [new Array(len), new Array(len)]
        for (let i = 0; i<len; i++) {
            // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(a0 + a1*z^-1 + a2*z^-2)
            numerator[0][i] =   this.b0 + this.b1 * Z1[0][i] + this.b2 * Z2[0][i]
            numerator[1][i] =             this.b1 * Z1[1][i] + this.b2 * Z2[1][i]

            denominator[0][i] =      a0 + this.a1 * Z1[0][i] + this.a2 * Z2[0][i]
            denominator[1][i] =           this.a1 * Z1[1][i] + this.a2 * Z2[1][i]
        }

        return complex_div(numerator, denominator)
    }

    return this;
}

function HarmonicNotchFilter(sample_freq,enable,mode,freq,bw,att,ref,fm_rat,hmncs,opts) {
    this.sample_rate = sample_freq
    this.notches = []
    var chained = 1;
    var composite_notches = 1;
    if (opts & 1) {
        dbl = true;
        composite_notches = 2;
    } else if (opts & 16) {
        triple = true;
        composite_notches = 3;
    }

    if (enable <= 0) {
        this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
            const len = Z1[0].length
            return [new Array(len).fill(1), new Array(len).fill(0)]

        }
        this.enabled = false
        return this;
    }
    this.enabled = true

    if (mode == 0) {
        // fixed notch
    }
    if (mode == 1) {
        var motors_throttle = Math.max(0,get_form("Throttle"));
        var throttle_freq = freq * Math.max(fm_rat,Math.sqrt(motors_throttle / ref));
        freq = throttle_freq;
    }
    if (mode == 2) {
        var rpm = get_form("RPM1");
        freq = Math.max(rpm/60.0,freq) * ref;
    }
    if (mode == 5) {
        var rpm = get_form("RPM2");
        freq = Math.max(rpm/60.0,freq) * ref;
    }
    if (mode == 3) {
        if (opts & 2) {
            chained = get_form("NUM_MOTORS");
        }
        var rpm = get_form("ESC_RPM");
        freq = Math.max(rpm/60.0,freq) * ref;
    }
    for (var n=0;n<8;n++) {
        var fmul = n+1;
        if (hmncs & (1<<n)) {
            var notch_center = freq * fmul;
            var bandwidth_hz = bw * fmul;
            for (var c=0; c<chained; c++) {
                var nyquist_limit = sample_freq * 0.48;
                var bandwidth_limit = bandwidth_hz * 0.52;

                // Calculate spread required to achieve an equivalent single notch using two notches with Bandwidth/2
                var notch_spread = bandwidth_hz / (32.0 * notch_center);

                // adjust the fundamental center frequency to be in the allowable range
                notch_center = Math.min(Math.max(notch_center, bandwidth_limit), nyquist_limit)

                if (composite_notches != 2) {
                    // only enable the filter if its center frequency is below the nyquist frequency
                    if (notch_center < nyquist_limit) {
                        this.notches.push(new NotchFilter(sample_freq,notch_center,bandwidth_hz/composite_notches,att));
                    }
                }
                if (composite_notches > 1) {
                    var notch_center_double;
                    // only enable the filter if its center frequency is below the nyquist frequency
                    notch_center_double = notch_center * (1.0 - notch_spread);
                    if (notch_center_double < nyquist_limit) {
                        this.notches.push(new NotchFilter(sample_freq,notch_center_double,bandwidth_hz/composite_notches,att));
                    }
                    // only enable the filter if its center frequency is below the nyquist frequency
                    notch_center_double = notch_center * (1.0 + notch_spread);
                    if (notch_center_double < nyquist_limit) {
                        this.notches.push(new NotchFilter(sample_freq,notch_center_double,bandwidth_hz/composite_notches,att));
                    }
                }
            }
        }
    }

    this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
        const len = Z1[0].length
        var H_total = [new Array(len).fill(1), new Array(len).fill(0)]
        for (n in this.notches) {
            const H = this.notches[n].transfer(Z, Z1, Z2);
            H_total = complex_mul(H_total, H)
        }

        this.attenuation = complex_abs(H_total)
        this.phase = array_scale(complex_phase(H_total), 180/Math.PI)
        if (use_dB) {
            this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
        }
        if (unwrap_phase) {
            this.phase = unwrap(this.phase)
        }

        return H_total;
    }
}

function get_form(vname) {
    var v = parseFloat(document.getElementById(vname).value);
    setCookie(vname, v);
    return v;
}

function get_filters(sample_rate) {
    var filters = []
    filters.push(new HarmonicNotchFilter(sample_rate,
                                         get_form("INS_HNTCH_ENABLE"),
                                         get_form("INS_HNTCH_MODE"),
                                         get_form("INS_HNTCH_FREQ"),
                                         get_form("INS_HNTCH_BW"),
                                         get_form("INS_HNTCH_ATT"),
                                         get_form("INS_HNTCH_REF"),
                                         get_form("INS_HNTCH_FM_RAT"),
                                         get_form("INS_HNTCH_HMNCS"),
                                         get_form("INS_HNTCH_OPTS")));
    filters.push(new HarmonicNotchFilter(sample_rate,
                                         get_form("INS_HNTC2_ENABLE"),
                                         get_form("INS_HNTC2_MODE"),
                                         get_form("INS_HNTC2_FREQ"),
                                         get_form("INS_HNTC2_BW"),
                                         get_form("INS_HNTC2_ATT"),
                                         get_form("INS_HNTC2_REF"),
                                         get_form("INS_HNTC2_FM_RAT"),
                                         get_form("INS_HNTC2_HMNCS"),
                                         get_form("INS_HNTC2_OPTS")));
    filters.push(new DigitalBiquadFilter(sample_rate,get_form("INS_GYRO_FILTER")));

    return filters;
}

// Unwrap phase by looking for jumps of larger than 180 deg
function unwrap(phase) {
    const len = phase.length

    // Notches result in large positive phase changes, bias the unwrap to do a better job
    const neg_threshold = 45
    const pos_threshold = 360 - neg_threshold

    let unwrapped = new Array(len)

    unwrapped[0] = phase[0]
    for (let i = 1; i < len; i++) {
        let phase_diff = phase[i] - phase[i-1];
        if (phase_diff > pos_threshold) {
            phase_diff -= 360.0;
        } else if (phase_diff < -neg_threshold) {
            phase_diff += 360.0;
        }
        unwrapped[i] = unwrapped[i-1] + phase_diff
    }

    return unwrapped
}

function evaluate_transfer_functions(filter_groups, freq_max, freq_step, use_dB, unwrap_phase) {

    // Not sure why range does not return expected array, _data gets us the array
    const freq = array_from_range(freq_step, freq_max, freq_step)

    // Start with unity transfer function, input = output
    const len = freq.length
    var H_total = [new Array(len).fill(1), new Array(len).fill(0)]

    for (let i = 0; i < filter_groups.length; i++) {
        // Allow for batches at different sample rates
        const filters = filter_groups[i]

        const sample_rate = filters[0].sample_rate
        for (let j = 1; j < filters.length; j++) {
            if (filters[0].sample_rate != sample_rate) {
                error("Sample rate miss match")
            }
        }

        // Calculate Z for transfer function
        // Z = e^jw
        const Z = exp_jw(freq, sample_rate)

        // Z^-1
        const Z1 = complex_inverse(Z)

        // Z^-2
        const Z2 = complex_inverse(complex_square(Z))

        // Apply all transfer functions
        for (let filter of filters) {
            const H = filter.transfer(Z, Z1, Z2, use_dB, unwrap_phase)
            H_total = complex_mul(H_total, H)
        }
    }

    // Calculate total filter transfer function
    let attenuation = complex_abs(H_total)
    let phase = array_scale(complex_phase(H_total), 180/Math.PI)
    if (use_dB) {
        attenuation = array_scale(array_log10(attenuation), 20.0)
    }
    if (unwrap_phase) {
        phase = unwrap(phase)
    }

    // Return attenuation and phase
    return { attenuation: attenuation, phase: phase, freq: freq}
}

var flight_data = {}
function setup_flight_data_plot() {

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
    Plotly.newPlot(plot, flight_data.data, flight_data.layout, {displaylogo: false});

    // Update start and end time based on range
    document.getElementById("FlightData").on('plotly_relayout', function(data) {

        function range_update(range) {
            document.getElementById("starttime").value = Math.floor(range[0])
            document.getElementById("endtime").value = Math.ceil(range[1])
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

    })
}

// Update flight data range and enable calculate when time range inputs are updated
function time_range_changed() {

    flight_data.layout.xaxis.range = [ parseFloat(document.getElementById("starttime").value),
                                       parseFloat(document.getElementById("endtime").value)]
    flight_data.layout.xaxis.autorange = false
    Plotly.redraw("FlightData")

//    document.getElementById('calculate').disabled = false
}

// micro seconds to seconds helpers
const US2S = 1 / 1000000
function TimeUS_to_seconds(TimeUS) {
    return array_scale(TimeUS, US2S)
}

// Load a new log
let log
function load_log(log_file) {

    log = new DataflashParser()
    log.processData(log_file, [])

    let start_time
    let end_time
    function update_time(time_s) {
        const first = time_s[0]
        if ((start_time == null) || (first < start_time)) {
            start_time = first
        }

        const last = time_s[time_s.length - 1]
        if ((end_time == null) || (last > end_time)) {
            end_time = last
        }
    }

    // Plot flight data from log
    if ("ATT" in log.messageTypes) {
        const ATT_time = TimeUS_to_seconds(log.get("ATT", "TimeUS"))
        flight_data.data[0].x = ATT_time
        flight_data.data[0].y = log.get("ATT", "Roll")

        flight_data.data[1].x = ATT_time
        flight_data.data[1].y = log.get("ATT", "Pitch")

        update_time(ATT_time)
    }

    if ("RATE" in log.messageTypes) {
        const RATE_time = TimeUS_to_seconds(log.get("RATE", "TimeUS"))
        flight_data.data[2].x = RATE_time
        flight_data.data[2].y = log.get("RATE", "AOut")

        update_time(RATE_time)
    }

    if ("POS" in log.messageTypes) {
        const POS_time = TimeUS_to_seconds(log.get("POS", "TimeUS"))
        flight_data.data[3].x = POS_time
        flight_data.data[3].y = log.get("POS", "RelHomeAlt")

        update_time(POS_time)
    }

    Plotly.redraw("FlightData")

    // Populate start and end time
    if ((start_time != null) && (end_time != null)) {
        document.getElementById("starttime").value = start_time
        document.getElementById("endtime").value = end_time
    }

    // Populate drop downs with available log messages
//    populate_log_message_select()

    // Enable submit button
//    document.getElementById("parseButton").disabled = false

}

function populate_log_message_select() {

    // Need a valid log
    if (log == null) {
        return
    }

    // Get list of all available types
    const message_types = []
    for (const [key, value] of Object.entries(log.messageTypes)) {
        if (!("instances" in value)) {
            // Don't add base message types with instances
            message_types.push(key)
        }
    }

    // Sort alphabetically
    message_types.sort((a, b) => a.localeCompare(b))

    function populate(message, field) {

        function option(value) {
            const option = document.createElement('option');
            option.value = value
            option.text = value
            return option
        }

        // Default to "None"
        message.appendChild(option("None"))

        // Add option for each message type
        for (const type of message_types) {
            message.appendChild(option(type))
        }
        message.disabled = false

        // Add "None" to field
        field.appendChild(option("None"))

        // Callback to add types to field
        message.onchange = () => {

            // Remove all existing options except first
            field.replaceChildren(field.firstElementChild)

            // Look up fields
            const msg = message.value
            const have_msg = msg in log.messageTypes
            if (have_msg) {
                const fields = log.messageTypes[msg].expressions
                for (const field_name of fields) {
                    field.appendChild(option(field_name))
                }
            }

            // Disable select if no valid types
            field.disabled = !have_msg
        }
    }

    const container_ids = ['inputFieldsContainer', 'outputFieldsContainer', 'tf_inputFieldsContainer', 'tf_outputFieldsContainer']
    for (const container_id of container_ids) {
        const container = document.getElementById(container_id)

        for (const select of container.querySelectorAll("select")) {
            const id = select.id
            if (id.includes("_name_")) {
                const field_name = id.replace("_name_", "_field_")
                const field = container.querySelector("select[id= " + field_name + "]")
                populate(select, field)
            }
        }
    }

}

function calculate_filter() {
    const start = performance.now()

    var sample_rate = get_form("GyroSampleRate");
    var freq_max = sample_rate * 0.5;
    var freq_step = 0.1;
    var filters = get_filters(sample_rate);

    var use_dB = document.getElementById("ScaleLog").checked;
    setCookie("Scale", use_dB ? "Log" : "Linear");
    var use_RPM = document.getElementById("freq_Scale_RPM").checked;
    setCookie("feq_unit", use_RPM ? "RPM" : "Hz");
    var unwrap_phase = document.getElementById("ScaleUnWrap").checked;
    setCookie("PhaseScale", unwrap_phase ? "unwrap" : "wrap");

    const H = evaluate_transfer_functions([filters], freq_max, freq_step, use_dB, unwrap_phase)

    let X_scale = H.freq
    if (use_RPM) {
        X_scale = array_scale(X_scale, 60.0);
    }

    const end = performance.now();
    console.log(`Calc took: ${end - start} ms`);
}

// Find the index in the array with value closest to the target
// If two values are the same the first will be returned
function nearestIndex(arr, target) {

    const len = arr.length
    let min_dist = null
    let min_index = null
    for (let i = 0; i<len; i++) {
        const dist = Math.abs(arr[i] - target)
        if ((min_dist == null) || (dist < min_dist)) {
            min_dist = dist
            min_index = i
        }
    }

    return min_index
}
// Determine the frequency response from log data
var data_set = []
function calculate_freq_resp() {

    const t_start = document.getElementById('starttime').value.trim()
    const t_end = document.getElementById('endtime').value.trim()

    let timeData_arr = log.get("RATE", "TimeUS")
    const ind1_i = nearestIndex(timeData_arr, t_start*1000000)
    const ind2_i = nearestIndex(timeData_arr, t_end*1000000)
    console.log("ind1: ",ind1_i," ind2: ",ind2_i)

    timeData = Array.from(timeData_arr)
    console.log("time field pre slicing size: ", timeData.length)

    timeData = timeData.slice(ind1_i, ind2_i)
    console.log("time field post slicing size: ", timeData.length)

    const Trec = (timeData[timeData.length - 1] - timeData[0]) / 1000000
    const sample_rate = Trec / (timeData.length)
    console.log("time Begin: ", timeData[0])
    console.log("sample rate: ", sample_rate)

    ///TODO/// multi-input configuration
    let inputData = Array.from(log.get("RATE", "ROut"))
    console.log("input field pre slicing size: ", inputData.length)

    inputData = inputData.slice(ind1_i, ind2_i)
    console.log("input field post slicing size: ", inputData.length)

    const t_data = log.get("SIDD", "TimeUS")
    const ind1_d = nearestIndex(t_data, t_start*1000000)
    const ind2_d = nearestIndex(t_data, t_end*1000000)
    let outputData = Array.from(log.get("SIDD", "Gx"))
    console.log("output field pre slicing size: ", outputData.length)

    outputData = outputData.slice(ind1_d, ind2_d)

    // Convert data from degrees/second to radians/second
    outputData = array_scale(outputData, 0.01745)

    console.log("output field post slicing size: ", outputData.length)

    // Window size from user
    const window_size = parseInt(document.getElementById("FFTWindow_size").value)
    if (!Number.isInteger(Math.log2(window_size))) {
        alert('Window size must be a power of two')
        throw new Error()
    }

    // Hard code 50% overlap
    const window_overlap = 0.5
    const window_spacing = Math.round(window_size * (1 - window_overlap))
    const num_sets = Math.trunc(timeData.length/window_spacing)

    // Get windowing function and correction factors for use later when plotting
    const windowing_function = hanning(window_size)
    const window_correction = window_correction_factors(windowing_function)

    // FFT library
    const fft = new FFTJS(window_size);

    for (let j=0; j<num_sets; j++) {
        data_set[j][fft_keys[0]] = []
        data_set[j][fft_keys[0]] = inputData.slice(j * window_spacing, j * window_spacing + window_spacing - 1)
        data_set[j][fft_keys[1]] = []
        data_set[j][fft_keys[1]] = outputData.slice(j * window_spacing, j * window_spacing + window_spacing - 1)
        
        var ret = run_fft(data_set[j], fft_keys, window_size, window_spacing, windowing_function, fft)

        for (const key of fft_keys) {
            data_set.FFT[key] = []
            data_set[j].FFT[key].push(...ret[key])
        }
    }
    // Get bins and other useful stuff
    data_set.FFT = { bins: rfft_freq(window_size, 1/sample_rate),
                    average_sample_rate: sample_rate,
                    window_size: window_size,
                    correction: window_correction }

}


    

// default to roll axis
var last_axis = "CalculateRoll"
function calculate_pid(axis_id) {
    const start = performance.now()

    var PID_rate = get_form("SCHED_LOOP_RATE")
    var filters = []
    var freq_max = PID_rate * 0.5
    var freq_step = 0.05;

    if (axis_id == null) {
        axis_id = last_axis
    }

    var axis_prefix;
    if (axis_id ==  "CalculatePitch") {
        axis_prefix = "ATC_RAT_PIT_";
        document.getElementById("PID_title").innerHTML = "Pitch axis";
    } else if (axis_id ==  "CalculateYaw") {
        axis_prefix = "ATC_RAT_YAW_";
        document.getElementById("PID_title").innerHTML = "Yaw axis";
    } else {
        axis_prefix = "ATC_RAT_RLL_";
        document.getElementById("PID_title").innerHTML = "Roll axis";
    }
    last_axis = axis_id

    filters.push(new PID(PID_rate,
                        get_form(axis_prefix + "P"),
                        get_form(axis_prefix + "I"),
                        get_form(axis_prefix + "D"),
                        get_form(axis_prefix + "FLTE"),
                        get_form(axis_prefix + "FLTD")));

    var use_dB = document.getElementById("PID_ScaleLog").checked;
    setCookie("PID_Scale", use_dB ? "Log" : "Linear");

    var use_RPM =  document.getElementById("PID_freq_Scale_RPM").checked;
    setCookie("PID_feq_unit", use_RPM ? "RPM" : "Hz");

    var unwrap_phase = document.getElementById("PID_ScaleUnWrap").checked;
    setCookie("PID_PhaseScale", unwrap_phase ? "unwrap" : "wrap");

    var filter_groups = [ filters ]
    var gyro_H
    let fast_sample_rate = get_form("GyroSampleRate");
    let gyro_filters = get_filters(fast_sample_rate)

    gyro_H = evaluate_transfer_functions([gyro_filters], freq_max, freq_step, use_dB, unwrap_phase)

    filter_groups.push(gyro_filters)

    const H = evaluate_transfer_functions(filter_groups, freq_max, freq_step, use_dB, unwrap_phase)

    let X_scale = H.freq
    if (use_RPM) {
        X_scale = array_scale(X_scale, 60.0);
    }

    // Set scale type
    var freq_log = document.getElementById("PID_freq_ScaleLog").checked;
    setCookie("PID_feq_scale", freq_log ? "Log" : "Linear");

    BodePID.layout.xaxis.type = freq_log ? "log" : "linear"
    BodePID.layout.xaxis2.type = freq_log ? "log" : "linear"

    BodePID.layout.xaxis2.title.text = use_RPM ? "Frequency (RPM)" : "Frequency (Hz)" 
    BodePID.layout.yaxis.title.text = use_dB ? "Gain (dB)" : "Gain"

    // Set to fixed range for wrapped phase
    if (!unwrap_phase) {
        BodePID.layout.yaxis2.range = [-180, 180]
        BodePID.layout.yaxis2.autorange = false
        BodePID.layout.yaxis2.fixedrange = true
    } else {
        BodePID.layout.yaxis2.fixedrange = false
        BodePID.layout.yaxis2.autorange = true
    }

    const meta = ""
    const amp_template = "<extra></extra>" + meta + "%{x:.2f} " + (use_RPM ? "RPM" : "Hz") + "<br>%{y:.2f} " + (use_dB ? "dB" : "")
    const phase_template = "<extra></extra>" + meta + "%{x:.2f} " + (use_RPM ? "RPM" : "Hz") + "<br>%{y:.2f} deg"

    const Show_Components = false
    // Total
    BodePID.data[0].x = X_scale
    BodePID.data[0].y = H.attenuation
    BodePID.data[0].hovertemplate = amp_template

    BodePID.data[1].x = X_scale
    BodePID.data[1].y = H.phase
    BodePID.data[1].hovertemplate = phase_template

    // Gyro filters
    const show_gyro = (gyro_H != undefined) && Show_Components
    BodePID.data[2].visible = show_gyro
    BodePID.data[2].x = X_scale
    BodePID.data[2].hovertemplate = amp_template

    BodePID.data[3].visible = show_gyro
    BodePID.data[3].x = X_scale
    BodePID.data[3].hovertemplate = phase_template

    if (show_gyro) {
        BodePID.data[2].y = gyro_H.attenuation
        BodePID.data[3].y = gyro_H.phase
    }

    // P
    BodePID.data[4].visible = Show_Components
    BodePID.data[4].x = X_scale
    BodePID.data[4].y = filter_groups[0][0].P_attenuation
    BodePID.data[4].hovertemplate = amp_template

    BodePID.data[5].visible = Show_Components
    BodePID.data[5].x = X_scale
    BodePID.data[5].y = filter_groups[0][0].P_phase
    BodePID.data[5].hovertemplate = phase_template

    // I
    BodePID.data[6].visible = Show_Components
    BodePID.data[6].x = X_scale
    BodePID.data[6].y = filter_groups[0][0].I_attenuation
    BodePID.data[6].hovertemplate = amp_template

    BodePID.data[7].visible = Show_Components
    BodePID.data[7].x = X_scale
    BodePID.data[7].y = filter_groups[0][0].I_phase
    BodePID.data[7].hovertemplate = phase_template

    // D
    BodePID.data[8].visible = Show_Components
    BodePID.data[8].x = X_scale
    BodePID.data[8].y = filter_groups[0][0].D_attenuation
    BodePID.data[8].hovertemplate = amp_template

    BodePID.data[9].visible = Show_Components
    BodePID.data[9].x = X_scale
    BodePID.data[9].y = filter_groups[0][0].D_phase
    BodePID.data[9].hovertemplate = phase_template

    Plotly.redraw("BodePID")

    const end = performance.now();
    console.log(`PID calc took: ${end - start} ms`);
}

var BodePID = {}
function load() {

    // PID Bode plot setup
    BodePID.data = []

    name = "Combined"
    BodePID.data[0] = { mode: "lines", line: { color: '#1f77b4' }, name: name, meta: name }
    BodePID.data[1] = { mode: "lines", showlegend: false, xaxis: 'x2', yaxis: 'y2', line: { color: '#1f77b4' }, name: name, meta: name }

    name = "Gyro filters"
    BodePID.data[2] = { mode: "lines", line: { color: '#ff7f0e' }, name: name, meta: name }
    BodePID.data[3] = { mode: "lines", showlegend: false, xaxis: 'x2', yaxis: 'y2', line: { color: '#ff7f0e' }, name: name, meta: name }

    name = "Proportional"
    BodePID.data[4] = { mode: "lines", line: { color: '#2ca02c' }, name: name, meta: name }
    BodePID.data[5] = { mode: "lines", showlegend: false, xaxis: 'x2', yaxis: 'y2', line: { color: '#2ca02c' }, name: name, meta: name }

    name = "Integral"
    BodePID.data[6] = { mode: "lines", line: { color: '#d62728' }, name: name, meta: name }
    BodePID.data[7] = { mode: "lines", showlegend: false, xaxis: 'x2', yaxis: 'y2', line: { color: '#d62728' }, name: name, meta: name }

    name = "Derivative"
    BodePID.data[8] = { mode: "lines", line: { color: '#9467bd' }, name: name, meta: name }
    BodePID.data[9] = { mode: "lines", showlegend: false, xaxis: 'x2', yaxis: 'y2', line: { color: '#9467bd' }, name: name, meta: name }

    BodePID.layout = {
        xaxis: {type: "linear", zeroline: false, showline: true, mirror: true },
        xaxis2: {title: {text: "" }, type: "linear", zeroline: false, showline: true, mirror: true },
        yaxis: {title: {text: "" }, zeroline: false, showline: true, mirror: true, domain: [0.52, 1] },
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

    plot = document.getElementById("BodePID")
    Plotly.purge(plot)
    Plotly.newPlot(plot, BodePID.data, BodePID.layout, {displaylogo: false});

    link_plot_axis_range([["BodePID", "x", "", BodePID],
                          ["BodePID", "x", "2", BodePID]])

    // Load params
    var url_string = (window.location.href).toLowerCase();
    if (url_string.indexOf('?') == -1) {
        // no query params, load from cookies
        load_cookies();
        return;
    }

    // populate from query's
    var params = new URL(url_string).searchParams;
    var sections = ["params", "PID_params"];
    for (var j = 0; j<sections.length; j++) {
        var items = document.forms[sections[j]].getElementsByTagName("input");
        for (var i=-0;i<items.length;i++) {
            let name = items[i].name.toLowerCase();
            if (params.has(name)) {
                if (items[i].type == "radio") {
                    // only checked buttons are included
                    if (items[i].value.toLowerCase() == params.get(name)) {
                        items[i].checked = true;
                    }
                    continue;
                }
                if (items[i].type == "checkbox") {
                    let val = params.get(name)
                    items[i].checked = val === 'true'
                    continue;
                }
                var value = parseFloat(params.get(name));
                if (!isNaN(value)) {
                    parameter_set_value(items[i].name, value)
                }
            }
        }
    }
}

// build url and query string for current view and copy to clipboard
function get_link() {

    if (!(navigator && navigator.clipboard && navigator.clipboard.writeText)) {
        // copy not available
        return
    }

    // get base url
    var url =  new URL((window.location.href).split('?')[0]);

    // Add all query strings
    var sections = ["params", "PID_params"];
    for (var j = 0; j<sections.length; j++) {
        var items = document.forms[sections[j]].querySelectorAll('input,select');
        for (var i=-0;i<items.length;i++) {
            if (items[i].name === "") {
                // Invalid name
                continue
            }
            if (items[i].type == "radio" && !items[i].checked) {
                // Only add checked radio buttons
                continue;
            }
            if (items[i].type == "checkbox") {
                url.searchParams.append(items[i].name, items[i].checked);
                continue;
            }
            url.searchParams.append(items[i].name, items[i].value);
        }
    }

    // copy to clipboard
    navigator.clipboard.writeText(url.toString());

}


function setCookie(c_name, value) {
    var exdate = new Date();
    var exdays = 365;
    exdate.setDate(exdate.getDate() + exdays);
    var c_value = escape(value) + ";expires=" + exdate.toUTCString();
    document.cookie = c_name + "=" + c_value + ";path=/";
}

function getCookie(c_name, def_value) {
    let name = c_name + "=";
    let decodedCookie = decodeURIComponent(document.cookie);
    let ca = decodedCookie.split(';');
    for(let i = 0; i <ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return def_value;
}

function load_cookies() {
    var sections = ["params", "PID_params"];
    for (var i = 0; i < sections.length; i++) {
        var inputs = document.forms[sections[i]].getElementsByTagName("input");
        for (const v in inputs) {
            var name = inputs[v].name;
            if (inputs[v].type == "radio") {
                // only checked buttons are included
                if (inputs[v].value == getCookie(name)) {
                    inputs[v].checked = true;
                }
                continue;
            }
            if (inputs[v].type == "checkbox") {
                inputs[v].checked = getCookie(name) === 'true'
                continue;
            }
            parameter_set_value(name, parseFloat(getCookie(name,inputs[v].value)))
        }
    }
}

function clear_cookies() {
    var cookies = document.cookie.split(";");
    for (var i = 0; i < cookies.length; i++) {
        var cookie = cookies[i];
        var eqPos = cookie.indexOf("=");
        var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
    }
}

function save_parameters() {

    function save_from_elements(inputs) {
        var params = "";
        for (const v in inputs) {
            var name = "" + inputs[v].id;
            if (name.startsWith("INS_")) {
                var value = inputs[v].value;
                params += name + "," + param_to_string(value) + "\n";
            }
        }
        return params
    }

    var params = save_from_elements(document.forms["params"].getElementsByTagName("input"))
    params += save_from_elements(document.forms["params"].getElementsByTagName("select"))

    var blob = new Blob([params], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "filter.param");
}

async function load_parameters(file) {
    var text = await file.text();
    var lines = text.split('\n');
    for (i in lines) {
        var line = lines[i];
        line = line.replace("Q_A_RAT_","ATC_RAT_");
        v = line.split(/[\s,=\t]+/);
        if (v.length >= 2) {
            var vname = v[0];
            var value = v[1];
            if (parameter_set_value(vname, value)) {
                console.log("set " + vname + "=" + value);
            }
        }
    }
    update_all_hidden();
    calculate_filter();
}

// update all hidden params, to be called at init
function update_all_hidden()
{
    var enable_params = ["INS_HNTCH_ENABLE", "INS_HNTC2_ENABLE"];
    for (var i=-0;i<enable_params.length;i++) {
        update_hidden(enable_params[i])
    }
}

// update hidden inputs based on param value
function update_hidden(enable_param)
{
    var enabled = parseFloat(document.getElementById(enable_param).value) > 0;
    var prefix = enable_param.split("_ENABLE")[0];

    // find all elements with same prefix
    var inputs = document.forms["params"].getElementsByTagName("*");
    for (var i=-0;i<inputs.length;i++) {
        var key = inputs[i].id;
        if (key.length == 0) {
            // no id, but bound to a valid one
            if (inputs[i].htmlFor == null) {
                continue;
            }
            key = inputs[i].htmlFor
        }
        if (key.startsWith(enable_param)) {
            // found original param, don't change
            continue;
        }
        if (key.startsWith(prefix)) {
            parameter_set_disable(key, !enabled)
        }
    }

    update_hidden_mode();
}

function update_hidden_mode()
{
    var mode_params = ["INS_HNTCH_MODE", "INS_HNTC2_MODE"];
    var mode_options = [[[1], "Throttle_input"], [[3], "ESC_input"], [[2,5], "RPM_input"]];

    for (var i =0; i < mode_options.length; i++) {
        var hide = true;
        for (var j =0; j < mode_params.length; j++) {
            // check enable param
            if (!(parseFloat(document.getElementById(mode_params[j].replace("MODE","ENABLE")).value) > 0)) {
                continue;
            }

            var mode = Math.floor(get_form(mode_params[j]))
            for (var k =0; k < mode_options[i][0].length; k++) {
                if (mode == mode_options[i][0][k]) {
                    hide = false;
                }
            }
        }
        document.getElementById(mode_options[i][1]).hidden = hide;
    }
}
