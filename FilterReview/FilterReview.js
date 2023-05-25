// A js tool for plotting ArduPilot batch log data

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
        this.data.time = []
        this.data.value = []
        for (var i=0; i < log.messages[msg_name].time_boot_ms.length; i++) {
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
        const start_index = find_start_index(this.data.time)
        const end_index = find_end_index(this.data.time)
        if (config.ref == 0) {
            return { freq:[config.freq, config.freq], time:[this.data.time[start_index], this.data.time[end_index]] }
        }

        var freq = []
        for (let j=start_index;j<end_index;j++) {
            freq.push(this.get_target_freq_index(config, j))
        }
        return { freq:freq, time:this.data.time.slice(start_index, end_index) }
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
        const start_time = parseFloat(document.getElementById("TimeStart").value)
        const end_time = parseFloat(document.getElementById("TimeEnd").value)
        return { freq:[config.freq, config.freq], time:[start_time, end_time] }
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
        const motors_throttle = math.max(0, AOut)
        return config.freq * math.max(config.min_ratio, math.sqrt(motors_throttle / config.ref))
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
            return math.max(config.freq, rpm * config.ref * (1.0/60.0))
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
            let ret = []
            for (var j=0; j < this.data.length; j++) {
                ret[j] = this.get_target(config, this.data.interpolated[instance][j][index])
            }
            return ret
        }
        
        return [this.get_target(config, this.data.interpolated[instance].avg_freq[index])]
    }

    get_target(config, rpm) {
        return math.max(rpm, config.freq)
    }

    get_target_freq(config) {
        if (this.data.length == 0) {
            return
        }

        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            // Tracking individual motor RPM's
            let freq = []
            let time = []

            for (let i = 0; i < this.data.length; i++) {
                const start_index = find_start_index(this.data[i].time)
                const end_index = find_end_index(this.data[i].time)

                let inst_freq = this.data[i].freq.slice(start_index, end_index)
                for (let j = 0; j < inst_freq.length; j++) {
                    inst_freq[j] = this.get_target(config, inst_freq[j])
                }

                time.push(...this.data[i].time.slice(start_index, end_index))
                freq.push(...inst_freq)

                // Add NAN to remove line from end back to the start
                time.push(NaN)
                freq.push(NaN)
            }
            return { freq:freq, time:time }

        }

        // Tracking average motor rpm
        const start_index = find_start_index(this.data.avg_time)
        const end_index = find_end_index(this.data.avg_time)

        let freq = this.data.avg_freq.slice(start_index, end_index)
        for (let j = 0; j < freq.length; j++) {
            freq[j] = this.get_target(config, freq[j])
        }

        return { freq:freq, time:this.data.avg_time.slice(start_index, end_index) }
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
            let ret = []
            for (var j=0; j < this.data.length; j++) {
                ret[j] = this.get_target(config, this.data.interpolated[instance][j][index])
            }
            return ret
        }
        
        return [this.get_target(config, this.data.interpolated[instance].avg_freq[index])]
    }

    get_target(config, rpm) {
        return math.max(rpm, config.freq)
    }

    get_target_freq(config) {
        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            // Tracking multiple peaks
            let freq = []
            let time = []

            for (let i = 0; i < this.data.length; i++) {
                const start_index = find_start_index(this.data[i].time)
                const end_index = find_end_index(this.data[i].time)

                let inst_freq = this.data[i].freq.slice(start_index, end_index)
                for (let j = 0; j < inst_freq.length; j++) {
                    inst_freq[j] = this.get_target(config, inst_freq[j])
                }

                time.push(...this.data[i].time.slice(start_index, end_index))
                freq.push(...inst_freq)

                // Add NAN to remove line from end back to the start
                time.push(NaN)
                freq.push(NaN)
            }
            return { freq:freq, time:time }
        }

        // Just center peak
        const start_index = find_start_index(this.data.time)
        const end_index = find_end_index(this.data.time)

        let freq = this.data.value.slice(start_index, end_index)
        for (let j = 0; j < freq.length; j++) {
            freq[j] = this.get_target(config, freq[j])
        }

        return { freq:freq, time:this.data.time.slice(start_index, end_index) }
    }
}

