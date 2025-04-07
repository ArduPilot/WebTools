// Static notch
class StaticTarget extends NotchTarget {
    constructor(log) {
        super(null, null, null, "Static", 0)
    }

    // Don't need to interpolate static
    interpolate(instance, time) { }

    get_target(config) {
        if (get_filter_version() == 2) {
            return Math.abs(config.freq)
        }
        return config.freq
    }

    get_target_freq(config) {
        return { freq:[this.get_target(config), this.get_target(config)], time:[Gyro_batch.start_time, Gyro_batch.end_time] }
    }

    get_target_freq_time(config, time) {
        // Target is independent of time
        return [this.get_target(config)]
    }

    get_interpolated_target_freq(instance, index, config) {
        return [this.get_target(config)]
    }

    have_data(config) {
        return true
    }
}
