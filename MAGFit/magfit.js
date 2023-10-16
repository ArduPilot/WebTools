// MAGFit tool for compass calibration

var DataflashParser
import('../JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

const axis = ['X', 'Y', 'Z']
var flight_data = {}
var mag_plot = { X: {}, Y:{}, Z: {} }
var error_plot = {}
var error_bars = {}
function setup_plots() {

    // Turn off buttons that should not be pressed
    document.getElementById("calculate").disabled = true
    document.getElementById("SaveParams").disabled = true

    const time_scale_label = "Time (s)"

    // Setup flight data plot
    const flight_data_plot = ["Roll", "Pitch", "Throttle", "Altitude"]
    const flight_data_unit = ["deg",  "deg",   "",         "m"]
    flight_data.data = []
    for (let i=0;i<flight_data_plot.length;i++) {
        let axi = "y"
        if (i > 0) {
            axi += (i+1)
        }
        flight_data.data[i] = { mode: "lines",
                                name: flight_data_plot[i],
                                meta: flight_data_plot[i],
                                yaxis: axi,
                                hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} " + flight_data_unit[i] }
    }

    flight_data.layout = {
        xaxis: { title: {text: time_scale_label },
                 domain: [0.07, 0.93],
                 type: "linear", 
                 zeroline: false, 
                 showline: true, 
                 mirror: true,
                 rangeslider: {} },
        showlegend: false,
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    // Set axis to match line colors
    const flight_data_axis_pos = [0, 0.06, 0.94, 1]
    for (let i=0;i<flight_data_plot.length;i++) {
        let axi = "yaxis"
        if (i > 0) {
            axi += (i+1)
        }
        const side = i < 2 ? "left" : "right"
        flight_data.layout[axi] = {title: { text: flight_data_plot[i] },
                                            zeroline: false,
                                            showline: true,
                                            mirror: true,
                                            side: side,
                                            position: flight_data_axis_pos[i],
                                            color: plot_default_color(i) }
        if (i > 0) {
            flight_data.layout[axi].overlaying = 'y'
        }
    }

    var plot = document.getElementById("FlightData")
    Plotly.purge(plot)
    Plotly.newPlot(plot, flight_data.data, flight_data.layout, {displaylogo: false});

    // Update start and end time based on range
    document.getElementById("FlightData").on('plotly_relayout', function(data) {

        function range_update(range) {
            document.getElementById("TimeStart").value = Math.floor(range[0])
            document.getElementById("TimeEnd").value = Math.ceil(range[1])
            if (MAG_Data != null) {
                // If we have data then enable re-calculate on updated range
                set_need_calc(true)
            }
        }

        if ((data['xaxis.range'] !== undefined)) {
            range_update(data['xaxis.range'])
            return
        }

        const range_keys = ['xaxis.range[0]', 'xaxis.range[1]']
        if ((data[range_keys[0]] !== undefined) && (data[range_keys[1]] !== undefined)) {
            range_update([data[range_keys[0]], data[range_keys[1]]])
            return
        }

        const auto_range_key = 'xaxis.autorange'
        if ((data[auto_range_key] !== undefined) && (data[auto_range_key] == true)) {
            range_update([MAG_Data.start_time, MAG_Data.end_time])
        }

    })

    // X, Y, Z component plots
    const gauss_hover = "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:.2f} mGauss"
    for (const axi of axis) {
        mag_plot[axi].data = []

        const name = "Expected"
        mag_plot[axi].data[0] = { mode: "lines", name: name, meta: name, line: { width: 4 }, hovertemplate: gauss_hover }

        for (let i=0;i<3;i++) {
            const name = "Mag " + (i + 1)
            mag_plot[axi].data[i+1] = {
                mode: "lines",
                name: name,
                meta: name,
                line: { color: plot_default_color(i+1) },
                visible: true,
                legendgroup: i,
                legendgrouptitle: { text: "" },
                hovertemplate: gauss_hover
            }
        }

        mag_plot[axi].layout = {
            xaxis: {title: {text: time_scale_label }, zeroline: false, showline: true, mirror: true},
            yaxis: {title: {text: "Field " + axi + " (mGauss)" }, zeroline: false, showline: true, mirror: true },
            showlegend: true,
            legend: {itemclick: false, itemdoubleclick: false },
            margin: { b: 50, l: 50, r: 50, t: 20 },
        }

        let plot = document.getElementById("mag_plot_" + axi)
        Plotly.purge(plot)
        Plotly.newPlot(plot, mag_plot[axi].data, mag_plot[axi].layout, {displaylogo: false});
    }

    // Error plot
    error_plot.data = []
    for (let i=0;i<3;i++) {
        const name = "Mag " + (i + 1)
        error_plot.data[i] = {
            mode: "lines",
            name: name,
            meta: name,
            line: { color: plot_default_color(i+1) },
            legendgroup: i,
            legendgrouptitle: { text: "" },
            hovertemplate: gauss_hover
        }
    }
    error_plot.layout = {
        xaxis: {title: {text: time_scale_label }, zeroline: false, showline: true, mirror: true},
        yaxis: {title: {text: "Field error (mGauss)" }, zeroline: false, showline: true, mirror: true },
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }
    plot = document.getElementById("error_plot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, error_plot.data, error_plot.layout, {displaylogo: false});

    // Error bar graph
    error_bars.data = []
    for (let i=0;i<3;i++) {
        const name = "Mag " + (i + 1)
        error_bars.data[i] = { 
            type: "bar",
            name: name,
            meta: name,
            marker: { color: plot_default_color(i+1) }, 
            y: [],
            hovertemplate: "<extra></extra>%{meta}<br>%{x}<br>%{y:.2f} mGauss"
        }
    }
    error_bars.layout = {
        xaxis: { zeroline: false, showline: true, mirror: true},
        yaxis: { title: {text: "mean field error (mGauss)" }, zeroline: false, showline: true, mirror: true },
        barmode: 'group',
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    plot = document.getElementById("error_bars")
    Plotly.purge(plot)
    Plotly.newPlot('error_bars', error_bars.data, error_bars.layout, { modeBarButtonsToRemove: ['lasso2d', 'select2d'], displaylogo: false })


    // Link all time axis
    link_plot_axis_range([["mag_plot_X", "x", "", mag_plot.X],
                          ["mag_plot_Y", "x", "", mag_plot.Y],
                          ["mag_plot_Z", "x", "", mag_plot.Z],
                          ["error_plot", "x", "", error_plot]])

    // Link plot reset
    link_plot_reset([["mag_plot_X", mag_plot.X],
                     ["mag_plot_Y", mag_plot.Y],
                     ["mag_plot_Z", mag_plot.Z],
                     ["error_plot", error_plot],
                     ["error_bars", error_bars],])

}

const offsets_range = [-1500.0, 1500.0]
const diagonals_range = [0.8, 1.2]
const off_diagonals_range = [-0.2, 0.2]
const scale_range = [0.8, 1.2]
function save_parameters() {

    function param_string(name, value) {
        return name + "," + value + "\n"
    }
    
    function save_params(names, values) {

        function param_array(names, values) {
            var ret = "";
            for (let i = 0; i < names.length; i++) {
                ret += param_string(names[i], values[i])
            }
            return ret
        }

        var ret = "";
        ret += param_array(names.offsets, values.offsets)
        ret += param_array(names.diagonals, values.diagonals)
        ret += param_array(names.off_diagonals, values.off_diagonals)
        ret += param_array(names.motor, values.motor)

        ret += param_string(names.scale, values.scale)
        return ret
    }

    function check_params(i, names, values, original_values) {

        function check_range(name, value, range) {
            let ret = ""
            if (value > range[1]) {
                ret = name + " " + value + " larger than " + range[1] + "\n"
            } else if (value < range[0]) {
                ret = name + " " + value + " less than " + range[0] + "\n"
            }
            return ret
        }

        function check_array(names, values, range) {
            let ret = ""
            for (let i = 0; i < names.length; i++) {
                ret += check_range(names[i], values[i], range)
            }
            return ret
        }

        let warning = ""

        warning += check_array(names.offsets, values.offsets, offsets_range)
        warning += check_array(names.diagonals, values.diagonals, diagonals_range)
        warning += check_array(names.off_diagonals, values.off_diagonals, off_diagonals_range)
        warning += check_range(names.scale, values.scale, scale_range)

        if (warning != "") {
            warning = "MAG " + (i+1) + " params outside typical range:\n" + warning
        }

        if (original_values.orientation != values.orientation) {
            if (warning != "") {
                warning += "\n"
            }
            warning += "MAG " + (i+1) + " orientation (" + names.orientation + ") changed from " + get_rotation_name(original_values.orientation) + " to " + get_rotation_name(values.orientation) + "\n"
        }

        if (warning == "") {
            return true
        }

        return confirm(warning);
    }

    let params = ""
    let type = 0
    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null || !document.getElementById("MAG" + i + "_SHOW").checked) {
            continue
        }
        for (let j = 0; j < MAG_Data[i].fits.length; j++) {
            if (MAG_Data[i].fits[j].select.checked) {
                if (MAG_Data[i].fits[j].valid && check_params(i, MAG_Data[i].names, MAG_Data[i].fits[j].params, MAG_Data[i].params)) {
                    const fit_type = MAG_Data[i].fits[j].type
                    if (type == 0) {
                        type = fit_type
                    } else if ((fit_type != 0) && (fit_type != type)) {
                        alert("All compasses must use the same motor fit type, current and throttle compensation cannot be used together")
                        return
                    }
                    params += save_params(MAG_Data[i].names, MAG_Data[i].fits[j].params)
                }
                break
            }
        }
    }
    if (params == "") {
        alert("No parameters to save")
        return
    }

    params += param_string("COMPASS_MOTCT", type)

    var blob = new Blob([params], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "MAGFit.param");
}

function redraw() {

    function show_params(names, values) {
        for (let i = 0; i < 3; i++) {
            parameter_set_value(names.offsets[i], values.offsets[i])
            parameter_set_value(names.diagonals[i], values.diagonals[i])
            parameter_set_value(names.off_diagonals[i], values.off_diagonals[i])
            parameter_set_value(names.motor[i], values.motor[i])
        }
        parameter_set_value(names.scale, values.scale)
        parameter_set_value(names.orientation, values.orientation)
    }

    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null) {
            continue
        }
        const show = document.getElementById("MAG" + i + "_SHOW").checked

        function setup_legend(data, group, text) {
            data.legendgroup = group
            data.legendgrouptitle.text = text
        }

        if (MAG_Data[i].orig.select.checked) {

            mag_plot.X.data[i+1].visible = show
            mag_plot.Y.data[i+1].visible = show
            mag_plot.Z.data[i+1].visible = show
            error_plot.data[i].visible = show

            mag_plot.X.data[i+1].y = MAG_Data[i].orig.x
            mag_plot.Y.data[i+1].y = MAG_Data[i].orig.y
            mag_plot.Z.data[i+1].y = MAG_Data[i].orig.z

            const name = "Existing Calibration"
            setup_legend(mag_plot.X.data[i+1], 0, name)
            setup_legend(mag_plot.Y.data[i+1], 0, name)
            setup_legend(mag_plot.Z.data[i+1], 0, name)


            error_plot.data[i].y = MAG_Data[i].orig.error
            setup_legend(error_plot.data[i], 0, name)

            show_params(MAG_Data[i].names, MAG_Data[i].params)
        } else {
            for (let j = 0; j < MAG_Data[i].fits.length; j++) {
                if (MAG_Data[i].fits[j].select.checked) {

                    const valid_fit = MAG_Data[i].fits[j].valid
                    mag_plot.X.data[i+1].visible = valid_fit && show
                    mag_plot.Y.data[i+1].visible = valid_fit && show
                    mag_plot.Z.data[i+1].visible = valid_fit && show
                    error_plot.data[i].visible = valid_fit && show

                    if (valid_fit) {
                        mag_plot.X.data[i+1].y = MAG_Data[i].fits[j].x
                        mag_plot.Y.data[i+1].y = MAG_Data[i].fits[j].y
                        mag_plot.Z.data[i+1].y = MAG_Data[i].fits[j].z
                        error_plot.data[i].y = MAG_Data[i].fits[j].error
                    }

                    const name = fits[j]
                    setup_legend(mag_plot.X.data[i+1], j+1, name)
                    setup_legend(mag_plot.Y.data[i+1], j+1, name)
                    setup_legend(mag_plot.Z.data[i+1], j+1, name)
                    setup_legend(error_plot.data[i], j+1, name)

                    // Show original prams if fit is invalid
                    show_params(MAG_Data[i].names, valid_fit ? MAG_Data[i].fits[j].params : MAG_Data[i].params)

                    break
                }
            }
        }
    }

    const time_range = [ parseFloat(document.getElementById("TimeStart").value),
                         parseFloat(document.getElementById("TimeEnd").value)]

    mag_plot.X.layout.xaxis.autorange = false
    mag_plot.Y.layout.xaxis.autorange = false
    mag_plot.Z.layout.xaxis.autorange = false

    mag_plot.X.layout.xaxis.range = time_range
    mag_plot.Y.layout.xaxis.range = time_range
    mag_plot.Z.layout.xaxis.range = time_range

    Plotly.redraw("mag_plot_X")
    Plotly.redraw("mag_plot_Y")
    Plotly.redraw("mag_plot_Z")

    error_plot.layout.xaxis.autorange = false
    error_plot.layout.xaxis.range = time_range

    Plotly.redraw("error_plot")

    // Plot error bars
    const bar_x_axis = ["Existing Calibration", ...fits ]
    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null) {
            continue
        }
        error_bars.data[i].visible = document.getElementById("MAG" + i + "_SHOW").checked
        error_bars.data[i].x = bar_x_axis
        error_bars.data[i].y[0] = MAG_Data[i].orig.mean_error

        for (let j = 0; j < MAG_Data[i].fits.length; j++) {
            if (MAG_Data[i].fits[j].valid) {
                error_bars.data[i].y[1+j] = MAG_Data[i].fits[j].mean_error
            }
        }
    }
    Plotly.redraw("error_bars")

}