function DigitalBiquadFilter(freq) {
    this.target_freq = freq

    if (this.target_freq <= 0) {
        this.transfer = function(sample_freq, Z, Z1, Z2) {
            return 1
        }
        return this;
    }

    this.transfer = function(sample_freq, Z, Z1, Z2) {

        const fr = sample_freq/this.target_freq;
        const ohm = Math.tan(Math.PI/fr);
        const c = 1.0+2.0*Math.cos(Math.PI/4.0)*ohm + ohm*ohm;

        const b0 = ohm*ohm/c;
        const b1 = 2.0*b0;
        const b2 = b0;
        const a1 = 2.0*(ohm*ohm-1.0)/c;
        const a2 = (1.0-2.0*Math.cos(Math.PI/4.0)*ohm+ohm*ohm)/c;

        // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(1 + a1*z^-1 + a2*z^-2)
        const b1z = math.dotMultiply(Z1, b1)
        const b2z = math.dotMultiply(Z2, b2)
        const a1z = math.dotMultiply(Z1, a1)
        const a2z = math.dotMultiply(Z2, a2)

        const numerator = math.add(b0, b1z, b2z)
        const denominator = math.add(1, a1z, a2z)
        return math.dotDivide(numerator, denominator)
    }

    return this
}

function NotchFilter(attenuation_dB, bandwidth_hz, harmonic_mul) {
    this.attenuation_dB = attenuation_dB
    this.bandwidth_hz = bandwidth_hz
    this.harmonic_mul = (harmonic_mul != null) ? harmonic_mul : 1
    this.Asq = Math.pow(10.0, -this.attenuation_dB / 40.0)**2

    this.transfer = function(center, sample_freq, Z, Z1, Z2) {
        const center_freq_hz = center * this.harmonic_mul

        // check center frequency is in the allowable range
        if ((center_freq_hz <= 0.5 * this.bandwidth_hz) || (center_freq_hz >= 0.5 * sample_freq)) {
            return 1
        }

        const octaves = Math.log2(center_freq_hz / (center_freq_hz - this.bandwidth_hz / 2.0)) * 2.0
        const Q = Math.sqrt(Math.pow(2.0, octaves)) / (Math.pow(2.0, octaves) - 1.0)

        const omega = 2.0 * Math.PI * center_freq_hz / sample_freq
        const alpha = Math.sin(omega) / (2 * Q)
        const b0 =  1.0 + alpha*this.Asq
        const b1 = -2.0 * Math.cos(omega)
        const b2 =  1.0 - alpha*this.Asq
        const a0 =  1.0 + alpha
        const a1 = b1
        const a2 =  1.0 - alpha

        // H(z) = (b0 + b1*z^-1 + b2*z^-2)/(a0 + a1*z^-1 + a2*z^-2)
        const b1z = math.dotMultiply(Z1, b1)
        const b2z = math.dotMultiply(Z2, b2)
        const a1z = math.dotMultiply(Z1, a1)
        const a2z = math.dotMultiply(Z2, a2)

        const numerator = math.add(b0, b1z, b2z)
        const denominator = math.add(a0, a1z, a2z)
        return math.dotDivide(numerator, denominator)
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

    this.transfer = function(center, sample_freq, Z, Z1, Z2) {
        center = center * this.harmonic

        // Calculate spread required to achieve an equivalent single notch using two notches with Bandwidth/2
        const notch_spread = this.bandwidth / (32.0 * center);

        const bandwidth_limit = this.bandwidth * 0.52
        const nyquist_limit = sample_freq * 0.48
        center = math.min(math.max(center, bandwidth_limit), nyquist_limit)

        var H = this.notches[0].transfer(center*(1-notch_spread), sample_freq, Z, Z1, Z2)
        H = math.dotMultiply(H, this.notches[1].transfer(center*(1+notch_spread), sample_freq, Z, Z1, Z2))
        if (this.notches.length == 3) {
            H = math.dotMultiply(H, this.notches[2].transfer(center, sample_freq, Z, Z1, Z2))
        }

        return H
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
        this.transfer = function(time, sample_freq, Z, Z1, Z2) {
            return 1
        }
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

    this.transfer = function(instance, index, sample_freq, Z, Z1, Z2) {
        // Get target frequencies from target
        const freq = this.tracking.get_interpolated_target_freq(instance, index, this.params)

        var H_total = 1
        if (freq != null) {
            for (let i = 0; i<this.notches.length; i++) {
                // Cycle over each notch
                for (let j=0; j<freq.length; j++) {
                    // Run each notch multiple times for multi frequency motor/esc/fft tracking
                    const H = this.notches[i].transfer(freq[j], sample_freq, Z, Z1, Z2)
                    H_total = math.dotMultiply(H_total, H)
                }
            }
        }
        return H_total
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
    const half = tf.scalar(0.5)
    return tf.sub(half, tf.mul(half, tf.cos(tf.linspace(0, 2*math.PI, len))))
}

// Calculate correction factors for linear and energy spectrum (window in tensorflow format)
// linear: 1 / mean(w)
// energy: 1 / sqrt(mean(w.^2))
function window_correction_factors(w) {
    return { 
        linear: 1/tf.mean(w).arraySync(),
        energy: 1/tf.sqrt(tf.mean(tf.square(w))).arraySync()
    }
}

// Length of real half of fft of len points
function real_length(len) {
    return math.floor(len / 2) + 1
}

// Frequency bins for given fft length and sample period (real only)
function rfft_freq(len, d) {
    const real_len = real_length(len)
    freq = []
    for (var i=0;i<real_len;i++) {
        freq[i] = i / (len * d)
    }
    return freq
}

function run_fft(data, window_size, window_spacing, windowing_function) {
    const num_points = data.x.length
    const real_len = real_length(window_size)

    var fft_x = []
    var fft_y = []
    var fft_z = []

    var center_sample = []

    // Convert to tensorflow format for faster fft
    const tf_data = tf.tensor2d([data.x, data.y, data.z])

    // Pre-allocate scale array.
    // double positive spectrum to account for discarded energy in the negative spectrum
    // Note that we don't scale the DC or Nyquist limit
    // normalize all points by the window size
    var scale = []
    scale[0] = 1 / window_size
    for (var j=1;j<real_len-1;j++) {
        scale[j] = 2 / window_size
    }
    scale[real_len-1] = 1 / window_size
    const tf_scale = tf.tensor1d(scale)

    const num_windows = math.floor((num_points-window_size)/window_spacing) + 1
    for (var i=0;i<num_windows;i++) {
        // Calculate the start of each window
        const window_start = i * window_spacing

        // Take average time for window
        center_sample[i] = window_start + window_size * 0.5

        // Get data and apply windowing function
        const windowed_data = tf.mul(tf_data.slice([0, window_start], [-1, window_size]), windowing_function)

        // Run fft
        const p2 = windowed_data.rfft()

        // Take magnitude to give real number
        const p1 = p2.abs()

        // Apply scale and convert back to js array
        const result = tf.mul(p1, tf_scale).arraySync()

        fft_x[i] = result[0]
        fft_y[i] = result[1]
        fft_z[i] = result[2]

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
        const window_per_batch = math.max(parseInt(document.getElementById("FFTWindow_per_batch").value), 1)

        // Calculate window size for given number of windows and overlap
        window_size = math.floor(num_points / (1 + (window_per_batch - 1)*(1-window_overlap)))

    } else {
        window_size = math.min(parseInt(document.getElementById("FFTWindow_size").value), num_points)

    }

    const window_spacing = math.round(window_size * (1 - window_overlap))
    const windowing_function = hanning(window_size)

    // Get windowing correction factors for use later when plotting
    const window_correction = window_correction_factors(windowing_function)

    // Get bins
    var bins = rfft_freq(window_size, sample_time)

    var x = []
    var y = []
    var z = []

    var time = []

    for (let i=0;i<num_batch;i++) {
        var ret = run_fft(data_set[i], window_size, window_spacing, windowing_function)

        time.push(...math.add(data_set[i].sample_time, math.dotMultiply(sample_time, ret.center)))
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

// Setup plots with no data
var Spectrogram = {}
var fft_plot = {}
var Bode_amp = {}
var Bode_phase = {}
const max_num_harmonics = 8
function reset() {

    // Disable all plot selection checkboxes
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            document.getElementById("Gyro" + i + "Pre" + axis[j]).disabled = true
            document.getElementById("Gyro" + i + "Post" + axis[j]).disabled = true
        }
        document.getElementById("SpecGyroInst" + i).disabled = true
    }
    document.getElementById("SpecGyroPre").disabled = true
    document.getElementById("SpecGyroPost").disabled = true
    for (let j = 0; j < 3; j++) {
        document.getElementById("SpecGyroAxis" +  axis[j]).disabled = true
    }

    // Clear extra text
    document.getElementById("Gyro0_FFT_info").innerHTML = "<br><br><br>"
    document.getElementById("Gyro1_FFT_info").innerHTML = "<br><br><br>"
    document.getElementById("Gyro2_FFT_info").innerHTML = "<br><br><br>"

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
        xaxis: {title: {text: ""}, type: "linear"},
        yaxis: {title: {text: ""}},
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 }
    }

    var plot = document.getElementById("FFTPlot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, fft_plot.data, fft_plot.layout, {displaylogo: false});

    // Bode plot setup
    Bode_amp.data = []
    Bode_phase.data = []
    for (let i=0;i<3;i++) {
        // For each gyro
        const name = "Gyro " + (i + 1)
        Bode_amp.data[i] = { mode: "lines", name: name, meta: name }
        Bode_phase.data[i] = { mode: "lines", name: name, meta: name }
    }

    Bode_amp.layout = {
        xaxis: {title: {text: ""}, type: "linear"},
        yaxis: {title: {text: ""}},
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 }
    }
    Bode_phase.layout = {
        xaxis: {title: {text: ""}, type: "linear"},
        yaxis: {title: {text: "phase (deg)"}},
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 }
    }

    plot = document.getElementById("BodeAmp")
    Plotly.purge(plot)
    Plotly.newPlot(plot, Bode_amp.data, Bode_amp.layout, {displaylogo: false});

    plot = document.getElementById("BodePhase")
    Plotly.purge(plot)
    Plotly.newPlot(plot, Bode_phase.data, Bode_phase.layout, {displaylogo: false});

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
        xaxis: {title: {text: "Time (s)"}},
        yaxis: {title: {text: ""}, type: "linear"},
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 }
    }

    plot = document.getElementById("Spectrogram")
    Plotly.purge(plot)
    Plotly.newPlot(plot, Spectrogram.data, Spectrogram.layout, {displaylogo: false});
}

