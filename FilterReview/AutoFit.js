// Automatic setup of the first harmonic notch from the logged pre-filter gyro spectrum
//
// The tracking source is ESC telemetry if it is logged, otherwise throttle.
// The spectrum of each FFT window is resampled against the tracked frequency and the windows are averaged.
// Noise that follows the motors adds up into peaks at multiples of the tracked frequency, other noise is
// spread out. A source is only used if this shows clear peaks, which verifies the tracking. The harmonics
// that stand out from the local noise floor are notched, and the attenuation is set from how far the
// largest of them stands out.

// Rules of thumb
const auto_fit_rules = {
    // Harmonic is notched if its peak is this far above the local noise floor (dB)
    min_peak_dB: 6,
    // Attenuation limits (dB)
    min_attenuation: 10,
    max_attenuation: 50,
    // Highest harmonic to consider
    max_harmonic: 8,
    // Width of the peak search around each harmonic, as a fraction of the fundamental
    peak_width: 0.1,
    // Width excluded around each harmonic when finding the noise floor, as a fraction of the fundamental
    floor_exclude: 0.12,
    // Windows where the tracked frequency is below this are ignored, motors stopped (Hz)
    min_freq: 10,
    // Notch frequency limit is this fraction of the lowest tracked frequency in flight
    min_freq_ratio: 0.8,
    // Lowest tracked frequency in flight is taken as this percentile
    low_percentile: 0.05,
    // Bandwidth as a fraction of the notch frequency, as suggested in the parameter description
    bandwidth_ratio: 0.5,
    // ESC tracking is rejected if the harmonics of another fundamental fit the noise this much better than
    // those of the motor frequency, fundamentals within the tolerance of the motor frequency are not checked
    esc_check_ratio: 1.5,
    esc_order_tolerance: 0.05,
    // Range of fundamentals checked, as multiples of the motor frequency
    esc_check_min: 0.5,
    esc_check_max: 2,
}

// Mean pre-filter power, summed over axes, on a grid of multiples of the tracked frequency
// get_tracked(instance, window) gives the tracked frequency for a FFT window, or null
function auto_fit_order_spectrum(get_tracked, grid) {
    const num_points = Math.floor((grid.max - grid.min) / grid.step) + 1
    const sum = new Array(num_points).fill(0)
    const count = new Array(num_points).fill(0)
    const tracked = []

    for (let i = 0; i < Gyro_batch.length; i++) {
        if ((Gyro_batch[i] == null) || Gyro_batch[i].post_filter || (Gyro_batch[i].FFT == null)) {
            continue
        }
        const FFT = Gyro_batch[i].FFT
        const bin_width = FFT.bins[1]
        const num_bins = FFT.bins.length

        const start_index = find_start_index(FFT.time)
        const end_index = find_end_index(FFT.time) + 1
        for (let j = start_index; j < end_index; j++) {
            const freq = get_tracked(i, j)
            if ((freq == null) || !(freq > 0)) {
                continue
            }
            tracked.push(freq)

            const x = FFT.x[j]
            const y = FFT.y[j]
            const z = FFT.z[j]
            for (let k = 0; k < num_points; k++) {
                const pos = (grid.min + k * grid.step) * freq / bin_width
                const bin = Math.floor(pos)
                if (bin + 1 >= num_bins) {
                    break
                }
                const frac = pos - bin
                const power_0 = x[bin]**2 + y[bin]**2 + z[bin]**2
                const power_1 = x[bin+1]**2 + y[bin+1]**2 + z[bin+1]**2
                sum[k] += power_0 + (power_1 - power_0) * frac
                count[k]++
            }
        }
    }

    // Only use points covered by most windows, higher multiples can be above the Nyquist frequency
    const dB = new Array(num_points).fill(null)
    for (let k = 0; k < num_points; k++) {
        if ((count[k] > 0) && (count[k] >= tracked.length * 0.5)) {
            dB[k] = 10 * Math.log10(sum[k] / count[k])
        }
    }

    return { dB, grid, tracked }
}