function scale_valid(scale) {
    const MAX_SCALE_FACTOR = 1.5
    return (scale <= MAX_SCALE_FACTOR) && (scale >= (1/MAX_SCALE_FACTOR))
}

function apply_params(ret, raw, params, motor) {

    // Offsets
    ret.x = array_offset(raw.x, params.offsets[0])
    ret.y = array_offset(raw.y, params.offsets[1])
    ret.z = array_offset(raw.z, params.offsets[2])

    // scale
    if (scale_valid(params.scale)) {
        ret.x = array_scale(ret.x, params.scale)
        ret.y = array_scale(ret.y, params.scale)
        ret.z = array_scale(ret.z, params.scale)
    }

    // Iron
    if (!array_all_equal(params.diagonals, 0.0)) {

        // Vectorized multiplication
        const corrected_x = array_add(array_add( array_scale(ret.x, params.diagonals[0]),     array_scale(ret.y, params.off_diagonals[0])), array_scale(ret.z, params.off_diagonals[1]) )
        const corrected_y = array_add(array_add( array_scale(ret.x, params.off_diagonals[0]), array_scale(ret.y, params.diagonals[1])),     array_scale(ret.z, params.off_diagonals[2]) )
        const corrected_z = array_add(array_add( array_scale(ret.x, params.off_diagonals[1]), array_scale(ret.y, params.off_diagonals[2])), array_scale(ret.z, params.diagonals[2]) )

        ret.x = corrected_x; ret.y = corrected_y; ret.z = corrected_z
    }

    // Motor
    if (motor != null) {
        ret.x = array_add(ret.x, array_scale(motor, params.motor[0]))
        ret.y = array_add(ret.y, array_scale(motor, params.motor[1]))
        ret.z = array_add(ret.z, array_scale(motor, params.motor[2]))
    }
}