// Calculate if needed and re-draw, called from calculate button
function re_calc() {

    calculate()

    calculate_transfer_function()

    redraw()
}

// Force full re-calc on next run, on window size change
function clear_calculation() {
    if (Gyro_batch == null) {
        return
    }
    for (let i = 0; i < Gyro_batch.length; i++) {
        if (Gyro_batch[i] == null) {
            continue
        }
        Gyro_batch[i].FFT = null
    }
}

// Re-run all FFT's
function calculate() {
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

        document.getElementById("Gyro" + i + "_FFT_info").innerHTML = "Logging rate : " + (sample_rate).toFixed(2) + " Hz<br><br>" +
                                                                        "Frequency  resolution : " + (sample_rate/window_size).toFixed(2) + " Hz"

        if (set_batch_len_msg == false) {
            set_batch_len_msg = true
            document.getElementById("FFTWindow_size").value = window_size
        }
    }

    // Update filter pre-calc values, speeds up changing the filters
    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null) || (Gyro_batch[i].post_filter)) {
            continue
        }

        // Calculate Z for transfer function
        // Z = e^jw
        Gyro_batch[i].FFT.Z = math.map(math.dotMultiply(Gyro_batch[i].FFT.bins, math.complex(0,(2*math.pi)/Gyro_batch[i].gyro_rate)), math.exp)

        // Pre calculate powers of Z
        // pow seems not to work on complex arrays
        Gyro_batch[i].FFT.Z1 = []
        Gyro_batch[i].FFT.Z2 = []
        for (let j = 0; j<Gyro_batch[i].FFT.Z.length; j++) {
            Gyro_batch[i].FFT.Z1[j] = math.pow(Gyro_batch[i].FFT.Z[j], -1)
            Gyro_batch[i].FFT.Z2[j] = math.pow(Gyro_batch[i].FFT.Z[j], -2)
        }

        // Interpolate tracking data to aline with FFT windows
        for (let j=0;j<tracking_methods.length;j++) {
            tracking_methods[j].interpolate(i, Gyro_batch[i].FFT.time)
        }
    }
}

