var ardupilotModule
const import_done = new Promise((resolve) => {
    WPNavModule().then((Module) => {
        ardupilotModule = Module
        resolve();
    });
});

pos_plot = {}
vel_plot = {}
accel_plot = {}
jerk_plot = {}
snap_plot = {}
wp_pos_plot = {}

function reset_wp_plot_data() {
    wp_pos_plot.data = [
        { 
            type:'scatter3d',
            x:[],
            y:[],
            z:[],
            meta: [ 1, 2, 3, 4 ],
            name: 'WP',
            mode: 'lines+markers',
            hovertemplate: "<extra></extra>WP: %{meta}<br> %{x:.0f} m<br>%{y:.0f} m<br>%{z:.0f} m"
        },
        {
            type:'scatter3d',
            x:[],
            y:[],
            z:[],
            name: 'Target',
            mode: 'lines',
            hovertemplate: "<extra></extra>N = %{y:.0f} m<br>E = %{x:.0f} m<br>U = %{z:.0f} m<br>Vel = %{line.color:.2f} m/s",
            line: {
                width: 10,
                color: [1], // Coloring based on Z values
                colorscale: "Viridis", // Color gradient
                colorbar: { 
                    title: "",
                    len: 0.75,
                    thickness: 40
                }
            },
        }
    ];
}


function initial_load()
{
    let plot;

    // Waypoints
    reset_wp_plot_data()

    wp_pos_plot.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        scene: {
            xaxis: { title: {text: "North (m)" }, autorange: false, zeroline: false, },
            yaxis: { title: {text: "East (m)"}, autorange: false, zeroline: false, },
            zaxis: { title: {text: "Up (m)" }, autorange: false, zeroline: false, },
            aspectmode: "cube"
            // aspectratio: { x: 1, y: 1, z: 1 }  // Equal scaling }  // Forces equal scaling on all axes
        }
    }

    plot = document.getElementById("waypoint_plot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, wp_pos_plot.data, wp_pos_plot.layout, { displaylogo: false })

    setup_kinematic_plots();

}

function setup_kinematic_plots() {

    const time_scale_label = "Time (s)";

    // Snap
    snap_plot.data = [];

    snap_plot.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label }, zeroline: false, showline: true, mirror: true },
        yaxis: { title: {text: "Snap (m/s⁴)" }, zeroline: false, showline: true, mirror: true },
        showlegend: true
    }

    plot = document.getElementById("snap_plot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, snap_plot.data, snap_plot.layout, { displaylogo: false })


    // Jerk
    jerk_plot.data = [];

    jerk_plot.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label }, zeroline: false, showline: true, mirror: true },
        yaxis: { title: {text: "Jerk (m/s³)" }, zeroline: false, showline: true, mirror: true},
        showlegend: true
    }

    plot = document.getElementById("jerk_plot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, jerk_plot.data, jerk_plot.layout, { displaylogo: false })

    // Acceleration
    accel_plot.data = []

    accel_plot.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label }, zeroline: false, showline: true, mirror: true },
        yaxis: { title: {text: "Acceleration (m/s²)" }, zeroline: false, showline: true, mirror: true},
        showlegend: true
    }

    plot = document.getElementById("accel_plot");
    Plotly.purge(plot);
    Plotly.newPlot(plot, accel_plot.data, accel_plot.layout, { displaylogo: false });

    // velocity
    vel_plot.data = [];

    vel_plot.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label }, zeroline: false, showline: true, mirror: true },
        yaxis: { title: {text: "Velocity (m/s)" }, zeroline: false, showline: true, mirror: true },
        showlegend: true,
    }

    plot = document.getElementById("vel_plot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, vel_plot.data, vel_plot.layout, { displaylogo: false })

    // position
    pos_plot.data = []

    pos_plot.layout = {
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 60, r: 50, t: 20 },
        xaxis: { title: {text: time_scale_label }, zeroline: false, showline: true, mirror: true },
        yaxis: { title: {text: "Position (m)" }, zeroline: false, showline: true, mirror: true },
        showlegend: true,
    }

    plot = document.getElementById("pos_plot");
    Plotly.purge(plot);
    Plotly.newPlot(plot, pos_plot.data, pos_plot.layout, { displaylogo: false });


    // Link all time axis
    link_plot_axis_range([
        ["snap_plot", "x", "", snap_plot],
        ["jerk_plot", "x", "", jerk_plot],
        ["accel_plot", "x", "", accel_plot],
        ["vel_plot", "x", "", vel_plot],
        ["pos_plot", "x", "", pos_plot],
    ]);

    // Link plot reset
    link_plot_reset([
        ["snap_plot", snap_plot],
        ["jerk_plot", jerk_plot],
        ["accel_plot", accel_plot],
        ["vel_plot", vel_plot],
        ["pos_plot", pos_plot],
    ]);
}


