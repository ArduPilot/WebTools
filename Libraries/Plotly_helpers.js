

// Plotly defualt color map
function plot_default_color(i) {
    const default_colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf']
    return default_colors[i % default_colors.length]
}

// Link axes ranges
function link_plot_axis_range(link) {
    for (let i = 0; i<link.length; i++) {
        const this_plot = link[i][0]
        const this_axis_key = link[i][1]
        const this_axis_index = link[i][2]
        const this_index = i
        document.getElementById(this_plot).on('plotly_relayout', function(data) {
            // This is seems not to be recursive because the second call sets with array rather than a object
            const axis_key = this_axis_key + 'axis' + this_axis_index
            const range_keys = [axis_key + '.range[0]', axis_key + '.range[1]']
            if ((data[range_keys[0]] !== undefined) && (data[range_keys[1]] !== undefined)) {
                var freq_range = [data[range_keys[0]], data[range_keys[1]]]
                for (let i = 0; i<link.length; i++) {
                    if (i == this_index) {
                        continue
                    }
                    link[i][3].layout[link[i][1] + "axis" + link[i][2]].range = freq_range
                    link[i][3].layout[link[i][1] + "axis" + link[i][2]].autorange = false
                    Plotly.redraw(link[i][0])
                }
            }
        })
    }
}

// Link axis range rest
function link_plot_reset(reset_link) {
    for (let i = 0; i<reset_link.length; i++) {
        const this_plot = reset_link[i][0]
        const this_index = i
        document.getElementById(this_plot).on('plotly_relayout', function(data) {
            // This is seems not to be recursive because the second call sets with array rather than a object
            const axis = ["xaxis","yaxis","xaxis2","yaxis2"]
            var reset = false
            for (let i = 0; i<axis.length; i++) {
                const key = axis[i] + '.autorange'
                if ((data[key] !== undefined) && (data[key] == true)) {
                    reset = true
                    break
                }
            }
            if (reset) {

                for (let i = 0; i<reset_link.length; i++) {
                    if (i == this_index) {
                        continue
                    }
                    var redraw = false
                    for (let j = 0; j<axis.length; j++) {
                        if (reset_link[i][1].layout[axis[j]] == null) {
                            continue
                        }
                        if (!reset_link[i][1].layout[axis[j]].fixedrange) {
                            reset_link[i][1].layout[axis[j]].autorange = true
                            redraw = true
                        }
                    }
                    if (redraw) {
                        Plotly.redraw(reset_link[i][0])
                    }
                }
            }
        })
    }
}
