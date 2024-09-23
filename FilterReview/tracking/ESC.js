// ESC tracking
class ESCTarget extends NotchTarget {
    constructor(log) {
        super(null, null, null, "ESC", 3)

        const msg = "ESC"
        if (!(msg in log.messageTypes) || !("instances" in log.messageTypes[msg])) {
            // No log data found
            return
        }

        // Individual RPM
        var instances = 0
        for (const inst of Object.keys(log.messageTypes[msg].instances)) {
            this.data[instances] = {}
            this.data[instances].time = TimeUS_to_seconds(log.get_instance(msg, inst, "TimeUS"))
            this.data[instances].freq = array_scale(log.get_instance(msg, inst, "RPM"), 1 / 60)
            instances++
        }

        // Average RPM
        this.data.avg_freq = []
        this.data.avg_time = []
        var inst = []
        let all = []
        for (let i=0;i<instances;i++) {
            inst[i] = { freq:null, time:null }
            const len = this.data[i].time.length
            for (let j=0;j<len;j++) {
                all.push({time: this.data[i].time[j], freq: this.data[i].freq[j], inst: i})
            }
        }

        // Sort by time
        all.sort((a, b) => { return a.time - b.time })

        const len = all.length
        for (let i=0;i<len;i++) {
            // Update instance
            const instance = all[i].inst
            inst[instance].freq = all[i].freq
            inst[instance].time_ms = all[i].time

            // Invalidate any instance that has timed out
            for (let j=0;j<instances;j++) {
                if ((j != instance) && (inst[j].time != null) && ((time_ms - inst[j].time) > 1)) {
                    inst[j].time = null
                    inst[j].freq = null
                }
            }

            // If a full set of valid instances take average
            var expected_count = 0
            var count = 0
            var sum = 0
            for (let j=0;j<instances;j++) {
                if (inst[j].freq != null) {
                    count++
                    sum += inst[j].freq
                }
                if (inst[j].time_ms != null) {
                    expected_count++
                }
            }

            if ((count > 0) && (count == expected_count)) {
                this.data.avg_freq.push(sum / count)
                this.data.avg_time.push(all[i].time)

                // Invalidate used values
                for (let j=0;j<instances;j++) {
                    inst[j].freq = null
                }
            }
        }
    }

    interpolate(instance, time) {
        if (!this.have_data()) {
            return
        }
        if (this.data.interpolated == null) {
            this.data.interpolated = []
        }
        this.data.interpolated[instance] = []
        for (var j=0; j < this.data.length; j++) {
            this.data.interpolated[instance][j] = linear_interp(this.data[j].freq, this.data[j].time, time)
        }
        this.data.interpolated[instance].avg_freq = linear_interp(this.data.avg_freq, this.data.avg_time, time)
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

    get_target(config, freq) {
        if (config.ref == 0) {
            return config.freq
        }
        if (get_filter_version() == 2) {
            return freq
        }
        return Math.max(freq, config.freq)
    }

    get_target_freq(config) {
        if (!this.have_data(config)) {
            return
        }

        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            // Tracking individual motor RPM's
            const len = this.data.length
            let freq = new Array(len)
            let time = new Array(len)

            for (let i = 0; i < len; i++) {
                const inst_len = this.data[i].freq.length
                let inst_freq = new Array(inst_len)
                for (let j = 0; j < inst_len; j++) {
                    inst_freq[j] = this.get_target(config, this.data[i].freq[j])
                }

                time[i] = this.data[i].time
                freq[i] = inst_freq
            }
            return { freq:freq, time:time }

        }

        // Tracking average motor rpm
        const len = this.data.avg_freq.length
        let freq = new Array(len)
        for (let j = 0; j < len; j++) {
            freq[j] = this.get_target(config, this.data.avg_freq[j])
        }

        return { freq:freq, time:this.data.avg_time }
    }

    get_mean() {
        if (!this.have_data()) {
            return
        }
        const mean_freq = this.get_mean_value(this.data.avg_time, this.data.avg_freq)
        if (mean_freq != undefined) {
            return mean_freq * 60
        }
    }

    get_num_motors() {
        if (this.have_data()) {
            return this.data.length
        }
    }

}
