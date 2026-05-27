var ardupilotModule
const import_done = new Promise((resolve) => {
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
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg", name: 'Pre 4.8' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg", name: '4.8 +' },
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
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s", name: 'Pre 4.8' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s", name: '4.8 +' },
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
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s²", name: 'Pre 4.8' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s²", name: '4.8 +' },
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
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s³", name: 'Pre 4.8' },
        { mode: 'lines', hovertemplate: "<extra></extra>%{x:.2f} s<br>%{y:.2f} deg/s³", name: '4.8 +' },
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

function update_axis()
{
    const axi = document.querySelector('input[name="axis"]:checked').value
    switch (axi) {
        case "R":
            document.getElementById("roll_params").hidden = false
            document.getElementById("pitch_params").hidden = true
            const rateLimit = parseFloat(document.getElementById("RLL2SRV_RMAX").value)
            return {
                rateMax: rateLimit,
                rateMin: rateLimit,
                accelMax: parseFloat(document.getElementById("RLL2SRV_ACCEL").value),
                timeConstant: parseFloat(document.getElementById("RLL2SRV_TCONST").value),
            }

        case "P":
            document.getElementById("roll_params").hidden = true
            document.getElementById("pitch_params").hidden = false
            return {
                rateMax: parseFloat(document.getElementById("PTCH2SRV_RMAX_UP").value),
                rateMin: parseFloat(document.getElementById("PTCH2SRV_RMAX_DN").value),
                accelMax: parseFloat(document.getElementById("PTCH2SRV_ACCEL").value),
                timeConstant: parseFloat(document.getElementById("PTCH2SRV_TCONST").value),
            }
    }
}

function update_mode()
{
    // Enable all
    document.getElementById("desired_pos").disabled = false
    document.getElementById("desired_vel").disabled = false

    const mode = document.querySelector('input[name="mode"]:checked').value
    switch (mode) {
        case "angle":
            document.getElementById("desired_vel").disabled = true
            return { use_pos: true, use_vel: false }

        case "rate":
            document.getElementById("desired_pos").disabled = true
            return { use_pos: false, use_vel: true }
    }
}

function wrap_360(x)
{
    let ret = x % 360.0
    if (ret < 0.0) {
        ret += 360.0
    }
    return ret
}

function wrap_180(x)
{
    let ret = wrap_360(x)
    if (ret > 180.0) {
        ret -= 360.0
    }
    return ret
}

function updateOld(params, mode, desired, state, dt)
{
    const i = state.pos.length

    let vel_target
    if (mode.use_pos) {

        let desired_ang_vel = 0
        if (mode.use_vel) {
            desired_ang_vel = desired.vel
        }
        const pos_error = wrap_180(desired.pos - state.pos[i-1])
        vel_target = pos_error / params.timeConstant

        if (params.rateMax > 0) {
            vel_target = Math.min(params.rateMax, vel_target)
        }
        if (params.rateMin > 0) {
            vel_target = Math.max(-params.rateMin, vel_target)
        }

    } else if (mode.use_vel) {
        vel_target = desired.vel
    }

    // update velocity
    state.vel[i] = vel_target

    // Integrate to position
    state.pos[i] = wrap_180(state.pos[i-1] + (state.vel[i-1] + vel_target) * dt * 0.5)

    // Differentiate to accel
    state.accel[i] = (vel_target - state.vel[i-1]) / dt

}

function updateInputShaping(params, mode, desired, state, dt)
{
    const i = state.pos.length

    const jerk_limit = params.accelMax / Math.max(params.timeConstant, 0.1);

    let accel
    if (mode.use_pos) {
        // Ensure the shortest path is taken
        const angle_error = wrap_180(desired.pos - state.pos[i-1]);

        accel = ardupilotModule._shape_pos_vel_accel_wrapper(
            angle_error, 0.0, 0.0, // desired pos, vel and accel
            0.0, state.vel[i-1], state.accel[i-1], // current shaped target
            -params.rateMin, params.rateMax, // velocity limits
            -params.accelMax, params.accelMax, // accel limits
            jerk_limit,
            dt, true)

    } else if (mode.use_vel) {
        accel = ardupilotModule._shape_pos_vel_accel_wrapper(
            0.0, desired.vel, 0.0, // desired pos, vel and accel
            0.0, state.vel[i-1], state.accel[i-1], // current shaped target
            -params.rateMin, params.rateMax, // velocity limits
            -params.accelMax, params.accelMax, // accel limits
            jerk_limit, // jerk limit
            dt, true)
    }

    const delta_pos = state.vel[i-1] * dt + accel * 0.5 * Math.pow(dt, 2.0)
    state.pos[i] =  wrap_180(state.pos[i-1] + delta_pos)

    const delta_vel = accel * dt
    state.vel[i] = state.vel[i-1] + delta_vel

    state.accel[i] = accel

}