const Last_Update = Object.freeze({
    VEL: 0,
    ACCEL: 1,
    JERK: 2
});

function update_wp_colours(last_set) {
    const vel_cb = document.getElementById("display_wp_vel");
    const accel_cb = document.getElementById("display_wp_accel");
    const jerk_cb = document.getElementById("display_wp_jerk");
    switch (last_set) {
        case Last_Update.VEL:
            accel_cb.checked = false;
            jerk_cb.checked = false;
            break;

        case Last_Update.ACCEL:
            vel_cb.checked = false;
            jerk_cb.checked = false;
            break;

        case Last_Update.JERK:
            vel_cb.checked = false;
            accel_cb.checked = false;
            break;
    }

    update();
}

// flor plotting 3D spheres around the waypoints to show the effect of WP_RADIUS_M param
function generate_plotly_sphere(center, radius, steps) {
    let x = [], y = [], z = [], i = [], j = [], k = [];

    const ang_step = Math.PI / steps;

    for (let theta = 0; theta < Math.PI; theta += ang_step) {
        for (let phi = 0; phi < 2 * Math.PI; phi += ang_step) {
            let x1 =  center.n + radius * Math.sin(theta) * Math.cos(phi);
            let y1 =  center.e + radius * Math.sin(theta) * Math.sin(phi);
            let z1 = -center.d + radius * Math.cos(theta);
            x.push(x1);
            y.push(y1);
            z.push(z1);
        }
    }

    for (let m = 0; m < steps - 1; m++) {
        for (let n = 0; n < steps * 2 - 1; n++) {
            let p1 = m * steps * 2 + n;
            let p2 = p1 + 1;
            let p3 = p1 + steps * 2;
            let p4 = p3 + 1;
            
            i.push(p1, p2, p3, p2, p4, p3);
            j.push(p2, p4, p4, p4, p3, p3);
            k.push(p3, p3, p1, p1, p1, p2);
        }
    }

    return {
        type: "mesh3d",
        x: x, y: y, z: z,
        i: i, j: j, k: k,
        opacity: 0.3, // Transparency
        color: "rgba(255, 0, 0, 0.5)",
        flatshading: true,
        hoverinfo: 'none'
    };
}

function get_range(data) {
    let min_val = Infinity;
    let max_val = -Infinity

    for (let i = 0; i < data.x.length; i++) {
        min_val = Math.min(min_val, data.x[i], data.y[i], data.z[i]);
        max_val = Math.max(max_val, data.x[i], data.y[i], data.z[i]);
    }

    // If the wp radius has not been displayed, add it on anyway, to stop the plot axis from jumping around when switching the sphere on and off
    const wp_rad = parseFloat(document.getElementById("WP_RADIUS_M").value);
    min_val = min_val - wp_rad;
    max_val = max_val + wp_rad;

    return [min_val, max_val];
}

function vectorLength(v) {
    return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2])
}

// Run a single 1D S-Curve and record its output
function add_curve(wp_nav, start_time, dt) {

    const curve = wp_nav.get_current_1D_curve(dt)

    curve.time =  array_offset(curve.time, start_time)

    SCurveLog.push(curve)
}


function update()
{
    loading_call(replot)
}