function calculate_transfer_function() {

    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || (Gyro_batch[i].FFT == null) || (Gyro_batch[i].post_filter)) {
            continue
        }

        // Low pass does not change frequency in flight
        var H_static = filters.static.transfer(Gyro_batch[i].gyro_rate, Gyro_batch[i].FFT.Z, Gyro_batch[i].FFT.Z1, Gyro_batch[i].FFT.Z2)

        // Evaluate any static notch
        for (let k=0; k<filters.notch.length; k++) {
            if (filters.notch[k].enabled() && filters.notch[k].static()) {
                H_static = math.dotMultiply(H_static, filters.notch[k].transfer(i, null, Gyro_batch[i].gyro_rate, Gyro_batch[i].FFT.Z, Gyro_batch[i].FFT.Z1, Gyro_batch[i].FFT.Z2))
            }
        }

        // Evaluate dynamic notches at each time step
        Gyro_batch[i].FFT.H = []
        for (let j = 0; j < Gyro_batch[i].FFT.time.length; j++) {

            var H = H_static
            for (let k=0; k<filters.notch.length; k++) {
                if (filters.notch[k].enabled() && !filters.notch[k].static()) {
                    H = math.dotMultiply(H, filters.notch[k].transfer(i, j, Gyro_batch[i].gyro_rate, Gyro_batch[i].FFT.Z, Gyro_batch[i].FFT.Z1, Gyro_batch[i].FFT.Z2))
                }
            }

            Gyro_batch[i].FFT.H[j] = H
        }
    }
}