// Largest value in the window, only if it is a peak, the largest value on a slope is at the window edge
function auto_fit_peak_value(dB, start, end) {
    let max_index = start
    for (let k = start; k <= end; k++) {
        if (dB[k] > dB[max_index]) {
            max_index = k
        }
    }
    if ((max_index == start) || (max_index == end)) {
        return -Infinity
    }
    return dB[max_index]
}

// How far a peak at the given position stands out from the local noise floor, widths are fractions of scale
function auto_fit_peak_excess(spectrum, position, scale) {
    const grid = spectrum.grid
    const dB = spectrum.dB
    const index = (value) => Math.round((value - grid.min) / grid.step)
    const floor_start = index(position - scale * 0.5)
    const floor_end = index(position + scale * 0.5)
    if ((floor_start < 0) || (floor_end >= dB.length) || (dB[floor_start] == null) || (dB[floor_end] == null)) {
        return -Infinity
    }

    const peak = auto_fit_peak_value(dB, index(position - scale * auto_fit_rules.peak_width), index(position + scale * auto_fit_rules.peak_width))

    let floor = []
    for (let k = floor_start; k <= floor_end; k++) {
        if (Math.abs(grid.min + k * grid.step - position) > scale * auto_fit_rules.floor_exclude) {
            floor.push(dB[k])
        }
    }
    floor.sort((a, b) => a - b)
    return peak - floor[Math.floor(floor.length / 2)]
}

// How far the peak at each harmonic of the fundamental stands out from the local noise floor (dB)
// Harmonics outside the spectrum give -Infinity
function auto_fit_harmonic_peaks(spectrum, fundamental) {
    let ret = []
    for (let harmonic = 1; harmonic <= auto_fit_rules.max_harmonic; harmonic++) {
        ret.push({ harmonic, excess: auto_fit_peak_excess(spectrum, fundamental * harmonic, fundamental) })
    }
    return ret
}

// Find the peak that stands out the most from the local noise floor
// scale gives the search widths, null to use the position of each peak
function auto_fit_strongest_peak(spectrum, scale) {
    const dB = spectrum.dB
    const grid = spectrum.grid
    const half_width = 10
    let best = null
    for (let k = half_width; k < dB.length - half_width; k++) {
        if (dB[k] == null) {
            continue
        }
        // Only check local maxima
        let is_max = true
        for (let n = k - half_width; n <= k + half_width; n++) {
            if ((dB[n] != null) && (dB[n] > dB[k])) {
                is_max = false
                break
            }
        }
        if (!is_max) {
            continue
        }
        const position = grid.min + k * grid.step
        // Must also be the maximum of the window the peak height is taken from, otherwise a nearby
        // noise maximum would borrow the height of the real peak
        const peak_half_width = Math.round((scale ?? position) * auto_fit_rules.peak_width / grid.step)
        for (let n = Math.max(0, k - peak_half_width); n <= Math.min(dB.length - 1, k + peak_half_width); n++) {
            if ((dB[n] != null) && (dB[n] > dB[k])) {
                is_max = false
                break
            }
        }
        if (!is_max) {
            continue
        }
        const excess = auto_fit_peak_excess(spectrum, position, scale ?? position)
        if ((best == null) || (excess > best.excess)) {
            best = { position, excess }
        }
    }
    if ((best == null) || (best.excess < auto_fit_rules.min_peak_dB)) {
        return
    }
    return best
}

// How well the harmonics of a fundamental fit the noise, the sum of how far each harmonic stands out
function auto_fit_series_score(spectrum, fundamental) {
    const peaks = auto_fit_harmonic_peaks(spectrum, fundamental)
    return {
        score: peaks.reduce((sum, peak) => sum + Math.max(0, peak.excess), 0),
        fundamental_excess: peaks[0].excess
    }
}

// Pick the harmonics to notch and the attenuation from the peaks
function auto_fit_select(peaks) {
    let harmonics = 0
    let max_excess = 0
    for (const peak of peaks) {
        if (peak.excess >= auto_fit_rules.min_peak_dB) {
            harmonics |= 1 << (peak.harmonic - 1)
            max_excess = Math.max(max_excess, peak.excess)
        }
    }
    if (harmonics == 0) {
        return
    }
    const attenuation = Math.round(Math.min(Math.max(max_excess, auto_fit_rules.min_attenuation), auto_fit_rules.max_attenuation))
    return { harmonics, attenuation, max_excess }
}

