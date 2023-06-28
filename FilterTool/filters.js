function PID(sample_rate,kP,kI,kD,filtE,filtD) {
    this.sample_rate = sample_rate

    this._kP = kP;
    this._kI = kI;
    this._kD = kD;

    this.E_filter = new LPF_1P(sample_rate, filtE)
    this.D_filter = new LPF_1P(sample_rate, filtD)

    this.transfer = function(Z, Z1, Z2) {
        const E_trans = this.E_filter.transfer(Z, Z1, Z2)
        const D_trans = math.dotMultiply(E_trans, this.D_filter.transfer(Z, Z1, Z2))

        const P_term = math.dotMultiply(E_trans, this._kP)

        // I term is k*z / (z - 1)
        const I = math.dotMultiply(E_trans, math.dotDivide(Z, math.subtract(Z, 1)))
        const I_term = math.dotMultiply(I, this._kI/this.sample_rate)

        // D term is k * (1 - Z^-1)
        const D =  math.dotMultiply(D_trans, math.subtract(1, Z1))
        const D_term = math.dotMultiply(D, this._kD*this.sample_rate)

        return math.add(P_term, I_term, D_term)
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
            return math.ones(Z.length)._data
        }
        return this;
    }
    this.alpha = calc_lowpass_alpha_dt(1.0/sample_rate,cutoff)
    this.transfer = function(Z, Z1, Z2) {
        // H(z) = a/(1-(1-a)*z^-1)
        const denominator = math.subtract(1, math.dotMultiply(Z1, 1 - this.alpha))
        return math.dotDivide(this.alpha, denominator)
    }
    return this;
}