// Get configured amplitude scale
function get_amplitude_scale() {

    const use_DB = document.getElementById("ScaleLog").checked;
    const use_PSD = document.getElementById("ScalePSD").checked;

    var ret = {}
    if (use_PSD) {
        ret.fun = function (x) { return math.dotMultiply(math.log10(math.dotMultiply(x,x)), 10.0) } // 10 * log10(x.^2)
        ret.label = "PSD (dB/Hz)"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} dB/Hz" }
        ret.window_correction = function(correction) { return correction.energy * math.sqrt(1/2) }

    } else if (use_DB) {
        ret.fun = function (x) { return math.dotMultiply(math.log10(x), 20.0) } // 20 * log10(x)
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
        ret.fun = function (x) { return math.dotMultiply(x, 60.0) }
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

    var end_index
    for (j = 0; j<time.length; j++) {
        // Move forward end index while time is less than end time
        if (time[j] <= end_time) {
            end_index = j
        }
    }
    return end_index + 1
}

function unwrap_phase(phase) {

    let phase_wrap = 0.0
    for (let i = 1; i < phase.length; i++) {
        phase[i] += phase_wrap
        const phase_diff = phase[i] - phase[i-1]
        if (phase_diff > 180) {
            phase_wrap -= 360.0
            phase[i] -= 360.0;
        } else if (phase_diff < -180) {
            phase_wrap += 360.0
            phase[i] += 360.0
        }
    }

    return phase
}