function auto_fit_percentile(values, fraction) {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor((sorted.length - 1) * fraction)]
}

// Tracked frequency is the motor frequency, notches are at whole multiples of it
function auto_fit_esc(esc_mask) {
    const esc = tracking_methods[3]
    if (!esc.have_data()) {
        return { error: "no ESC telemetry" }
    }

    // Mean frequency of the masked motors
    const config = { options: 0, ref: 1, freq: 0, esc_mask }
    const get_tracked = (instance, index) => {
        const freq = esc.get_interpolated_target_freq(instance, index, config)
        if ((freq == null) || (freq[0] < auto_fit_rules.min_freq)) {
            return null
        }
        return freq[0]
    }
    const spectrum = auto_fit_order_spectrum(get_tracked, { min: 0.25, max: auto_fit_rules.max_harmonic + 0.75, step: 0.005 })
    if (spectrum.tracked.length == 0) {
        return { error: "no FFT windows with the motors running" }
    }

    // The notch tracks each motor separately, so also look at each motor on its own. Motors at different
    // speeds can spread the harmonics out in the mean spectrum.
    const spectra = [spectrum]
    const multi_source = esc.get_num_motors() > 1
    if (multi_source) {
        const motor_config = { options: 2, ref: 1, freq: 0, esc_mask }
        for (let motor = 0; motor < esc.get_num_motors(); motor++) {
            const get_motor_tracked = (instance, index) => {
                const freq = esc.get_interpolated_target_freq(instance, index, motor_config)
                if ((freq == null) || !(freq[motor] >= auto_fit_rules.min_freq)) {
                    return null
                }
                return freq[motor]
            }
            const motor_spectrum = auto_fit_order_spectrum(get_motor_tracked, spectrum.grid)
            if (motor_spectrum.tracked.length > 0) {
                spectra.push(motor_spectrum)
            }
        }
    }

    // Check the noise follows whole multiples of the motor frequency. If the ESC frequency is scaled wrongly,
    // for example by the motor poles, each motor's own harmonics move to the same other fundamental in its
    // spectrum. Other motors at different speeds only line up at a ratio that differs from motor to motor,
    // so the fit of each fundamental is averaged over the motor spectra.
    const motor_spectra = (spectra.length > 1) ? spectra.slice(1) : spectra
    const mean_fit = (fundamental) => {
        let score = 0
        let num_peaks = 0
        for (const s of motor_spectra) {
            const fit = auto_fit_series_score(s, fundamental)
            score += fit.score
            if (fit.fundamental_excess >= auto_fit_rules.min_peak_dB) {
                num_peaks++
            }
        }
        // The fundamental must stand out for most motors, a peak from one motor alone is a speed difference
        return { score: score / motor_spectra.length, has_peak: num_peaks > motor_spectra.length / 2 }
    }
    // Telemetry can be a little off, so the motor frequency fit is the best within the tolerance
    let logged_score = 0
    let best_other_score = 0
    for (let fundamental = auto_fit_rules.esc_check_min; fundamental <= auto_fit_rules.esc_check_max; fundamental += 0.01) {
        const fit = mean_fit(fundamental)
        if (Math.abs(fundamental - 1) <= auto_fit_rules.esc_order_tolerance) {
            logged_score = Math.max(logged_score, fit.score)
        } else if (fit.has_peak) {
            best_other_score = Math.max(best_other_score, fit.score)
        }
    }
    if (best_other_score > logged_score * auto_fit_rules.esc_check_ratio) {
        return { error: "noise does not follow whole multiples of the ESC frequency, check motor poles" }
    }
    // How much better the motor frequency fits than any other, for the confidence
    const fit_margin = (best_other_score > 0) ? logged_score / best_other_score : Infinity

    // A harmonic is used if it stands out for the mean or for any one motor
    const peaks = auto_fit_harmonic_peaks(spectrum, 1)
    for (const s of spectra.slice(1)) {
        const motor_peaks = auto_fit_harmonic_peaks(s, 1)
        for (let i = 0; i < peaks.length; i++) {
            peaks[i].excess = Math.max(peaks[i].excess, motor_peaks[i].excess)
        }
    }

    const selection = auto_fit_select(peaks)
    if (selection == null) {
        return { error: "no noise peaks follow the ESC frequency" }
    }

    // Lowest frequency of any one motor, a slow motor can be well below the mean
    const tracked = (spectra.length > 1) ? spectra.slice(1).flatMap((s) => s.tracked) : spectrum.tracked
    const low = auto_fit_percentile(tracked, auto_fit_rules.low_percentile)
    return {
        name: "ESC",
        mode: 3,
        freq: Math.round(low * auto_fit_rules.min_freq_ratio),
        ref: 1,
        min_ratio: 1,
        multi_source,
        fit_margin,
        ...selection
    }
}

