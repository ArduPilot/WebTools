
ang_pos = {}
ang_vel = {}
ang_accel = {}
ang_jerk = {}
function initial_load()
{
    const time_scale_label = "Time (s)"
    let plot

    // position
    ang_pos.data = [
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg", name: 'Sqrt' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg", name: 'SCurve' }
    ]

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
    ang_vel.data = [
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s", name: 'Sqrt' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s", name: 'SCurve' },
    ]

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
    ang_accel.data = [
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s²", name: 'Sqrt' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s²", name: 'SCurve' },
    ]

    ang_accel.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label } },
        yaxis: { title: {text: "Angular Acceleration (deg/s²)" } }
    }

    plot = document.getElementById("ang_accel")
    Plotly.purge(plot)
    Plotly.newPlot(plot, ang_accel.data, ang_accel.layout, { displaylogo: false })

    // Jerk
    ang_jerk.data = [
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s³", name: 'Sqrt' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s³", name: 'SCurve' },
    ]

    ang_jerk.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label } },
        yaxis: { title: {text: "Jerk (deg/s³)" } }
    }

    plot = document.getElementById("ang_jerk")
    Plotly.purge(plot)
    Plotly.newPlot(plot, ang_jerk.data, ang_jerk.layout, { displaylogo: false })

    // Link all time axis
    link_plot_axis_range([
        ["ang_pos", "x", "", ang_pos],
        ["ang_vel", "x", "", ang_vel],
        ["ang_accel", "x", "", ang_accel],
        ["ang_jerk", "x", "", ang_jerk],
    ])

    // Link plot reset
    link_plot_reset([
        ["ang_pos", ang_pos],
        ["ang_vel", ang_vel],
        ["ang_accel", ang_accel],
        ["ang_jerk", ang_jerk],
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

function updateSqrtControl(config, desired, state, dt)
{
    const i = state.pos.length

    let vel_target
    if (config.mode.use_pos) {

        let desired_ang_vel = 0
        if (config.mode.use_vel) {
            desired_ang_vel = desired.vel
        }
        const pos_error = wrap_PI(desired.pos - state.pos[i-1])
        vel_target = input_shaping_angle(pos_error, config.input_tc, config.accel_limit, state.vel[i-1], desired_ang_vel, config.vel_limit, dt)

    } else if (config.mode.use_vel) {
        vel_target = input_shaping_ang_vel(state.vel[i-1], desired.vel, config.accel_limit, dt, config.rate_tc)
    }

    if (is_positive(config.vel_limit)) {
        vel_target = constrain_float(vel_target, -config.vel_limit, config.vel_limit)
    }

    // update velocity
    state.vel[i] = vel_target

    // Integrate to position
    state.pos[i] = wrap_PI(state.pos[i-1] + (state.vel[i-1] + vel_target) * dt * 0.5)

    // Differentiate to accel
    state.accel[i] = (vel_target - state.vel[i-1]) / dt

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

// Applies jerk-limited shaping to the acceleration value to gradually approach a new target.
// - Constrains the rate of change of acceleration to be within ±`jerk_max` over time `dt`.
// - The current acceleration value is modified in-place.
// Useful for ensuring smooth transitions in thrust or lean angle command profiles.
function shape_accel(accel_input, accel, jerk_max, dt)
{
    // sanity check jerk_max
    if (!is_positive(jerk_max)) {
        return;
    }

    // jerk limit acceleration change
    if (is_positive(dt)) {
        let accel_delta = accel_input - accel;
        accel_delta = constrain_float(accel_delta, -jerk_max * dt, jerk_max * dt);
        accel += accel_delta;
    }

    return accel
}

// Shapes velocity and acceleration using jerk-limited control.
// - Computes correction acceleration needed to reach `vel_input` from current `vel`.
// - Uses a square-root controller with max acceleration and jerk constraints.
// - Correction is combined with feedforward `accel_input`.
// - If `limit_total_accel` is true, total acceleration is constrained to `accel_min` / `accel_max`.
// The result is applied via `shape_accel`.
function shape_vel_accel(vel_input, accel_input, vel, accel, accel_min, accel_max, jerk_max, dt, limit_total_accel)
{
    // sanity check accel_min, accel_max and jerk_max.
    if (!is_negative(accel_min) || !is_positive(accel_max) || !is_positive(jerk_max)) {
        return;
    }

    // velocity error to be corrected
    const vel_error = vel_input - vel;

    // Calculate time constants and limits to ensure stable operation
    // The direction of acceleration limit is the same as the velocity error.
    // This is because the velocity error is negative when slowing down while
    // closing a positive position error.
    let  KPa;
    if (is_positive(vel_error)) {
        KPa = jerk_max / accel_max;
    } else {
        KPa = jerk_max / (-accel_min);
    }

    // acceleration to correct velocity
    let accel_target = sqrt_controller(vel_error, KPa, jerk_max, dt);

    // constrain correction acceleration from accel_min to accel_max
    accel_target = constrain_float(accel_target, accel_min, accel_max);

    // velocity correction with input velocity
    accel_target += accel_input;

    // Constrain total acceleration if limiting is enabled
    if (limit_total_accel) {
        accel_target = constrain_float(accel_target, accel_min, accel_max);
    }

    return shape_accel(accel_target, accel, jerk_max, dt);
}

// Computes a jerk-limited acceleration command to follow an angular position, velocity, and acceleration target.
// - This function applies jerk-limited shaping to angular acceleration, based on input angle, angular velocity, and angular acceleration.
// - Internally computes a target angular velocity using a square-root controller on the angle error.
// - Velocity and acceleration are both optionally constrained:
//   - If `limit_total` is true, limits apply to the total (not just correction) command.
//   - Setting `angle_vel_max` or `angle_accel_max` to zero disables that respective limit.
// - The acceleration output is shaped toward the target using `shape_vel_accel`.
// Used for attitude control with limited angular velocity and angular acceleration (e.g., roll/pitch shaping).
function shape_angle_vel_accel(angle_input, angle_vel_input, angle_accel_input, angle, angle_vel, angle_accel, angle_vel_max, angle_accel_max, angle_jerk_max, dt, limit_total)
{
    // sanity check accel_max
    if (!is_positive(angle_accel_max)) {
        return;
    }

    // Estimate time to decelerate based on current angular velocity and acceleration limit
    const stopping_time = Math.abs(angle_vel / angle_accel_max);

    // Compute total angular error with prediction of future motion, then wrap to [-π, π]
    let angle_error = angle_input - angle - angle_vel * stopping_time;
    angle_error = wrap_PI(angle_error);
    angle_error += angle_vel * stopping_time;

    // Calculate time constants and limits to ensure stable operation
    // These ensure the square-root controller respects angular acceleration and jerk constraints
    const angle_accel_tc_max = 0.5 * angle_accel_max;
    const KPv = 0.5 * angle_jerk_max / angle_accel_max;

    // velocity to correct position
    let angle_vel_target = sqrt_controller(angle_error, KPv, angle_accel_tc_max, dt);

    // limit velocity to vel_max
    if (is_positive(angle_vel_max)) {
        angle_vel_target = constrain_float(angle_vel_target, -angle_vel_max, angle_vel_max);
    }

    // velocity correction with input velocity
    angle_vel_target += angle_vel_input;

    // Constrain total velocity if limiting is enabled and angle_vel_max is positive 
    if (limit_total && is_positive(angle_vel_max)) {
        angle_vel_target = constrain_float(angle_vel_target, -angle_vel_max, angle_vel_max);
    }

    // Shape the angular acceleration using jerk-limited profile
    return shape_vel_accel(angle_vel_target, angle_accel_input, angle_vel, angle_accel, -angle_accel_max, angle_accel_max, angle_jerk_max, dt, limit_total);
}

function updateSCurve(config, desired, state, dt)
{
    const i = state.pos.length

    let accel
    if (config.mode.use_pos) {

        let desired_ang_vel = 0
        if (config.mode.use_vel) {
            desired_ang_vel = desired.vel
        }
        const jerkLimit = config.accel_limit / config.input_tc

        accel = shape_angle_vel_accel(desired.pos, desired_ang_vel, 0.0, state.pos[i-1], state.vel[i-1], state.accel[i-1], config.vel_limit, config.accel_limit, jerkLimit, dt, false)

    } else if (config.mode.use_vel) {

        const jerkLimit = config.accel_limit / config.rate_tc

        accel = shape_vel_accel(desired.vel, 0.0, state.vel[i-1], state.accel[i-1], -config.accel_limit, config.accel_limit, jerkLimit, dt, false)

    }

    const delta_pos = state.vel[i-1] * dt + accel * 0.5 * sq(dt)
    state.pos[i] =  wrap_PI(state.pos[i-1] + delta_pos)

    const delta_vel = accel * dt
    state.vel[i] = state.vel[i-1] + delta_vel

    state.accel[i] = accel

}

function run_attitude()
{
    const param_names = update_axis()
    const mode = update_mode(param_names)

    const desired = {
        pos: wrap_PI(radians(parseFloat(document.getElementById("desired_pos").value))),
        vel: radians(parseFloat(document.getElementById("desired_vel").value)),
    }

    const end_time = parseFloat(document.getElementById("end_time").value)
    const max_time = 20

    const dt = 1/400

    const config = {
        mode,
        vel_limit: radians(parseFloat(document.getElementById(param_names.rate_max).value)),
        accel_limit: radians(parseFloat(document.getElementById(param_names.accel_max).value) * 0.01),
        input_tc: parseFloat(document.getElementById("ATC_INPUT_TC").value),
        rate_tc: parseFloat(document.getElementById(param_names.rate_tc).value),
    }

    const pos_tol = radians(0.1)
    const vel_tol = radians(0.1)

    // Initial state
    let time = [0]
    const sqrtState = {
        pos: [wrap_PI(radians(parseFloat(document.getElementById("initial_pos").value)))],
        vel: [radians(parseFloat(document.getElementById("initial_vel").value))],
        accel: [0]
    }
    const SCurveState = {
        pos: [wrap_PI(radians(parseFloat(document.getElementById("initial_pos").value)))],
        vel: [radians(parseFloat(document.getElementById("initial_vel").value))],
        accel: [0]
    }

    // Run until current reaches target
    let i = 1
    let done_time
    while(true) {

        updateSqrtControl(config, desired, sqrtState, dt)
        updateSCurve(config, desired, SCurveState, dt)

        // update time
        time[i] = i * dt

        // Check if the target has been reached
        if (done_time == null) {
            let done = false
            if (mode.use_pos) {
                done = Math.abs(wrap_PI(desired.pos - sqrtState.pos[i])) < pos_tol &&
                        Math.abs(wrap_PI(desired.pos - SCurveState.pos[i])) < pos_tol

            } else if (mode.use_vel) {
                done = Math.abs(desired.vel - sqrtState.vel[i]) < vel_tol &&
                        Math.abs(desired.vel - SCurveState.vel[i]) < vel_tol
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

    // Update plots
    ang_pos.data[0].x = time
    ang_pos.data[0].y = array_scale(sqrtState.pos, 180.0 / Math.PI)
    ang_pos.data[1].x = time
    ang_pos.data[1].y = array_scale(SCurveState.pos, 180.0 / Math.PI)
    ang_pos.layout.shapes[0].y0 = degrees(desired.pos)
    ang_pos.layout.shapes[0].y1 = degrees(desired.pos)
    ang_pos.layout.shapes[0].visible = mode.use_pos
    Plotly.redraw("ang_pos")

    ang_vel.data[0].x = time
    ang_vel.data[0].y = array_scale(sqrtState.vel, 180.0 / Math.PI)
    ang_vel.data[1].x = time
    ang_vel.data[1].y = array_scale(SCurveState.vel, 180.0 / Math.PI)
    ang_vel.layout.shapes[0].y0 = degrees(desired.vel)
    ang_vel.layout.shapes[0].y1 = degrees(desired.vel)
    ang_vel.layout.shapes[0].visible = mode.use_vel
    Plotly.redraw("ang_vel")

    ang_accel.data[0].x = time
    ang_accel.data[0].y = array_scale(sqrtState.accel, 180.0 / Math.PI)
    ang_accel.data[1].x = time
    ang_accel.data[1].y = array_scale(SCurveState.accel, 180.0 / Math.PI)
    Plotly.redraw("ang_accel")

    // Calculate jerk by differentiating accel
    const jerkTime = array_offset(time.slice(0, -1), dt * 0.5)
    const sqrtJerk = array_scale(array_sub(sqrtState.accel.slice(1), sqrtState.accel.slice(0, -1)), (1 / dt) * (180.0 / Math.PI))
    const SCurveJerk = array_scale(array_sub(SCurveState.accel.slice(1), SCurveState.accel.slice(0, -1)), (1 / dt) * (180.0 / Math.PI))

    ang_jerk.data[0].x = jerkTime
    ang_jerk.data[0].y = sqrtJerk
    ang_jerk.data[1].x = jerkTime
    ang_jerk.data[1].y = SCurveJerk
    Plotly.redraw("ang_jerk")

}