function DigitalBiquadFilter(sample_freq, cutoff_freq) {
    this.sample_rate = sample_freq

    if (cutoff_freq <= 0) {
        this.transfer = function(Z, Z1, Z2) {
            return math.ones(Z.length)._data
        }
        return this;
    }

    var fr = sample_freq/cutoff_freq;
    var ohm = Math.tan(Math.PI/fr);
    var c = 1.0+2.0*Math.cos(Math.PI/4.0)*ohm + ohm*ohm;

    this.b0 = ohm*ohm/c;
    this.b1 = 2.0*this.b0;
    this.b2 = this.b0;
    this.a1 = 2.0*(ohm*ohm-1.0)/c;
    this.a2 = (1.0-2.0*Math.cos(Math.PI/4.0)*ohm+ohm*ohm)/c;

    this.transfer = function(Z, Z1, Z2) {

        // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(1 + a1*z^-1 + a2*z^-2)
        const b1z = math.dotMultiply(Z1, this.b1)
        const b2z = math.dotMultiply(Z2, this.b2)
        const a1z = math.dotMultiply(Z1, this.a1)
        const a2z = math.dotMultiply(Z2, this.a2)

        const numerator = math.add(this.b0, b1z, b2z)
        const denominator = math.add(1, a1z, a2z)
        return math.dotDivide(numerator, denominator)
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
            return math.ones(Z.length)._data
        }

        // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(a0 + a1*z^-1 + a2*z^-2)
        const a0 = 1 / this.a0_inv

        const b1z = math.dotMultiply(Z1, this.b1)
        const b2z = math.dotMultiply(Z2, this.b2)
        const a1z = math.dotMultiply(Z1, this.a1)
        const a2z = math.dotMultiply(Z2, this.a2)

        const numerator = math.add(this.b0, b1z, b2z)
        const denominator = math.add(a0, a1z, a2z)
        return math.dotDivide(numerator, denominator)
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
        this.transfer = function(Z, Z1, Z2) {
            return math.ones(Z.length)._data
        }
        return this;
    }

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
                notch_center = math.min(math.max(notch_center, bandwidth_limit), nyquist_limit)

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

    this.transfer = function(Z, Z1, Z2) {
        var H_total = math.ones(Z.length)._data
        for (n in this.notches) {
            const H = this.notches[n].transfer(Z, Z1, Z2);
            H_total = math.dotMultiply(H_total, H)
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

function evaluate_transfer_functions(filter_groups, freq_max, freq_step, use_dB, unwrap_phase) {

    // Not sure why range does not return expected array, _data gets us the array
    const freq = math.range(freq_step, freq_max, freq_step, true)._data

    // Start with unity transfer function, input = output
    var H_total = math.ones(freq.length)._data

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
        const Z = math.map(math.dotMultiply(freq, math.complex(0,(2*math.pi)/sample_rate)), math.exp)

        // Pre calculate powers of Z
        // pow seems not to work on complex arrays
        let Z1 = []
        let Z2 = []
        for (let j = 0; j<Z.length; j++) {
            Z1[j] = math.pow(Z[j], -1)
            Z2[j] = math.pow(Z[j], -2)
        }

        // Apply all transfer functions
        for (let filter of filters) {
            const H = filter.transfer(Z, Z1, Z2)
            H_total = math.dotMultiply(H_total, H)
        }
    }

    let attenuation = math.abs(H_total)

    // Convert to decibels
    if (use_dB) {
        attenuation = math.dotMultiply(math.log10(attenuation), 20.0)
    }

    // Calculate phase in deg
    let phase = math.dotMultiply(math.atan2(math.im(H_total), math.re(H_total)), 180/math.pi)

    if (unwrap_phase) {
        // Unwrap phase if required
        let phase_wrap = 0.0;
        for (let i = 1; i < freq.length; i++) {
            phase[i] += phase_wrap
            const phase_diff = phase[i] - phase[i-1];
            if (phase_diff > 180) {
                phase_wrap -= 360.0;
                phase[i] -= 360.0;
            } else if (phase_diff < -180) {
                phase_wrap += 360.0;
                phase[i] += 360.0;
            }
        }
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
        X_scale = math.dotMultiply(X_scale, 60.0);
    }

    // Set scale type
    var freq_log = document.getElementById("freq_ScaleLog").checked;
    setCookie("feq_scale", freq_log ? "Log" : "Linear");
    Bode.layout.xaxis.type = freq_log ? "log" : "linear"
    Bode.layout.xaxis2.type = freq_log ? "log" : "linear"

    Bode.layout.xaxis2.title.text = use_RPM ? "Frequency (RPM)" : "Frequency (Hz)" 
    Bode.layout.yaxis.title.text = use_dB ? "Magnitude (dB)" : "Magnitude"

    // Set to fixed range for wrapped phase
    if (!unwrap_phase) {
        Bode.layout.yaxis2.range = [-180, 180]
        Bode.layout.yaxis2.autorange = false
        Bode.layout.yaxis2.fixedrange = true
    } else {
        Bode.layout.yaxis2.fixedrange = false
        Bode.layout.yaxis2.autorange = true
    }

    // Set data
    Bode.data[0].x = X_scale
    Bode.data[0].y = H.attenuation
    Bode.data[0].hovertemplate = "<extra></extra>" + "%{x:.2f} " + (use_RPM ? "RPM" : "Hz") + "<br>%{y:.2f} " + (use_dB ? "dB" : "")


    Bode.data[1].x = X_scale
    Bode.data[1].y = H.phase
    Bode.data[1].hovertemplate = "<extra></extra>" + "%{x:.2f} " + (use_RPM ? "RPM" : "Hz") + "<br>%{y:.2f} deg"

    Plotly.redraw("Bode")

    const end = performance.now();
    console.log(`Calc took: ${end - start} ms`);
}

function calculate_pid(axis_id) {
    const start = performance.now()

    var PID_rate = get_form("SCHED_LOOP_RATE")
    var filters = []
    var freq_max = PID_rate * 0.5
    var freq_step = 0.1;

    // default to roll axis
    var axis_prefix = "ATC_RAT_RLL_";
    if (axis_id ==  "CalculatePitch") {
        var axis_prefix = "ATC_RAT_PIT_";
        document.getElementById("PID_title").innerHTML = "Pitch axis";
    } else if (axis_id ==  "CalculateYaw") {
        var axis_prefix = "ATC_RAT_YAW_";
        document.getElementById("PID_title").innerHTML = "Yaw axis";
    } else {
        document.getElementById("PID_title").innerHTML = "Roll axis";
    }

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
    if (document.getElementById("PID_filtering_Post").checked) {
        let fast_sample_rate = get_form("GyroSampleRate");
        filter_groups.push(get_filters(fast_sample_rate))
        setCookie("filtering", "Post")
    } else {
        setCookie("filtering", "Pre")
    }

    const H = evaluate_transfer_functions(filter_groups, freq_max, freq_step, use_dB, unwrap_phase)

    let X_scale = H.freq
    if (use_RPM) {
        X_scale = math.dotMultiply(X_scale, 60.0);
    }

    // Set scale type
    var freq_log = document.getElementById("freq_ScaleLog").checked;
    setCookie("feq_scale", freq_log ? "Log" : "Linear");

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

    // Set data
    BodePID.data[0].x = X_scale
    BodePID.data[0].y = H.attenuation
    BodePID.data[0].hovertemplate = "<extra></extra>" + "%{x:.2f} " + (use_RPM ? "RPM" : "Hz") + "<br>%{y:.2f} " + (use_dB ? "dB" : "")


    BodePID.data[1].x = X_scale
    BodePID.data[1].y = H.phase
    BodePID.data[1].hovertemplate = "<extra></extra>" + "%{x:.2f} " + (use_RPM ? "RPM" : "Hz") + "<br>%{y:.2f} deg"

    Plotly.redraw("BodePID")

    const end = performance.now();
    console.log(`PID calc took: ${end - start} ms`);
}

var Bode = {}
var BodePID = {}
function load() {

    // Bode plot setup
    Bode.data = []

    Bode.data[0] = { mode: "lines", showlegend: false, line: { color: '#1f77b4' } }
    Bode.data[1] = { mode: "lines", showlegend: false, xaxis: 'x2', yaxis: 'y2', line: { color: '#1f77b4' } }

    Bode.layout = {
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

    plot = document.getElementById("Bode")
    Plotly.purge(plot)
    Plotly.newPlot(plot, Bode.data, Bode.layout, {displaylogo: false});

    // PID Bode plot setup
    BodePID.data = []

    BodePID.data[0] = { mode: "lines", showlegend: false, line: { color: '#1f77b4' } }
    BodePID.data[1] = { mode: "lines", showlegend: false, xaxis: 'x2', yaxis: 'y2', line: { color: '#1f77b4' } }

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
    link_plot_axis_range([["Bode", "x", "", Bode],
                          ["Bode", "x", "2", Bode]])

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
            var name = items[i].name.toLowerCase();
            if (params.has(name)) {
                if (items[i].type == "radio") {
                    // only checked buttons are included
                    if (items[i].value.toLowerCase() == params.get(name)) {
                        items[i].checked = true;
                    }
                    continue;
                }
                var value = parseFloat(params.get(name));
                if (!isNaN(value)) {
                    items[i].value = value;
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
        var items = document.forms[sections[j]].getElementsByTagName("input");
        for (var i=-0;i<items.length;i++) {
            if (items[i].type == "radio" && !items[i].checked) {
                // Only add checked radio buttons
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
            inputs[v].value = parseFloat(getCookie(name,inputs[v].value));
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
    var params = "";
    var inputs = document.forms["params"].getElementsByTagName("input");
    for (const v in inputs) {
        var name = "" + inputs[v].name;
        if (name.startsWith("INS_")) {
            var value = inputs[v].value;
            params += name + "," + value + "\n";
        }
    }
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
            var fvar = document.getElementById(vname);
            if (fvar) {
                fvar.value = value;
                console.log("set " + vname + "=" + value);
            }
        }
    }
    fill_docs();
    update_all_hidden();
    calculate_filter();
}

function fill_docs()
{
    var inputs = document.forms["params"].getElementsByTagName("input");
    for (const v in inputs) {
        var name = inputs[v].name;
        var doc = document.getElementById(name + ".doc");
        if (!doc) {
            continue;
        }
        if (inputs[v].onchange == null) {
            inputs[v].onchange = fill_docs;
        }
        var value = parseFloat(inputs[v].value);
        if (name.endsWith("_ENABLE")) {
            if (value >= 1) {
                doc.innerHTML = "Enabled";
            } else {
                doc.innerHTML = "Disabled";
            }
        } else if (name.endsWith("_MODE")) {
            switch (Math.floor(value)) {
            case 0:
                doc.innerHTML = "Fixed notch";
                break;
            case 1:
                doc.innerHTML = "Throttle";
                break;
            case 2:
                doc.innerHTML = "RPM Sensor 1";
                break;
            case 3:
                doc.innerHTML = "ESC Telemetry";
                break;
            case 4:
                doc.innerHTML = "Dynamic FFT";
                break;
            case 5:
                doc.innerHTML = "RPM Sensor 2";
                break;
            default:
                doc.innerHTML = "INVALID";
                break;
            }
        } else if (name.endsWith("_OPTS")) {
            var ival = Math.floor(value);
            var bits = [];
            if (ival & 1) {
                bits.push("Double Notch");
            }
            if (ival & 2) {
                bits.push("Dynamic Harmonic");
            }
            if (ival & 4) {
                bits.push("Loop Rate");
            }
            if (ival & 8) {
                bits.push("All IMUs Rate");
            }
            if ((ival & 16) && (ival & 1) == 0) {
                bits.push("Triple Notch");
            }
            doc.innerHTML = bits.join(", ");
        } else if (name.endsWith("_HMNCS")) {
            var ival = Math.floor(value);
            var bits = [];
            if (ival & 1) {
                bits.push("Fundamental");
            }
            if (ival & 2) {
                bits.push("1st Harmonic");
            }
            if (ival & 4) {
                bits.push("2nd Harmonic");
            }
            if (ival & 8) {
                bits.push("3rd Harmonic");
            }
            if (ival & 16) {
                bits.push("4th Harmonic");
            }
            if (ival & 32) {
                bits.push("5th Harmonic");
            }
            if (ival & 64) {
                bits.push("6th Harmonic");
            }
            doc.innerHTML = bits.join(", ");
        }

    }
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
            inputs[i].hidden = !enabled;
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
