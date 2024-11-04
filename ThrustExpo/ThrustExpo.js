const TABLE_ROW_HEIGHT = 22;
const TABLE_MAX_HEIGHT = 800;
const PLOT_LEGEND_X = 1.3;
const PLOT_MARGIN = { b: 50, l: 50, r: 150, t: 20 };

const params = {
    MOT_SPIN_ARM: {
        default: 0.1,
        save: true,
    },
    MOT_SPIN_MIN: {
        default: 0.15,
        save: true,
    },
    MOT_SPIN_MAX: {
        default: 0.95,
        save: true,
    },
    MOT_PWM_MIN: {
        default: 1000,
        save: true,
    },
    MOT_PWM_MAX: {
        default: 2000,
        save: true,
    },
    MOT_THST_EXPO: {
        default: 0.65,
        save: true,
    },
    MOT_THST_HOVER: {
        default: 0.35,
        save: false,
    },
    MOTOR_COUNT: {
        default: 4,
        save: false,
    },
    COPTER_MASS: {
        default: 0,
        save: false,
    },
};
const thrustExpoPlot = {};
const thrustErrorPlot = {};
const thrustPwmPlot = {};
let thrustTable;

function loadParamFile(input) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split("\n");
        lines.forEach((line) => {
            const [param, value] = line.split(",");
            const inputElement = document.getElementById(param);
            if (inputElement) {
                inputElement.value = parseFloat(value);
                inputElement.dispatchEvent(new Event("change"));
            }
        });
    };
    reader.readAsText(file);
}

function saveParamFile() {
    const paramsString = Object.entries(params)
        .filter(([_, value]) => value.save)
        .map(([key, value]) => `${key},${value.value}`)
        .join("\n");
    const blob = new Blob([paramsString], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "ThrustExpo.param");
}

function initParamInputs() {
    document.querySelectorAll(".param-row input").forEach((input) => {
        const paramName = input.name || input.id;
        if (paramName === "MOT_SPIN_ARM") {
            input.addEventListener("change", function (e) {
                params[paramName].value = parseFloat(this.value);
                // trigger MOT_SPIN_MIN check
                document.getElementById("MOT_SPIN_MIN").dispatchEvent(new Event("input"));
                updatePlotData();
            });
        } else if (paramName === "MOT_SPIN_MIN") {
            // constrain spin_min to be greater than spin_arm
            input.addEventListener("input", function (e) {
                const spin_arm = document.getElementById("MOT_SPIN_ARM").value;
                if (this.value < spin_arm) {
                    this.value = spin_arm;
                }
                params[paramName].value = parseFloat(this.value);
            });
            input.addEventListener("change", function (e) {
                updatePlotData();
            });
        } else if (paramName === "MOT_THST_EXPO") {
            input.addEventListener("change", function (e) {
                // provide discrete expo value (prevents optimization from overwriting user input)
                params[paramName].value = parseFloat(this.value);
                updatePlotData(parseFloat(this.value));
            });
        } else {
            input.addEventListener("change", function (e) {
                params[paramName].value = parseFloat(this.value);
                updatePlotData();
            });
        }
    });

    // load params
    load_param_inputs("params.json", Object.keys(params));

    document.getElementById("paramFile")
        .addEventListener("change", function (e) {
            loadParamFile(this);
        });
}

function createSpinMarkers(usePwm = false) {
    // calculate PWM values for vertical markers
    const pwmRange = usePwm
        ? params.MOT_PWM_MAX.value - params.MOT_PWM_MIN.value
        : 100;
    const pwmBase = usePwm ? params.MOT_PWM_MIN.value : 0;
    const pwmArm = pwmBase + params.MOT_SPIN_ARM.value * pwmRange;
    const pwmMin = pwmBase + params.MOT_SPIN_MIN.value * pwmRange;
    const pwmMax = pwmBase + params.MOT_SPIN_MAX.value * pwmRange;

    const markerDetails = [
        {
            param: pwmArm,
            color: "orange",
            label: "SPIN_ARM",
        },
        {
            param: pwmMin,
            color: "green",
            label: "SPIN_MIN",
        },
        {
            param: pwmMax,
            color: "red",
            label: "SPIN_MAX",
        },
    ];

    const markers = markerDetails.map((marker) => {
        const x = marker.param;

        return {
            type: "line",
            x0: x,
            x1: x,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: {
                color: marker.color,
                width: 0.75,
                dash: "dot",
            },
        };
    });

    const annotations = markerDetails.map((marker) => ({
        x: marker.param,
        y: 1,
        yref: "paper",
        text: marker.label,
        showarrow: false,
        textangle: -90,
        xshift: -9,
        yshift: -5,
    }));

    return { shapes: markers, annotations };
}