function redraw() {

    // Graph config
    const amplitude_scale = get_amplitude_scale()
    const frequency_scale = get_frequency_scale()

    // Setup axes
    fft_plot.layout.xaxis.type = frequency_scale.type
    fft_plot.layout.xaxis.title.text = frequency_scale.label
    fft_plot.layout.yaxis.title.text = amplitude_scale.label

    Bode_amp.layout.xaxis.type = frequency_scale.type
    Bode_amp.layout.xaxis.title.text = frequency_scale.label
    Bode_amp.layout.yaxis.title.text = amplitude_scale.label
    Bode_phase.layout.xaxis.type = frequency_scale.type
    Bode_phase.layout.xaxis.title.text = frequency_scale.label

    const fft_hovertemplate = "<extra></extra>%{meta}<br>" + frequency_scale.hover("x") + "<br>" + amplitude_scale.hover("y")
    const bode_amp_hovertemplate = "<extra></extra>%{meta}<br>" + frequency_scale.hover("x") + "<br>" + amplitude_scale.hover("y")
    const bode_phase_hovertemplate = "<extra></extra>%{meta}<br>" + frequency_scale.hover("x") + "<br>%{y:.2f} deg"

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
        var fft_mean_x = 0
        var fft_mean_y = 0
        var fft_mean_z = 0
        for (let j=start_index;j<end_index;j++) {
            // Add to mean sum
            fft_mean_x = math.add(fft_mean_x, amplitude_scale.fun(math.dotMultiply(Gyro_batch[i].FFT.x[j], window_correction)))
            fft_mean_y = math.add(fft_mean_y, amplitude_scale.fun(math.dotMultiply(Gyro_batch[i].FFT.y[j], window_correction)))
            fft_mean_z = math.add(fft_mean_z, amplitude_scale.fun(math.dotMultiply(Gyro_batch[i].FFT.z[j], window_correction)))
        }

        let plot_type = Gyro_batch[i].post_filter ? 1 : 0

        let X_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, plot_type, 0)
        let Y_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, plot_type, 1)
        let Z_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, plot_type, 2)

        // Set scaled y data
        fft_plot.data[X_plot_index].y = math.dotMultiply(fft_mean_x, 1 / plot_length)
        fft_plot.data[Y_plot_index].y = math.dotMultiply(fft_mean_y, 1 / plot_length)
        fft_plot.data[Z_plot_index].y = math.dotMultiply(fft_mean_z, 1 / plot_length)

        // Set scaled x data
        const scaled_bins = frequency_scale.fun(Gyro_batch[i].FFT.bins)
        fft_plot.data[X_plot_index].x = scaled_bins
        fft_plot.data[Y_plot_index].x = scaled_bins
        fft_plot.data[Z_plot_index].x = scaled_bins

        // Set hover over function
        fft_plot.data[X_plot_index].hovertemplate = fft_hovertemplate
        fft_plot.data[Y_plot_index].hovertemplate = fft_hovertemplate
        fft_plot.data[Z_plot_index].hovertemplate = fft_hovertemplate

        if (Gyro_batch[i].post_filter) {
            continue
        }

        // Estimate filtered from pre-filter data
        var quantization_noise
        if (Gyro_batch.type == "batch") {
            // white noise noise model
            // https://en.wikipedia.org/wiki/Quantization_(signal_processing)#Quantization_noise_model
            // See also Analog Devices:
            // "Taking the Mystery out of the Infamous Formula, "SNR = 6.02N + 1.76dB," and Why You Should Care"
            // The 16 here is the number of bits in the batch log
            quantization_noise = 1 / (math.sqrt(3) * 2**(16-0.5))

        } else {
            // Raw logging uses floats, quantization noise probably negligible (not yet investigated)
            quantization_noise = 0
        }

        fft_mean_x = 0
        fft_mean_y = 0
        fft_mean_z = 0
        H_mean = 0
        for (let j=start_index;j<end_index;j++) {
            H_mean = math.add(H_mean, Gyro_batch[i].FFT.H[j])

            const attenuation = math.abs(Gyro_batch[i].FFT.H[j])

            // Apply window correction
            const corrected_x = math.dotMultiply(Gyro_batch[i].FFT.x[j], window_correction)
            const corrected_y = math.dotMultiply(Gyro_batch[i].FFT.y[j], window_correction)
            const corrected_z = math.dotMultiply(Gyro_batch[i].FFT.z[j], window_correction)

            // Subtract noise, apply transfer function, re-apply noise
            // Strictly we need not bother noise, it makes the estimate less accurate
            // However it does result in a good match to logged post filter data making it easy to verify the estimates
            const filtered_x = math.add(math.dotMultiply(math.subtract(corrected_x, quantization_noise), attenuation), quantization_noise)
            const filtered_y = math.add(math.dotMultiply(math.subtract(corrected_y, quantization_noise), attenuation), quantization_noise)
            const filtered_z = math.add(math.dotMultiply(math.subtract(corrected_z, quantization_noise), attenuation), quantization_noise)

            // Add to mean sum
            fft_mean_x = math.add(fft_mean_x, amplitude_scale.fun(filtered_x))
            fft_mean_y = math.add(fft_mean_y, amplitude_scale.fun(filtered_y))
            fft_mean_z = math.add(fft_mean_z, amplitude_scale.fun(filtered_z))
        }

        X_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, 2, 0)
        Y_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, 2, 1)
        Z_plot_index = get_FFT_data_index(Gyro_batch[i].sensor_num, 2, 2)

        // Set scaled y data
        fft_plot.data[X_plot_index].y = math.dotMultiply(fft_mean_x, 1 / plot_length)
        fft_plot.data[Y_plot_index].y = math.dotMultiply(fft_mean_y, 1 / plot_length)
        fft_plot.data[Z_plot_index].y = math.dotMultiply(fft_mean_z, 1 / plot_length)

        // Set scaled x data
        fft_plot.data[X_plot_index].x = scaled_bins
        fft_plot.data[Y_plot_index].x = scaled_bins
        fft_plot.data[Z_plot_index].x = scaled_bins

        // Set hover over function
        fft_plot.data[X_plot_index].hovertemplate = fft_hovertemplate
        fft_plot.data[Y_plot_index].hovertemplate = fft_hovertemplate
        fft_plot.data[Z_plot_index].hovertemplate = fft_hovertemplate

        // Bode plot
        Bode_amp.data[Gyro_batch[i].sensor_num].x = scaled_bins
        Bode_phase.data[Gyro_batch[i].sensor_num].x = scaled_bins

        H_mean = math.dotMultiply(H_mean, 1 / plot_length)

        Bode_amp.data[Gyro_batch[i].sensor_num].y = amplitude_scale.fun(math.abs(H_mean))
        Bode_phase.data[Gyro_batch[i].sensor_num].y = unwrap_phase(math.dotMultiply(math.atan2(math.im(H_mean), math.re(H_mean)), 180/math.pi))

        Bode_amp.data[Gyro_batch[i].sensor_num].hovertemplate = bode_amp_hovertemplate
        Bode_phase.data[Gyro_batch[i].sensor_num].hovertemplate = bode_phase_hovertemplate

    }

    Plotly.redraw("FFTPlot")

    Plotly.redraw("BodeAmp")
    Plotly.redraw("BodePhase")

    redraw_Spectrogram()

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

    // Get scales
    const amplitude_scale = get_amplitude_scale()
    const frequency_scale = get_frequency_scale()

    // Setup axes
    Spectrogram.layout.yaxis.type = frequency_scale.type
    Spectrogram.layout.yaxis.title.text = frequency_scale.label

    Spectrogram.data[0].hovertemplate = "<extra></extra>" + "%{x:.2f} s<br>" + frequency_scale.hover("y") + "<br>" + amplitude_scale.hover("z")
    Spectrogram.data[0].colorbar.title.text = amplitude_scale.label

    // Find the start and end index
    const start_index = find_start_index(Gyro_batch[batch_instance].FFT.time)
    const end_index = find_end_index(Gyro_batch[batch_instance].FFT.time)

    // Number of windows to plot
    const plot_length = end_index - start_index

    // Setup xy data (x and y swapped because transpose flag is set)
    Spectrogram.data[0].x = Gyro_batch[batch_instance].FFT.time.slice(start_index, end_index)
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
        quantization_noise = 1 / (math.sqrt(3) * 2**(16-0.5))

    } else {
        // Raw logging uses floats, quantization noise probably negligible (not yet investigated)
        quantization_noise = 0
    }


    // Setup z data
    Spectrogram.data[0].z = []
    for (j = 0; j<plot_length; j++) {
        const index = start_index + j

        var amplitude = math.dotMultiply(Gyro_batch[batch_instance].FFT[axis][index], window_correction)
        if (estimated) {
            const attenuation = math.abs(Gyro_batch[batch_instance].FFT.H[index])
            amplitude = math.add(math.dotMultiply(math.subtract(amplitude, quantization_noise), attenuation), quantization_noise)
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

        // Enable each harmonic
        for (let j=0;j<max_num_harmonics;j++) {
            if ((filters.notch[i].harmonics() & (1<<j)) == 0) {
                continue
            }
            const harmonic_freq = math.dotMultiply(fundamental.freq, j+1)
            if (harmonic_freq == null) {
                break
            }

            Spectrogram.data[plot_offset + j].visible = true
            Spectrogram.data[plot_offset + j].x = fundamental.time
            Spectrogram.data[plot_offset + j].y = frequency_scale.fun(harmonic_freq)
            Spectrogram.data[plot_offset + j].hovertemplate = tracking_hovertemplate
            Spectrogram.data[plot_offset + j].legendgrouptitle.text = Group_name
        }

    }

    Plotly.redraw("Spectrogram")
}

