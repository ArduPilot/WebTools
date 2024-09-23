// Throttle target
class ThrottleTarget extends NotchTarget {
    constructor(log) {
        super(log, "RATE", "AOut", "Throttle", 1)

        // Read params
        const PARM = log.get("PARM")

        // Get RC output functions
        const functions = new Array(32)
        for (let i = 0; i<functions.length; i++) {
            functions[i] = get_param_value(PARM, "SERVO" + (i+1) + "_FUNCTION")
        }

        const k_motor1 = 33
        const k_motor8 = 40
        const k_motor9 = 82
        const k_motor12 = 85

        // return true if function is for a multicopter motor
        function is_motor(val) {
            if (val == null) {
                return false
            }

            return (val >= k_motor1 && val <= k_motor8) ||
                   (val >= k_motor9 && val <= k_motor12)
        }

        // given a zero-based motor channel, return the k_motor function for that channel
        function get_motor_function(channel) {
            if (channel < 8) {
                return k_motor1+channel
            }
            return k_motor9 + channel - 8
        }

        // Count motor functions
        let motor_count = 0
        for (let i = 0; i<functions.length; i++) {
            if (is_motor(functions[i])) {
                motor_count += 1
            }
        }

        // Try to workout how many motors we should have
        let frame_class = get_param_value(PARM, "FRAME_CLASS")
        if (frame_class == null) {
            frame_class = get_param_value(PARM, "Q_FRAME_CLASS")
        }

        const motor_frame_class = {
            QUAD: { value: 1, count: 4 },
            HEXA: { value: 2, count: 6 },
            OCTA: { value: 3, count: 8 },
            OCTAQUAD: { value: 4, count: 8 },
            Y6: { value: 5, count: 6 },
            TRI: { value: 7, count: 4 }, // Not all are really motors
            SINGLE: { value: 8, count: 6 }, // Not all are really motors
            COAX: { value: 9, count: 6 }, // Not all are really motors
            //TAILSITTER: { value: 10, count: 4 },
            DODECAHEXA: { value: 12, count: 12 },
            DECA: { value: 14, count: 10 },
            SCRIPTING_MATRIX: { value: 15, count: motor_count },
            _6DOF_SCRIPTING: { value: 16, count: motor_count },
            DYNAMIC_SCRIPTING_MATRIX: { value: 17, count: motor_count },
        }

        let motors = []
        for (const [name, value] of Object.entries(motor_frame_class)) {
            if (value.value != frame_class) {
                continue
            }
            if (motor_count != value.count) {
                console.log("Expected " + value.count + " motors for frame class: " + name)
                return
            }
            for (let i = 0; i<value.count; i++) {
                motors.push(get_motor_function(i))
            }
            break
        }

        // These frame classes don't use all the motor outputs for motors
        if (frame_class == motor_frame_class.TRI.value) {
            motors = [ get_motor_function(0),
                       get_motor_function(1),
                       get_motor_function(3) ]

        } else if ((frame_class == motor_frame_class.SINGLE.value) || (frame_class == motor_frame_class.COAX.value)) {
            motors = [ get_motor_function(5),
                       get_motor_function(6) ]

        } else if (frame_class == 10) {
            // Tailsitter doesn't use the motor outputs at all
            motors = [ 73, // throttle left
                       74 ] // throttle right
        }

        if (motors.length == 0) {
            console.log("Unknown frame class: " + frame_class)
            return
        }

        for (const motor of motors) {
            if (!functions.includes(motor)) {
                console.log("Could not find servo assigned to function: " + motor)
                return
            }
        }

        // Load motor params
        // Default options to 0 so there is no error if it is missing
        const mot_params = { OPTIONS: 0 }
        for (const name of ["THST_EXPO", "SPIN_MAX", "SPIN_MIN", "PWM_MIN", "PWM_MAX", "BAT_VOLT_MIN", "BAT_VOLT_MAX", "BAT_IDX", "OPTIONS"]) {
            const has_default = mot_params[name] != null
            for (const prefix of ["MOT_", "Q_M_"]) {
                const param_name = prefix + name
                const param_value = get_param_value(PARM, param_name)
                if (param_value != null) {
                    if (!has_default && (name in mot_params)) {
                        alert("Unexpected motor param: " + param_name)
                    }
                    mot_params[name] = param_value
                }
            }
            if (mot_params[name] == null) {
                // Need all params to extract throttle
                console.log("Missing motor param: " + name)
                return
            }
        }

        // Thrust expo must be in the range +- 1.0
        mot_params.THST_EXPO = Math.min(Math.max(mot_params.THST_EXPO, -1.0), 1.0)

        // Battery compensation
        const skip_battery_comp = (mot_params.BAT_VOLT_MAX <= 0) || (mot_params.BAT_VOLT_MIN >= mot_params.BAT_VOLT_MAX)
        let batt_time = null
        let batt_voltage = 1.0
        let lift_max = 1.0
        if (!skip_battery_comp) {
            // Check for battery log
            if (!("BAT" in log.messageTypes) || !("instances" in log.messageTypes.BAT) || !(mot_params.BAT_IDX in log.messageTypes.BAT.instances)) {
                console.log("No battery logging for multi throttle notch")
                return
            }

            const use_raw_voltage = (mot_params.OPTIONS & 1) != 0
            batt_time = log.get_instance("BAT", mot_params.BAT_IDX, "TimeUS")
            const voltage = log.get_instance("BAT", mot_params.BAT_IDX, use_raw_voltage ? "Volt" : "VoltR")

            // Calculate lift max and normalized battery voltage
            const len = voltage.length
            batt_voltage = new Array(len)
            lift_max = new Array(len)
            const min_volt_threshold = 0.25 * mot_params.BAT_VOLT_MIN
            for (let i = 0; i<len; i++) {
                if (voltage[i] < min_volt_threshold) {
                    batt_voltage[i] = 1.0
                    lift_max[i] = 1.0
                }

                // Constrain to range and normalize
                let constrained = Math.min(Math.max(voltage[i], mot_params.BAT_VOLT_MIN), mot_params.BAT_VOLT_MAX)
                batt_voltage[i] = constrained / mot_params.BAT_VOLT_MAX

                // Calculate lift max
                lift_max[i] = batt_voltage[i] *  (1 - mot_params.THST_EXPO) + mot_params.THST_EXPO * batt_voltage[i] * batt_voltage[i]
            }
        }

        // Air density correction
        const primary_baro = get_param_value(PARM, "BARO_PRIMARY")
        if (!("BARO" in log.messageTypes) || !("instances" in log.messageTypes.BARO) || !(primary_baro in log.messageTypes.BARO.instances)) {
            console.log("No barometer logging for multi throttle notch")
            return

        }

        const baro_time = log.get_instance("BARO", primary_baro, "TimeUS")
        const baro_alt = log.get_instance("BARO", primary_baro, "Alt")

        const air_density_model = get_air_density_model()
        const baro_len = baro_time.length
        const air_density_correction = new Array(baro_len)
        for (let i = 0; i<baro_len; i++) {
            const air_density_ratio = 1.0 / Math.pow(air_density_model.get_EAS2TAS(baro_alt[i]), 2.0)
            if (air_density_ratio > 0.3 && air_density_ratio < 1.5) {
                air_density_correction[i] = 1.0 / Math.min(Math.max(air_density_ratio, 0.5), 1.25)
            } else {
                air_density_correction[i] = 1.0
            }
        }

        // Read in PWM

        // Get the log message name to look in for the given channel
        function get_log_msg_name(channel) {
            if (channel < 14) {
                return "RCOU"
            }
            if (channel < 18) {
                return "RCO2"
            }
            return "RCO3"
        }

        // Find each motor function in the log
        var instances = 0
        for (const motor of motors) {
            const channel = functions.findIndex(f => f === motor)
            if (channel == -1) {
                // This really should not happen if we got this far
                console.log("Could not find servo assigned to function: " + motor)
                return
            }
            const log_name = get_log_msg_name(channel)
            const field_name = "C" + (channel + 1)
            const PWM = log.get(log_name, field_name)
            const len = PWM.length

            const time = log.get(log_name, "TimeUS")

            // Interpolate battery and baro corrections to the PWM time
            const density_correction = linear_interp(air_density_correction, baro_time, time)

            let batt_correction
            let lift_correction
            if (!skip_battery_comp) {
                batt_correction = linear_interp(batt_voltage, batt_time, time)
                lift_correction = linear_interp(lift_max, batt_time, time)
            }

            const thrust = new Array(len)
            for (let i = 0; i<len; i++) {
                // Calculate actuator output using PWM min and max
                let throttle = (PWM[i] - mot_params.PWM_MIN) / (mot_params.PWM_MAX - mot_params.PWM_MIN)

                // Remove spin min and max
                throttle = (throttle - mot_params.SPIN_MIN) / (mot_params.SPIN_MAX - mot_params.SPIN_MIN)

                // Constrain 0 to 1
                throttle = Math.min(Math.max(throttle, 0.0), 1.0)

                function remove_thrust_curve_and_volt_scaling(throttle, batt_voltage_filt, lift_max) {
                    let battery_scale = 1.0
                    if (batt_voltage_filt > 0) {
                        battery_scale = 1.0 / batt_voltage_filt
                    }
                    // apply thrust curve - domain -1.0 to 1.0, range -1.0 to 1.0
                    const thrust_curve_expo = mot_params.THST_EXPO
                    if (thrust_curve_expo == 0) {
                        // zero expo means linear, avoid floating point exception for small values
                        return  throttle / (lift_max * battery_scale)
                    }
                    let thrust = ((throttle / battery_scale) * (2.0 * thrust_curve_expo)) - (thrust_curve_expo - 1.0)
                    thrust = (thrust * thrust) - ((1.0 - thrust_curve_expo) * (1.0 - thrust_curve_expo))
                    thrust /=  4.0 * thrust_curve_expo * lift_max
                    return Math.min(Math.max(thrust, 0.0), 1.0)
                }

                const lift_max = skip_battery_comp ? 1.0 : lift_correction[i]

                thrust[i] = remove_thrust_curve_and_volt_scaling(throttle, skip_battery_comp ? 1.0 : batt_correction[i], lift_max)

                function get_compensation_gain(lift_max, air_density_ratio) {
                    if (lift_max <= 0) {
                        return 1.0 
                    }
                    return (1.0 / lift_max) * air_density_ratio
                 }

                thrust[i] /= get_compensation_gain(lift_max, density_correction[i])
            }

            this.data[instances] = { time: TimeUS_to_seconds(time), thrust }
            instances++
        }

    }

