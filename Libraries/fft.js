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