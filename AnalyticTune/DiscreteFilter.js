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

    console.log("Evaluating transfer functions",freq_step,freq_max)
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
