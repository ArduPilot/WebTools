
ang_pos = {}
ang_vel = {}
ang_accel = {}
function initial_load()
{
    const time_scale_label = "Time (s)"
    let plot

    // position
    ang_pos.data = [{ mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg" }]

    ang_pos.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label } },
        yaxis: { title: {text: "Angle (deg)" } },
        shapes: [{
            type: 'line',
            line: { dash: "dot" },
            xref: 'paper',
            x0: 0,
            x1: 1,
            visible: false,
        }]
    }

    plot = document.getElementById("ang_pos")
    Plotly.purge(plot)
    Plotly.newPlot(plot, ang_pos.data, ang_pos.layout, { displaylogo: false })

    // velocity
    ang_vel.data = [{ mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s" }]

    ang_vel.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label } },
        yaxis: { title: {text: "Angular Velocity (deg/s)" } },
        shapes: [{
            type: 'line',
            line: { dash: "dot" },
            xref: 'paper',
            x0: 0,
            x1: 1,
            visible: false,
        }]
    }

    plot = document.getElementById("ang_vel")
    Plotly.purge(plot)
    Plotly.newPlot(plot, ang_vel.data, ang_vel.layout, { displaylogo: false })

    // Acceleration
    ang_accel.data = [{ mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s²" }]

    ang_accel.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label } },
        yaxis: { title: {text: "Angular Acceleration (deg/s²)" } }
    }

    plot = document.getElementById("ang_accel")
    Plotly.purge(plot)
    Plotly.newPlot(plot, ang_accel.data, ang_accel.layout, { displaylogo: false })

    // Link all time axis
    link_plot_axis_range([
        ["ang_pos", "x", "", ang_pos],
        ["ang_vel", "x", "", ang_vel],
        ["ang_accel", "x", "", ang_accel],
    ])

    // Link plot reset
    link_plot_reset([
        ["ang_pos", ang_pos],
        ["ang_vel", ang_vel],
        ["ang_accel", ang_accel],
    ])
}

function get_param_names_for_axi(axi)
{
    let rate_tc = "ACRO_RP_RATE_TC"
    if (axi == "Y") {
        rate_tc = "PILOT_Y_RATE_TC"
    }

    return {
        rate_max: "ATC_RATE_" + axi + "_MAX",
        accel_max: "ATC_ACCEL_" + axi + "_MAX",
        rate_tc
    }
}

function update_axis()
{
    const axi = document.querySelector('input[name="axis"]:checked').value

    const param_set_id = {
        R: ["roll_params", "rp_rate_tc"],
        P: ["pitch_params", "rp_rate_tc"],
        Y: ["yaw_params", "yaw_rate_tc"]
    }

    // Hide all
    for (const ids of Object.values(param_set_id)) {
        for (const id of ids) {
            document.getElementById(id).hidden = true
        }
    }

    // Show the selected
    for (const id of param_set_id[axi]) {
        document.getElementById(id).hidden = false
    }

    return get_param_names_for_axi(axi)
}

function update_mode(params)
{

    // Enable all
    for (const id of Object.values(params)) {
        document.getElementById(id).disabled = false
    }
    document.getElementById("ATC_INPUT_TC").disabled = false
    document.getElementById("desired_pos").disabled = false
    document.getElementById("desired_vel").disabled = false


    const mode = document.querySelector('input[name="mode"]:checked').value
    switch (mode) {
        case "angle":
            document.getElementById(params.rate_tc).disabled = true
            document.getElementById("desired_vel").disabled = true
            return { use_pos: true, use_vel: false }

        case "rate":
            document.getElementById("ATC_INPUT_TC").disabled = true
            document.getElementById("desired_pos").disabled = true
            return { use_pos: false, use_vel: true }

        case "angle+rate":
            document.getElementById(params.rate_tc).disabled = true
            return { use_pos: true, use_vel: true }
    }
}

function radians(deg)
{
    return deg * (Math.PI/180)
}

function degrees(rad)
{
    return rad * (180/Math.PI)
}

