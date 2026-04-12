var RuckigModule
let import_done = []
import_done[0] = new Promise((resolve) => {
    import('./Ruckig/ruckig.js').then(async(mod) => { 
        RuckigModule = await mod.default()
        resolve()
    })
})

var ardupilotModule
import_done[1] = new Promise((resolve) => {
    ControlModule().then((Module) => {
        ardupilotModule = Module
        resolve();
    });
});

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
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg", name: 'Sqrt (pre 4.7)' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg", name: 'SCurve (4.7+)' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg", name: 'minimum time' },
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
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s", name: 'Sqrt (pre 4.7)' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s", name: 'SCurve (4.7+)' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s", name: 'minimum time' },
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
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s²", name: 'Sqrt (pre 4.7)' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s²", name: 'SCurve (4.7+)' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s²", name: 'minimum time' },
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
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s³", name: 'Sqrt (pre 4.7)' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s³", name: 'SCurve (4.7+)' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s³", name: 'minimum time' },
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
        accel_max: "ATC_ACC_" + axi + "_MAX",
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
        const desired_ang_accel = ardupilotModule._sqrt_controller_wrapper(error_rate, 1.0 / Math.max(input_tc, 0.01), 0.0, dt)
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
    desired_ang_vel += ardupilotModule._sqrt_controller_wrapper(error_angle, 1.0 / Math.max(input_tc, 0.01), accel_max, dt)
    if (is_positive(max_ang_vel)) {
        desired_ang_vel = constrain_float(desired_ang_vel, -max_ang_vel, max_ang_vel)
    }

    // Acceleration is limited directly to smooth the beginning of the curve.
    return input_shaping_ang_vel(target_ang_vel, desired_ang_vel, accel_max, dt, 0.0)
}


// calculates the velocity correction from an angle error. The angular velocity has acceleration and
// deceleration limits including basic jerk limiting using _input_tc
// Translated from `AC_AttitudeControl::attitude_command_model`
function attitude_command_model(error_angle, desired_ang_vel, target_ang_vel, target_ang_accel, max_ang_vel, accel_max, input_tc, dt)
{
    if (!is_positive(dt)) {
        return 0.0;
    }
    
    // protect against divide by zero
    if (!is_positive(accel_max)) {
        // no acceleration set so default to 1800 degrees/s²
        accel_max = radians(1800);
    }

    if (!is_positive(input_tc)) {
        // no acceleration set so default to achieve maximum acceleration in 10 clock cycles
        input_tc = dt * 10.0;
    }

    return ardupilotModule._shape_angle_vel_accel_wrapper(
        error_angle, desired_ang_vel, 0.0, // Target
        0.0, target_ang_vel, target_ang_accel, // Current
        -max_ang_vel, max_ang_vel, // Vel limits
        accel_max, // accel limit
        accel_max / input_tc, // jerk limit
        dt, true // time step and limit flag
    );
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

        accel = attitude_command_model(wrap_PI(desired.pos - state.pos[i-1]), desired_ang_vel, state.vel[i-1], state.accel[i-1], config.vel_limit, config.accel_limit, config.input_tc, dt)

    } else if (config.mode.use_vel) {
        accel = attitude_command_model(0.0, desired.vel, state.vel[i-1], state.accel[i-1], 0.0, config.accel_limit, config.rate_tc, dt)

    }

    const delta_pos = state.vel[i-1] * dt + accel * 0.5 * Math.pow(dt, 2.0)
    state.pos[i] =  wrap_PI(state.pos[i-1] + delta_pos)

    const delta_vel = accel * dt
    state.vel[i] = state.vel[i-1] + delta_vel

    state.accel[i] = accel

}