// Look through time array and return first index before start time
function find_start_index(time) {
    const start_time = parseFloat(document.getElementById("TimeStart").value)

    var start_index = 0
    for (j = 0; j<time.length; j++) {
        // Move forward start index while time is less than start time
        if (time[j] < start_time) {
            start_index = j
        }
    }
    return start_index
}

// Look through time array and return first index after end time
function find_end_index(time) {
    const end_time = parseFloat(document.getElementById("TimeEnd").value)

    var end_index = 0
    for (j = 0; j<time.length-1; j++) {
        // Move forward end index while time is less than end time
        if (time[j] <= end_time) {
            end_index = j + 1
        }
    }
    return end_index
}

// Run all calculation steps
function calculate() {

    select_body_frame_attitude()

    check_orientation()

    fit()

    redraw()

    set_need_calc(false)

}

function check_orientation() {

    const start = performance.now()

    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null || !MAG_Data[i].rotate) {
            continue
        }

        // Find the start and end index
        const start_index = find_start_index(MAG_Data[i].time)
        const end_index = find_end_index(MAG_Data[i].time)+1
        const num_samples = end_index - start_index

        // Calculate average earth filed to match sensor to
        let ef_mean = { x:0.0, y:0.0, z:0.0 }
        for (let j = 0; j < num_samples; j++) {
            const data_index = start_index + j

            ef_mean.x += MAG_Data[i].expected.x[data_index]
            ef_mean.y += MAG_Data[i].expected.y[data_index]
            ef_mean.z += MAG_Data[i].expected.z[data_index]
        }
        ef_mean.x /= num_samples
        ef_mean.y /= num_samples
        ef_mean.z /= num_samples

        let rotation = new Quaternion()

        // Try all rotations
        const last_rotation = 43
        let rot_error = []
        for (let rot = 0; rot <= last_rotation; rot++) {
            // Skip the weird ones
            if ((rot == 38) || (rot == 41)) {
                // ROTATION_ROLL_90_PITCH_68_yAW_293
                // ROTATION_PITCH_7
                continue
            }

            if (!rotation.from_rotation(rot)) {
                continue
            }

            // Rotate and take average
            let x = new Array(num_samples)
            let y = new Array(num_samples)
            let z = new Array(num_samples)
            let mean = { x:0.0, y:0.0, z:0.0 }
            for (let j = 0; j < num_samples; j++) {
                const data_index = start_index + j

                const tmp = rotation.rotate([MAG_Data[i].raw.x[data_index],
                                             MAG_Data[i].raw.y[data_index],
                                             MAG_Data[i].raw.z[data_index]])
    
                x[j] = tmp[0]
                y[j] = tmp[1]
                z[j] = tmp[2]

                mean.x += x[j]
                mean.y += y[j]
                mean.z += z[j]
            }
            mean.x /= num_samples
            mean.y /= num_samples
            mean.z /= num_samples

            const offsets = { 
                x: ef_mean.x - mean.x,
                y: ef_mean.y - mean.y,
                z: ef_mean.z - mean.z
            }

            let error_sum = 0
            for (let j = 0; j < num_samples; j++) {
                const data_index = start_index + j

                error_sum += Math.sqrt(
                    (x[j] - MAG_Data[i].expected.x[data_index] + offsets.x)**2 +
                    (y[j] - MAG_Data[i].expected.y[data_index] + offsets.y)**2 +
                    (z[j] - MAG_Data[i].expected.z[data_index] + offsets.z)**2
                )
            }

            rot_error.push({ rotation: rot, error: error_sum / num_samples })

        }

        rot_error.sort((a, b) => a.error - b.error);

        const first = rot_error[0]
        const second = rot_error[1]

        const is_correct = (first.rotation == MAG_Data[i].params.orientation)
        const cost_ratio = second.error / first.error

        const correct_txt = is_correct ? "correct" : "incorrect"
        let txt = "Mag " + (i+1) + " " + correct_txt + " orientation " + get_rotation_name(MAG_Data[i].params.orientation)
        if (!is_correct) {
            txt += ", best orientation: " + get_rotation_name(first.rotation)
        }
        txt += ", second best orientation: " + get_rotation_name(second.rotation)
        txt += ", cost ratio: " + (cost_ratio*100).toFixed(2) + " %"
        console.log(txt)

        // If best rotation fit is twice as good as next best then switch
        MAG_Data[i].rotation = (cost_ratio > 2) ? first.rotation : MAG_Data[i].params.orientation

        // Apply rotation
        let rot = new Quaternion()
        rot.from_rotation(MAG_Data[i].rotation)

        const len = MAG_Data[i].raw.x.length
        MAG_Data[i].rotated = { x: new Array(len), y: new Array(len), z: new Array(len) }
        for (let j = 0; j < len; j++) {
            const tmp = rot.rotate([ MAG_Data[i].raw.x[j],
                                     MAG_Data[i].raw.y[j],
                                     MAG_Data[i].raw.z[j] ])

            MAG_Data[i].rotated.x[j] = tmp[0]
            MAG_Data[i].rotated.y[j] = tmp[1]
            MAG_Data[i].rotated.z[j] = tmp[2]
        }

    }

    const end = performance.now();
    console.log(`Orientation check took: ${end - start} ms`);
}