function wrap_PI(x)
{
    let ret = wrap_2PI(x)
    if (ret > Math.PI) {
        ret -= Math.PI * 2.0
    }
    return ret
}

function wrap_2PI(x)
{
    const M_2PI = Math.PI * 2.0
    let ret = x % M_2PI
    if (ret < 0.0) {
        ret += M_2PI
    }
    return ret
}

function is_positive(x)
{
    return x > 0.0
}

function is_negative(x)
{
    return x < 0.0
}

function is_zero(x)
{
    return !is_negative(x) && !is_positive(x)
}

function constrain_float(amt, low, high)
{
    if (amt < low) {
        return low
    }

    if (amt > high) {
        return high
    }

    return amt
}

function sq(x)
{
    return Math.pow(x, 2.0)
}

function safe_sqrt(x)
{
    let ret = Math.sqrt(x)
    if (Number.isNaN(ret)) {
        return 0
    }
    return ret
}

// sqrt_controller calculates the correction based on a proportional controller with piecewise sqrt sections to constrain second derivative.
function sqrt_controller(error, p, second_ord_lim, dt)
{
    let correction_rate
    if (is_negative(second_ord_lim) || is_zero(second_ord_lim)) {
        // second order limit is zero or negative.
        correction_rate = error * p
    } else if (is_zero(p)) {
        // P term is zero but we have a second order limit.
        if (is_positive(error)) {
            correction_rate = safe_sqrt(2.0 * second_ord_lim * (error))
        } else if (is_negative(error)) {
            correction_rate = -safe_sqrt(2.0 * second_ord_lim * (-error))
        } else {
            correction_rate = 0.0
        }
    } else {
        // Both the P and second order limit have been defined.
        const linear_dist = second_ord_lim / sq(p)
        if (error > linear_dist) {
            correction_rate = safe_sqrt(2.0 * second_ord_lim * (error - (linear_dist / 2.0)))
        } else if (error < -linear_dist) {
            correction_rate = -safe_sqrt(2.0 * second_ord_lim * (-error - (linear_dist / 2.0)))
        } else {
            correction_rate = error * p
        }
    }
    if (is_positive(dt)) {
        // this ensures we do not get small oscillations by over shooting the error correction in the last time step.
        return constrain_float(correction_rate, -Math.abs(error) / dt, Math.abs(error) / dt)
    } else {
        return correction_rate
    }
}

// Shapes the velocity request based on a rate time constant. The angular acceleration and deceleration is limited.
function input_shaping_ang_vel(target_ang_vel, desired_ang_vel, accel_max, dt, input_tc)
{
    if (is_positive(input_tc)) {
        // Calculate the acceleration to smoothly achieve rate. Jerk is not limited.
        const error_rate = desired_ang_vel - target_ang_vel
        const desired_ang_accel = sqrt_controller(error_rate, 1.0 / Math.max(input_tc, 0.01), 0.0, dt)
        desired_ang_vel = target_ang_vel + desired_ang_accel * dt
    }
    // Acceleration is limited directly to smooth the beginning of the curve.
    if (is_positive(accel_max)) {
        const delta_ang_vel = accel_max * dt
        return constrain_float(desired_ang_vel, target_ang_vel - delta_ang_vel, target_ang_vel + delta_ang_vel)
    } else {
        return desired_ang_vel
    }
}

// calculates the velocity correction from an angle error. The angular velocity has acceleration and
// deceleration limits including basic jerk limiting using _input_tc
function input_shaping_angle(error_angle, input_tc, accel_max, target_ang_vel, desired_ang_vel, max_ang_vel, dt)
{
    // Calculate the velocity as error approaches zero with acceleration limited by accel_max_radss
    desired_ang_vel += sqrt_controller(error_angle, 1.0 / Math.max(input_tc, 0.01), accel_max, dt)
    if (is_positive(max_ang_vel)) {
        desired_ang_vel = constrain_float(desired_ang_vel, -max_ang_vel, max_ang_vel)
    }

    // Acceleration is limited directly to smooth the beginning of the curve.
    return input_shaping_ang_vel(target_ang_vel, desired_ang_vel, accel_max, dt, 0.0)
}