async function run_attitude()
{
    await import_done

    const params = update_axis()
    const mode = update_mode()

    const desired = {
        pos: wrap_180(parseFloat(document.getElementById("desired_pos").value)),
        vel: parseFloat(document.getElementById("desired_vel").value),
    }

    const end_time = parseFloat(document.getElementById("end_time").value)
    const max_time = 20

    const dt = 1/50

    const pos_tol = 0.1
    const vel_tol = 0.1

    // Initial state
    let time = [0]
    const oldState = {
        pos: [wrap_180(parseFloat(document.getElementById("initial_pos").value))],
        vel: [parseFloat(document.getElementById("initial_vel").value)],
        accel: [0]
    }
    const SCurveState = {
        pos: [wrap_180(parseFloat(document.getElementById("initial_pos").value))],
        vel: [parseFloat(document.getElementById("initial_vel").value)],
        accel: [0]
    }

    // Run until current reaches target
    let i = 1
    let done_time
    while(true) {

        updateOld(params, mode, desired, oldState, dt)
        updateInputShaping(params, mode, desired, SCurveState, dt)

        // update time
        time[i] = i * dt

        // Check if the target has been reached
        if (done_time == null) {
            let done = false
            if (mode.use_pos) {
                done = Math.abs(wrap_180(desired.pos - oldState.pos[i])) < pos_tol &&
                        Math.abs(wrap_180(desired.pos - SCurveState.pos[i])) < pos_tol

            } else if (mode.use_vel) {
                done = Math.abs(desired.vel - oldState.vel[i]) < vel_tol &&
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
    ang_pos.data[0].y = oldState.pos
    ang_pos.data[1].x = time
    ang_pos.data[1].y = SCurveState.pos
    ang_pos.layout.shapes[0].y0 = desired.pos
    ang_pos.layout.shapes[0].y1 = desired.pos
    ang_pos.layout.shapes[0].visible = mode.use_pos
    Plotly.redraw("ang_pos")

    ang_vel.data[0].x = time
    ang_vel.data[0].y = oldState.vel
    ang_vel.data[1].x = time
    ang_vel.data[1].y = SCurveState.vel
    ang_vel.layout.shapes[0].y0 = desired.vel
    ang_vel.layout.shapes[0].y1 = desired.vel
    ang_vel.layout.shapes[0].visible = mode.use_vel
    Plotly.redraw("ang_vel")

    // Since old controller is not accel limited plotting it blows up the scale
    //ang_accel.data[0].x = time
    //ang_accel.data[0].y = oldState.accel
    ang_accel.data[1].x = time
    ang_accel.data[1].y = SCurveState.accel
    Plotly.redraw("ang_accel")

    // Calculate jerk by differentiating accel
    const jerkTime = array_offset(time.slice(0, -1), dt * 0.5)
    //const oldJerk = array_scale(array_sub(oldState.accel.slice(1), oldState.accel.slice(0, -1)), 1 / dt)
    const SCurveJerk = array_scale(array_sub(SCurveState.accel.slice(1), SCurveState.accel.slice(0, -1)), 1 / dt)

    // Since old controller is not jerk limited plotting it blows up the scale
    //ang_jerk.data[0].x = jerkTime
    //ang_jerk.data[0].y = oldJerk
    ang_jerk.data[1].x = jerkTime
    ang_jerk.data[1].y = SCurveJerk
    Plotly.redraw("ang_jerk")

}