// Update lines that are shown in FFT plot
function update_hidden(checkbox) {

    const gyro_instance = parseFloat(checkbox.id.match(/\d+/g))

    const post_filter = checkbox.id.includes("Post")
    const post_estimate = checkbox.id.includes("PostEst")

    var pre_post_index = 0
    if (post_estimate) {
        pre_post_index = 2
    } else if (post_filter) {
        pre_post_index = 1
    }

    const axi = checkbox.id.substr(checkbox.id.length - 1)

    let axi_index
    for (let j=0;j<3;j++) {
        if (axis[j] == axi) {
            axi_index = j
            break
        }
    }

    const plot_index = get_FFT_data_index(gyro_instance, pre_post_index, axi_index)

    fft_plot.data[plot_index].visible = checkbox.checked

    Plotly.redraw("FFTPlot")

}

// Grab param from log
function get_param_value(param_log, name) {
    var value
    for (let i = 0; i < param_log.Name.length; i++) {
        if (param_log.Name[i] === name) {
            if ((value != null) && (value != PARM_log.Value[i])) {
                console.log("Param changed in flight: " + name)
            }
            value = param_log.Value[i]
        }
    }
    return value
}

function get_HNotch_param_names() {
    prefix = ["INS_HNTCH_", "INS_HNTC2_"]
    ret = []
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

function filter_param_change() {

    // Read latest params
    filter_param_read()

    // Update transfer function
    calculate_transfer_function()

    // Update plot
    redraw()
}

function filter_param_read() {
    filters = []
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
    }

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
                console.log("sequence incomplete " + i + " of " + log.messages.ISBH.N.length-1)
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
        x = math.dotMultiply(x, mul)
        y = math.dotMultiply(y, mul)
        z = math.dotMultiply(z, mul)

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
        Gyro_batch[i].gyro_rate = math.max(gyro_rate[Gyro_batch[i].sensor_num], max_logging_rate[Gyro_batch[i].sensor_num])
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
        Gyro_batch[i].gyro_rate = math.max(gyro_rate[i], sample_rate)
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

    var log = new DataflashParser()
    log.processData(log_file)

    log.parseAtOffset('PARM')
    log.parseAtOffset('IMU')

    // Try and decode device IDs and rate
    var num_gyro = 0
    var gyro_rate = []
    for (let i = 0; i < 3; i++) {
        document.getElementById("Gyro" + i + "_info").innerHTML = "<br>"
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
                document.getElementById("Gyro" + i + "_info").innerHTML = decoded.name + " via " + decoded.bus_type + " @ " + math.round(gyro_rate[i]) + " Hz"
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
        console.log("No Batch or raw data")
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

    // setup/reset plot and options
    reset()

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

    // Load filter params
    filter_param_read()

    // Update ranges of start and end time
    start_time = math.floor(Gyro_batch.start_time)
    end_time = math.ceil(Gyro_batch.end_time)

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
        document.getElementById("SpecGyroAxisX").checked = true
        document.getElementById("SpecGyroAxisY").disabled = false
        document.getElementById("SpecGyroAxisZ").disabled = false
    }

    // Default spectrograph to first sensor, pre if available and X axis
    document.getElementById("SpecGyroInst" + first_gyro).checked = true
    document.getElementById("SpecGyro" + (Gyro_batch.have_pre ? "Pre" : "Post")).checked = true
    document.getElementById("SpecGyroAxisX").disabled = false

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

    // Enable the calculate button
    document.getElementById("calculate").disabled = false

    const end = performance.now();
    console.log(`Load took: ${end - start} ms`);
}