function updateThrustExpoPlot(thrustExpo = null) {
    // do a little error checking
    const thrustData = thrustTable.getData().filter((row) => {
        return row.pwm && row.thrust && !isNaN(row.pwm) && !isNaN(row.thrust);
    });

    // skip plotting on erroneous data
    if (thrustData.length === 0) {
        thrustExpoPlot.data = [];
        Plotly.react(
            thrustExpoPlot.plot,
            thrustExpoPlot.data,
            thrustExpoPlot.layout
        );
        return;
    }

    // Sort into arrays
    const data_length = thrustData.length
    const data = {
        pwm: new Array(data_length),
        thrust: new Array(data_length),
        voltage: new Array(data_length),
        current: new Array(data_length)
    }
    for (let i = 0; i < data_length; i++) {
        data.pwm[i] = thrustData[i].pwm
        data.thrust[i] = thrustData[i].thrust
        data.voltage[i] = thrustData[i].voltage
        data.current[i] = thrustData[i].current
    }

    // Test at actuator values from 0 to 1
    const actuator_test_step = 0.001
    const actuator_test_values = array_from_range(0.0, 1.0, actuator_test_step)

    const MOT_PWM_MIN = parseFloat(params.MOT_PWM_MIN.value)
    const MOT_PWM_MAX = parseFloat(params.MOT_PWM_MAX.value)

    const MOT_SPIN_MIN = parseFloat(params.MOT_SPIN_MIN.value)
    const MOT_SPIN_MAX = parseFloat(params.MOT_SPIN_MAX.value)

    function get_corrected_thrust(curve_expo) {

        // Helper function allows direct copy of AP linearisation code
        function constrain_float(amt, low, high) {
            if (amt < low) {
                return low
            }

            if (amt > high) {
                return high
            }

            return amt
        }

        // Helper function allows direct copy of AP linearisation code
        function is_zero(val) {
            return val == 0.0
        }

        // Helper function allows direct copy of AP linearisation code
        function safe_sqrt(val) {
            return Math.sqrt(val)
        }

        // https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Motors/AP_Motors_Thrust_Linearization.cpp#L116
        // apply_thrust_curve_and_volt_scaling - returns throttle in the range 0 ~ 1
        function apply_thrust_curve_and_volt_scaling(thrust)
        {
            const battery_scale = 1.0;
            const lift_max = 1.0;

            /*
                AP uses estimated resting voltage for correction, we can assume constant resting voltage for the duration of the test
                if (is_positive(batt_voltage_filt.get())) {
                    battery_scale = 1.0 / batt_voltage_filt.get();
                }
            */

            // apply thrust curve - domain -1.0 to 1.0, range -1.0 to 1.0
            const thrust_curve_expo = constrain_float(curve_expo, -1.0, 1.0);
            if (is_zero(thrust_curve_expo)) {
                // zero expo means linear, avoid floating point exception for small values
                return lift_max * thrust * battery_scale;
            }
            const throttle_ratio = ((thrust_curve_expo - 1.0) + safe_sqrt((1.0 - thrust_curve_expo) * (1.0 - thrust_curve_expo) + 4.0 * thrust_curve_expo * lift_max * thrust)) / (2.0 * thrust_curve_expo);
            return constrain_float(throttle_ratio * battery_scale, 0.0, 1.0);
        }


        // https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Motors/AP_Motors_Thrust_Linearization.cpp#L101
        // converts desired thrust to linearized actuator output in a range of 0~1
        function thrust_to_actuator(thrust_in) {
            thrust_in = constrain_float(thrust_in, 0.0, 1.0)
            return MOT_SPIN_MIN + (MOT_SPIN_MAX - MOT_SPIN_MIN) * apply_thrust_curve_and_volt_scaling(thrust_in)
        }

        // https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Motors/AP_MotorsMulticopter.cpp#L405-L406
        // convert actuator output (0~1) range to pwm range
        function output_to_pwm(actuator) {
            return MOT_PWM_MIN + (MOT_PWM_MAX - MOT_PWM_MIN) * actuator
        }

        // Run the actuator demand through the AP equations to get a PWM output
        const len = actuator_test_values.length
        let pwm = new Array(len)
        for (let i = 0; i < len; i++) {
            const actuator = thrust_to_actuator(actuator_test_values[i])
            pwm[i] = output_to_pwm(actuator)
        }

        // Interpolate the thrust for the given PWM
        const corrected_thrust = linear_interp(data.thrust, data.pwm, pwm)

        // Differentiate, good linearisation has constant gradient
        let gradient = new Array(len-1)
        for (let i = 0; i < (len-1); i++) {
            gradient[i] = (corrected_thrust[i+1] - corrected_thrust[i]) / actuator_test_step
        }

        // Standard deviation
        const mean = array_mean(gradient)
        let std_deviation_sum = 0.0
        for (let i = 0; i < (len-1); i++) {
            std_deviation_sum += (gradient[i] - mean)  ** 2
        }
        const std_deviation = Math.sqrt(std_deviation_sum / gradient.length)

        return {
            corrected_thrust,
            gradient,
            mean,
            std_deviation,
            expo: curve_expo
        }
    }

    let result;
    if (thrustExpo) {
        // don't optimize if user has provided a value
        result = get_corrected_thrust(thrustExpo);
    } else {
        // find optimal expo value
        // test expo values from -1 to 1 in steps of 0.005
        for (let expo = -1; expo <= 1; expo += 0.005) {
            const test_result = get_corrected_thrust(expo);
            if ((result == null) || (test_result.std_deviation < result.std_deviation)) {
                result = test_result
            }
        }
    }

    // Calculate uncorrected thrust by converting PWM to actuator value
    const uncorrected_actuator = new Array(data_length)
    for (let i = 0; i < data_length; i++) {
        const throttle = (data.pwm[i] - MOT_PWM_MIN) / (MOT_PWM_MAX - MOT_PWM_MIN)
        uncorrected_actuator[i] = (throttle - MOT_SPIN_MIN) / (MOT_SPIN_MAX - MOT_SPIN_MIN)
    }
    const uncorrected_thrust = linear_interp(data.thrust, uncorrected_actuator, actuator_test_values)

    // update the parameter with the optimal value
    params.MOT_THST_EXPO.value = result.expo;
    document.getElementById("MOT_THST_EXPO").value = result.expo.toFixed(3);

    const linearizedThrustData = result.corrected_thrust;

    const actuator_pct = array_scale(actuator_test_values, 100.0)

    thrustExpoPlot.data = [
        {
            x: actuator_pct,
            y: uncorrected_thrust,
            name: "Measured Thrust",
            mode: "lines",
        },
        {
            x: actuator_pct,
            y: result.corrected_thrust,
            name: "Linearized Thrust",
            mode: "lines",
        },
    ];

    // estimate hover thrust if mass is provided
    if (params.COPTER_MASS.value > 0 && params.MOTOR_COUNT.value > 0) {
        const requiredThrust =
            params.COPTER_MASS.value / params.MOTOR_COUNT.value;

        const hoverThrottle = linear_interp(actuator_pct, result.corrected_thrust, [requiredThrust])[0]

        if (hoverThrottle >= 0 && hoverThrottle <= 100) {
            // update MOT_THST_HOVER estimate (to 4 decimal places)
            params.MOT_THST_HOVER.value = Math.round(hoverThrottle / 100 * 10000) / 10000;
            params.MOT_THST_HOVER.save = true;
            const hoverContainer = document.getElementById(
                "hover-thrust-estimate"
            );
            const hoverInput = document.getElementById("MOT_THST_HOVER");
            if (hoverContainer && hoverInput) {
                hoverInput.value = params.MOT_THST_HOVER.value.toFixed(3);
                hoverContainer.style.display = "block";
            }

            // add hover point to plot
            thrustExpoPlot.data.push({
                x: [hoverThrottle],
                y: [requiredThrust],
                name: "THST_HOVER",
                mode: "markers",
                marker: {
                    size: 6,
                    symbol: "circle",
                    color: "green",
                },
            });
        }
    }

    Plotly.react(
        thrustExpoPlot.plot,
        thrustExpoPlot.data,
        thrustExpoPlot.layout
    );
    thrustExpoPlot.plot.style.display = "block";

    // Gradient plot
    thrustErrorPlot.data = [
        {
            x: array_scale(array_offset(actuator_test_values.slice(0, -1), actuator_test_step * 0.5), 100.0),
            y: result.gradient,
            name: "Linearized Thrust<br>Std dev: " + result.std_deviation.toFixed(3),
            mode: "lines",
            line: {
                color: "indianred",
            },
        },
    ];
    thrustErrorPlot.layout.shapes[0].y0 = result.mean
    thrustErrorPlot.layout.shapes[0].y1 = result.mean
    Plotly.react(
        thrustErrorPlot.plot,
        thrustErrorPlot.data,
        thrustErrorPlot.layout
    );
    thrustErrorPlot.plot.style.display = "block";
}