let source
function select_body_frame_attitude() {

    if (source != null) {
        // No need to re-calc
        return
    }

    for (const ef of body_frame_earth_field) {
        if (ef.select.checked) {
            source = ef
        }
    }
    if (source == null) {
        error("No attitude source selected")
    }

    // Setup expected plot
    mag_plot.X.data[0].x = source.time
    mag_plot.X.data[0].y = source.x

    mag_plot.Y.data[0].x = source.time
    mag_plot.Y.data[0].y = source.y

    mag_plot.Z.data[0].x = source.time
    mag_plot.Z.data[0].y = source.z

    // Interpolate expected to logged compass and calculate error
    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null) {
            continue
        }
        MAG_Data[i].expected = { x: linear_interp(source.x, source.time, MAG_Data[i].time),
                                 y: linear_interp(source.y, source.time, MAG_Data[i].time),
                                 z: linear_interp(source.z, source.time, MAG_Data[i].time) }

        MAG_Data[i].orig.error = calc_error(MAG_Data[i].expected, MAG_Data[i].orig)
    }
}

function fit() {

    const start = performance.now()

    // Run fit
    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null) {
            continue
        }

        // Find the start and end index
        const start_index = find_start_index(MAG_Data[i].time)
        const end_index = find_end_index(MAG_Data[i].time)+1
        const num_samples = end_index - start_index

        // Calculate original fit error for selected samples only
        MAG_Data[i].orig.mean_error = 0
        for (let j = 0; j < num_samples; j++) {
            MAG_Data[i].orig.mean_error += MAG_Data[i].orig.error[start_index + j]
        }
        MAG_Data[i].orig.mean_error /= num_samples

        let rot = {}
        let orientation
        if (!MAG_Data[i].rotate) {
            // Use raw directly
            rot.x = MAG_Data[i].raw.x
            rot.y = MAG_Data[i].raw.y
            rot.z = MAG_Data[i].raw.z

            // Original orientation
            orientation = MAG_Data[i].params.orientation

        } else {
            // use rotation corrected
            rot.x = MAG_Data[i].rotated.x
            rot.y = MAG_Data[i].rotated.y
            rot.z = MAG_Data[i].rotated.z

            // New orientation (possibly)
            orientation = MAG_Data[i].rotation

        }

        // Solve in the form Ax = B
        let A = new mlMatrix.Matrix(num_samples*3, 12)
        let B = new mlMatrix.Matrix(num_samples*3, 1)
        let B2 = new mlMatrix.Matrix(num_samples*3, 1)

        function setup_iron(A, row, colum, x, y, z) {

            const x_row = row + 0
            const y_row = row + 1
            const z_row = row + 2

            // Diagonal 1
            A.data[x_row][colum] = x
            A.data[y_row][colum] = 0.0
            A.data[z_row][colum] = 0.0

            // Diagonal 2
            colum++
            A.data[x_row][colum] = 0.0
            A.data[y_row][colum] = y
            A.data[z_row][colum] = 0.0

            // Diagonal 3
            colum++
            A.data[x_row][colum] = 0.0
            A.data[y_row][colum] = 0.0
            A.data[z_row][colum] = z

            // Off Diagonal 1
            colum++
            A.data[x_row][colum] = y
            A.data[y_row][colum] = x
            A.data[z_row][colum] = 0.0

            // Off Diagonal 2
            colum++
            A.data[x_row][colum] = z
            A.data[y_row][colum] = 0.0
            A.data[z_row][colum] = x

            // Off Diagonal 3
            colum++
            A.data[x_row][colum] = 0.0
            A.data[y_row][colum] = z
            A.data[z_row][colum] = y
        }

        function setup_offsets(A, row, colum) {

            const x_row = row + 0
            const y_row = row + 1
            const z_row = row + 2

            // Offset 1
            A.data[x_row][colum] = 1.0
            A.data[y_row][colum] = 0.0
            A.data[z_row][colum] = 0.0

            // Offset 2
            colum++
            A.data[x_row][colum] = 0.0
            A.data[y_row][colum] = 1.0
            A.data[z_row][colum] = 0.0

            // Offset 3
            colum++
            A.data[x_row][colum] = 0.0
            A.data[y_row][colum] = 0.0
            A.data[z_row][colum] = 1.0

        }

        function setup_motor(A, row, colum, val) {

            const x_row = row + 0
            const y_row = row + 1
            const z_row = row + 2

            // Motor 1
            A.data[x_row][colum] = val
            A.data[y_row][colum] = 0.0
            A.data[z_row][colum] = 0.0

            // Motor 2
            colum++
            A.data[x_row][colum] = 0.0
            A.data[y_row][colum] = val
            A.data[z_row][colum] = 0.0

            // Motor 3
            colum++
            A.data[x_row][colum] = 0.0
            A.data[y_row][colum] = 0.0
            A.data[z_row][colum] = val

        }

        function setup_scale(A, row, colum, x, y, z) {

            const x_row = row + 0
            const y_row = row + 1
            const z_row = row + 2

            // Scale
            A.data[x_row][colum] = x
            A.data[y_row][colum] = y
            A.data[z_row][colum] = z

        }

        // Populate A and B
        for (let j = 0; j < num_samples; j++) {
            const index = j*3
            const data_index = start_index + j

            // A matrix, all fits include offsets, setup rest later
            setup_offsets(A, index, 0)

            // B Matrix if scale or iron are included
            B.data[index+0][0] = MAG_Data[i].expected.x[data_index]
            B.data[index+1][0] = MAG_Data[i].expected.y[data_index]
            B.data[index+2][0] = MAG_Data[i].expected.z[data_index]

            // B Matrix for offsets only
            B2.data[index+0][0] = MAG_Data[i].expected.x[data_index] - rot.x[data_index]
            B2.data[index+1][0] = MAG_Data[i].expected.y[data_index] - rot.y[data_index]
            B2.data[index+2][0] = MAG_Data[i].expected.z[data_index] - rot.z[data_index]
        }

        for (let fit of MAG_Data[i].fits) {

            // Populate all params with defaults
            fit.params = { 
                offsets: [0.0, 0.0, 0.0],
                diagonals: [1.0, 1.0, 1.0],
                off_diagonals: [0.0, 0.0, 0.0,],
                scale: 1.0,
                motor: [0.0, 0.0, 0.0],
                orientation: orientation
            }

            const fit_mot = fit.value != null
            if (fit.offsets_only) {
                // Just fitting offsets, possibly with motor correction
                A.columns = fit_mot ? 6 : 3

                if (fit_mot) {
                    for (let j = 0; j < num_samples; j++) {
                        const index = j*3
                        const data_index = start_index + j
                        setup_motor(A, index, 3, fit.value[data_index])
                    }
                }

                // Solves
                const params = mlMatrix.solve(A, B2)

                // Extract params
                fit.params.offsets = [ params.get(0,0), params.get(1,0), params.get(2,0) ]

                if (fit_mot) {
                    fit.params.motor = [params.get(3,0), params.get(4,0), params.get(5,0)]
                }

            } else if (fit.offsets_and_scale === true) {
                // Just fitting offsets and scale, possibly with motor correction
                A.columns = fit_mot ? 7 : 4

                // Offsets already in column 0,1,2
                // Add scale and motor
                for (let j = 0; j < num_samples; j++) {
                    const index = j*3
                    const data_index = start_index + j

                    setup_scale(A, index, 3, rot.x[data_index], rot.y[data_index], rot.z[data_index])

                    if (fit_mot) {
                        setup_motor(A, index, 4, fit.value[data_index])
                    }

                }

                // Solve
                const params = mlMatrix.solve(A, B)

                // Extract params
                fit.params.scale = params.get(3,0)

                // Remove scale from offsets
                fit.params.offsets = array_scale([ params.get(0,0), params.get(1,0), params.get(2,0) ], 1 / fit.params.scale)

                if (fit_mot) {
                    fit.params.motor = [params.get(4,0), params.get(5,0), params.get(6,0)]
                }

            } else {
                // Fitting offsets and iron matrix, possibly with motor correction

                // Adjust size of A matrix depending if full mot fit is being done
                A.columns = fit_mot ? 12 : 9

                for (let j = 0; j < num_samples; j++) {
                    const index = j*3
                    const data_index = start_index + j

                    setup_iron(A, index, 3, rot.x[data_index], rot.y[data_index], rot.z[data_index])

                    if (fit_mot) {
                        setup_motor(A, index, 9, fit.value[data_index])
                    }

                }

                // Solve
                const params = mlMatrix.solve(A, B)

                // Extract params
                const diagonals =     [ params.get(3,0), params.get(4,0), params.get(5,0) ]
                const off_diagonals = [ params.get(6,0), params.get(7,0), params.get(8,0) ]

                // Remove iron correction from offsets
                const iron = new mlMatrix.Matrix([
                    [diagonals[0],     off_diagonals[0], off_diagonals[1]],
                    [off_diagonals[0], diagonals[1],     off_diagonals[2]], 
                    [off_diagonals[1], off_diagonals[2], diagonals[2]]
                ])
                const uncorrected_offsets = new mlMatrix.Matrix([[params.get(0,0), params.get(1,0), params.get(2,0)]])
                const offsets = uncorrected_offsets.mmul(mlMatrix.inverse(iron))

                fit.params.offsets = Array.from(offsets.data[0])
                fit.params.diagonals = diagonals
                fit.params.off_diagonals = off_diagonals
                if (fit_mot) {
                    fit.params.motor = [params.get(9,0), params.get(10,0), params.get(11,0)]
                }
            }

            function params_valid(params) {

                function check_range(val, range) {
                    return (val > range[0]) && (val < range[1])
                }

                let ret = true
                for (let i = 0; i < 3; i++) {
                    ret &= check_range(params.offsets[i], offsets_range)
                    ret &= check_range(params.diagonals[i], diagonals_range)
                    ret &= check_range(params.off_diagonals[i], off_diagonals_range)
                }
                ret &= check_range(params.scale, scale_range)
                return ret
            }

            // Check param ranges
            fit.valid = params_valid(fit.params)

            if (!fit.valid) {
                continue
            }

            apply_params(fit, rot, fit.params, fit.value)
            fit.error = calc_error(MAG_Data[i].expected, fit)

            // Calculate error for selected samples only
            fit.mean_error = 0
            for (let j = 0; j < num_samples; j++) {
                fit.mean_error += fit.error[start_index + j]
            }
            fit.mean_error /= num_samples


        }

    }

    // Auto select best fit
    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null) {
            continue
        }
        let best_select = MAG_Data[i].orig.select
        let best = MAG_Data[i].orig.mean_error

        for (let fit of MAG_Data[i].fits) {
            fit.select.disabled = !fit.valid
            if (fit.valid && (fit.mean_error < best)) {
                best_select = fit.select
                best = fit.mean_error
            }
        }

        best_select.checked = true
    }

    const end = performance.now();
    console.log(`Fit took: ${end - start} ms`);

}

