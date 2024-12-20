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
        const E_trans = this.E_filter.transfer(Z, Z1, Z2, false, false)
        const D_trans = complex_mul(E_trans, this.D_filter.transfer(Z, Z1, Z2, false, false))

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


function Ang_P(sample_rate,kP) {
    this.sample_rate = sample_rate

    this._kP = kP;

    this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
        // I term is k*z / (z - 1)
        const Z_less_one = [array_offset(Z[0], -1), Z[1].slice()]
        const I_comp = complex_div(Z,Z_less_one)
        const kI = this._kP/this.sample_rate

        const len = Z1[0].length
        let ret = [new Array(len), new Array(len)]
        let I = [new Array(len), new Array(len)]
        for (let i = 0; i<len; i++) {

            // Store components
            I[0][i] = I_comp[0][i] * kI
            I[1][i] = I_comp[1][i] * kI

            // Sum of components
            ret[0][i] = I[0][i]
            ret[1][i] = I[1][i]

        }

        this.attenuation = complex_abs(ret)

        this.phase = array_scale(complex_phase(ret), 180/Math.PI)

        if (use_dB) {
            this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
        }
        if (unwrap_phase) {
            this.phase = unwrap(this.phase)
        }

        return ret
    }
    return this;
}

function feedforward(sample_rate, kFF, kFF_D) {
    this.sample_rate = sample_rate

    this._kFF = kFF;
    this._kFF_D = kFF_D;

    this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
        // D term is k * (1 - Z^-1)
        const one_less_Z1 = [array_offset(array_scale(Z1[0],-1), 1), array_scale(Z1[1],-1)]
        const kFF_D = this._kFF_D*this.sample_rate

        const len = Z1[0].length
        let ret = [new Array(len), new Array(len)]
        let FF_D = [new Array(len), new Array(len)]
        for (let i = 0; i<len; i++) {

            // Store components
            FF_D[0][i] = one_less_Z1[0][i] * kFF_D
            FF_D[1][i] = one_less_Z1[1][i] * kFF_D

            // Sum of components
            ret[0][i] = FF_D[0][i] + this._kFF
            ret[1][i] = FF_D[1][i]

        }

        this.attenuation = complex_abs(ret)

        this.phase = array_scale(complex_phase(ret), 180/Math.PI)

        if (use_dB) {
            this.attenuation = array_scale(array_log10(this.attenuation), 20.0)
        }
        if (unwrap_phase) {
            this.phase = unwrap(this.phase)
        }

        return ret
    }
    return this;
}