async function replot()
{
    await import_done;

    var wp_nav = new ardupilotModule.AC_WPNav_wrapper();

    // reset stored data history
    SCurveLog = [];

    // Load in configured points
    let point1 = {
        n: parseFloat(document.getElementById("first_wp_x").value),
        e: parseFloat(document.getElementById("first_wp_y").value),
        d: -parseFloat(document.getElementById("first_wp_z").value)
    };

    let point2 = {
        n: parseFloat(document.getElementById("curr_wp_x").value),
        e: parseFloat(document.getElementById("curr_wp_y").value),
        d: -parseFloat(document.getElementById("curr_wp_z").value)
    };

    let point3 = {
        n: parseFloat(document.getElementById("next_wp_x").value),
        e: parseFloat(document.getElementById("next_wp_y").value),
        d: -parseFloat(document.getElementById("next_wp_z").value)
    };

    let point4 = { 
        n: parseFloat(document.getElementById("last_wp_x").value),
        e: parseFloat(document.getElementById("last_wp_y").value),
        d: -parseFloat(document.getElementById("last_wp_z").value)
    };

    // Run at 400hz equivalent like copter
    const dt = 1/400;

    // Load in params
    wp_nav.set_wp_nav_params(
        parseFloat(document.getElementById("WP_SPD").value),
        parseFloat(document.getElementById("WP_SPD_UP").value),
        parseFloat(document.getElementById("WP_SPD_DN").value),
        parseFloat(document.getElementById("WP_RADIUS_M").value),
        parseFloat(document.getElementById("WP_ACC").value),
        parseFloat(document.getElementById("WP_ACC_CNR").value),
        parseFloat(document.getElementById("WP_ACC_Z").value),
        parseFloat(document.getElementById("WP_JERK").value),
        10.0
    )

    wp_nav.set_psc_params(
        parseFloat(document.getElementById("PSC_NE_POS_P").value),
        parseFloat(document.getElementById("PSC_D_ACC_FLTT").value),
        parseFloat(document.getElementById("PSC_D_ACC_FLTE").value),
        parseFloat(document.getElementById("PSC_JERK_NE").value),
        parseFloat(document.getElementById("PSC_JERK_D").value),
        dt
    )

    wp_nav.set_atc_params(
        parseFloat(document.getElementById("ATC_RATE_R_MAX").value),
        parseFloat(document.getElementById("ATC_RATE_P_MAX").value),
        parseFloat(document.getElementById("ATC_ACC_R_MAX").value),
        parseFloat(document.getElementById("ATC_ACC_P_MAX").value),
        parseFloat(document.getElementById("ATC_INPUT_TC").value),
        parseFloat(document.getElementById("ATC_RATE_FF_ENAB").value) == 1.0,
    )

    // wp_start()
    // This pretty much follows the mode auto logic in copter
    wp_nav.set_initial_position(point1.n, point1.e, point1.d);
    wp_nav.wp_and_spline_init_m(point1.n, point1.e, point1.d);

    wp_nav.set_wp_destination_NED_m(point2.n, point2.e, point2.d);
    wp_nav.set_wp_destination_next_NED_m(point3.n, point3.e, point3.d);

    add_curve(wp_nav, 0.0, dt)

    // now in wp_run()
    let t = 0.0;
    const T = 1000;
    const n_steps = Math.floor(T/dt);
    let pos_targ = [];
    let vel_targ = [];
    let accel_targ = [];
    let jerk_targ = [];
    let mission_leg_track = [];
    let time = [];
    let wp_index = 2;
    for (let i = 0; i < n_steps; i++) {

        wp_nav.advance_wp_target_along_track(dt)

        // logging 3D kinematics to add to the 3D plot
        t += dt;
        time.push(t);

        mission_leg_track.push(wp_index - 1);

        pos_targ.push(wp_nav.get_pos()); // (m)
        vel_targ.push(wp_nav.get_vel()); // (m/s)
        accel_targ.push(wp_nav.get_accel()); // (m/s/s)

        if (wp_nav.reached_wp_destination()) {
            if (wp_index == 4) {
                // Reached the end of the "mission"
                break;
            }

            // Check for loading next waypoints
            if (wp_index == 2) {
                wp_nav.set_wp_destination_NED_m(point3.n, point3.e, point3.d);
                wp_nav.set_wp_destination_next_NED_m(point4.n, point4.e, point4.d);
                wp_index += 1;

            } else if (wp_index == 3) {
                wp_nav.set_wp_destination_NED_m(point4.n, point4.e, point4.d);
                wp_nav.set_wp_destination_next_NED_m(point4.n, point4.e, point4.d);
                wp_index += 1;
            }

            add_curve(wp_nav, t, dt)
        }
    }

    // Calculate jerk
    jerk_targ.push([0, 0, 0]);
    for (let i = 1; i < accel_targ.length; i++) {
        jerk_targ.push([
            (accel_targ[i][0] - accel_targ[i - 1][0]) / dt,
            (accel_targ[i][1] - accel_targ[i - 1][1]) / dt,
            (accel_targ[i][2] - accel_targ[i - 1][2]) / dt
        ])
    }

    // Update plots
    reset_wp_plot_data();
    wp_pos_plot.data[0].x = [ point1.n,  point2.n,  point3.n,  point4.n];
    wp_pos_plot.data[0].y = [ point1.e,  point2.e,  point3.e,  point4.e];
    wp_pos_plot.data[0].z = [-point1.d, -point2.d, -point3.d, -point4.d];

    wp_pos_plot.data[1].x = pos_targ.map(v =>  v[0]);
    wp_pos_plot.data[1].y = pos_targ.map(v =>  v[1]);
    wp_pos_plot.data[1].z = pos_targ.map(v => -v[2]);
    // colour the line based on velocity magnitude
    const vel_cb = document.getElementById("display_wp_vel");
    const accel_cb = document.getElementById("display_wp_accel");
    const jerk_cb = document.getElementById("display_wp_jerk");
    if (jerk_cb.checked) {
        wp_pos_plot.data[1].line.color = jerk_targ.map(v => vectorLength(v));
        wp_pos_plot.data[1].line.colorbar.title = "Jerk Magnitude";
        wp_pos_plot.data[1].hovertemplate = "<extra></extra>N = %{y:.0f} m<br>E = %{x:.0f} m<br>U = %{z:.0f} m<br>Jerk = %{line.color:.2f} m/s³";
    } else if (accel_cb.checked) {
        wp_pos_plot.data[1].line.color = accel_targ.map(v => vectorLength(v));
        wp_pos_plot.data[1].line.colorbar.title = "Accel Magnitude";
        wp_pos_plot.data[1].hovertemplate = "<extra></extra>N = %{y:.0f} m<br>E = %{x:.0f} m<br>U = %{z:.0f} m<br>Accel = %{line.color:.2f} m/s²";
    } else if (vel_cb.checked) {
        wp_pos_plot.data[1].line.color = vel_targ.map(v => vectorLength(v));
        wp_pos_plot.data[1].line.colorbar.title = "Vel Magnitude";
        wp_pos_plot.data[1].hovertemplate = "<extra></extra>N = %{y:.0f} m<br>E = %{x:.0f} m<br>U = %{z:.0f} m<br>Vel = %{line.color:.2f} m/s";
    } else {
        wp_pos_plot.data[1].line.color = "rgba(0, 0, 0, 1)";
        wp_pos_plot.data[1].line.showscale = false;
    }

    const wp_display_cb = document.getElementById("display_wp_radius");
    if (wp_display_cb.checked) {
        const WP_RADIUS_M = parseFloat(document.getElementById("WP_RADIUS_M").value)
        const wp1_sphere = generate_plotly_sphere(point1, WP_RADIUS_M, 100);
        const wp2_sphere = generate_plotly_sphere(point2, WP_RADIUS_M, 100);
        const wp3_sphere = generate_plotly_sphere(point3, WP_RADIUS_M, 100);
        const wp4_sphere = generate_plotly_sphere(point4, WP_RADIUS_M, 100);

        wp_pos_plot.data.push(wp1_sphere);
        wp_pos_plot.data.push(wp2_sphere);
        wp_pos_plot.data.push(wp3_sphere);
        wp_pos_plot.data.push(wp4_sphere);
    }
    const [ax_min, ax_max] = get_range(wp_pos_plot.data[0]);

    wp_pos_plot.layout.scene.xaxis["range"] = [ax_max, ax_min]; // reversed
    wp_pos_plot.layout.scene.yaxis["range"] = [ax_min, ax_max];
    wp_pos_plot.layout.scene.zaxis["range"] = [ax_min, ax_max];

    plot = document.getElementById("waypoint_plot")
    Plotly.newPlot(plot, wp_pos_plot.data, wp_pos_plot.layout, { displaylogo: false })

    plot_scurves();
}