function updateThrustPwmPlot() {
    // get thrust data and filter out invalid entries
    const thrustData = thrustTable.getData().filter((row) => {
        return row.pwm && row.thrust && !isNaN(row.pwm) && !isNaN(row.thrust);
    });

    // skip plotting if no valid data
    if (thrustData.length === 0) {
        thrustPwmPlot.data = [];
        Plotly.react(
            thrustPwmPlot.plot,
            thrustPwmPlot.data,
            thrustPwmPlot.layout
        );
        return;
    }

    Plotly.relayout(thrustPwmPlot.plot, {
        "xaxis.range": [params.MOT_PWM_MIN.value, params.MOT_PWM_MAX.value],
    });

    // create the plot
    thrustPwmPlot.data = [
        {
            x: thrustData.map((row) => row.pwm),
            y: thrustData.map((row) => row.thrust),
            name: "Measured Thrust",
            mode: "lines",
        },
    ];

    // update layout with vertical markers
    const { shapes, annotations } = createSpinMarkers(true);
    thrustPwmPlot.layout.shapes = shapes;
    thrustPwmPlot.layout.annotations = annotations;

    // update the plot
    Plotly.react(thrustPwmPlot.plot, thrustPwmPlot.data, thrustPwmPlot.layout);
    thrustPwmPlot.plot.style.display = "block";
}

