
const origin_size = 0.2
function update() {

    let mat = new Matrix3()

    let rotation = parseInt(document.getElementById("rotations").value)

    // Angle input boxes
    const roll_in = document.getElementById("EulerRoll")
    const pitch_in = document.getElementById("EulerPitch")
    const yaw_in = document.getElementById("EulerYaw")

    if ((rotation == 101) || (rotation == 102)) {
        // Custom rotation, use input from boxes
        roll_in.disabled = false
        pitch_in.disabled = false
        yaw_in.disabled = false

        const deg2rad = Math.PI / 180.0
        mat.from_euler(parseFloat(roll_in.value) * deg2rad, parseFloat(pitch_in.value) * deg2rad, parseFloat(yaw_in.value) * deg2rad)

    } else if (mat.from_rotation(rotation)) {
        // Disable angle input and set values to match selected rotation
        roll_in.disabled = true
        pitch_in.disabled = true
        yaw_in.disabled = true

        roll_in.value = euler[rotation][0]
        pitch_in.value = euler[rotation][1]
        yaw_in.value = euler[rotation][2]

    } else {
        throw new Error("Invalid rotation")
    }

    function update_plot_data(index, vector) {

        let rotated = mat.rotate(vector)

        index = index*2
        Object.assign(rotations_plot.data[index + 0], {  x: [rotated[0]],   y: [rotated[1]],   z: [rotated[2]], u: [rotated[0]], v: [rotated[1]], w: [rotated[2]] })
        Object.assign(rotations_plot.data[index + 1], {  x: [0,rotated[0]], y: [0,rotated[1]], z: [0,rotated[2]] })

    }

    update_plot_data(3, [ origin_size * 1.5, 0, 0 ])
    update_plot_data(4, [ 0, origin_size * 1.5, 0 ])
    update_plot_data(5, [ 0, 0, origin_size * 1.5 ])

    let plot = document.getElementById("plot")
    Plotly.redraw(plot)

}

let rotations_plot = {}
function reset() {

    const cone_size = origin_size * 2.0
    const range = 0.3

    rotations_plot.data = []

    // Origin
    // X
    const x_color = 'rgba(0,0,255,0.5)'
    rotations_plot.data.push({type: "cone", x: [origin_size], y: [0], z: [0], u: [origin_size], v: [0], w: [0], sizemode: "raw", sizeref: cone_size, showscale: false, hoverinfo: "none", colorscale:[[0, x_color], [1, x_color]]})
    rotations_plot.data.push({type: 'scatter3d', mode: 'lines', x: [0,origin_size], y: [0,0], z: [0,0], showlegend: false, hoverinfo: "none", line: {color: x_color, width: 10 }})

    // Y
    const y_color = 'rgba(255,0,0,0.5)'
    rotations_plot.data.push({type: "cone", x: [0], y: [origin_size], z: [0], u: [0], v: [origin_size], w: [0], sizemode: "raw", sizeref: cone_size, showscale: false, hoverinfo: "none", colorscale:[[0, y_color], [1, y_color]]})
    rotations_plot.data.push({type: 'scatter3d', mode: 'lines', x: [0,0], y: [0,origin_size], z: [0,0], showlegend: false, hoverinfo: "none", line: {color: y_color, width: 10 }})

    // Z
    const z_color = 'rgba(0,255,0,0.5)'
    rotations_plot.data.push({type: "cone", x: [0], y: [0], z: [origin_size], u: [0], v: [0], w: [origin_size], sizemode: "raw", sizeref: cone_size, showscale: false, hoverinfo: "none", colorscale:[[0, z_color], [1, z_color]]})
    rotations_plot.data.push({type: 'scatter3d', mode: 'lines', x: [0,0], y: [0,0], z: [0,origin_size], showlegend: false, hoverinfo: "none", line: {color: z_color, width: 10 }})

    // Rotated thing
    // X
    const x_color_2 = 'rgba(0,0,255,1.0)'
    rotations_plot.data.push({type: "cone", x: [origin_size], y: [0], z: [0], u: [origin_size], v: [0], w: [0], sizemode: "raw", sizeref: cone_size, showscale: false, hoverinfo: "none", colorscale:[[0, x_color_2], [1, x_color_2]]})
    rotations_plot.data.push({type: 'scatter3d', mode: 'lines', x: [0,origin_size], y: [0,0], z: [0,0], showlegend: false, hoverinfo: "none", line: {color: x_color_2, width: 10 }})

    // Y
    const y_color_2 = 'rgba(255,0,0,1.0)'
    rotations_plot.data.push({type: "cone", x: [0], y: [origin_size], z: [0], u: [0], v: [origin_size], w: [0], sizemode: "raw", sizeref: cone_size, showscale: false, hoverinfo: "none", colorscale:[[0, y_color_2], [1, y_color_2]]})
    rotations_plot.data.push({type: 'scatter3d', mode: 'lines', x: [0,0], y: [0,origin_size], z: [0,0], showlegend: false, hoverinfo: "none", line: {color: y_color_2, width: 10 }})

    // Z
    const z_color_2 = 'rgba(0,255,0,1.0)'
    rotations_plot.data.push({type: "cone", x: [0], y: [0], z: [origin_size], u: [0], v: [0], w: [origin_size], sizemode: "raw", sizeref: cone_size, showscale: false, hoverinfo: "none", colorscale:[[0, z_color_2], [1, z_color_2]]})
    rotations_plot.data.push({type: 'scatter3d', mode: 'lines', x: [0,0], y: [0,0], z: [0,origin_size], showlegend: false, hoverinfo: "none", line: {color: z_color_2, width: 10 }})
 
    rotations_plot.layout = {
        scene: { xaxis: {title: { text: "X, forward" }, range: [ -range, range ], zeroline: false, showline: true, mirror: true, showspikes: false },
                 yaxis: {title: { text: "Y, right" }, range: [ range, -range ], zeroline: false, showline: true, mirror: true, showspikes: false },
                 zaxis: {title: { text: "Z, down" }, range: [ range, -range ], zeroline: false, showline: true, mirror: true, showspikes: false },
                 aspectratio: { x:0.75, y:0.75, z:0.75 },
                 camera: {eye: { x:-1.25, y:1.25, z:1.25 }}},
        showlegend: true,
        legend: {itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    let plot = document.getElementById("plot")
    Plotly.purge(plot)
    Plotly.newPlot(plot, rotations_plot.data, rotations_plot.layout, { displaylogo: false });

    update()
}
