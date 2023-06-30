// A js tool for plotting ArduPilot batch log data

// Use browser-cjs to load fft lib
// https://github.com/indutny/fft.js
// Much faster than math.fft!
const FFT_lib = require("https://unpkg.com/fft.js@4.0.4/lib/fft.js")

var DataflashParser
import('../JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

// Generic Class to hold source for notch target
class NotchTarget {
    constructor(log, msg_name, key_name, name, mode_value) {
        this.name = name
        this.mode_value = mode_value
        this.data = []

        // Don't always need log data (static notch)
        if (log == null) {
            return
        }

        // Grab data from log
        log.parseAtOffset(msg_name)
        if ((log.messages[msg_name] == null) || (Object.keys(log.messages[msg_name]).length == 0)) {
            return
        }

        // Grab all given keys to data struct
        const len = log.messages[msg_name].time_boot_ms.length
        this.data.time = new Array(len)
        this.data.value = new Array(len)
        for (var i=0; i < len; i++) {
            this.data.time[i] = log.messages[msg_name].time_boot_ms[i] / 1000
            this.data.value[i] = log.messages[msg_name][key_name][i]
        }
    }

    linear_interp(values, index, query_index) {
        var ret = []

        const data_points = index.length
        var interpolate_index = 0
        for (let i = 0; i < query_index.length; i++) {
            if (query_index[i] <= index[0]) {
                // Before start
                ret[i] = values[0]
                continue
            }
            if (query_index[i] >= index[data_points-1]) {
                // After end
                ret[i] = values[data_points-1]
                continue
            }

            // increment index until there is a point after the target
            for (interpolate_index; interpolate_index < data_points-2; interpolate_index++) {
                if (query_index[i] < index[interpolate_index+1]) {
                    const ratio = (query_index[i] - index[interpolate_index]) / (index[interpolate_index+1] - index[interpolate_index])
                    ret[i] = values[interpolate_index] + (values[interpolate_index+1] - values[interpolate_index]) * ratio
                    break
                }
            }

            if (interpolate_index == data_points-3) {
                // Got to the end
                ret[i] = values[data_points-1]
            }
        }
        return ret
    }

    interpolate(instance, time) {
        if (Object.keys(this.data).length == 0) {
            // No data
            return
        }
        if (this.data.interpolated == null) {
            this.data.interpolated = []
        }
        this.data.interpolated[instance] = this.linear_interp(this.data.value, this.data.time, time)
    }

    get_target_freq(config) {
        if ((Object.keys(this.data).length == 0) || (this.data.time == null)) {
            return
        }
        if (config.ref == 0) {
            return { freq:[config.freq, config.freq], time:[this.data.time[0], this.data.time[this.data.time.length]] }
        }
        const len = this.data.value.length
        var freq = new Array(len)
        for (let j=0;j<len;j++) {
            freq[j] = this.get_target_freq_index(config, j)
        }
        return { freq:freq, time:this.data.time }
    }

    get_interpolated_target_freq(instance, index, config) {
        if ((this.data.interpolated == null) || (this.data.interpolated[instance] == null) || (this.data.interpolated[instance].length == 0)) {
            return null
        }

        return [this.get_target(config, this.data.interpolated[instance][index])]
    }
}

// Tracking mode specific classes
class StaticTarget extends NotchTarget {
    constructor(log) {
        super(null, null, null, "Static", 0)
    }

    // Don't need to interpolate static
    interpolate(instance, time) { }

    get_target_freq(config) {
        return { freq:[config.freq, config.freq], time:[Gyro_batch.start_time, Gyro_batch.end_time] }
    }

    get_target_freq_time(config, time) {
        // Target is independent of time
        return [config.freq]
    }

    get_interpolated_target_freq(instance, index, config) {
        return [config.freq]
    }
}

class ThrottleTarget extends NotchTarget {
    constructor(log) {
        super(log, "RATE", "AOut", "Throttle", 1)
    }

    get_target(config, AOut) {
        const motors_throttle = Math.max(0, AOut)
        return config.freq * Math.max(config.min_ratio, Math.sqrt(motors_throttle / config.ref))
    }

    get_target_freq_index(config, index) {
        return this.get_target(config, this.data.value[index])
    }

}

class RPMTarget extends NotchTarget {
    constructor(log, instance, mode_value) {
        super(log, "RPM", "rpm" + instance, "RPM" + instance, mode_value)
    }

    get_target(config, rpm) {
        if (rpm > 0) {
            return Math.max(config.freq, rpm * config.ref * (1.0/60.0))
        }
        return config.freq
    }

    get_target_freq_index(config, index) {
        return this.get_target(config, this.data.value[index])
    }

}

class ESCTarget extends NotchTarget {
    constructor(log) {
        super(null, null, null, "ESC", 3)

        // Grab data from log, have to do it a little differently to get instances
        const msg = "ESC"
        log.parseAtOffset(msg)
        if ((log.messages[msg] == null) || (log.messages[msg].length == 0)) {
            return
        }

        // Individual RPM
        var instances = 0
        for (let i=0;i<16;i++) {
            const inst_msg = msg + "[" + i + "]"
            if (log.messages[inst_msg] != null) {
                this.data[i] = { time:[], freq:[] }
                for (var j=0; j < log.messages[inst_msg].time_boot_ms.length; j++) {
                    this.data[i].time[j] = log.messages[inst_msg].time_boot_ms[j] / 1000
                    this.data[i].freq[j] = log.messages[inst_msg].RPM[j] / 60
                }
                instances++
            }
        }

        // Average RPM
        this.data.avg_freq = []
        this.data.avg_time = []
        var inst = []
        for (let i=0;i<instances;i++) {
            inst[i] = { rpm:null, time_ms:null }
        }
        for (let i=0;i<log.messages[msg].length;i++) {
            // Update instance
            const instance = log.messages[msg][i].Instance
            const time_ms = log.messages[msg][i].time_boot_ms
            inst[instance].rpm = log.messages[msg][i].RPM
            inst[instance].time_ms = time_ms

            // Invalidate any instance that has timed out
            for (let j=0;j<instances;j++) {
                if ((j != instance) && (inst[j].time_ms != null) && ((time_ms - inst[j].time_ms) > 1000)) {
                    inst[j].time_ms = null
                    inst[j].rpm = null
                }
            }

            // If a full set of valid instances take average
            var expected_count = 0
            var count = 0
            var sum = 0
            for (let j=0;j<instances;j++) {
                if (inst[j].rpm != null) {
                    count++
                    sum += inst[j].rpm
                }
                if (inst[j].time_ms != null) {
                    expected_count++
                }
            }

            if ((count > 0) && (count == expected_count)) {
                this.data.avg_freq.push((sum / count) / 60)
                this.data.avg_time.push(time_ms / 1000)

                // Invalidate used values
                for (let j=0;j<instances;j++) {
                    inst[j].rpm = null
                }
            }
        }
    }

    interpolate(instance, time) {
        if (Object.keys(this.data).length == 0) {
            // No data
            return
        }
        if (this.data.interpolated == null) {
            this.data.interpolated = []
        }
        this.data.interpolated[instance] = []
        for (var j=0; j < this.data.length; j++) {
            this.data.interpolated[instance][j] = this.linear_interp(this.data[j].freq, this.data[j].time, time)
        }
        this.data.interpolated[instance].avg_freq = this.linear_interp(this.data.avg_freq, this.data.avg_time, time)
    }

    get_interpolated_target_freq(instance, index, config) {
        if ((this.data.interpolated == null) || (this.data.interpolated[instance] == null) || (this.data.interpolated[instance].length == 0)) {
            return null
        }

        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            const len = this.data.length
            let ret = new Array(len)
            for (var j=0; j < len; j++) {
                ret[j] = this.get_target(config, this.data.interpolated[instance][j][index])
            }
            return ret
        }
        
        return [this.get_target(config, this.data.interpolated[instance].avg_freq[index])]
    }

    get_target(config, rpm) {
        return Math.max(rpm, config.freq)
    }

    get_target_freq(config) {
        if (this.data.length == 0) {
            return
        }

        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            // Tracking individual motor RPM's
            const len = this.data.length
            let freq = new Array(len)
            let time = new Array(len)

            for (let i = 0; i < len; i++) {
                let inst_freq = this.data[i].freq
                for (let j = 0; j < inst_freq.length; j++) {
                    inst_freq[j] = this.get_target(config, inst_freq[j])
                }

                time[i] = this.data[i].time
                freq[i] = inst_freq
            }
            return { freq:freq, time:time }

        }

        // Tracking average motor rpm
        let freq = this.data.avg_freq
        for (let j = 0; j < freq.length; j++) {
            freq[j] = this.get_target(config, freq[j])
        }

        return { freq:freq, time:this.data.avg_time }
    }
}