// plot_all_curves: True = plot prev, current, and next scurves. False = plot only current.
function plot_scurves()
{
    // reset all of the plots 
    setup_kinematic_plots();

    const plots = [
        { key: "snap", template: "<extra></extra>%{x:.2f} s<br>%{y:.2f} m/s⁴", obj: snap_plot},
        { key: "jerk", template: "<extra></extra>%{x:.2f} s<br>%{y:.2f} m/s³", obj: jerk_plot},
        { key: "accel", template: "<extra></extra>%{x:.2f} s<br>%{y:.2f} m/s²", obj: accel_plot},
        { key: "vel", template: "<extra></extra>%{x:.2f} s<br>%{y:.2f} m/s", obj: vel_plot},
        { key: "pos", template: "<extra></extra>%{x:.2f} s<br>%{y:.2f} m", obj: pos_plot}
    ];

    // Cycle through all mission legs to plot
    for (let i = 0; i < SCurveLog.length; i++) {
        const curve = SCurveLog[i]
        for (const plot of plots) {
            plot.obj.data.push({
                x: curve.time,
                y: curve[plot.key],
                name: `Leg ${i+1}`,
                mode: 'lines',
                hovertemplate: plot.template
            });
        }
    }

    Plotly.redraw("snap_plot")
    Plotly.redraw("jerk_plot")
    Plotly.redraw("accel_plot");
    Plotly.redraw("vel_plot");
    Plotly.redraw("pos_plot");

}