function run_attitude()
{
    const param_names = update_axis()
    const mode = update_mode(param_names)

    const desired_pos = wrap_PI(radians(parseFloat(document.getElementById("desired_pos").value)))
    const desired_vel = radians(parseFloat(document.getElementById("desired_vel").value))
    const end_time = parseFloat(document.getElementById("end_time").value)
    const max_time = 20

    const dt = 1/400

    const vel_limit = radians(parseFloat(document.getElementById(param_names.rate_max).value))
    const accel_limit = radians(parseFloat(document.getElementById(param_names.accel_max).value) * 0.01)
    const input_tc = parseFloat(document.getElementById("ATC_INPUT_TC").value)
    const rate_tc = parseFloat(document.getElementById(param_names.rate_tc).value)

    const pos_tol = radians(0.1)
    const vel_tol = radians(0.1)

    // Initial state
    let time = [0]
    let pos = [wrap_PI(radians(parseFloat(document.getElementById("initial_pos").value)))]
    let vel = [radians(parseFloat(document.getElementById("initial_vel").value))]
    let accel = [0]

    // Run until current reaches target
    let i = 1
    let done_time
    while(true) {

        let vel_target
        if (mode.use_pos) {

            let desired_ang_vel = 0
            let max_ang_vel = 0
            if (mode.use_vel) {
                desired_ang_vel = desired_vel
                max_ang_vel = vel_limit
            }
            const pos_error = wrap_PI(desired_pos - pos[i-1])
            vel_target = input_shaping_angle(pos_error, input_tc, accel_limit, vel[i-1], desired_ang_vel, max_ang_vel, dt)

        } else if (mode.use_vel) {
            vel_target = input_shaping_ang_vel(vel[i-1], desired_vel, accel_limit, dt, rate_tc)
        }

        if (is_positive(vel_limit)) {
            vel_target = constrain_float(vel_target, -vel_limit, vel_limit)
        }

        // update velocity
        vel[i] = vel_target

        // Integrate to position
        pos[i] = wrap_PI(pos[i-1] + (vel[i-1] + vel_target) * dt * 0.5)

        // Differentiate to accel
        accel[i] = (vel_target - vel[i-1]) / dt

        // update time
        time[i] = i * dt

        // Check if the target has been reached
        if (done_time == null) {
            let done = false
            if (mode.use_pos) {
                done = Math.abs(wrap_PI(desired_pos - pos[i])) < pos_tol

            } else if (mode.use_vel) {
                done = Math.abs(desired_vel - vel[i]) < vel_tol
            }
            if (done) {
                done_time = time[i]
            }

        } else {
            if (time[i] > Math.max(done_time + 0.5, end_time)) {
                // Run for a short time after completion
                break
            }
        }


        if (time[i] >= max_time) {
            // Reached max time
            break
        }
        i++
    }

    // Convert to degrees
    for (let i = 0; i < pos.length; i++) {
        pos[i] = degrees(pos[i])
        vel[i] = degrees(vel[i])
        accel[i] = degrees(accel[i])
    }

    // Update plots
    ang_pos.data[0].x = time
    ang_pos.data[0].y = pos
    ang_pos.layout.shapes[0].y0 = degrees(desired_pos)
    ang_pos.layout.shapes[0].y1 = degrees(desired_pos)
    ang_pos.layout.shapes[0].visible = mode.use_pos
    Plotly.redraw("ang_pos")

    ang_vel.data[0].x = time
    ang_vel.data[0].y = vel
    ang_vel.layout.shapes[0].y0 = degrees(desired_vel)
    ang_vel.layout.shapes[0].y1 = degrees(desired_vel)
    ang_vel.layout.shapes[0].visible = mode.use_vel
    Plotly.redraw("ang_vel")

    ang_accel.data[0].x = time
    ang_accel.data[0].y = accel
    Plotly.redraw("ang_accel")

}