class FFTTarget extends NotchTarget {
    constructor(log) {
        super(log, "FTN1", "PkAvg", "FFT", 4)

        // Grab data from log, have to do it a little differently to get instances
        const msg = "FTN2"
        log.parseAtOffset(msg)
        if ((log.messages[msg] == null) || (log.messages[msg].length == 0)) {
            return
        }

        for (let i=0;i<3;i++) {
            // FFT can track three peaks
            const inst_msg = msg + "[" + i + "]"
            if (log.messages[inst_msg] != null) {
                this.data[i] = { time:[], freq:[] }
                for (var j=0; j < log.messages[inst_msg].time_boot_ms.length; j++) {

                    // Do noise weighting between axis to get a single frequency
                    // Same as `get_weighted_freq_hz` function in AP_GyroFFT
                    const energy_x = log.messages[inst_msg].EnX[j]
                    const energy_y = log.messages[inst_msg].EnY[j]
                    const freq_x = log.messages[inst_msg].PkX[j]
                    const freq_y = log.messages[inst_msg].PkY[j]

                    if ((energy_x > 0) && (energy_y > 0)) {
                        // Weighted by relative energy
                        this.data[i].freq[j] = (freq_x*energy_x + freq_y*energy_y) / (energy_x + energy_y)
                    } else {
                        // Just take average
                        this.data[i].freq[j] = (freq_x + freq_y) * 0.5
                    }
                    this.data[i].time[j] = log.messages[inst_msg].time_boot_ms[j] / 1000
                }
            }
        }
    }

    interpolate(instance, time) {
        if (Object.keys(this.data).length == 0) {
            // No data
            return
        }
        if (this.data.interpolated == null) {
            this.data.interpolated = []
        }
        this.data.interpolated[instance] = []
        for (var j=0; j < this.data.length; j++) {
            this.data.interpolated[instance][j] = this.linear_interp(this.data[j].freq, this.data[j].time, time)
        }
        this.data.interpolated[instance].value = this.linear_interp(this.data.value, this.data.time, time)
    }

    get_interpolated_target_freq(instance, index, config) {
        if ((this.data.interpolated == null) || (this.data.interpolated[instance] == null) || (this.data.interpolated[instance].length == 0)) {
            return null
        }

        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            const len = this.data.length
            let ret = new Array(len)
            for (var j=0; j < len; j++) {
                ret[j] = this.get_target(config, this.data.interpolated[instance][j][index])
            }
            return ret
        }
        