function initThrustExpoPlot() {
    thrustExpoPlot.layout = {
        xaxis: {
            title: { text: "Throttle (%)" },
            type: "linear",
            zeroline: false,
            showline: true,
            mirror: true,
            range: [0, 100],
        },
        yaxis: {
            title: { text: "Thrust" },
            zeroline: false,
            showline: true,
            mirror: true,
        },
        showlegend: true,
        legend: {
            itemclick: false,
            itemdoubleclick: false,
            xanchor: "right",
            x: PLOT_LEGEND_X,
        },
        margin: PLOT_MARGIN,
        shapes: [],
    };
    thrustExpoPlot.plot = document.getElementById("thrust-expo-plot");
    Plotly.purge(thrustExpoPlot.plot);
    Plotly.newPlot(
        thrustExpoPlot.plot,
        thrustExpoPlot.data,
        thrustExpoPlot.layout,
        {
            displaylogo: false,
        }
    );
}

function initThrustErrorPlot() {
    thrustErrorPlot.layout = {
        xaxis: {
            title: { text: "Throttle (%)" },
            type: "linear",
            zeroline: false,
            showline: true,
            mirror: true,
            range: [0, 100],
        },
        yaxis: {
            title: { text: "Thrust gradient (delta thrust / delta throttle)" },
            zeroline: false,
            showline: true,
            mirror: true,
        },
        showlegend: true,
        legend: {
            itemclick: false,
            itemdoubleclick: false,
            xanchor: "right",
            x: PLOT_LEGEND_X,
        },
        margin: PLOT_MARGIN,
        shapes: [
            {
                type: "line",
                x0: 0,
                x1: 100,
                y0: 0,
                y1: 0,
                line: {
                    dash: "4px,3px",
                    width: 1,
                    color: "gray",
                },
            },
        ],
    };
    thrustErrorPlot.plot = document.getElementById("thrust-error-plot");
    Plotly.purge(thrustErrorPlot.plot);
    Plotly.newPlot(
        thrustErrorPlot.plot,
        thrustErrorPlot.data,
        thrustErrorPlot.layout,
        {
            displaylogo: false,
        }
    );
}

