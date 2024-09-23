// RPM tracking
class RPMTarget extends NotchTarget {
    constructor(log, instance, mode_value) {
        super(null, null, null, "RPM" + instance, mode_value)

        const msg_name = "RPM"
        if (!(msg_name in log.messageTypes)) {
            // Log message not found
            return
        }

        if ("instances" in log.messageTypes.RPM) {
            // New instance RPM message
            const inst = instance - 1
            if (inst in Object.keys(log.messageTypes.RPM.instances)) {
                this.data.time = TimeUS_to_seconds(log.get_instance(msg_name, inst, "TimeUS"))
                this.data.value = log.get_instance(msg_name, inst, "RPM")

                // Set RPM to -1 when unhealthy, this maintains behavior with the old logging
                const health = log.get_instance(msg_name, inst, "H")
                const len = health.length
                for (let i = 0; i < len; i++) {
                    if (health[i] == 0) {
                        this.data.value[i] = -1
                    }
                }
            }

        } else {
            // Old log message containing both rpm 1 and 2
            this.data.time = TimeUS_to_seconds(log.get(msg_name, "TimeUS"))
            this.data.value = log.get(msg_name, "rpm" + instance)

        }
    }

    get_target(config, rpm) {
        if (config.ref == 0) {
            return config.freq
        }
        const rpm_valid = rpm > 0
        const freq = rpm * config.ref * (1.0/60.0)
        if (get_filter_version() == 2) {
            if (rpm_valid) {
                return freq
            }
            return 0.0
        }
        if (rpm_valid) {
            return Math.max(config.freq, freq)
        }
        return config.freq
    }

    get_target_freq_index(config, index) {
        return this.get_target(config, this.data.value[index])
    }

}