        return [this.get_target(config, this.data.interpolated[instance].avg_freq[index])]
    }

    get_target(config, rpm) {
        return Math.max(rpm, config.freq)
    }

    get_target_freq(config) {
        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            // Tracking multiple peaks
            const len = this.data.length
            let freq = new Array(len)
            let time = new Array(len)

            for (let i = 0; i < len; i++) {
                let inst_freq = this.data[i].freq
                for (let j = 0; j < inst_freq.length; j++) {
                    inst_freq[j] = this.get_target(config, inst_freq[j])
                }

                time[i] = this.data[i].time
                freq[i] = inst_freq
            }
            return { freq:freq, time:time }
        }

        // Just center peak
        let freq = this.data.value
        for (let j = 0; j < freq.length; j++) {
            freq[j] = this.get_target(config, freq[j])
        }
        return { freq:freq, time:this.data.time }
    }
}

function DigitalBiquadFilter(freq) {
    this.target_freq = freq

    if (this.target_freq <= 0) {
        this.transfer = function(Hn, Hd, sample_freq, Z1, Z2) { }
        return this;
    }

    this.transfer = function(Hn, Hd, sample_freq, Z1, Z2) {

        const fr = sample_freq/this.target_freq;
        const ohm = Math.tan(Math.PI/fr);
        const c = 1.0+2.0*Math.cos(Math.PI/4.0)*ohm + ohm*ohm;

        const b0 = ohm*ohm/c;
        const b1 = 2.0*b0;
        const b2 = b0;
        const a1 = 2.0*(ohm*ohm-1.0)/c;
        const a2 = (1.0-2.0*Math.cos(Math.PI/4.0)*ohm+ohm*ohm)/c;

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

function NotchFilter(attenuation_dB, bandwidth_hz, harmonic_mul) {
    this.attenuation_dB = attenuation_dB
    this.bandwidth_hz = bandwidth_hz
    this.harmonic_mul = (harmonic_mul != null) ? harmonic_mul : 1
    this.Asq = (10.0**(-this.attenuation_dB / 40.0))**2

    this.transfer = function(Hn, Hd, center, sample_freq, Z1, Z2) {
        const center_freq_hz = center * this.harmonic_mul

        // check center frequency is in the allowable range
        if ((center_freq_hz <= 0.5 * this.bandwidth_hz) || (center_freq_hz >= 0.5 * sample_freq)) {
            return
        }

        const octaves = Math.log2(center_freq_hz / (center_freq_hz - this.bandwidth_hz / 2.0)) * 2.0
        const Q = ((2.0**octaves)**0.5) / ((2.0**octaves) - 1.0)

        const omega = 2.0 * Math.PI * center_freq_hz / sample_freq
        const alpha = Math.sin(omega) / (2 * Q)
        const b0 =  1.0 + alpha*this.Asq
        const b1 = -2.0 * Math.cos(omega)
        const b2 =  1.0 - alpha*this.Asq
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

function MultiNotch(attenuation_dB, bandwidth_hz, harmonic, num) {
    this.bandwidth = bandwidth_hz
    this.harmonic = harmonic

    const bw_scaled = this.bandwidth / num

    this.notches = []
    this.notches.push(new NotchFilter(attenuation_dB, bw_scaled))
    this.notches.push(new NotchFilter(attenuation_dB, bw_scaled))
    if (num == 3) {
        this.notches.push(new NotchFilter(attenuation_dB, bw_scaled))
    }

    this.transfer = function(Hn, Hd, center, sample_freq, Z1, Z2) {
        center = center * this.harmonic

        // Calculate spread required to achieve an equivalent single notch using two notches with Bandwidth/2
        const notch_spread = this.bandwidth / (32.0 * center);

        const bandwidth_limit = this.bandwidth * 0.52
        const nyquist_limit = sample_freq * 0.48
        center = Math.min(Math.max(center, bandwidth_limit), nyquist_limit)

        this.notches[0].transfer(Hn, Hd, center*(1-notch_spread), sample_freq, Z1, Z2)
        this.notches[1].transfer(Hn, Hd, center*(1+notch_spread), sample_freq, Z1, Z2)
        if (this.notches.length == 3) {
            this.notches[2].transfer(Hn, Hd, center, sample_freq, Z1, Z2)
        }
    }

    return this
}



function HarmonicNotchFilter(params) {
    this.active = false
    this.params = params

    // Find tracking source
    this.tracking = null
    for (let j=0;j<tracking_methods.length;j++) {
        if (this.params.mode == tracking_methods[j].mode_value) {
            this.tracking = tracking_methods[j]
            break
        }
    }

    this.enabled = function() {
        return (this.params.enable > 0) && (this.tracking != null)
    }

    this.static = function() {
        return this.tracking.mode_value == 0
    }

    if (!this.enabled()) {
        // Disabled
        this.transfer = function(Hn, Hd, instance, index, sample_freq, Z1, Z2) { }
        return this
    }
    this.active = true

    const triple = (this.params.options & 16) != 0
    const double = (this.params.options & 1) != 0
    const single = !double && !triple

    this.notches = []
    for (var n=0; n<max_num_harmonics; n++) {
        if (this.params.harmonics & (1<<n)) {
            const harmonic = n + 1
            const bandwidth = this.params.bandwidth * harmonic
            if (single) {
                this.notches.push(new NotchFilter(this.params.attenuation, bandwidth, harmonic))
            } else {
                this.notches.push(new MultiNotch(this.params.attenuation, bandwidth, harmonic, double ? 2 : 3))
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

    this.harmonics = function() {
        return this.params.harmonics
    }
    return this
}

// return hanning window array of given length (in tensorflow format)
function hanning(len) {
    let w = new Array(len)
    const scale = (2*Math.PI) / (len - 1)
    for (let i=0; i<len; i++) {
        w[i] = 0.5 - 0.5 * Math.cos(scale * i)
    }
    return w
}

// Calculate correction factors for linear and energy spectrum (window in tensorflow format)
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
    const num_batch = data_set.length
    const num_points = data_set[0].x.length

    var sample_rate_sum = 0
    for (let i=0;i<num_batch;i++) {
        if ((data_set[i].x.length != num_points) || (data_set[i].y.length != num_points) || (data_set[i].z.length != num_points)) {
            console.log("Uneven batch sizes")
            return
        }
        sample_rate_sum += data_set[0].sample_rate
    }

    // Average sample time
    const sample_time = num_batch / sample_rate_sum


    // Hard code 50% overlap
    const window_overlap = 0.5

    var window_size
    if (Gyro_batch.type == "batch") {
        // Must have at least one window
        const window_per_batch = Math.max(parseInt(document.getElementById("FFTWindow_per_batch").value), 1)

        // Calculate window size for given number of windows and overlap
        window_size = Math.floor(num_points / (1 + (window_per_batch - 1)*(1-window_overlap)))

    } else {
        window_size = Math.min(parseInt(document.getElementById("FFTWindow_size").value), num_points)

    }

    const window_spacing = Math.round(window_size * (1 - window_overlap))
    const windowing_function = hanning(window_size)

    // Get windowing correction factors for use later when plotting
    const window_correction = window_correction_factors(windowing_function)

    // Get bins
    var bins = rfft_freq(window_size, sample_time)

    const fft = new FFT_lib(window_size);

    var x = []
    var y = []
    var z = []

    var time = []

    for (let i=0;i<num_batch;i++) {
        var ret = run_fft(data_set[i], window_size, window_spacing, windowing_function, fft)

        time.push(...array_offset(array_scale(ret.center, sample_time), data_set[i].sample_time))
        x.push(...ret.x)
        y.push(...ret.y)
        z.push(...ret.z)

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

    document.getElementById("FFTWindow_per_batch").disabled = true
    document.getElementById("FFTWindow_size").disabled = true
    document.getElementById("TimeStart").disabled = true
    document.getElementById("TimeEnd").disabled = true
    document.getElementById("calculate").disabled = true
    document.getElementById("calculate_filters").disabled = true

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
    document.getElementById("INS_GYRO_FILTER").disabled = true
    const notch_params = get_HNotch_param_names()
    for (let i = 0; i < notch_params.length; i++) {
        for (param of Object.values(notch_params[i])) {
            document.getElementById(param).disabled = true
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
    }

}

// Setup plots with no data
var Spectrogram = {}
var fft_plot = {}
var Bode = {}
var flight_data = {}
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
                const name = axis[j] + " " + plot_types[n]
                fft_plot.data[get_FFT_data_index(i, n, j)] = { mode: "lines",
                                                                name: name,
                                                                // this extra data allows us to put the name in the hover tool tip
                                                                meta: name,
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
    Plotly.newPlot(plot, fft_plot.data, fft_plot.layout, {displaylogo: false});

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
    Plotly.newPlot(plot, Bode.data, Bode.layout, {displaylogo: false});

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
            let name = (j == 0) ? "Fundamental" : "Harmonic " + j
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
                          ["Bode", "x", "", Bode],
                          ["Bode", "x", "2", Bode],
                          ["Spectrogram", "y", "", Spectrogram]])

    // Link all reset calls
    const reset_link = [["FFTPlot", fft_plot],
                        ["Bode", Bode],
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
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        if (Gyro_batch[i].FFT == null) {
            Gyro_batch[i].FFT = run_batch_fft(Gyro_batch[i])
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
            if ((Gyro_batch[j] == null) || Gyro_batch[j].sensor_num != i) {
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
            const Z = exp_jw(Gyro_batch[i].FFT.bins, Gyro_batch[i].gyro_rate)

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
            Gyro_batch[i].FFT.bode.freq = math.range(0, max_freq, freq_step, true)._data

            // Calculate Z for transfer function
            // Z = e^jw
            const bode_Z = exp_jw(Gyro_batch[i].FFT.bode.freq, Gyro_batch[i].gyro_rate)

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
            Gyro_batch[i].FFT.H = calc(i, Gyro_batch[i].FFT.time, Gyro_batch[i].gyro_rate, Gyro_batch[i].FFT.Z1, Gyro_batch[i].FFT.Z2)

        }
        if (Gyro_batch[i].FFT.bode != null) {
            // Use post filter if available

            // Higher frequency resolution for bode plot
            Gyro_batch[i].FFT.bode.H = calc(i, Gyro_batch[i].FFT.time, Gyro_batch[i].gyro_rate, Gyro_batch[i].FFT.bode.Z1, Gyro_batch[i].FFT.bode.Z2)
        }
    }

    // Just updated, disable calc button
    document.getElementById("calculate_filters").disabled = true
}


// Get configured amplitude scale
function get_amplitude_scale() {

    const use_DB = document.getElementById("ScaleLog").checked;
    const use_PSD = document.getElementById("ScalePSD").checked;

    var ret = {}
    if (use_PSD) {
        ret.fun = function (x) { return array_scale(array_log10(array_mul(x,x)), 10.0) } // 10 * log10(x.^2)
        ret.label = "PSD (dB/Hz)"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} dB/Hz" }
        ret.window_correction = function(correction) { return correction.energy * Math.SQRT1_2 }

    } else if (use_DB) {
        ret.fun = function (x) { return array_scale(array_log10(x), 20.0) } // 20 * log10(x)
        ret.label = "Amplitude (dB)"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} dB" }
        ret.correction_scale = 1.0
        ret.window_correction = function(correction) { return correction.linear }

    } else {
        ret.fun = function (x) { return x }
        ret.label = "Amplitude"
        ret.hover = function (axis) { return "%{" + axis + ":.2f}" }
        ret.window_correction = function(correction) { return correction.linear }

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

    var end_index = time.length
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
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null)) {
            continue
        }

        // Find the start and end index
        const start_index = find_start_index(Gyro_batch[i].FFT.time)
        const end_index = find_end_index(Gyro_batch[i].FFT.time)

        // Number of windows to plot
        const plot_length = end_index - start_index

        // Windowing amplitude correction depends on spectrum of interest
        const window_correction = amplitude_scale.window_correction(Gyro_batch[i].FFT.correction)

        // Take mean from start to end
        const fft_len = Gyro_batch[i].FFT.x[0].length
        var fft_mean_x = (new Array(fft_len)).fill(0)
        var fft_mean_y = (new Array(fft_len)).fill(0)
        var fft_mean_z = (new Array(fft_len)).fill(0)
        for (let j=start_index;j<end_index;j++) {
            // Add to mean sum
            fft_mean_x = array_add(fft_mean_x, amplitude_scale.fun(array_scale(Gyro_batch[i].FFT.x[j], window_correction)))
            fft_mean_y = array_add(fft_mean_y, amplitude_scale.fun(array_scale(Gyro_batch[i].FFT.y[j], window_correction)))
            fft_mean_z = array_add(fft_mean_z, amplitude_scale.fun(array_scale(Gyro_batch[i].FFT.z[j], window_correction)))
        }

        let plot_type = Gyro_batch[i].post_filter ? 1 : 0

        let X_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, plot_type, 0)
        let Y_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, plot_type, 1)
        let Z_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, plot_type, 2)

        // Set scaled y data
        fft_plot.data[X_plot_index].y = array_scale(fft_mean_x, 1 / plot_length)
        fft_plot.data[Y_plot_index].y = array_scale(fft_mean_y, 1 / plot_length)
        fft_plot.data[Z_plot_index].y = array_scale(fft_mean_z, 1 / plot_length)

        // Set scaled x data
        const scaled_bins = frequency_scale.fun(Gyro_batch[i].FFT.bins)
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
        if (filters.notch[i].active == false) {
            continue
        }

        const fundamental = filters.notch[i].get_target_freq()

        function get_mean_and_range(time, freq) {
            // Find the start and end index
            const start_index = find_start_index(time)
            const end_index = find_end_index(time)

            // Take mean and range from start to end
            var mean = 0
            var min = null
            var max = null
            for (let j=start_index;j<end_index;j++) {
                mean += freq[j]
                if ((min == null) || (freq[j] < min)) {
                    min = freq[j]
                }
                if ((max == null) || (freq[j] > max)) {
                    max = freq[j]
                }
            }
            mean /= end_index - start_index

            return { mean: mean, min:min, max:max}
        }

        var mean
        var min
        var max
        if (!Array.isArray(fundamental.time[0])) {
            // Single peak
            let mean_range = get_mean_and_range(fundamental.time, fundamental.freq)
            mean = mean_range.mean
            min = mean_range.min
            max = mean_range.max

        } else {
            // Combine multiple peaks
            mean = 0
            min = null
            max = null
            for (let j=0;j<fundamental.time.length;j++) {
                let mean_range = get_mean_and_range(fundamental.time[j], fundamental.freq[j])
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

        const show_notch = document.getElementById("Notch" + (i+1) + "Show").checked
        for (let j=0;j<max_num_harmonics;j++) {
            if ((filters.notch[i].harmonics() & (1<<j)) == 0) {
                continue
            }
            const harmonic_freq = frequency_scale.fun(mean * (j+1))

            const line_index = (i*max_num_harmonics*2) + j*2
            fft_plot.layout.shapes[line_index].visible = show_notch
            fft_plot.layout.shapes[line_index].x0 = harmonic_freq
            fft_plot.layout.shapes[line_index].x1 = harmonic_freq

            const min_freq = frequency_scale.fun(min * (j+1))
            const max_freq = frequency_scale.fun(max * (j+1))

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
    var quantization_noise
    if (Gyro_batch.type == "batch") {
        // white noise noise model
        // https://en.wikipedia.org/wiki/Quantization_(signal_processing)#Quantization_noise_model
        // See also Analog Devices:
        // "Taking the Mystery out of the Infamous Formula, "SNR = 6.02N + 1.76dB," and Why You Should Care"
        // The 16 here is the number of bits in the batch log
        quantization_noise = 1 / (Math.sqrt(3) * 2**(16-0.5))

    } else {
        // Raw logging uses floats, quantization noise probably negligible (not yet investigated)
        quantization_noise = 0
    }

    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null) || (Gyro_batch[i].FFT.H == null)) {
            continue
        }

        // Find the start and end index
        const start_index = find_start_index(Gyro_batch[i].FFT.time)
        const end_index = find_end_index(Gyro_batch[i].FFT.time)

        // Windowing amplitude correction depends on spectrum of interest
        const window_correction = amplitude_scale.window_correction(Gyro_batch[i].FFT.correction)

        // Scale factor to get mean from accumulated samples
        const mean_scale = 1 / (end_index - start_index)

        // Estimate filtered from pre-filter data
        const fft_len = Gyro_batch[i].FFT.x[0].length
        let fft_mean_x = (new Array(fft_len)).fill(0)
        let fft_mean_y = (new Array(fft_len)).fill(0)
        let fft_mean_z = (new Array(fft_len)).fill(0)
        for (let j=start_index;j<end_index;j++) {
            const attenuation = complex_abs(Gyro_batch[i].FFT.H[j])

            // Apply window correction
            const corrected_x = array_scale(Gyro_batch[i].FFT.x[j], window_correction)
            const corrected_y = array_scale(Gyro_batch[i].FFT.y[j], window_correction)
            const corrected_z = array_scale(Gyro_batch[i].FFT.z[j], window_correction)

            // Subtract noise, apply transfer function, re-apply noise
            // Strictly we need not bother with noise, it makes the estimate less accurate
            // However it does result in a good match to logged post filter data making it easy to verify the estimates
            const filtered_x = array_offset(array_mul(array_offset(corrected_x, -quantization_noise), attenuation), quantization_noise)
            const filtered_y = array_offset(array_mul(array_offset(corrected_y, -quantization_noise), attenuation), quantization_noise)
            const filtered_z = array_offset(array_mul(array_offset(corrected_z, -quantization_noise), attenuation), quantization_noise)

            // Add to mean sum
            fft_mean_x = array_add(fft_mean_x, amplitude_scale.fun(filtered_x))
            fft_mean_y = array_add(fft_mean_y, amplitude_scale.fun(filtered_y))
            fft_mean_z = array_add(fft_mean_z, amplitude_scale.fun(filtered_z))
        }

        X_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, 2, 0)
        Y_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, 2, 1)
        Z_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, 2, 2)

        // Set scaled y data
        fft_plot.data[X_plot_index].y = array_scale(fft_mean_x, mean_scale)
        fft_plot.data[Y_plot_index].y = array_scale(fft_mean_y, mean_scale)
        fft_plot.data[Z_plot_index].y = array_scale(fft_mean_z, mean_scale)

        // Set scaled x data
        const scaled_bins = frequency_scale.fun(Gyro_batch[i].FFT.bins)
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

    // Find the start and end index
    const start_index = find_start_index(Gyro_batch[index].FFT.time)
    const end_index = find_end_index(Gyro_batch[index].FFT.time)

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
    Bode.data[2].y = amplitude_scale.fun(Amp_mean)
    Bode.data[3].y = scaled_phase[0]

    const area_freq = [...scaled_bode_freq, ...scaled_bode_freq.toReversed()]
    Bode.data[0].x = area_freq
    Bode.data[0].y = amplitude_scale.fun([...Amp_max, ...Amp_min.toReversed()])

    Bode.data[1].x = area_freq
    Bode.data[1].y = [...scaled_phase[1], ...scaled_phase[2].toReversed()]

    Plotly.redraw("Bode")

}