    no_data_error(config) {
        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            if (this.data.length == 0) {
                alert("No tracking data available for multi-Source throttle notch")
                return
            }
            if (get_filter_version() != 2) {
                alert("Multi-Source throttle notch only available on filter V2")
                return
            }
        }
        super.no_data_error()
    }

    have_data(config) {
        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            if (this.data.length == 0) {
                return false
            }
            if (get_filter_version() != 2) {
                return false
            }
        }
        return "value" in this.data
    }

    get_target(config, thrust) {
        if (config.ref == 0) {
            return config.freq
        }
        const motors_throttle = Math.max(0, thrust)
        const throttle_norm = Math.sqrt(motors_throttle / config.ref)
        if (get_filter_version() == 2) {
            return config.freq * throttle_norm
        }
        return config.freq * Math.max(config.min_ratio, throttle_norm)
    }

    get_target_freq_index(config, index) {
        return this.get_target(config, this.data.value[index])
    }

    interpolate(instance, time) {
        if (!("value" in this.data)) {
            return
        }
        if (this.data.interpolated == null) {
            this.data.interpolated = []
        }
        this.data.interpolated[instance] = {}
        this.data.interpolated[instance].value = linear_interp(this.data.value, this.data.time, time)

        for (let i = 0; i<this.data.length; i++) {
            this.data.interpolated[instance][i] = linear_interp(this.data[i].thrust, this.data[i].time, time)
        }
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

        return [this.get_target(config, this.data.interpolated[instance].value[index])]
    }

    get_target_freq(config) {
        if (!this.have_data(config)) {
            return
        }

        const dynamic = (config.options & (1<<1)) != 0
        if (dynamic) {
            // Tracking multiple peaks
            const len = this.data.length
            let freq = new Array(len)
            let time = new Array(len)
            for (let i = 0; i < len; i++) {
                const inst_len = this.data[i].thrust.length
                let inst_freq = new Array(inst_len)
                for (let j = 0; j < inst_len; j++) {
                    inst_freq[j] = this.get_target(config, this.data[i].thrust[j])
                }
                time[i] = this.data[i].time
                freq[i] = inst_freq
            }
            return { freq:freq, time:time }
        }

        // Just average
        const len = this.data.value.length
        let freq = new Array(len)
        for (let i = 0; i < len; i++) {
            freq[i] = this.get_target(config, this.data.value[i])
        }
        return { freq:freq, time:this.data.time }
    }
}
