// Helper functions for FFTs
// For use with https://github.com/indutny/fft.js

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
        linear: 1/array_mean(w),
        energy: 1/Math.sqrt(array_mean(array_mul(w,w)))
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

// Run fft on arrays in data object with given keys
function run_fft(data, keys, window_size, window_spacing, windowing_function, fft, take_max) {
    const num_points = data[keys[0]].length
    const real_len = real_length(window_size)
    const num_windows = Math.floor((num_points-window_size)/window_spacing) + 1

    // Allocate for each window
    var ret = { center: new Array(num_windows) }
    for (const key of keys) {
        ret[key] = new Array(num_windows)
        if (take_max === true) {
            ret[key + "Max"] = new Array(num_windows)
        }
    }

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

    var result = fft.createComplexArray()
    for (var i=0;i<num_windows;i++) {
        // Calculate the start of each window
        const window_start = i * window_spacing
        const window_end = window_start + window_size

        // Take average time for window
        ret.center[i] = window_start + window_size * 0.5

        for (const key of keys) {
            if (!(key in data)) {
                continue
            }

            // Get data and apply windowing function
            var windowed = array_mul(data[key].slice(window_start, window_end), windowing_function)

            // Record the maximum value in the window
            if (take_max === true) {
                ret[key + "Max"][i] = Math.max(...array_abs(windowed))
            }

            // Run fft
            fft.realTransform(result, windowed)

            // Allocate for result
            ret[key][i] = [new Array(real_len), new Array(real_len)]

            // Apply scale and convert complex format
            // fft.js uses interleaved complex numbers, [ real0, imaginary0, real1, imaginary1, ... ]
            for (let j=0;j<real_len;j++) {
                const index = j*2
                ret[key][i][0][j] = result[index]   * scale[j]
                ret[key][i][1][j] = result[index+1] * scale[j]
            }
        }
    }

    return ret
}

// Take result of above FFT and recreate full double sided spectrum including removing scale
function to_double_sided(X) {
    const real_len = X[0].length
    const full_len = (real_len - 1) * 2

    let ret = [new Array(full_len), new Array(full_len)]

    // DC
    ret[0][0] = X[0][0]
    ret[1][0] = X[1][0]

    // Nyquist
    ret[0][real_len-1] = X[0][real_len-1]
    ret[1][real_len-1] = X[1][real_len-1]

    // Everything else is added in two places
    // Divide by 2 to return to double sided
    for (let i=1;i<real_len-1;i++) {
        ret[0][i] = X[0][i] * 0.5
        ret[1][i] = X[1][i] * 0.5

        const rhs_index = full_len - i
        ret[0][rhs_index] = X[0][i] *  0.5
        ret[1][rhs_index] = X[1][i] * -0.5
    }

    return ret
}

// Populate target complex array in fft.js interleaved format
function to_fft_format(target, source) {
    const len = source[0].length
    for (let i=0;i<len;i++) {
        const index = i*2
        target[index]   = source[0][i]
        target[index+1] = source[1][i]
    }
}

// Helper function to change the value of a number input in powers of 2
// Bind to onchange of value input
function fft_window_size_inc(event) {

    // Stash the last valid window size as a data attribute
    const attribute_name = 'data-last'
    if (!event.target.hasAttribute(attribute_name)) {
        event.target.setAttribute(attribute_name, event.target.defaultValue)
    }
    const last_window_size = parseFloat(event.target.getAttribute(attribute_name))

    const new_value = parseFloat(event.target.value)
    const change = parseFloat(event.target.value) - last_window_size
    if (Math.abs(change) != 1) {
        // Assume a change of one is comming from the up down buttons, ignore angthing else
        event.target.setAttribute(attribute_name, new_value)
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
    event.target.setAttribute(attribute_name, event.target.value)
}

// Get amplitude scale object
function fft_amplitude_scale(use_DB, use_PSD) {

    var ret = {}
    if (use_PSD) {
        ret.fun = function (x) { return array_mul(x,x) } // x.^2
        ret.scale = function (x) { return array_scale(array_log10(x), 10.0) } // 10 * log10(x)
        ret.label = "PSD (dB/Hz)"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} dB/Hz" }
        ret.window_correction = function(correction, resolution) { return ((correction.energy**2) * 0.5) / resolution }
        ret.quantization_correction = function(window_correction) { return 1 / Math.sqrt(window_correction) }

    } else if (use_DB) {
        ret.fun = function (x) { return x }
        ret.scale = function (x) { return array_scale(array_log10(x), 20.0) } // 20 * log10(x)
        ret.label = "Amplitude (dB)"
        ret.hover = function (axis) { return "%{" + axis + ":.2f} dB" }
        ret.correction_scale = 1.0
        ret.window_correction = function(correction, resolution) { return correction.linear }
        ret.quantization_correction = function(window_correction) { return 1 / window_correction }

    } else {
        ret.fun = function (x) { return x }
        ret.scale = function (x) { return x }
        ret.label = "Amplitude"
        ret.hover = function (axis) { return "%{" + axis + ":.2f}" }
        ret.window_correction = function(correction, resolution) { return correction.linear }
        ret.quantization_correction = function(window_correction) { return 1 / window_correction }

    }

    return ret
}

// Get frequency scale object
function fft_frequency_scale(use_RPM, log_scale) {

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

    ret.type = log_scale ? "log" : "linear"

    return ret
}
