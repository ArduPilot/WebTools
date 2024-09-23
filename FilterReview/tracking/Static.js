// Static notch
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

    have_data(config) {
        return true
    }
}