// Tracked frequency is freq * sqrt(throttle / ref), fit freq with ref as the mean throttle
// Average throttle is used, so the notch is a single throttle notch rather than one per motor
function auto_fit_throttle() {
    if (Gyro_batch.heli) {
        return { error: "heli firmware does not allow a throttle notch" }
    }
    const throttle = tracking_methods[1]
    if (!throttle.have_data({ options: 0 })) {
        return { error: "no throttle" }
    }

    // Root of throttle for each window
    const config = { options: 0, ref: 1, freq: 1, min_ratio: 0 }
    const root_throttle = (instance, index) => {
        const value = throttle.get_interpolated_target_freq(instance, index, config)
        if ((value == null) || (value.length == 0)) {
            return null
        }
        return value.reduce((sum, v) => sum + v, 0) / value.length
    }

    // Reference is the mean throttle over the analysis time
    const ref = throttle.get_mean()
    if (!(Math.round(ref * 100) > 0)) {
        // REF is set to two decimal places, zero would disable tracking
        return { error: "mean throttle is too low" }
    }

    // Spectrum against frequency at the reference throttle
    const get_tracked = (instance, index) => {
        const value = root_throttle(instance, index)
        return (value > 0) ? value / Math.sqrt(ref) : null
    }
    let max_freq = Infinity
    for (const batch of Gyro_batch) {
        if ((batch != null) && !batch.post_filter && (batch.FFT != null)) {
            max_freq = Math.min(max_freq, batch.FFT.bins[batch.FFT.bins.length - 1])
        }
    }
    const step = 0.25
    const spectrum = auto_fit_order_spectrum(get_tracked, { min: auto_fit_rules.min_freq, max: max_freq, step })

    // The fundamental is the strongest peak, or the lowest whole fraction of it that also has a peak
    const strongest = auto_fit_strongest_peak(spectrum, null)
    if (strongest == null) {
        return { error: "no noise peaks follow throttle" }
    }
    let fundamental = strongest.position
    for (let harmonic = 4; harmonic >= 2; harmonic--) {
        const position = strongest.position / harmonic
        if ((position >= auto_fit_rules.min_freq * 2) && (auto_fit_peak_excess(spectrum, position, position) >= auto_fit_rules.min_peak_dB)) {
            fundamental = position
            break
        }
    }
    const selection = auto_fit_select(auto_fit_harmonic_peaks(spectrum, fundamental))
    if (selection == null) {
        return { error: "no noise peaks follow throttle" }
    }

    // REF is set to two decimal places, the frequency at the rounded reference is the same notch
    const ref_rounded = Math.round(ref * 100) / 100
    const freq = fundamental * Math.sqrt(ref_rounded / ref)

    // The notch frequency never goes below FREQ * FM_RAT. Set FM_RAT so that limit is a little below the lowest
    // frequency seen in flight, so the notch keeps tracking at low throttle. spectrum.tracked is the tracked
    // frequency of each window divided by the frequency at the reference throttle.
    const lowest_freq = auto_fit_percentile(spectrum.tracked, auto_fit_rules.low_percentile) * fundamental
    const freq_limit = lowest_freq * auto_fit_rules.min_freq_ratio
    // FM_RAT is between 0.1 and 1, rounded down to a multiple of 0.05
    const min_ratio = Math.min(1, Math.max(0.1, Math.floor((freq_limit / freq) * 20) / 20))

    return {
        name: "throttle",
        mode: 1,
        freq: Math.round(freq),
        ref: ref_rounded,
        min_ratio,
        multi_source: false,
        ...selection
    }
}