function calc_error(A, B) {
    const len = A.x.length
    let ret = new Array(len)
    for (let i = 0; i < len; i++) {
        ret[i] = Math.sqrt((A.x[i] - B.x[i])**2 + (A.y[i] - B.y[i])**2 + (A.z[i] - B.z[i])**2)
    }
    return ret
}

function extractLatLon(log) {
  var Lat, Lng
  if (log.messages["ORGN[0]"] !== undefined) {
    Lat = log.messages["ORGN[0]"].Lat[log.messages["ORGN[0]"].Lat.length-1] * 10**-7
    Lng = log.messages["ORGN[0]"].Lng[log.messages["ORGN[0]"].Lng.length-1] * 10**-7
    return [Lat, Lng]
  }
  console.warn("no ORGN message found")
  if (log.messages["POS"] !== undefined) {
    Lat = log.messages["POS"].Lat[log.messages["POS"].Lat.length-1] * 10**-7
    Lng = log.messages["POS"].Lng[log.messages["POS"].Lng.length-1] * 10**-7
    return [Lat, Lng]
  }
  return [Lat, Lng]
}

// Enable/disable calculate and save params button
function set_need_calc(b) {
    document.getElementById('calculate').disabled = !b
    document.getElementById('SaveParams').disabled = b
}