function initThrustPwmPlot() {
    thrustPwmPlot.layout = {
        xaxis: {
            title: { text: "PWM (µs)" },
            type: "linear",
            zeroline: false,
            showline: true,
            mirror: true,
            range: [params.MOT_PWM_MIN.value, params.MOT_PWM_MAX.value],
        },
        yaxis: {
            title: { text: "Thrust" },
            zeroline: false,
            showline: true,
            mirror: true,
        },
        showlegend: true,
        legend: {
            itemclick: false,
            itemdoubleclick: false,
            xanchor: "right",
            x: PLOT_LEGEND_X,
        },
        margin: PLOT_MARGIN,
        shapes: [],
    };
    thrustPwmPlot.plot = document.getElementById("thrust-pwm-plot");
    Plotly.purge(thrustPwmPlot.plot);
    Plotly.newPlot(
        thrustPwmPlot.plot,
        thrustPwmPlot.data,
        thrustPwmPlot.layout,
        {
            displaylogo: false,
        }
    );
}

function initThrustTable() {
    thrustTable = new Tabulator("#thrust-table", {
        rowHeight: TABLE_ROW_HEIGHT,

        // enable range selection
        selectableRange: 1,
        selectableRangeColumns: true,
        selectableRangeRows: true,
        selectableRangeClearCells: true,

        // change edit trigger mode to make cell navigation smoother
        editTriggerEvent: "dblclick",

        // configure clipboard to allow copy and paste of range format data
        clipboard: true,
        clipboardCopyStyled: false,
        clipboardCopyConfig: {
            rowHeaders: false,
            columnHeaders: false,
        },
        clipboardCopyRowRange: "range",
        clipboardPasteParser: function (text) {
            const fields = ["pwm", "thrust", "voltage", "current"];
            const startCol = thrustTable.getRanges()[0].getLeftEdge() - 1;

            const parsed = text
                .trim()
                .split("\n")
                .map((row) => {
                    const values = row.split("\t");
                    const result = {};
                    values.forEach((value, i) => {
                        const fieldIndex = startCol + i;
                        if (fieldIndex < fields.length) {
                            result[fields[fieldIndex]] = parseFloat(value);
                        }
                    });
                    return result;
                });

            // add rows if necessary
            let currentRowCount = thrustTable.getData().length;
            const pastedRowCount = parsed.length;
            const startIndex = thrustTable.getRanges()[0].getTopEdge();
            while (currentRowCount < startIndex + pastedRowCount + 1) {
                thrustTable.addRow({
                    pwm: "",
                    thrust: "",
                    voltage: "",
                    current: "",
                });
                currentRowCount++;
            }

            return parsed;
        },
        clipboardPasteAction: "range",

        rowHeader: {
            resizable: false,
            frozen: true,
            width: 40,
            hozAlign: "center",
            formatter: "rownum",
            cssClass: "range-header-col",
            editor: false,
        },

        columnDefaults: {
            headerSort: false,
            headerHozAlign: "center",
            editor: "input",
            resizable: "header",
            width: 110,
        },

        columns: [
            {
                title: "ESC signal (µs)",
                field: "pwm",
                hozAlign: "right",
                validator: "numeric",
            },
            {
                title: "Thrust",
                field: "thrust",
                hozAlign: "right",
                validator: "numeric",
            },
            {
                title: "Voltage (V)",
                field: "voltage",
                hozAlign: "right",
                validator: "numeric",
            },
            {
                title: "Current (A)",
                field: "current",
                hozAlign: "right",
                validator: "numeric",
            },
        ],

        // add new rows at the bottom
        addRowPos: "bottom",

        // ensure data contains keys
        dataLoaded: function (data) {
            this.setData(
                data.map((row) => ({
                    pwm: row.pwm || "",
                    thrust: row.thrust || "",
                    voltage: row.voltage || "",
                    current: row.current || "",
                }))
            );
        },
    });

    // dynamically set table display height
    let currentHeight = 0;
    let updateTimeout = null;

    const onDataChanged = function () {
        // update table height as necessary
        const rowCount = thrustTable.getRows().length;
        const headerHeight =
            thrustTable.element.querySelector(".tabulator-header").offsetHeight;
        const newHeight = Math.min(
            rowCount * TABLE_ROW_HEIGHT + headerHeight,
            TABLE_MAX_HEIGHT
        );
        if (currentHeight !== newHeight) {
            currentHeight = newHeight;
            thrustTable.setHeight(`${newHeight}px`);
        }

        // update chart after changes stop
        // (paste actions call this repeatedly, so debounce a little)
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            updatePlotData();
        }, 100);
    };

    thrustTable.on("dataChanged", onDataChanged);
    thrustTable.on("renderComplete", onDataChanged);

    // if the last row is edited, add a new row
    thrustTable.on("cellEdited", function (cell) {
        const row = cell.getRow();
        if (row.getPosition() === thrustTable.getRows().length) {
            thrustTable.addRow({
                pwm: "",
                thrust: "",
                voltage: "",
                current: "",
            });
        }
    });
}