// Find the instance of "Gyro_batch" that matches the selection
function find_instance(gyro_instance, post_filter) {
    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null)) {
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

    // Setup xy data (x and y swapped because transpose flag is set)
    Spectrogram.data[0].x = Gyro_batch[batch_instance].FFT.time
    Spectrogram.data[0].y = frequency_scale.fun(Gyro_batch[batch_instance].FFT.bins)

    // Windowing amplitude correction depends on spectrum of interest
    const window_correction = amplitude_scale.window_correction(Gyro_batch[batch_instance].FFT.correction)

    var quantization_noise
    if (Gyro_batch.type == "batch") {
        // white noise noise model
        // https://en.wikipedia.org/wiki/Quantization_(signal_processing)#Quantization_noise_model
        // See also Analog Devices:
        // "Taking the Mystery out of the Infamous Formula, "SNR = 6.02N + 1.76dB," and Why You Should Care"
        // The 16 here is the number of bits in the batch log
        quantization_noise = 1 / (Math.sqrt(3) * 2**(16-0.5))

    } else {
        // Raw logging uses floats, quantization noise probably negligible (not yet investigated)
        quantization_noise = 0
    }


    // Setup z data
    const len = Gyro_batch[batch_instance].FFT[axis].length
    Spectrogram.data[0].z = new Array(len)
    for (j = 0; j<len; j++) {

        var amplitude = array_scale(Gyro_batch[batch_instance].FFT[axis][j], window_correction)
        if (estimated) {
            const attenuation = complex_abs(Gyro_batch[batch_instance].FFT.H[j])
            amplitude = array_offset(array_mul(array_offset(amplitude, -quantization_noise), attenuation), quantization_noise)
        }
        Spectrogram.data[0].z[j] = amplitude_scale.fun(amplitude)
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
        if (filters.notch[i].active == false) {
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
        for (let j=0;j<max_num_harmonics;j++) {
            if ((filters.notch[i].harmonics() & (1<<j)) == 0) {
                continue
            }
            const harmonic_freq = array_scale(freq, j+1)

            Spectrogram.data[plot_offset + j].visible = true
            Spectrogram.data[plot_offset + j].x = time
            Spectrogram.data[plot_offset + j].y = frequency_scale.fun(harmonic_freq)
            Spectrogram.data[plot_offset + j].hovertemplate = tracking_hovertemplate
            Spectrogram.data[plot_offset + j].legendgrouptitle.text = Group_name
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

// Grab param from log
function get_param_value(param_log, name) {
    var value
    for (let i = 0; i < param_log.Name.length; i++) {
        if (param_log.Name[i] === name) {
            if ((value != null) && (value != param_log.Value[i])) {
                console.log("Param changed in flight: " + name)
            }
            value = param_log.Value[i]
        }
    }
    return value
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
    filters = []
    const HNotch_params = get_HNotch_param_names()

    // Load static
    filters.static = new DigitalBiquadFilter(parseFloat(document.getElementById("INS_GYRO_FILTER").value))

    // Load harmonic notches
    filters.notch = []
    for (let i = 0; i < HNotch_params.length; i++) {
        params = []
        for (const [key, value] of Object.entries(HNotch_params[i])) {
            params[key] = parseFloat(document.getElementById(value).value)
        }
        filters.notch.push(new HarmonicNotchFilter(params))

        document.getElementById("Notch" + (i+1) + "Show").disabled = !filters.notch[i].active
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
                document.getElementById(value).disabled = !enable_input
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

// Load from batch logging messages
function load_from_batch(log, num_gyro, gyro_rate) {
    Gyro_batch = []
    Gyro_batch.type = "batch"

    // Assign batches to each sensor
    // Only interested in gyro here
    const IMU_SENSOR_TYPE_GYRO = 1
    let data_index = 0
    for (let i = 0; i < log.messages.ISBH.N.length; i++) {
        // Parse headers
        if (log.messages.ISBH.type[i] != IMU_SENSOR_TYPE_GYRO) {
            continue
        }

        const instance = log.messages.ISBH.instance[i]
        if (Gyro_batch[instance] == null) {
            Gyro_batch[instance] = []
        }

        let decode_complete = false

        // Advance data index until sequence match
        const seq_num = log.messages.ISBH.N[i]
        while (log.messages.ISBD.N[data_index] != seq_num) {
            data_index++
            if (data_index >= log.messages.ISBD.N.length) {
                // This is expected at the end of a log, no more msgs to add, break here
                console.log("Could not find next sequence " + i + " of " + log.messages.ISBH.N.length-1)
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
        const num_samples = log.messages.ISBH.smp_cnt[i]
        const num_data_msg = num_samples / 32
        for (let j = 0; j < num_data_msg; j++) {
            // Read in expected number of samples
            if ((log.messages.ISBD.N[data_index] != seq_num) || (log.messages.ISBD.seqno[data_index] != j)) {
                console.log("Missing or extra data msg")
                return
            }

            // Accumulate data for this batch
            x.push(...log.messages.ISBD.x[data_index])
            y.push(...log.messages.ISBD.y[data_index])
            z.push(...log.messages.ISBD.z[data_index])

            data_index++
            if (data_index >= log.messages.ISBD.N.length) {
                console.log("Sequence incomplete " + i + " of " + (log.messages.ISBH.N.length-1) + ", Got " + (j+1) + " batches out of " + num_data_msg)
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
        const mul = 1/log.messages.ISBH.mul[i]
        x = array_scale(x, mul)
        y = array_scale(y, mul)
        z = array_scale(z, mul)

        // Add to batches for this instance
        Gyro_batch[instance].push({ sample_time: log.messages.ISBH.SampleUS[i] / 1000000,
                                    sample_rate: log.messages.ISBH.smp_rate[i],
                                    x: x,
                                    y: y,
                                    z: z })
    }

    // Work out if logging is pre/post from param value
    const INS_LOG_BAT_OPT = get_param_value(log.messages.PARM, "INS_LOG_BAT_OPT")
    const _doing_sensor_rate_logging = (INS_LOG_BAT_OPT & (1 << 0)) != 0
    const _doing_post_filter_logging = (INS_LOG_BAT_OPT & (1 << 1)) != 0
    const _doing_pre_post_filter_logging = (INS_LOG_BAT_OPT & (1 << 2)) != 0
    const use_instance_offset = _doing_pre_post_filter_logging || (_doing_post_filter_logging && _doing_sensor_rate_logging)
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
        Gyro_batch[i].gyro_rate = Math.max(gyro_rate[Gyro_batch[i].sensor_num], max_logging_rate[Gyro_batch[i].sensor_num])
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
function load_from_raw_log(log, num_gyro, gyro_rate) {
    Gyro_batch = []
    Gyro_batch.type = "raw"

    // Work out if logging is pre/post from param value
    const INS_LOG_BAT_OPT = get_param_value(log.messages.PARM, "INS_LOG_BAT_OPT")
    const post_filter = (INS_LOG_BAT_OPT & (1 << 1)) != 0

    // Load in a one massive batch
    for (let i = 0; i < 3; i++) {
        const instance_name = "GYR[" + i + "]"
        if (log.messages[instance_name].length == 0) {
            continue
        }

        Gyro_batch[i] = []

        // Assume a constant sample rate for the FFT
        const sample_rate = 1000000 / math.mean(math.diff(Array.from(log.messages[instance_name].SampleUS)))

        // Use first sample time as stamp for this "batch"
        Gyro_batch[i].push({ sample_time: log.messages[instance_name].SampleUS[0] / 1000000,
                             sample_rate: sample_rate,
                             x: Array.from(log.messages[instance_name].GyrX),
                             y: Array.from(log.messages[instance_name].GyrY),
                             z: Array.from(log.messages[instance_name].GyrZ)})

        Gyro_batch[i].sensor_num = i
        Gyro_batch[i].post_filter = post_filter
        Gyro_batch[i].gyro_rate = Math.max(gyro_rate[i], sample_rate)
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

        const batch_end = batch_start + (Gyro_batch[i][0].x.length / Gyro_batch[i][0].sample_rate)
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
var filters
function load(log_file) {

    const start = performance.now()

    // Reset buttons and labels
    reset()

    let log = new DataflashParser()
    log.processData(log_file, ['PARM', 'IMU'])

    if ((Object.keys(log.messages.PARM).length == 0) && (Object.keys(log.messages.IMU).length == 0)) {
        alert("No params or IMU in log")
        return
    }

    // Try and decode device IDs and rate
    var num_gyro = 0
    var gyro_rate = []
    for (let i = 0; i < 3; i++) {
        const ID_param = i == 0 ? "INS_GYR_ID" : "INS_GYR" + (i + 1) + "_ID"
        const ID = get_param_value(log.messages.PARM, ID_param)
        if ((ID != null) && (ID > 0)) {
            const decoded = decode_devid(ID, DEVICE_TYPE_IMU)

            if (log.messages.IMU != null) {
                // Assume constant rate, this is not actually true, but variable rate breaks FFT averaging.
                gyro_rate[i] = math.mean(Array.from(log.messages["IMU[" + i + "]"].GHz))
            } else {
                // Use default
                gyro_rate[i] = 1000
            }

            if (decoded != null) {
                document.getElementById("Gyro" + i + "_info").innerHTML = decoded.name + " via " + decoded.bus_type + " at " + Math.round(gyro_rate[i]) + " Hz"
            }
            num_gyro++
        }
    }

    // Check for some data that we can use
    log.parseAtOffset("ISBH")
    log.parseAtOffset("ISBD")
    log.parseAtOffset("GYR")
    const have_batch_log = (Object.keys(log.messages.ISBH).length > 0) && (Object.keys(log.messages.ISBD).length > 0)
    const have_raw_log = Object.keys(log.messages.GYR).length > 0

    if (!have_batch_log && !have_raw_log) {
        alert("No batch data or raw IMU found in log")
        return
    }

    // Update interface and work out which log type to use
    var use_batch
    if (have_batch_log && !have_raw_log) {
        // Only have batch log
        document.getElementById("log_type_batch").checked = true
        document.getElementById("log_type_raw").disabled = true
        use_batch = true

    } else if (have_raw_log && !have_batch_log) {
        // Only have raw log
        document.getElementById("log_type_raw").checked = true
        document.getElementById("log_type_batch").disabled = true
        use_batch = false

    } else {
        // Have both, use selected
        use_batch = document.getElementById("log_type_batch").checked
    }
    document.getElementById("FFTWindow_size").disabled = use_batch
    document.getElementById("FFTWindow_per_batch").disabled = !use_batch


    if (use_batch) {
        load_from_batch(log, num_gyro, gyro_rate)

    } else {
        load_from_raw_log(log, num_gyro, gyro_rate)

    }

    // Delete log data now it has been used
    delete log.messages.ISBH
    delete log.messages.ISBD
    delete log.messages.GYR

    // Load potential sources of notch tracking targets
    tracking_methods = [new StaticTarget(),
                        new ThrottleTarget(log),
                        new RPMTarget(log, 1, 2),
                        new ESCTarget(log),
                        new FFTTarget(log),
                        new RPMTarget(log, 2, 5)]

    // Read from log into HTML box
    const HNotch_params = get_HNotch_param_names()
    for (let i = 0; i < HNotch_params.length; i++) {
        for (const param of Object.values(HNotch_params[i])) {
            const value = get_param_value(log.messages.PARM, param)
            if (value != null) {
                document.getElementById(param).value = value
            }
        }
    }
    const value = get_param_value(log.messages.PARM, "INS_GYRO_FILTER")
    if (value != null) {
        document.getElementById("INS_GYRO_FILTER").value = value
    }

    // Plot flight data from log
    log.parseAtOffset("ATT")

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

    // Were now done with the log, delete it to save memory before starting caculations
    delete log.buffer
    delete log.data
    delete log.messages
    log_file = null
    log = null

    // Enable top level filter params
    document.getElementById("INS_GYRO_FILTER").disabled = false
    document.getElementById("INS_HNTCH_ENABLE").disabled = false
    document.getElementById("INS_HNTC2_ENABLE").disabled = false

    // Load filters from params
    filter_param_read()
    load_filters()

    // Update ranges of start and end time
    start_time = Math.floor(Gyro_batch.start_time)
    end_time = Math.ceil(Gyro_batch.end_time)

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

    // Enable checkboxes for sensors which are present
    var first_gyro
    Gyro_batch.have_pre = false
    Gyro_batch.have_post = false
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        const prepost = Gyro_batch[i].post_filter ? "Post" : "Pre"
        for (let j = 0; j < 3; j++) {
            var fft_check = document.getElementById("Gyro" + Gyro_batch[i].sensor_num + prepost + axis[j])
            fft_check.disabled = false
            fft_check.checked = true
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
        document.getElementById("SpecGyroAxisX").checked = true
        document.getElementById("SpecGyroAxisY").disabled = false
        document.getElementById("SpecGyroAxisZ").disabled = false
    }

    // Default spectrograph to first sensor, pre if available and X axis
    document.getElementById("SpecGyroInst" + first_gyro).checked = true
    document.getElementById("SpecGyro" + (Gyro_batch.have_pre ? "Pre" : "Post")).checked = true
    document.getElementById("SpecGyroAxisX").disabled = false
    document.getElementById("BodeGyroInst" + first_gyro).checked = true

    // Enable estimated post filter if there is pre filter data
    if (Gyro_batch.have_pre) {
        for (let i = 0; i < Gyro_batch.length; i++) {
            if (Gyro_batch[i] == null) {
                continue
            }
            for (let j = 0; j < 3; j++) {
                let fft_check = document.getElementById("Gyro" + Gyro_batch[i].sensor_num + "PostEst" + axis[j])
                fft_check.disabled = false
                // Show estimated by default if there is no post filter data
                fft_check.checked = !Gyro_batch.have_post
                fft_plot.data[get_FFT_data_index(Gyro_batch[i].sensor_num, 2, j)].visible = !Gyro_batch.have_post
            }
        }
    }
    document.getElementById("SpecGyroEstPost").disabled = !Gyro_batch.have_pre

    // Calculate FFT
    calculate()

    // Update transfer function from filter setting
    calculate_transfer_function()

    // Plot
    redraw()

    Plotly.redraw("FlightData")

    const end = performance.now();
    console.log(`Load took: ${end - start} ms`);
}