function add_attitude_source(quaternion, earth_field, name) {

    // Rotate earth frame into body frame based on attitude
    let q = new Quaternion()

    const len = quaternion.q1.length
    let ret = { x: new Array(len), y: new Array(len), z: new Array(len), time: quaternion.time, name: name }
    for (i = 0; i < len; i++) {

        // Invert and load into helper
        q.q1 =  quaternion.q1[i]
        q.q2 = -quaternion.q2[i]
        q.q3 = -quaternion.q3[i]
        q.q4 = -quaternion.q4[i]

        const tmp = q.rotate(earth_field)

        ret.x[i] = tmp[0]
        ret.y[i] = tmp[1]
        ret.z[i] = tmp[2]

    }

    // Add check box for this attitude source
    let section = document.getElementById("ATTITUDE")

    let radio = document.createElement("input")
    radio.setAttribute('type', 'radio')
    radio.setAttribute('id', "ATTITUDE" + name)
    radio.setAttribute('name', "attitude_source")
    radio.disabled = false

    // Clear selected source and enable re-calc
    radio.addEventListener('change', function() { 
        set_need_calc(true)
        source = null
    })

    let label = document.createElement("label")
    label.setAttribute('for', "ATTITUDE" + name)
    label.innerHTML = name

    section.appendChild(radio)
    section.appendChild(label)
    section.appendChild(document.createElement("br"))

    ret.select = radio

    return ret

}

