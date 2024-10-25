// Tracking logged values
class LoggedNotch extends NotchTarget {
    constructor(log, instance) {
        super(null, null, null, "Logged", null)

        this.harmonics = null

        // Load single notch message
        const static_msg = "FTNS"
        if ((static_msg in log.messageTypes) && ("instances" in log.messageTypes[static_msg])) {
            for (const inst of Object.keys(log.messageTypes[static_msg].instances)) {
                if (parseFloat(inst) != instance) {
                    // Not selected instance
                    continue
                }

                this.data.time = TimeUS_to_seconds(log.get_instance(static_msg, inst, "TimeUS"))
                this.data.freq = Array.from(log.get_instance(static_msg, inst, "NF"))
                // If we have a single instance there should not be a dynamic for this instance
                return
            }
        }

        // Load multi notch message
        const dynamic_msg = "FTN"
        if ((dynamic_msg in log.messageTypes) && ("instances" in log.messageTypes[dynamic_msg])) {
            for (const inst of Object.keys(log.messageTypes[dynamic_msg].instances)) {
                if (parseFloat(inst) != instance) {
                    // Not selected instance
                    continue
                }

                const notch_number = log.get_instance(dynamic_msg, inst, "NDn")
                let num_notches = 0
                const len = notch_number.length
                for (let i = 0; i<len; i++) {
                    num_notches = Math.max(num_notches, notch_number[i])
                }

                this.data.time = TimeUS_to_seconds(log.get_instance(dynamic_msg, inst, "TimeUS"))

                this.data.freq = new Array(num_notches)
                for (let i = 0; i<num_notches; i++) {
                    const name = "NF" + (i + 1)
                    this.data.freq[i] = Array.from(log.get_instance(dynamic_msg, inst, name))
                }
                return
            }
        }
    }

    get_target_freq() {
        return { freq:this.data.freq, time:this.data.time }
    }

}
