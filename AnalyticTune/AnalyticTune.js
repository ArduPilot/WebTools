// Import log parser
var DataflashParser
import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default })

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

var flight_data = {}
var fft_plot = {}
var fft_plot_Phase = {}
var fft_plot_Coh = {}
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


    amplitude_scale = get_amplitude_scale()
    frequency_scale = get_frequency_scale()

    // FFT plot setup
    fft_plot.data = []
    fft_plot_Phase.data = []
    fft_plot_Coh.data = []
    fft_plot.layout = {
        xaxis: {title: {text: frequency_scale.label }, type: "linear", zeroline: false, showline: true, mirror: true},
        yaxis: {title: {text: amplitude_scale.label }, zeroline: false, showline: true, mirror: true },
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }
    fft_plot_Phase.layout = {
        xaxis: {title: {text: frequency_scale.label }, type: "linear", zeroline: false, showline: true, mirror: true},
        yaxis: {title: "Phase (degrees)", zeroline: false, showline: true, mirror: true },
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }
    fft_plot_Coh.layout = {
        xaxis: {title: {text: frequency_scale.label }, type: "linear", zeroline: false, showline: true, mirror: true},
        yaxis: {title: "Coherence", zeroline: false, showline: true, mirror: true },
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    plot = document.getElementById("FFTPlotMag")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot.data, fft_plot.layout, {displaylogo: false});

    plot = document.getElementById("FFTPlotPhase")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot_Phase.data, fft_plot_Phase.layout, {displaylogo: false});

    plot = document.getElementById("FFTPlotCoh")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot_Coh.data, fft_plot_Coh.layout, {displaylogo: false});

    //link_plots()
}

// Get configured amplitude scale
function get_amplitude_scale() {

    const use_DB = document.getElementById("PID_ScaleLog").checked;

    var ret = {}
    if (use_DB) {
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

    const use_RPM = document.getElementById("PID_freq_Scale_RPM").checked;

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

    ret.type = document.getElementById("PID_freq_ScaleLog").checked ? "log" : "linear"

    return ret
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

    setup_FFT_data()
}

function setup_FFT_data() {

    // Clear existing data
    fft_plot.data = []
    fft_plot_Phase.data = []
    fft_plot_Coh.data = []

    const plot_types = "bare airframe"
    const meta_prefix = "Roll"
            // For each axis
            fft_plot.data[0] = { mode: "lines",
                                     name: plot_types,
                                     meta: meta_prefix + plot_types,
                                     hovertemplate: "" }

            fft_plot_Phase.data[0] = { mode: "lines",
                                     name: plot_types,
                                     meta: meta_prefix + plot_types,
                                     hovertemplate: "" }

            fft_plot_Coh.data[0] = { mode: "lines",
                                     name: plot_types,
                                     meta: meta_prefix + plot_types,
                                     hovertemplate: "" }
/*          
            // Add legend groups if multiple sets
            if (num_sets > 1) {
                fft_plot.data[index].legendgroup = i
                fft_plot.data[index].legendgrouptitle =  { text: "Test " + (i+1) }
                fft_plot_Phase.data[index].legendgroup = i
                fft_plot_Phase.data[index].legendgrouptitle =  { text: "Test " + (i+1) }
                fft_plot_Coh.data[index].legendgroup = i
                fft_plot_Coh.data[index].legendgrouptitle =  { text: "Test " + (i+1) }
             }
*/
    plot = document.getElementById("FFTPlotMag")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot.data, fft_plot.layout, {displaylogo: false});

    plot = document.getElementById("FFTPlotPhase")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot_Phase.data, fft_plot_Phase.layout, {displaylogo: false});

    plot = document.getElementById("FFTPlotCoh")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot_Coh.data, fft_plot_Coh.layout, {displaylogo: false});