var MAG_Data
var fits
var body_frame_earth_field
function load(log_file) {

    let log = new DataflashParser()
    log.processData(log_file, ["MAG", "PARM"])

    // Plot flight data from log
    log.parseAtOffset("ATT")
    if (Object.keys(log.messages.ATT).length > 0) {
        const ATT_time = array_scale(Array.from(log.messages.ATT.time_boot_ms), 1 / 1000)
        flight_data.data[0].x = ATT_time
        flight_data.data[0].y = Array.from(log.messages.ATT.Roll)

        flight_data.data[1].x = ATT_time
        flight_data.data[1].y = Array.from(log.messages.ATT.Pitch)
    } else {
        flight_data.data[0].x = null
        flight_data.data[0].y = null
        flight_data.data[1].x = null
        flight_data.data[1].y = null
    }

    log.parseAtOffset("RATE")
    if (Object.keys(log.messages.RATE).length > 0) {
        flight_data.data[2].x = array_scale(Array.from(log.messages.RATE.time_boot_ms), 1 / 1000)
        flight_data.data[2].y = Array.from(log.messages.RATE.AOut)
    } else {
        flight_data.data[2].x = null
        flight_data.data[2].y = null
    }

    log.parseAtOffset("POS")
    if (Object.keys(log.messages.POS).length > 0) {
        flight_data.data[3].x = array_scale(Array.from(log.messages.POS.time_boot_ms), 1 / 1000)
        flight_data.data[3].y = Array.from(log.messages.POS.RelHomeAlt)
    } else {
        flight_data.data[3].x = null
        flight_data.data[3].y = null
    }
    Plotly.redraw("FlightData")

    MAG_Data = []

    // Get MAG data
    MAG_Data.start_time = null
    MAG_Data.end_time = null
    for (let i = 0; i < 3; i++) {
        var msg_name = 'MAG[' + i + ']'
        if (log.messages[msg_name] == null) {
            continue
        }

        // Load data from log
        MAG_Data[i] = { orig: { x: Array.from(log.messages[msg_name].MagX),
                                y: Array.from(log.messages[msg_name].MagY),
                                z: Array.from(log.messages[msg_name].MagZ)},
                        time: array_scale(Array.from(log.messages[msg_name].time_boot_ms), 1 / 1000),
                        names: get_compass_param_names(i+1),
                        fits: [] }

        // Set start and end times
        MAG_Data[i].start_time = MAG_Data[i].time[0]
        MAG_Data[i].end_time = MAG_Data[i].time[MAG_Data[i].time.length - 1]

        MAG_Data.start_time = (MAG_Data.start_time == null) ? MAG_Data[i].start_time : Math.min(MAG_Data.start_time, MAG_Data[i].start_time)
        MAG_Data.end_time = (MAG_Data.end_time == null) ? MAG_Data[i].end_time : Math.max(MAG_Data.end_time, MAG_Data[i].end_time)

        // Get param values
        MAG_Data[i].params = { offsets:  [ get_param_value(log.messages.PARM, MAG_Data[i].names.offsets[0]),
                                           get_param_value(log.messages.PARM, MAG_Data[i].names.offsets[1]),
                                           get_param_value(log.messages.PARM, MAG_Data[i].names.offsets[2])],
                               diagonals: [ get_param_value(log.messages.PARM, MAG_Data[i].names.diagonals[0]),
                                            get_param_value(log.messages.PARM, MAG_Data[i].names.diagonals[1]),
                                            get_param_value(log.messages.PARM, MAG_Data[i].names.diagonals[2])],
                               off_diagonals: [ get_param_value(log.messages.PARM, MAG_Data[i].names.off_diagonals[0]),
                                                get_param_value(log.messages.PARM, MAG_Data[i].names.off_diagonals[1]),
                                                get_param_value(log.messages.PARM, MAG_Data[i].names.off_diagonals[2])],
                               scale: get_param_value(log.messages.PARM, MAG_Data[i].names.scale),
                               motor: [ get_param_value(log.messages.PARM, MAG_Data[i].names.motor[0]),
                                        get_param_value(log.messages.PARM, MAG_Data[i].names.motor[1]),
                                        get_param_value(log.messages.PARM, MAG_Data[i].names.motor[2])],
                               id: get_param_value(log.messages.PARM, MAG_Data[i].names.id),
                               use: get_param_value(log.messages.PARM, MAG_Data[i].names.use),
                               external: get_param_value(log.messages.PARM, MAG_Data[i].names.external),
                               orientation: get_param_value(log.messages.PARM, MAG_Data[i].names.orientation) }

        // Print some device info, offset is first param in fieldset
        let name = "MAG" + i
        let info = document.getElementById(name)
        info.replaceChildren()

        const id = decode_devid(MAG_Data[i].params.id, DEVICE_TYPE_COMPASS)
        if (id != null) {
            if (id.bus_type_index == 3) {
                // DroneCAN
                info.appendChild(document.createTextNode(id.bus_type + " bus: " + id.bus + " node id: " + id.address + " sensor: " + id.sensor_id))
            } else {
                info.appendChild(document.createTextNode(id.name + " via " + id.bus_type))
            }
        }
        info.appendChild(document.createElement("br"))
        info.appendChild(document.createElement("br"))

        info.appendChild(document.createTextNode("Use: " + (MAG_Data[i].params.use ? "\u2705" : "\u274C")))
        info.appendChild(document.createTextNode(", "))
        info.appendChild(document.createTextNode("External: " + ((MAG_Data[i].params.external > 0) ? "\u2705" : "\u274C")))
        info.appendChild(document.createTextNode(", "))
        info.appendChild(document.createTextNode("Health: " + (array_all_equal(log.messages[msg_name].Health, 1) ? "\u2705" : "\u274C")))

        info.appendChild(document.createElement("br"))
        info.appendChild(document.createElement("br"))

        let show = document.createElement("input")
        let show_name = name + "_SHOW"
        show.setAttribute('type', 'checkbox')
        show.setAttribute('id', show_name)
        show.addEventListener('change', function() { redraw() } )
        show.checked = true

        let label = document.createElement("label")
        label.setAttribute('for', show_name)
        label.innerHTML = "Show"

        info.appendChild(show)
        info.appendChild(label)


        // Remove calibration to get raw values

        // Subtract compass-motor compensation
        let x = array_sub(MAG_Data[i].orig.x, Array.from(log.messages[msg_name].MOX))
        let y = array_sub(MAG_Data[i].orig.y, Array.from(log.messages[msg_name].MOY))
        let z = array_sub(MAG_Data[i].orig.z, Array.from(log.messages[msg_name].MOZ))

        // Remove iron correction
        if (!array_all_equal(MAG_Data[i].params.diagonals, 0.0)) {

            // Invert iron correction matrix
            const iron = new mlMatrix.Matrix([
                [ MAG_Data[i].params.diagonals[0],     MAG_Data[i].params.off_diagonals[0], MAG_Data[i].params.off_diagonals[1] ],
                [ MAG_Data[i].params.off_diagonals[0], MAG_Data[i].params.diagonals[1],     MAG_Data[i].params.off_diagonals[2] ],
                [ MAG_Data[i].params.off_diagonals[1], MAG_Data[i].params.off_diagonals[2], MAG_Data[i].params.diagonals[2] ]
            ])
            const inv_iron = mlMatrix.inverse(iron)

            // Vectorized multiplication
            const corrected_x = array_add(array_add( array_scale(x, inv_iron.get(0,0)), array_scale(y, inv_iron.get(0,1))), array_scale(z, inv_iron.get(0,2)) )
            const corrected_y = array_add(array_add( array_scale(x, inv_iron.get(1,0)), array_scale(y, inv_iron.get(1,1))), array_scale(z, inv_iron.get(1,2)) )
            const corrected_z = array_add(array_add( array_scale(x, inv_iron.get(2,0)), array_scale(y, inv_iron.get(2,1))), array_scale(z, inv_iron.get(2,2)) )

            x = corrected_x; y = corrected_y; z = corrected_z
        }

        // Remove scale factor, if valid
        if (scale_valid(MAG_Data[i].params.scale)) {
            const inv_scale = 1 / MAG_Data[i].params.scale
            x = array_scale(x, inv_scale)
            y = array_scale(y, inv_scale)
            z = array_scale(z, inv_scale)
        }

        // remove offsets
        x = array_sub(x, Array.from(log.messages[msg_name].OfsX))
        y = array_sub(y, Array.from(log.messages[msg_name].OfsY))
        z = array_sub(z, Array.from(log.messages[msg_name].OfsZ))

        // Rotate external compasses back into raw sensor frame
        let rotation = new Quaternion()
        let rotate = false
        if ((MAG_Data[i].params.external != 0) && rotation.from_rotation(MAG_Data[i].params.orientation)) {
            rotation.invert()
            const len = x.length
            for (let j = 0; j < len; j++) {
                const tmp = rotation.rotate([x[j], y[j], z[j]])
    
                x[j] = tmp[0]
                y[j] = tmp[1]
                z[j] = tmp[2]
            }
            rotate = true
        }

        MAG_Data[i].raw = { x: x, y: y, z: z }
        MAG_Data[i].rotate = rotate

    }

    // Set start and end time
    document.getElementById("TimeStart").value = MAG_Data.start_time
    document.getElementById("TimeEnd").value = MAG_Data.end_time

    // Assume constant earth felid
    // Use origin msg
    // Use last EKF origin for earth field
    log.parseAtOffset("ORGN")
    log.parseAtOffset("POS")
    var [Lat, Lng] = extractLatLon(log)
    var earth_field = expected_earth_field_lat_lon(Lat, Lng)
    if (earth_field == null) {
        alert("Could not get earth field for Lat: " + Lat + " Lng: " + Lng)
        return
    }
    console.log("EF: " + earth_field[0] + ", " + earth_field[1] + ", " + earth_field[2] + " at Lat: " + Lat + " Lng: " + Lng)

    // Workout which attitude source to use, Note that this is not clever enough to deal with primary changing in flight
    const EKF_TYPE = get_param_value(log.messages.PARM, "AHRS_EKF_TYPE")

    // Load various attitude sources and calculate body frame earth field

    // Clear attitude selection options
    let attitude_select = document.getElementById("ATTITUDE")
    attitude_select.replaceChildren(attitude_select.children[0])

    body_frame_earth_field = []

    log.parseAtOffset("AHR2")
    msg_name = "AHR2"
    if (log.messages[msg_name] != null) {

        const quaternion = {
            time: array_scale(Array.from(log.messages[msg_name].time_boot_ms), 1 / 1000),
            q1: Array.from(log.messages[msg_name].Q1),
            q2: Array.from(log.messages[msg_name].Q2),
            q3: Array.from(log.messages[msg_name].Q3),
            q4: Array.from(log.messages[msg_name].Q4)
        }

        let field = add_attitude_source(quaternion, earth_field, "DCM")
        if (EKF_TYPE == 0) {
            field.select.checked = true
        }
 
        body_frame_earth_field.push(field)
    }

    log.parseAtOffset("NKQ")
    msg_name = "NKQ[0]"
    if (log.messages[msg_name] != null) {

        const quaternion = {
            time: array_scale(Array.from(log.messages[msg_name].time_boot_ms), 1 / 1000),
            q1: Array.from(log.messages[msg_name].Q1),
            q2: Array.from(log.messages[msg_name].Q2),
            q3: Array.from(log.messages[msg_name].Q3),
            q4: Array.from(log.messages[msg_name].Q4)
        }

        let field = add_attitude_source(quaternion, earth_field, "EKF 2 IMU 1")
        if (EKF_TYPE == 2) {
            field.select.checked = true
        }

        body_frame_earth_field.push(field)
    }

    log.parseAtOffset("XKQ")
    if (log.messages["XKQ"] != null) {

        var primary = 0
        const EKF3_PRIMARY = get_param_value(log.messages.PARM, "EK3_PRIMARY")
        if (EKF3_PRIMARY != null) {
            primary = EKF3_PRIMARY
        }
        msg_name = "XKQ[" + primary + "]"

        if (log.messages[msg_name] != null) {

            quaternion = { 
                time: array_scale(Array.from(log.messages[msg_name].time_boot_ms), 1 / 1000),
                q1: Array.from(log.messages[msg_name].Q1),
                q2: Array.from(log.messages[msg_name].Q2),
                q3: Array.from(log.messages[msg_name].Q3),
                q4: Array.from(log.messages[msg_name].Q4)
            }

            let field = add_attitude_source(quaternion, earth_field, "EKF 3 IMU " + (primary + 1))
            if (EKF_TYPE == 3) {
                field.select.checked = true
            }
            body_frame_earth_field.push(field)
        }
    }

    if (body_frame_earth_field.length == 0) {
        alert("Unknown attitude source")
        return
    } else if (body_frame_earth_field.length == 1) {
        // Only one item, select it and disable
        body_frame_earth_field[0].select.checked = true
        body_frame_earth_field[0].select.disabled = true
    }

    // Add interference sources
    source = null
    fits = []

    // Only offsets
    fits.push("Offsets")
    fits.push("Offsets and scale")
    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null) {
            continue
        }
        MAG_Data[i].fits.push({ value: null, type: 0, offsets_only: true })
        MAG_Data[i].fits.push({ value: null, type: 0, offsets_and_scale: true })
    }

    // Offsets and elliptical only
    fits.push("Offsets and iron")
    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null) {
            continue
        }
        MAG_Data[i].fits.push({ value: null, type: 0 })
    }

    log.parseAtOffset("BAT")
    if (Object.keys(log.messages.BAT).length > 0) {
        for (let i = 0; i < 1; i++) {
            let msg_name = "BAT[" + i + "]"
            if (log.messages[msg_name] == null) {
                // Try single instance, deal with change in instance string
                let found_inst = false
                for (const inst of ["Inst", "Instance"]) {
                    if ((inst in log.messages.BAT) && Array.from(log.messages.BAT[inst]).every((x) => x == i)) {
                        found_inst = true
                    }
                }
                if (!found_inst) {
                    continue
                }
                msg_name = "BAT"
            }
            if (log.messages[msg_name].length == 0) {
                continue
            }
            const value = Array.from(log.messages[msg_name].Curr)
            if (array_all_NaN(value)) {
                // Battery does not support current
                continue
            }
            fits.push("Battery " + (i+1) + " current")
            const time = array_scale(Array.from(log.messages[msg_name].time_boot_ms), 1 / 1000)
            for (let i = 0; i < 3; i++) {
                if (MAG_Data[i] == null) {
                    continue
                }
                MAG_Data[i].fits.push({ value: linear_interp(value, time, MAG_Data[i].time), type: 2 })
            }
        }
    }

    // Setup time array in plots
    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null) {
            continue
        }
        mag_plot.X.data[i+1].x = MAG_Data[i].time
        mag_plot.Y.data[i+1].x = MAG_Data[i].time
        mag_plot.Z.data[i+1].x = MAG_Data[i].time

        error_plot.data[i].x = MAG_Data[i].time
    }

    // Add button for each fit
    for (let i = 0; i < 3; i++) {
        if (MAG_Data[i] == null) {
            continue
        }
        let name = "MAG" + i + "_TYPE"
        let section = document.getElementById(name)
        section.replaceChildren(section.children[0])

        function setup_radio(type) {
            let radio = document.createElement("input")
            radio.setAttribute('type', 'radio')
            radio.setAttribute('id', name + type)
            radio.setAttribute('name', name)
            radio.disabled = false
            radio.addEventListener('change', function() { redraw() } )
    
            let label = document.createElement("label")
            label.setAttribute('for', name + type)
            label.innerHTML = type

            section.appendChild(radio)
            section.appendChild(label)
            section.appendChild(document.createElement("br"))

            return radio
        }

        MAG_Data[i].orig.select = setup_radio("Existing Calibration")
        for (let j = 0; j < fits.length; j++) {
            MAG_Data[i].fits[j].select = setup_radio(fits[j])
        }

    }

    calculate()

}

// Update flight data range and enable calculate when time range inputs are updated
function time_range_changed() {

    flight_data.layout.xaxis.range = [ parseFloat(document.getElementById("TimeStart").value),
                                       parseFloat(document.getElementById("TimeEnd").value)]
    flight_data.layout.xaxis.autorange = false
    Plotly.redraw("FlightData")

    set_need_calc(true)
}