function updatePlotData(thrustExpo = null) {
    updateThrustExpoPlot(thrustExpo);
    updateThrustPwmPlot();
}

function reset() {
    const hoverContainer = document.getElementById("hover-thrust-estimate");
    hoverContainer.style.display = "none";
    thrustExpoPlot.plot.style.display = "none";
    thrustErrorPlot.plot.style.display = "none";
    thrustPwmPlot.plot.style.display = "none";
    document.getElementById("paramFile").value = "";
    params.MOT_THST_HOVER.save = false;
    document.querySelectorAll(".param-row input").forEach((input) => {
        const paramName = input.name || input.id;
        input.value = params[paramName].default;
        params[paramName].value = params[paramName].default;
    });
    thrustTable.setData(
        Array.from({ length: 10 }, () => ({
            pwm: "",
            thrust: "",
            voltage: "",
            current: "",
        }))
    );
}

// add cleanup function to prevent memory leaks
function cleanup() {
    // clear plots
    Plotly.purge(thrustExpoPlot.plot);
    Plotly.purge(thrustErrorPlot.plot);
    Plotly.purge(thrustPwmPlot.plot);
    
    // destroy table
    if (thrustTable) {
        thrustTable.destroy();
    }
}

// cleanup before unloading
window.addEventListener('beforeunload', cleanup);

// add listeners here rather than using event attributes in html
document.addEventListener("DOMContentLoaded", async () => {
    // clear any existing event listeners before adding new ones
    const saveParamsBtn = document.getElementById("save-params");
    const resetBtn = document.getElementById("reset");
    
    // remove old listeners if they exist
    const newSaveParamsBtn = saveParamsBtn.cloneNode(true);
    const newResetBtn = resetBtn.cloneNode(true);
    saveParamsBtn.parentNode.replaceChild(newSaveParamsBtn, saveParamsBtn);
    resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
    
    // add new listeners
    newSaveParamsBtn.addEventListener("click", saveParamFile);
    newResetBtn.addEventListener("click", reset);
    
    // initialize components
    tippy(".tooltip-trigger");
    initParamInputs();
    initThrustExpoPlot();
    initThrustErrorPlot();
    initThrustPwmPlot();
    initThrustTable();
    thrustTable.on("tableBuilt", () => reset());
});