//    link_plots()

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
var data_set
var amplitude_scale
var frequency_scale
function calculate_freq_resp() {

    const t_start = document.getElementById('starttime').value.trim()
    const t_end = document.getElementById('endtime').value.trim()
    const eval_axis 
    if (document.getElementById('type_Roll').checked) {
        eval_axis = "Roll"
    } else if (document.getElementById('type_Pitch').checked) {
        eval_axis = "Pitch"
    } else if (document.getElementById('type_Yaw').checked) {
        eval_axis = "Yaw"
    }
    load_time_history_data(t_start, t_end)

    // Graph config
    amplitude_scale = get_amplitude_scale()
    frequency_scale = get_frequency_scale()

    // Setup axes
    fft_plot.layout.xaxis.type = frequency_scale.type
    fft_plot.layout.xaxis.title.text = frequency_scale.label
    fft_plot.layout.yaxis.title.text = amplitude_scale.label

    fft_plot_Phase.layout.xaxis.type = frequency_scale.type
    fft_plot_Phase.layout.xaxis.title.text = frequency_scale.label
    fft_plot_Phase.layout.yaxis.title.text = amplitude_scale.label

    fft_plot_Coh.layout.xaxis.type = frequency_scale.type
    fft_plot_Coh.layout.xaxis.title.text = frequency_scale.label
    fft_plot_Coh.layout.yaxis.title.text = amplitude_scale.label

    const fft_hovertemplate = "<extra></extra>%{meta}<br>" + frequency_scale.hover("x") + "<br>" + amplitude_scale.hover("y")
    for (let i = 0; i < fft_plot.data.length; i++) {
        fft_plot.data[i].hovertemplate = fft_hovertemplate
        fft_plot_Phase.data[i].hovertemplate = fft_hovertemplate
        fft_plot_Coh.data[i].hovertemplate = fft_hovertemplate
    }


    let timeData_arr = log.get("RATE", "TimeUS")
    const ind1_i = nearestIndex(timeData_arr, t_start*1000000)
    const ind2_i = nearestIndex(timeData_arr, t_end*1000000)
    console.log("ind1: ",ind1_i," ind2: ",ind2_i)

    timeData = Array.from(timeData_arr)
    console.log("time field pre slicing size: ", timeData.length)

    timeData = timeData.slice(ind1_i, ind2_i)
    console.log("time field post slicing size: ", timeData.length)

    const Trec = (timeData[timeData.length - 1] - timeData[0]) / 1000000
    const sample_rate = (timeData.length)/ Trec
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

    // Get windowing function and correction factors for use later when plotting
    const windowing_function = hanning(window_size)
    const win_correction = window_correction_factors(windowing_function)

    // FFT library
    const fft = new FFTJS(window_size);

    data_set = {
        Tar:   inputData,
        Act: outputData
    }

    data_set.FFT = run_fft(data_set, Object.keys(data_set), window_size, window_spacing, windowing_function, fft)

    // Get bins and other useful stuff
    Object.assign(data_set.FFT, { bins: rfft_freq(window_size, 1/sample_rate),
                  average_sample_rate: sample_rate,
                  window_size: window_size,
                  correction: win_correction })

    console.log(data_set)

    // Windowing amplitude correction depends on spectrum of interest and resolution
    const FFT_resolution = data_set.FFT.average_sample_rate/data_set.FFT.window_size
    const window_correction = amplitude_scale.window_correction(data_set.FFT.correction, FFT_resolution)

     // Set scaled x data
    const scaled_bins = frequency_scale.fun(data_set.FFT.bins)

    const start_index = 0
    const end_index = data_set.FFT.center.length

    // Number of windows averaged
    const mean_length = end_index - start_index
    console.log(mean_length)

    var sum_in = array_mul(complex_abs(data_set.FFT.Tar[start_index]),complex_abs(data_set.FFT.Tar[start_index]))
    var sum_out = array_mul(complex_abs(data_set.FFT.Act[start_index]),complex_abs(data_set.FFT.Act[start_index]))
    var input_output = complex_mul(complex_conj(data_set.FFT.Tar[start_index]),data_set.FFT.Act[start_index])
    var real_sum_inout = input_output[0]
    var im_sum_inout = input_output[1]

    for (let k=start_index+1;k<end_index;k++) {
        // Add to sum
        var input_sqr = array_mul(complex_abs(data_set.FFT.Tar[k]),complex_abs(data_set.FFT.Tar[k]))
        var output_sqr = array_mul(complex_abs(data_set.FFT.Act[k]),complex_abs(data_set.FFT.Act[k]))
        input_output = complex_mul(complex_conj(data_set.FFT.Tar[k]),data_set.FFT.Act[k])
        sum_in = array_add(sum_in, input_sqr)  // this is now a scalar
        sum_out = array_add(sum_out, output_sqr) // this is now a scalar
        real_sum_inout = array_add(real_sum_inout, input_output[0])
        im_sum_inout = array_add(im_sum_inout, input_output[1])
    }

    const Twin = (window_size - 1) * sample_rate
    fft_scale = 2 / (0.612 * mean_length * Twin)
    var input_sqr_avg = array_scale(sum_in, fft_scale)
    var output_sqr_avg = array_scale(sum_out, fft_scale)
    var input_output_avg = [array_scale(real_sum_inout, fft_scale), array_scale(im_sum_inout, fft_scale)]

    var input_sqr_inv = array_inverse(input_sqr_avg)
    const H = [array_mul(input_output_avg[0],input_sqr_inv), array_mul(input_output_avg[1],input_sqr_inv)]

    const coh_num = array_mul(complex_abs(input_output_avg),complex_abs(input_output_avg))
    const coh_den = array_mul(array_abs(input_sqr_avg), array_abs(output_sqr_avg))
    const coh = array_div(coh_num, coh_den)

    const Hmag = complex_abs(H)

    const Hphase = complex_phase(H)
    console.log(Hmag)
    console.log(Hphase)
    console.log(coh)
    const show_set = true

        // Apply selected scale, set to y axis
        fft_plot.data[0].y = amplitude_scale.scale(Hmag)
        
        // Set bins
        fft_plot.data[0].x = scaled_bins

        // Work out if we should show this line
        fft_plot.data[0].visible = show_set

        // Apply selected scale, set to y axis
        fft_plot_Phase.data[0].y = array_scale(Hphase, 180 / Math.PI)

        // Set bins
        fft_plot_Phase.data[0].x = scaled_bins

        // Work out if we should show this line
        fft_plot_Phase.data[0].visible = show_set

        // Apply selected scale, set to y axis
        fft_plot_Coh.data[0].y = coh

        // Set bins
        fft_plot_Coh.data[0].x = scaled_bins

        // Work out if we should show this line
        fft_plot_Coh.data[0].visible = show_set


    Plotly.redraw("FFTPlotMag")

    Plotly.redraw("FFTPlotPhase")

    Plotly.redraw("FFTPlotCoh")


}

function load() {

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