// Confidence levels, low, medium or high
const auto_fit_confidence_levels = ["low", "medium", "high"]
// Strongest notched harmonic above the noise floor needed for medium and high confidence (dB)
const auto_fit_confidence_dB = [10, 20]
// How much better the ESC frequency must fit than any other fundamental for medium and high confidence
const auto_fit_confidence_margin = [1, 2]

// Rough confidence in the fit, from how clear the noise peaks are and, for ESC, how clearly the noise follows the
// ESC frequency. Throttle is at most medium, as it only approximates the motor speed.
function auto_fit_confidence(result) {
    const level_of = (value, thresholds) => thresholds.filter((threshold) => value >= threshold).length
    let level = level_of(result.max_excess, auto_fit_confidence_dB)
    let reason = "strongest harmonic " + Math.round(result.max_excess) + " dB above the noise floor"
    if (result.fit_margin != null) {
        level = Math.min(level, level_of(result.fit_margin, auto_fit_confidence_margin))
        const margin = result.fit_margin
        if (margin < 0.95) {
            reason += ", the harmonics of another frequency fit the noise " + (1 / margin).toFixed(1) + " times better than those of the ESC frequency"
        } else {
            reason += ", the ESC frequency harmonics fit the noise " + ((margin <= 1.05) ? "about as well as" : (isFinite(margin) ? margin.toFixed(1) + " times better than" : "better than")) + " those of any other frequency"
        }
    } else {
        level = Math.min(level, 1)
        reason += ", throttle only approximates motor speed"
    }
    return { level: auto_fit_confidence_levels[level], reason }
}

function auto_fit() {
    let info = document.getElementById("auto_fit_info")
    info.textContent = ""
    info.title = ""

    // The button is only enabled with pre-filter data
    if ((Gyro_batch == null) || !Gyro_batch.have_pre) {
        return
    }

    // Make sure FFT is up to date
    calculate()

    const names = get_HNotch_param_names()[0]
    const esc_mask = parameter_get_value(names.esc_mask) || 0

    // Try each source in order of preference
    let result
    let errors = []
    for (const fit of [() => auto_fit_esc(esc_mask), () => auto_fit_throttle()]) {
        result = fit()
        if (result.error == null) {
            break
        }
        errors.push(result.error)
        result = null
    }
    if (result == null) {
        alert("Auto fit failed: " + errors.join(", "))
        return
    }

    // Single notch per harmonic, set multi source as required
    let options = parameter_get_value(names.options) & ~(1 | 16 | 64)
    if (result.multi_source) {
        options |= 2
    } else {
        options &= ~2
    }

    parameter_set_value(names.enable, 1)
    parameter_set_value(names.mode, result.mode)
    parameter_set_value(names.freq, result.freq)
    parameter_set_value(names.bandwidth, Math.round(result.freq * auto_fit_rules.bandwidth_ratio))
    parameter_set_value(names.attenuation, result.attenuation)
    parameter_set_value(names.ref, result.ref)
    parameter_set_value(names.min_ratio, result.min_ratio)
    parameter_set_value(names.harmonics, result.harmonics)
    parameter_set_value(names.options, options)
    filter_param_read()

    const confidence = auto_fit_confidence(result)
    const message = "Fitted using " + result.name + (errors.length > 0 ? " (" + errors.join(", ") + ")" : "") +
        ", confidence " + confidence.level + ": " + confidence.reason
    info.textContent = "Fitted using " + result.name + ", " + confidence.level + " confidence"
    info.title = message

    // Already in a loading call
    re_calc()

    alert("Auto fit (beta)\n\n" + message + "\n\nCheck the estimated post-filter spectrum and fly the result carefully, auto fit only looks at the selected analysis time and may get it wrong.")
}