// Ruckig is a time-optimal jerk limited trajectory planner
// see: https://github.com/pantor/ruckig
function update_ruckig(config, desired, state, dt)
{
    function toWASM(vec) {
        const q = new RuckigModule.Vector()
        const len = vec.length
        q.resize(len, 0.0)
        for (let i = 0; i < len; i++) {
            q.set(i, vec[i])
        }
        return q
    }

    // Single DoF
    const input = new RuckigModule.InputParameter(1)

    // Start
    input.current_position = toWASM([state.pos[0]])
    input.current_velocity = toWASM([state.vel[0]])
    input.current_acceleration = toWASM([state.accel[0]])

    // Extract config
    let desired_ang_vel = 0
    let jerkLimit = Infinity
    if (config.mode.use_pos) {
        if (config.mode.use_vel) {
            desired_ang_vel = desired.vel
        }
        if (config.input_tc > 0) {
            jerkLimit = config.accel_limit / config.input_tc
        }
        input.control_interface = RuckigModule.ControlInterface.Position

    } else if (config.mode.use_vel) {
        if (config.rate_tc > 0) {
            jerkLimit = config.accel_limit / config.rate_tc
        }
        input.control_interface = RuckigModule.ControlInterface.Velocity
        desired_ang_vel = desired.vel

    }

    // End
    input.target_position = toWASM([desired.pos])
    input.target_velocity = toWASM([desired_ang_vel])
    input.target_acceleration = toWASM([0])

    // Limits
    let maxVel = Infinity
    if (config.vel_limit > 0) {
        maxVel = config.vel_limit
    }
    input.max_velocity = toWASM([maxVel])
    input.max_acceleration = toWASM([config.accel_limit])
    input.max_jerk = toWASM([jerkLimit])

    const trajectory = new RuckigModule.Trajectory(1);

    const ruckig = new RuckigModule.Ruckig(1);
    const result = ruckig.calculate(input, trajectory);

    if (result.value !== 0) {
        if (result.value === -100) {
            console.log('Invalid input parameters.')
        } else if (result.value === -101) {
            console.log('The trajectory duration exceeds its numerical limits.')
        } else if (result.value === -110) {
            console.log('ErrorExecutionTimeCalculation.')
        } else {
            console.log(`Unknown error (${result.value}).`)
        }
        return
    }

    const duration = trajectory.get_duration();

    state.time = []
    state.pos = []
    state.vel = []
    state.accel = []
    state.jerk = []
    for (const t of array_from_range(0, duration, dt)) {
        const stateAtTime = trajectory.at_time(t);

        state.time.push(t);
        state.pos.push(stateAtTime.position.get(0));
        state.vel.push(stateAtTime.velocity.get(0));
        state.accel.push(stateAtTime.acceleration.get(0));
        state.jerk.push(stateAtTime.jerk.get(0));
    }

}

async function run_attitude()
{
    await Promise.allSettled(import_done)

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
        accel_limit: radians(parseFloat(document.getElementById(param_names.accel_max).value)),
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
    const ruckigState = {
        time: [0],
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

    update_ruckig(config, desired, ruckigState, dt)

    // Update plots
    ang_pos.data[0].x = time
    ang_pos.data[0].y = array_scale(sqrtState.pos, 180.0 / Math.PI)
    ang_pos.data[1].x = time
    ang_pos.data[1].y = array_scale(SCurveState.pos, 180.0 / Math.PI)
    ang_pos.data[2].x = ruckigState.time
    ang_pos.data[2].y = array_scale(ruckigState.pos, 180.0 / Math.PI)
    ang_pos.layout.shapes[0].y0 = degrees(desired.pos)
    ang_pos.layout.shapes[0].y1 = degrees(desired.pos)
    ang_pos.layout.shapes[0].visible = mode.use_pos
    Plotly.redraw("ang_pos")

    ang_vel.data[0].x = time
    ang_vel.data[0].y = array_scale(sqrtState.vel, 180.0 / Math.PI)
    ang_vel.data[1].x = time
    ang_vel.data[1].y = array_scale(SCurveState.vel, 180.0 / Math.PI)
    ang_vel.data[2].x = ruckigState.time
    ang_vel.data[2].y = array_scale(ruckigState.vel, 180.0 / Math.PI)
    ang_vel.layout.shapes[0].y0 = degrees(desired.vel)
    ang_vel.layout.shapes[0].y1 = degrees(desired.vel)
    ang_vel.layout.shapes[0].visible = mode.use_vel
    Plotly.redraw("ang_vel")

    ang_accel.data[0].x = time
    ang_accel.data[0].y = array_scale(sqrtState.accel, 180.0 / Math.PI)
    ang_accel.data[1].x = time
    ang_accel.data[1].y = array_scale(SCurveState.accel, 180.0 / Math.PI)
    ang_accel.data[2].x = ruckigState.time
    ang_accel.data[2].y = array_scale(ruckigState.accel, 180.0 / Math.PI)
    Plotly.redraw("ang_accel")

    // Calculate jerk by differentiating accel
    const jerkTime = array_offset(time.slice(0, -1), dt * 0.5)
    //const sqrtJerk = array_scale(array_sub(sqrtState.accel.slice(1), sqrtState.accel.slice(0, -1)), (1 / dt) * (180.0 / Math.PI))
    const SCurveJerk = array_scale(array_sub(SCurveState.accel.slice(1), SCurveState.accel.slice(0, -1)), (1 / dt) * (180.0 / Math.PI))

    // Since sqrt controller is not jerk limited plotting it blows up the scale
    //ang_jerk.data[0].x = jerkTime
    //ang_jerk.data[0].y = sqrtJerk
    ang_jerk.data[1].x = jerkTime
    ang_jerk.data[1].y = SCurveJerk
    ang_jerk.data[2].x = ruckigState.time
    ang_jerk.data[2].y = array_scale(ruckigState.jerk, 180.0 / Math.PI)
    Plotly.redraw("ang_jerk")

}