function LPF_1P(sample_rate,cutoff) {
    this.sample_rate = sample_rate
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
    this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
        // H(z) = a/(1-(1-a)*z^-1)
        const len = Z1[0].length

        const numerator = [new Array(len).fill(this.alpha), new Array(len).fill(0)]
        const denominator = [array_offset(array_scale(Z1[0], this.alpha-1),1), 
                                          array_scale(Z1[1], this.alpha-1)]

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

function NotchFilterusingQ(sample_freq,center_freq_hz,notch_Q,attenuation_dB) {
    this.sample_rate = sample_freq;
    this.center_freq_hz = center_freq_hz;
    this.Q = notch_Q;
    this.attenuation_dB = attenuation_dB;
    this.initialised = false;

    if ((this.center_freq_hz > 0.0) && (this.center_freq_hz < 0.5 * this.sample_rate) && (this.Q > 0.0)) {
        this.A = Math.pow(10.0, -this.attenuation_dB / 40.0);
        var omega = 2.0 * Math.PI * this.center_freq_hz / this.sample_rate;
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

    this.transfer = function(Z, Z1, Z2, use_dB, unwrap_phase) {
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

function get_PID_param_names() {
    let prefix = ["ATC_RAT_RLL_", "ATC_RAT_PIT_", "ATC_RAT_YAW_"]
    let ret = []
    for (let i = 0; i < prefix.length; i++) {
        ret[i] = {p: prefix[i] + "P",
                  i: prefix[i] + "I",
                  d: prefix[i] + "D",
                  ff: prefix[i] + "FF",
                  d_ff: prefix[i] + "D_FF",
                  fltt: prefix[i] + "FLTT",
                  fltdd: prefix[i] + "FLTD",
                  flte: prefix[i] + "FLTE",
                  ntf: prefix[i] + "NTF",
                  nef: prefix[i] + "NEF"}
    }
    return ret
}

function get_FILT_param_names(num) {
    let prefix = ["FILT"]
    let ret = {type: prefix + num + "_TYPE",
            freq: prefix + num + "_NOTCH_FREQ",
            q: prefix + num + "_NOTCH_Q",
            att: prefix + num + "_NOTCH_ATT"}
    
    return ret
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
    return { attenuation: attenuation, phase: phase, freq: freq, H_total: H_total}
}

var flight_data = {}
var fft_plot = {}
var fft_plot_Phase = {}
var fft_plot_Coh = {}
function setup_plots() {

    const time_scale_label = "Time (s)"

    // Setup flight data plot
    const flight_data_plot = ["Targ", "Roll", "Pitch", "Yaw"]
    const flight_data_unit = ["deg",  "deg/s","deg/s", "deg/s"]
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

function get_axis_prefix() {
    if (document.getElementById('type_Roll').checked) {
        return "RLL_"
    } else if (document.getElementById('type_Pitch').checked) {
        return "PIT_"
    } else if (document.getElementById('type_Yaw').checked) {
        return "YAW_"
    }
    return ""
}

function calculate_predicted_TF(H_acft, sample_rate, window_size) {

    //this will have to be the sample rate of time history data
    var freq_max = sample_rate * 0.5
    var freq_step = sample_rate / window_size;
    var use_dB = false
    var unwrap_phase = false

    var PID_rate = get_form("SCHED_LOOP_RATE")

    // Calculate transfer function for Rate PID
    var PID_filter = []
    var axis_prefix = "ATC_RAT_" + get_axis_prefix();
    PID_filter.push(new PID(PID_rate,
        get_form(axis_prefix + "P"),
        get_form(axis_prefix + "I"),
        get_form(axis_prefix + "D"),
        get_form(axis_prefix + "FLTE"),
        get_form(axis_prefix + "FLTD")));

    const PID_H = evaluate_transfer_functions([PID_filter], freq_max, freq_step, use_dB, unwrap_phase)

    // calculate transfer funciton for the PID Error Notch filter
    const nef_num = get_form(axis_prefix + "NEF")
    var nef_freq = 0.0
    if (nef_num > 0) { nef_freq = get_form("FILT" + nef_num + "_NOTCH_FREQ") }
    if (nef_num > 0 && nef_freq > 0.0) {
        var E_notch_filter = []
        E_notch_filter.push(new NotchFilterusingQ(PID_rate, nef_freq, get_form("FILT" + nef_num + "_NOTCH_Q"), get_form("FILT" + nef_num + "_NOTCH_ATT")))
        const NEF_H = evaluate_transfer_functions([E_notch_filter], freq_max, freq_step, use_dB, unwrap_phase)
        PID_H_TOT = complex_mul(NEF_H.H_total, PID_H.H_total)
    } else {
        PID_H_TOT = PID_H.H_total
    }

    // calculate transfer function for FF and DFF
    var FF_filter = []
    FF_filter.push(new feedforward(PID_rate, get_form(axis_prefix + "FF"),get_form(axis_prefix + "D_FF")))
    const FF_H = evaluate_transfer_functions([FF_filter], freq_max, freq_step, use_dB, unwrap_phase)
    var FFPID_H = [new Array(H_acft[0].length).fill(0), new Array(H_acft[0].length).fill(0)]
    for (let k=0;k<H_acft[0].length+1;k++) {
        FFPID_H[0][k] = PID_H_TOT[0][k] + FF_H.H_total[0][k]
        FFPID_H[1][k] = PID_H_TOT[1][k] + FF_H.H_total[1][k]
    }

    // calculate transfer function for target LPF
    var T_filter = []
    T_filter.push(new LPF_1P(PID_rate, get_form(axis_prefix + "FLTT")))
    const FLTT_H = evaluate_transfer_functions([T_filter], freq_max, freq_step, use_dB, unwrap_phase)

    // calculate transfer function for target PID notch and the target LPF combined, if the notch is defined.  Otherwise just 
    // provide the target LPF as the combined transfer function.
    const ntf_num = get_form(axis_prefix + "NTF")
    var ntf_freq = 0.0
    if (ntf_num > 0) { ntf_freq = get_form("FILT" + ntf_num + "_NOTCH_FREQ") }
    if (ntf_num > 0 && ntf_freq > 0.0) {
        var T_notch_filter = []
        T_notch_filter.push(new NotchFilterusingQ(PID_rate, ntf_freq, get_form("FILT" + ntf_num + "_NOTCH_Q"), get_form("FILT" + ntf_num + "_NOTCH_ATT")))
        const NTF_H = evaluate_transfer_functions([T_notch_filter], freq_max, freq_step, use_dB, unwrap_phase)
        TGT_FILT_H = complex_mul(NTF_H.H_total, FLTT_H.H_total)
    } else {
        TGT_FILT_H = FLTT_H.H_total
    }

    // calculate the transfer function of the INS filters which includes notches and LPF
    let fast_sample_rate = get_form("GyroSampleRate");
    let gyro_filters = get_filters(fast_sample_rate)
    const INS_H = evaluate_transfer_functions([gyro_filters], freq_max, freq_step, use_dB, unwrap_phase)

    // calculation of transfer function for the rate controller (includes serveral intermediate steps)
    var H_PID_Acft_plus_one = [new Array(PID_H_TOT[0].length).fill(0), new Array(PID_H_TOT[0].length).fill(0)]

    const PID_Acft = complex_mul(H_acft, PID_H_TOT)
    const INS_PID_Acft = complex_mul(PID_Acft, INS_H.H_total)

    const FFPID_Acft = complex_mul(H_acft, FFPID_H)
    const FLTT_FFPID_Acft = complex_mul(FFPID_Acft, TGT_FILT_H)

    for (let k=0;k<H_acft[0].length+1;k++) {
        H_PID_Acft_plus_one[0][k] = INS_PID_Acft[0][k] + 1
        H_PID_Acft_plus_one[1][k] = INS_PID_Acft[1][k]
    }
    const Ret_rate = complex_div(FLTT_FFPID_Acft, H_PID_Acft_plus_one)

    // calculate transfer function for the angle P in prep for attitude controller calculation
    var Ang_P_filter = []
    Ang_P_filter.push(new Ang_P(PID_rate, get_form("ATC_ANG_" + get_axis_prefix() + "P")))
    const Ang_P_H = evaluate_transfer_functions([Ang_P_filter], freq_max, freq_step, use_dB, unwrap_phase)

    // calculate transfer function for attitude controller with feedforward enabled (includes intermediate steps)
    const rate_INS_ANGP = complex_mul(Ret_rate, complex_mul(INS_H.H_total, Ang_P_H.H_total))
    var rate_INS_ANGP_plus_one = [new Array(H_acft[0].length).fill(0), new Array(H_acft[0].length).fill(0)]
    var ANGP_plus_one = [new Array(H_acft[0].length).fill(0), new Array(H_acft[0].length).fill(0)]
    for (let k=0;k<H_acft[0].length+1;k++) {
        rate_INS_ANGP_plus_one[0][k] = rate_INS_ANGP[0][k] + 1
        rate_INS_ANGP_plus_one[1][k] = rate_INS_ANGP[1][k]
        ANGP_plus_one[0][k] = Ang_P_H.H_total[0][k] + 1
        ANGP_plus_one[1][k] = Ang_P_H.H_total[1][k]
    }
    const Ret_att_ff = complex_div(complex_mul(ANGP_plus_one, Ret_rate), rate_INS_ANGP_plus_one)

    // transfer function of attitude controller without feedforward
    const Ret_att_nff = complex_div(complex_mul(Ang_P_H.H_total, Ret_rate), rate_INS_ANGP_plus_one)

    // calculate transfer function for pilot feel LPF
    var tc_filter = []
    const tc_freq = 1 / (get_form("ATC_INPUT_TC") * 2 * Math.PI)
    tc_filter.push(new LPF_1P(PID_rate, tc_freq))
    const tc_H = evaluate_transfer_functions([tc_filter], freq_max, freq_step, use_dB, unwrap_phase)
    // calculate transfer function for pilot input to the aircraft response
    const Ret_pilot = complex_mul(tc_H.H_total, Ret_att_ff)

    // calculate transfer function for attitude Distrubance Rejection
    var minus_one = [new Array(H_acft[0].length).fill(-1), new Array(H_acft[0].length).fill(0)]
    const Ret_DRB = complex_div(minus_one, rate_INS_ANGP_plus_one)
   
    const Ret_att_bl = rate_INS_ANGP

    return [Ret_rate, Ret_att_ff, Ret_pilot, Ret_DRB, Ret_att_nff, Ret_att_bl]

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

    const use_RPS = document.getElementById("PID_freq_Scale_RPS").checked;

    var ret = {}
    if (use_RPS) {
        ret.fun = function (x) { return array_scale(x, Math.PI * 2) }
        ret.label = "Rad/s"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} Rad/s" }

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
        // favour earlier settings
        if (start_time != null && end_time != null) {
            return
        }
        const first = time_s[0]
        if ((start_time == null) || (first < start_time)) {
            start_time = first
        }

        const last = time_s[time_s.length - 1]
        if ((end_time == null) || (last > end_time)) {
            end_time = last
        }
    }

    if (!("PARM" in log.messageTypes)) {
        alert("No params in log")
        return
    }
    const PARM = log.get("PARM")
    function get_param(name, allow_change) {
        return get_param_value(PARM, name, allow_change)
    }

    // Find SIDD data range
    if ("SIDD" in log.messageTypes) {
        const SIDD_time = TimeUS_to_seconds(log.get("SIDD", "TimeUS"))

        flight_data.data[0].x = SIDD_time
        flight_data.data[0].y = log.get("SIDD", "Targ")

        update_time(SIDD_time)
    }

    if ("RATE" in log.messageTypes) {
        const RATE_time = TimeUS_to_seconds(log.get("RATE", "TimeUS"))
        flight_data.data[1].x = RATE_time
        flight_data.data[1].y = log.get("RATE", "R")
        flight_data.data[2].x = RATE_time
        flight_data.data[2].y = log.get("RATE", "P")
        flight_data.data[3].x = RATE_time
        flight_data.data[3].y = log.get("RATE", "Y")
        update_time(RATE_time)
    }

    // If found use zoom to non-zero SIDD
    if ((start_time != null) && (end_time != null)) {
        flight_data.layout.xaxis.range = [start_time, end_time]
        flight_data.layout.xaxis.autorange = false
    }

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

    const pid_params = get_PID_param_names()
    for (let i = 0; i < pid_params.length; i++) {
        for (const param of Object.values(pid_params[i])) {
            const value = get_param(param)
            if (value != null) {
                parameter_set_value(param, value)
            }
        }
    }

    for (let j = 1; j < 9; j++) {
        const filt_params = get_FILT_param_names(j)
        for (const param of Object.values(filt_params)) {
            const value = get_param(param)
            if (value != null) {
                parameter_set_value(param, value)
            }
        }
    }

    const other_params = [
        "INS_GYRO_FILTER",
        "ATC_INPUT_TC",
        "ATC_ANG_RLL_P",
        "ATC_ANG_PIT_P",
        "ATC_ANG_YAW_P"
    ]

    for (const param of other_params) {
        const value = get_param(param)
        if (value != null) {
            parameter_set_value(param, value)
        }
    }

    // approximately calculate the gyro sample rate
    const gyro_rate = get_param("INS_GYRO_RATE");
    if (gyro_rate != 0) {
        parameter_set_value("GyroSampleRate", (1 << gyro_rate) * 1000)
    }

    // approximately calculate the rate loop rate
    const loop_rate = get_param("SCHED_LOOP_RATE");
    const fstrate = get_param("FSTRATE_ENABLE");
    const fstrate_div = get_param("FSTRATE_DIV");
    if (loop_rate > 0) {
        if (fstrate > 0 && fstrate_div > 0) {
            parameter_set_value("SCHED_LOOP_RATE", ((1 << gyro_rate) * 1000) / fstrate_div)
        } else {
            parameter_set_value("SCHED_LOOP_RATE", loop_rate)
        }
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

    const plot_types = ["Calculated", "Predicted"]
    const meta_prefix = "Closed Loop Rate "
            // For Calculated Freq Resp
            fft_plot.data[0] = { mode: "lines",
                                     name: plot_types[0],
                                     meta: meta_prefix + plot_types[0],
                                     hovertemplate: "" }

            fft_plot_Phase.data[0] = { mode: "lines",
                                     name: plot_types[0],
                                     meta: meta_prefix + plot_types[0],
                                     hovertemplate: "" }

            fft_plot_Coh.data[0] = { mode: "lines",
                                     name: plot_types[0],
                                     meta: meta_prefix + plot_types[0],
                                     hovertemplate: "" }

            // For Predicted Freq Resp
            fft_plot.data[1] = { mode: "lines",
                                    name: plot_types[1],
                                    meta: meta_prefix + plot_types[1],
                                    hovertemplate: "" }

            fft_plot_Phase.data[1] = { mode: "lines",
                                    name: plot_types[1],
                                    meta: meta_prefix + plot_types[1],
                                    hovertemplate: "" }

            fft_plot_Coh.data[1] = { mode: "lines",
                                    name: plot_types[1],
                                    meta: meta_prefix + plot_types[1],
                                    hovertemplate: "" }

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

// Change the visibility of the PID elements
function axis_changed() {
    update_PID_filters()
}

function update_PID_filters() {
    document.getElementById('RollPIDS').style.display = 'none';
    document.getElementById('PitchPIDS').style.display = 'none';
    document.getElementById('YawPIDS').style.display = 'none';
    document.getElementById('RollNOTCH').style.display = 'none';
    document.getElementById('PitchNOTCH').style.display = 'none';
    document.getElementById('YawNOTCH').style.display = 'none';
    for (let i = 1; i<9; i++) {    
        document.getElementById('FILT' + i).style.display = 'none';
    }
    if (document.getElementById('type_Roll').checked) {
        document.getElementById('RollPIDS').style.display = 'block';;
        document.getElementById('RollNOTCH').style.display = 'block';
        const NTF_num = document.getElementById('ATC_RAT_RLL_NTF').value;
        if (NTF_num > 0) {
            document.getElementById('FILT' + NTF_num).style.display = 'block';
        }
        const NEF_num = document.getElementById('ATC_RAT_RLL_NEF').value;
        if (NEF_num > 0 && NEF_num != NTF_num) {
            document.getElementById('FILT' + NEF_num).style.display = 'block';
        }
    } else if (document.getElementById('type_Pitch').checked) {
        document.getElementById('PitchPIDS').style.display = 'block';
        document.getElementById('PitchNOTCH').style.display = 'block';
        const NTF_num = document.getElementById('ATC_RAT_PIT_NTF').value;
        if (NTF_num > 0) {
            document.getElementById('FILT' + NTF_num).style.display = 'block';
        }
        const NEF_num = document.getElementById('ATC_RAT_PIT_NEF').value;
        if (NEF_num > 0 && NEF_num != NTF_num) {
            document.getElementById('FILT' + NEF_num).style.display = 'block';
        }
    } else if (document.getElementById('type_Yaw').checked) {
        document.getElementById('YawPIDS').style.display = 'block';
        document.getElementById('YawNOTCH').style.display = 'block';
        const NTF_num = document.getElementById('ATC_RAT_YAW_NTF').value;
        if (NTF_num > 0) {
            document.getElementById('FILT' + NTF_num).style.display = 'block';
        }
        const NEF_num = document.getElementById('ATC_RAT_YAW_NEF').value;
        if (NEF_num > 0 && NEF_num != NTF_num) {
            document.getElementById('FILT' + NEF_num).style.display = 'block';
        }
    }


}

// Determine the frequency response from log data
var data_set
var calc_freq_resp
var pred_freq_resp
function calculate_freq_resp() {
    const start = performance.now()

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

    const t_start = document.getElementById('starttime').value.trim()
    const t_end = document.getElementById('endtime').value.trim()
    update_PID_filters()
    var eval_axis = ""
    if (document.getElementById('type_Roll').checked) {
        eval_axis = "Roll"
    } else if (document.getElementById('type_Pitch').checked) {
        eval_axis = "Pitch"
    } else if (document.getElementById('type_Yaw').checked) {
        eval_axis = "Yaw"
    }
    var sample_rate
    [data_set, sample_rate] = load_time_history_data(t_start, t_end, eval_axis)

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


    const start_index = 0
    const end_index = data_set.FFT.center.length

    // Number of windows averaged
    const mean_length = end_index - start_index
    console.log(mean_length)

    var H_pilot
    var coh_pilot
    if (document.getElementById('type_Yaw').checked) {        
        [H_pilot, coh_pilot] = calculate_freq_resp_from_FFT(data_set.FFT.PilotInput, data_set.FFT.Rate, start_index, end_index, mean_length, window_size, sample_rate)
    } else {
        [H_pilot, coh_pilot] = calculate_freq_resp_from_FFT(data_set.FFT.PilotInput, data_set.FFT.Att, start_index, end_index, mean_length, window_size, sample_rate)
    }
    var H_acft
    var coh_acft
    [H_acft, coh_acft] = calculate_freq_resp_from_FFT(data_set.FFT.ActInput, data_set.FFT.GyroRaw, start_index, end_index, mean_length, window_size, sample_rate)

    var H_rate
    var coh_rate
    [H_rate, coh_rate] = calculate_freq_resp_from_FFT(data_set.FFT.RateTgt, data_set.FFT.GyroRaw, start_index, end_index, mean_length, window_size, sample_rate)

    var H_att
    var coh_att
    [H_att, coh_att] = calculate_freq_resp_from_FFT(data_set.FFT.AttTgt, data_set.FFT.Att, start_index, end_index, mean_length, window_size, sample_rate)

    var H_drb
    var coh_drb
    [H_drb, coh_drb] = calculate_freq_resp_from_FFT(data_set.FFT.DRBin, data_set.FFT.DRBresp, start_index, end_index, mean_length, window_size, sample_rate)


    // resample calculated responses to predicted response length
    const len = H_acft[0].length-1
    var H_pilot_tf = [new Array(len).fill(0), new Array(len).fill(0)]
    var coh_pilot_tf = [new Array(len).fill(0)]
    var H_acft_tf = [new Array(len).fill(0), new Array(len).fill(0)]
    var coh_acft_tf = [new Array(len).fill(0)]
    var H_rate_tf = [new Array(len).fill(0), new Array(len).fill(0)]
    var coh_rate_tf = [new Array(len).fill(0)]
    var H_att_tf = [new Array(len).fill(0), new Array(len).fill(0)]
    var coh_att_tf = [new Array(len).fill(0)]
    var H_drb_tf = [new Array(len).fill(0), new Array(len).fill(0)]
    var coh_drb_tf = [new Array(len).fill(0)]
    var freq_tf = [new Array(len).fill(0)]
    for (let k=1;k<len+1;k++) {
        H_pilot_tf[0][k-1] = H_pilot[0][k]
        H_pilot_tf[1][k-1] = H_pilot[1][k]
        coh_pilot_tf[k-1] = coh_pilot[k]
        H_acft_tf[0][k-1] = H_acft[0][k]
        H_acft_tf[1][k-1] = H_acft[1][k]
        coh_acft_tf[k-1] = coh_acft[k]
        H_rate_tf[0][k-1] = H_rate[0][k]
        H_rate_tf[1][k-1] = H_rate[1][k]
        coh_rate_tf[k-1] = coh_rate[k]
        H_att_tf[0][k-1] = H_att[0][k]
        H_att_tf[1][k-1] = H_att[1][k]
        coh_att_tf[k-1] = coh_att[k]
        H_drb_tf[0][k-1] = H_drb[0][k]
        H_drb_tf[1][k-1] = H_drb[1][k]
        coh_drb_tf[k-1] = coh_drb[k]
        freq_tf[k-1] = data_set.FFT.bins[k]
    }

    var H_rate_pred
    var H_att_ff_pred
    var H_pilot_pred
    var H_DRB_pred
    var H_att_bl
    [H_rate_pred, H_att_ff_pred, H_pilot_pred, H_DRB_pred, H_att_nff_pred, H_att_bl] = calculate_predicted_TF(H_acft_tf, sample_rate, window_size)

    calc_freq_resp = {
        pilotctrl_H: H_pilot_tf,
        pilotctrl_coh: coh_pilot_tf,
        attctrl_H: H_att_tf,
        attctrl_coh: coh_att_tf,
        ratectrl_H: H_rate_tf,
        ratectrl_coh: coh_rate_tf,
        bareAC_H: H_acft_tf,
        bareAC_coh: coh_acft_tf,
        DRB_H: H_drb_tf,
        DRB_coh: coh_drb_tf,
        freq: freq_tf
    }
    pred_freq_resp = {
        attctrl_ff_H: H_att_ff_pred,
        ratectrl_H: H_rate_pred,
        pilotctrl_H: H_pilot_pred,
        attctrl_nff_H: H_att_nff_pred,
        DRB_H: H_DRB_pred,
        attbl_H: H_att_bl
    }

    redraw_freq_resp()


    const end = performance.now();
    console.log(`Calc Freq Resp took: ${end - start} ms`);

}

function load_time_history_data(t_start, t_end, axis) {


    let timeRATE_arr = log.get("RATE", "TimeUS")
    const ind1_i = nearestIndex(timeRATE_arr, t_start*1000000)
    const ind2_i = nearestIndex(timeRATE_arr, t_end*1000000)
    console.log("ind1: ",ind1_i," ind2: ",ind2_i)

    let timeRATE = Array.from(timeRATE_arr)
    console.log("time field pre slicing size: ", timeRATE.length)

    timeRATE = timeRATE.slice(ind1_i, ind2_i)
    console.log("time field post slicing size: ", timeRATE.length)

    // Determine average sample rate
    const trecord = (timeRATE[timeRATE.length - 1] - timeRATE[0]) / 1000000
    const samplerate = (timeRATE.length)/ trecord
    console.log("sample rate: ", samplerate)

    const timeATT = log.get("ATT", "TimeUS")
    const ind1_a = nearestIndex(timeATT, t_start*1000000)
    const ind2_a = nearestIndex(timeATT, t_end*1000000)

    const timeSIDD = log.get("SIDD", "TimeUS")
    const ind1_s = nearestIndex(timeSIDD, t_start*1000000)
    const ind2_s = nearestIndex(timeSIDD, t_end*1000000)

    var ActInputParam = ""
    var RateTgtParam = ""
    var RateParam = ""
    var AttTgtParam = ""
    var AttParam = ""
    var GyroRawParam = ""
    if (axis == "Roll") {
        ActInputParam = "ROut"
        RateTgtParam = "RDes"
        RateParam = "R"
        AttTgtParam = "DesRoll"
        AttParam = "Roll"
        GyroRawParam = "Gx"
    } else if (axis == "Pitch") {
        ActInputParam = "POut"
        RateTgtParam = "PDes"
        RateParam = "P"
        AttTgtParam = "DesPitch"
        AttParam = "Pitch"
        GyroRawParam = "Gy"
    } else if (axis == "Yaw") {
        ActInputParam = "YOut"
        RateTgtParam = "YDes"
        RateParam = "Y"
        AttTgtParam = "DesYaw"
        AttParam = "Yaw"
        GyroRawParam = "Gz"
    }
    let ActInputData = Array.from(log.get("RATE", ActInputParam))
    let RateTgtData = Array.from(log.get("RATE", RateTgtParam))
    let RateData = Array.from(log.get("RATE", RateParam))
    let AttTgtData = Array.from(log.get("ATT", AttTgtParam))
    let AttData = Array.from(log.get("ATT", AttParam))
    let GyroRawData = Array.from(log.get("SIDD", GyroRawParam))

    // Slice ActInputData
    ActInputData = ActInputData.slice(ind1_i, ind2_i)
    // Slice RateTgtData and Convert data from degrees/second to radians/second
    RateTgtData = RateTgtData.slice(ind1_i, ind2_i)
    RateTgtData = array_scale(RateTgtData, 0.01745)
    // Slice RateData and Convert data from degrees/second to radians/second
    RateData = RateData.slice(ind1_i, ind2_i)
    RateData = array_scale(RateData, 0.01745)


    // Slice AttTgtData Convert data from degrees/second to radians/second
    AttTgtData = AttTgtData.slice(ind1_a, ind2_a)
    AttTgtData = array_scale(AttTgtData, 0.01745)
    // Slice AttData and Convert data from degrees/second to radians/second
    AttData = AttData.slice(ind1_a, ind2_a)
    AttData = array_scale(AttData, 0.01745)


    // Slice GyroRawData and Convert data from degrees/second to radians/second
    GyroRawData = GyroRawData.slice(ind1_s, ind2_s)
    GyroRawData = array_scale(GyroRawData, 0.01745)
    // Pull and Slice PilotInputData
    let PilotInputData = Array.from(log.get("SIDD", "Targ"))
    PilotInputData = PilotInputData.slice(ind1_s, ind2_s)
    PilotInputData = array_scale(PilotInputData, 0.01745)

    // Pull Targ for input to Attitude Disturbance Rejection Transfer Function
    DRBInputData = PilotInputData
    DRBRespData = array_sub(AttData, DRBInputData)

    

    var data = {
        PilotInput: PilotInputData,
        ActInput:   ActInputData,
        GyroRaw:    GyroRawData,
        RateTgt:    RateTgtData,
        Rate:       RateData,
        AttTgt:     AttTgtData,
        Att:        AttData,
        DRBin:      DRBInputData,
        DRBresp:    DRBRespData
    }
    return [data, samplerate]

}

function calculate_freq_resp_from_FFT(input_fft, output_fft, start_index, end_index, mean_length, window_size, sample_rate) {

    var sum_in = array_mul(complex_abs(input_fft[start_index]),complex_abs(input_fft[start_index]))
    var sum_out = array_mul(complex_abs(output_fft[start_index]),complex_abs(output_fft[start_index]))
    var input_output = complex_mul(complex_conj(input_fft[start_index]),output_fft[start_index])
    var real_sum_inout = input_output[0]
    var im_sum_inout = input_output[1]

    for (let k=start_index+1;k<end_index;k++) {
        // Add to sum
        var input_sqr = array_mul(complex_abs(input_fft[k]),complex_abs(input_fft[k]))
        var output_sqr = array_mul(complex_abs(output_fft[k]),complex_abs(output_fft[k]))
        input_output = complex_mul(complex_conj(input_fft[k]),output_fft[k])
        sum_in = array_add(sum_in, input_sqr)  // this is now a scalar
        sum_out = array_add(sum_out, output_sqr) // this is now a scalar
        real_sum_inout = array_add(real_sum_inout, input_output[0])
        im_sum_inout = array_add(im_sum_inout, input_output[1])
    }

    const Twin = (window_size - 1) * sample_rate
    const fft_scale = 2 / (0.612 * mean_length * Twin)
    var input_sqr_avg = array_scale(sum_in, fft_scale)
    var output_sqr_avg = array_scale(sum_out, fft_scale)
    var input_output_avg = [array_scale(real_sum_inout, fft_scale), array_scale(im_sum_inout, fft_scale)]

    var input_sqr_inv = array_inverse(input_sqr_avg)
    const H = [array_mul(input_output_avg[0],input_sqr_inv), array_mul(input_output_avg[1],input_sqr_inv)]

    const coh_num = array_mul(complex_abs(input_output_avg),complex_abs(input_output_avg))
    const coh_den = array_mul(array_abs(input_sqr_avg), array_abs(output_sqr_avg))
    const coh = array_div(coh_num, coh_den)
    
    return [H, coh]
}

function load() {

    // Load params
    var url_string = (window.location.href).toLowerCase();
    if (url_string.indexOf('?') == -1) {
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

function save_parameters() {

    function save_from_elements(inputs) {
        var params = "";
        var NEF_num
        var NTF_num
        for (const v in inputs) {
            var name = "" + inputs[v].id;
            if (document.getElementById('type_Roll').checked) {
                if (name.startsWith("ATC_RAT_RLL")) {
                    var value = inputs[v].value;
                    params += name + "," + param_to_string(value) + "\n";
                }
                if (name.startsWith("ATC_ANG_RLL")) {
                    var value = inputs[v].value;
                    params += name + "," + param_to_string(value) + "\n";
                }
                NEF_num = document.getElementById('ATC_RAT_RLL_NEF').value
                NTF_num = document.getElementById('ATC_RAT_RLL_NTF').value
            } else if (document.getElementById('type_Pitch').checked) {
                if (name.startsWith("ATC_RAT_PIT")) {
                    var value = inputs[v].value;
                    params += name + "," + param_to_string(value) + "\n";
                }
                if (name.startsWith("ATC_ANG_PIT")) {
                    var value = inputs[v].value;
                    params += name + "," + param_to_string(value) + "\n";
                }
                NEF_num = document.getElementById('ATC_RAT_PIT_NEF').value
                NTF_num = document.getElementById('ATC_RAT_PIT_NTF').value
            } else if (document.getElementById('type_Yaw').checked) {
                if (name.startsWith("ATC_RAT_YAW")) {
                    var value = inputs[v].value;
                    params += name + "," + param_to_string(value) + "\n";
                }
                if (name.startsWith("ATC_ANG_YAW")) {
                    var value = inputs[v].value;
                    params += name + "," + param_to_string(value) + "\n";
                }
                NEF_num = document.getElementById('ATC_RAT_YAW_NEF').value
                NTF_num = document.getElementById('ATC_RAT_YAW_NTF').value
            }
            if (NEF_num > 0) {
                if (name.startsWith("FILT" + NEF_num + "_")) {
                    var value = inputs[v].value;
                    params += name + "," + param_to_string(value) + "\n";
                }
            }
            if (NTF_num > 0 && NEF_num != NTF_num) {
                if (name.startsWith("FILT" + NTF_num + "_")) {
                    var value = inputs[v].value;
                    params += name + "," + param_to_string(value) + "\n";
                }
            }
            if (name.startsWith("INS_")) {
                var value = inputs[v].value;
                params += name + "," + param_to_string(value) + "\n";
            }
            if (name.startsWith("SCHED_")) {
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

var amplitude_scale
var frequency_scale
// default to roll axis
var last_axis = "CalculateRoll"
function redraw_freq_resp() {
    const start = performance.now()

    // Graph config
    amplitude_scale = get_amplitude_scale()
    frequency_scale = get_frequency_scale()

    // Setup axes
    fft_plot.layout.xaxis.type = frequency_scale.type
    fft_plot.layout.xaxis.title.text = frequency_scale.label
    fft_plot.layout.yaxis.title.text = amplitude_scale.label

    fft_plot_Phase.layout.xaxis.type = frequency_scale.type
    fft_plot_Phase.layout.xaxis.title.text = frequency_scale.label
    fft_plot_Phase.layout.yaxis.title.text = "Phase (deg)"

    fft_plot_Coh.layout.xaxis.type = frequency_scale.type
    fft_plot_Coh.layout.xaxis.title.text = frequency_scale.label
    fft_plot_Coh.layout.yaxis.title.text = "Coherence"

    const fftmag_hovertemplate = "<extra></extra>%{meta}<br>" + frequency_scale.hover("x") + "<br>" + amplitude_scale.hover("y")
    const fftphase_hovertemplate = "<extra></extra>%{meta}<br>" + frequency_scale.hover("x") + "<br>%{y:.2f} deg"
    const fftcoh_hovertemplate = "<extra></extra>%{meta}<br>" + frequency_scale.hover("x") + "<br>%{y:.2f}"
    for (let i = 0; i < fft_plot.data.length; i++) {
        fft_plot.data[i].hovertemplate = fftmag_hovertemplate
        fft_plot_Phase.data[i].hovertemplate = fftphase_hovertemplate
        fft_plot_Coh.data[i].hovertemplate = fftcoh_hovertemplate
    }

    var unwrap_ph = document.getElementById("PID_ScaleUnWrap").checked;

    unwrap_ph = false
     // Set scaled x data
    const scaled_bins = frequency_scale.fun(calc_freq_resp.freq)
    var show_set = true
    var calc_data
    var calc_data_coh
    var pred_data
    var pred_data_coh
    if (document.getElementById("type_Pilot_Ctrlr").checked) {
        calc_data = calc_freq_resp.pilotctrl_H
        calc_data_coh = calc_freq_resp.pilotctrl_coh
        pred_data = pred_freq_resp.pilotctrl_H
        pred_data_coh = calc_freq_resp.bareAC_coh
        show_set = true
    } else if (document.getElementById("type_Att_Ctrlr").checked) {
        calc_data = calc_freq_resp.attctrl_H
        calc_data_coh = calc_freq_resp.attctrl_coh
        pred_data = pred_freq_resp.attctrl_ff_H  // attitude controller with feedforward
//        pred_data = pred_freq_resp.attctrl_nff_H  // attitude controller without feedforward

//        calc_data = calc_freq_resp.DRB_H  // calculated disturbance rejection
//        calc_data_coh = calc_freq_resp.DRB_coh  // calculated disturbance rejection coherence
//        pred_data = pred_freq_resp.DRB_H  // predicted disturbance rejection

//        pred_data = pred_freq_resp.attbl_H  // attitude stability
        pred_data_coh = calc_freq_resp.bareAC_coh
        show_set = true
    } else if (document.getElementById("type_Rate_Ctrlr").checked) {
        calc_data = calc_freq_resp.ratectrl_H
        calc_data_coh = calc_freq_resp.ratectrl_coh
        pred_data = pred_freq_resp.ratectrl_H
        pred_data_coh = calc_freq_resp.bareAC_coh
        show_set = true
    } else {
        calc_data = calc_freq_resp.bareAC_H
        calc_data_coh = calc_freq_resp.bareAC_coh
        pred_data = pred_freq_resp.ratectrl_H
        show_set = false
    }

    // Apply selected scale, set to y axis
    fft_plot.data[0].y = amplitude_scale.scale(complex_abs(calc_data))

    // Set bins
    fft_plot.data[0].x = scaled_bins

    // Work out if we should show this line
    fft_plot.data[0].visible = true

    var calc_plotted_phase = []
    if (unwrap_ph) {
        calc_plotted_phase = unwrap(array_scale(complex_phase(calc_data), 180 / Math.PI))
    } else {
        calc_plotted_phase = array_scale(complex_phase(calc_data), 180 / Math.PI)
    }
    // Apply selected scale, set to y axis
    fft_plot_Phase.data[0].y = calc_plotted_phase

    // Set bins
    fft_plot_Phase.data[0].x = scaled_bins

    // Work out if we should show this line
    fft_plot_Phase.data[0].visible = true

    // Apply selected scale, set to y axis
    fft_plot_Coh.data[0].y = calc_data_coh

    // Set bins
    fft_plot_Coh.data[0].x = scaled_bins

    // Work out if we should show this line
    fft_plot_Coh.data[0].visible = true

    // Apply selected scale, set to y axis
    fft_plot.data[1].y = amplitude_scale.scale(complex_abs(pred_data))

    // Set bins
    fft_plot.data[1].x = scaled_bins

    // Work out if we should show this line
    fft_plot.data[1].visible = show_set

    var pred_plotted_phase = []
    if (unwrap_ph) {
        pred_plotted_phase = unwrap(array_scale(complex_phase(pred_data), 180 / Math.PI))
    } else {
        pred_plotted_phase = array_scale(complex_phase(pred_data), 180 / Math.PI)
    }
    // Apply selected scale, set to y axis
    fft_plot_Phase.data[1].y = pred_plotted_phase

    // Set bins
    fft_plot_Phase.data[1].x = scaled_bins

    // Work out if we should show this line
    fft_plot_Phase.data[1].visible = show_set

    // Apply selected scale, set to y axis
    fft_plot_Coh.data[1].y = pred_data_coh

    // Set bins
    fft_plot_Coh.data[1].x = scaled_bins

    // Work out if we should show this line
    fft_plot_Coh.data[1].visible = show_set

    Plotly.redraw("FFTPlotMag")

    Plotly.redraw("FFTPlotPhase")

    Plotly.redraw("FFTPlotCoh")

    const end = performance.now();
    console.log(`freq response redraw took: ${end - start} ms`);
}
