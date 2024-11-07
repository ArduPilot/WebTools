const TABLE_ROW_HEIGHT = 22;
const TABLE_MAX_HEIGHT = 242;
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
    COPTER_AUW: {
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
                document
                    .getElementById("MOT_SPIN_MIN")
                    .dispatchEvent(new Event("input"));
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

    document
        .getElementById("paramFile")
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
    const data_length = thrustData.length;
    const data = {
        pwm: new Array(data_length),
        thrust: new Array(data_length),
        voltage: new Array(data_length),
        current: new Array(data_length),
    };
    for (let i = 0; i < data_length; i++) {
        data.pwm[i] = thrustData[i].pwm;
        data.thrust[i] = thrustData[i].thrust;
        data.voltage[i] = thrustData[i].voltage;
        data.current[i] = thrustData[i].current;
    }

    // Test at actuator values from 0 to 1
    const actuator_test_step = 0.001;
    const actuator_test_values = array_from_range(0.0, 1.0, actuator_test_step);

    const MOT_PWM_MIN = parseFloat(params.MOT_PWM_MIN.value);
    const MOT_PWM_MAX = parseFloat(params.MOT_PWM_MAX.value);

    const MOT_SPIN_MIN = parseFloat(params.MOT_SPIN_MIN.value);
    const MOT_SPIN_MAX = parseFloat(params.MOT_SPIN_MAX.value);

    function get_corrected_thrust(curve_expo) {
        // Helper function allows direct copy of AP linearisation code
        function constrain_float(amt, low, high) {
            if (amt < low) {
                return low;
            }

            if (amt > high) {
                return high;
            }

            return amt;
        }

        // Helper function allows direct copy of AP linearisation code
        function is_zero(val) {
            return val == 0.0;
        }

        // Helper function allows direct copy of AP linearisation code
        function safe_sqrt(val) {
            return Math.sqrt(val);
        }

        // https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Motors/AP_Motors_Thrust_Linearization.cpp#L116
        // apply_thrust_curve_and_volt_scaling - returns throttle in the range 0 ~ 1
        function apply_thrust_curve_and_volt_scaling(thrust) {
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
            const throttle_ratio =
                (thrust_curve_expo -
                    1.0 +
                    safe_sqrt(
                        (1.0 - thrust_curve_expo) * (1.0 - thrust_curve_expo) +
                            4.0 * thrust_curve_expo * lift_max * thrust
                    )) /
                (2.0 * thrust_curve_expo);
            return constrain_float(throttle_ratio * battery_scale, 0.0, 1.0);
        }

        // https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Motors/AP_Motors_Thrust_Linearization.cpp#L101
        // converts desired thrust to linearized actuator output in a range of 0~1
        function thrust_to_actuator(thrust_in) {
            thrust_in = constrain_float(thrust_in, 0.0, 1.0);
            return (
                MOT_SPIN_MIN +
                (MOT_SPIN_MAX - MOT_SPIN_MIN) *
                    apply_thrust_curve_and_volt_scaling(thrust_in)
            );
        }

        // https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Motors/AP_MotorsMulticopter.cpp#L405-L406
        // convert actuator output (0~1) range to pwm range
        function output_to_pwm(actuator) {
            return MOT_PWM_MIN + (MOT_PWM_MAX - MOT_PWM_MIN) * actuator;
        }

        // Run the actuator demand through the AP equations to get a PWM output
        const len = actuator_test_values.length;
        let pwm = new Array(len);
        for (let i = 0; i < len; i++) {
            const actuator = thrust_to_actuator(actuator_test_values[i]);
            pwm[i] = output_to_pwm(actuator);
        }

        // Interpolate the thrust for the given PWM
        const corrected_thrust = linear_interp(data.thrust, data.pwm, pwm);

        // Differentiate, good linearisation has constant gradient
        let gradient = new Array(len - 1);
        for (let i = 0; i < len - 1; i++) {
            gradient[i] =
                (corrected_thrust[i + 1] - corrected_thrust[i]) /
                actuator_test_step;
        }

        // Standard deviation
        const mean = array_mean(gradient);
        let std_deviation_sum = 0.0;
        for (let i = 0; i < len - 1; i++) {
            std_deviation_sum += (gradient[i] - mean) ** 2;
        }
        const std_deviation = Math.sqrt(std_deviation_sum / gradient.length);

        return {
            corrected_thrust,
            gradient,
            mean,
            std_deviation,
            expo: curve_expo,
        };
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
            if (
                result == null ||
                test_result.std_deviation < result.std_deviation
            ) {
                result = test_result;
            }
        }
    }

    // Calculate uncorrected thrust by converting PWM to actuator value
    const uncorrected_actuator = new Array(data_length);
    for (let i = 0; i < data_length; i++) {
        const throttle =
            (data.pwm[i] - MOT_PWM_MIN) / (MOT_PWM_MAX - MOT_PWM_MIN);
        uncorrected_actuator[i] =
            (throttle - MOT_SPIN_MIN) / (MOT_SPIN_MAX - MOT_SPIN_MIN);
    }
    const uncorrected_thrust = linear_interp(
        data.thrust,
        uncorrected_actuator,
        actuator_test_values
    );

    // update the parameter with the optimal value
    params.MOT_THST_EXPO.value = result.expo;
    document.getElementById("MOT_THST_EXPO").value = result.expo.toFixed(3);

    const linearizedThrustData = result.corrected_thrust;

    const actuator_pct = array_scale(actuator_test_values, 100.0);

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
    if (params.COPTER_AUW.value > 0 && params.MOTOR_COUNT.value > 0) {
        const requiredThrust =
            params.COPTER_AUW.value / params.MOTOR_COUNT.value;

        const hoverThrottle = linear_interp(
            actuator_pct,
            result.corrected_thrust,
            [requiredThrust]
        )[0];

        if (hoverThrottle >= 0 && hoverThrottle <= 100) {
            // update MOT_THST_HOVER estimate (to 4 decimal places)
            params.MOT_THST_HOVER.value =
                Math.round((hoverThrottle / 100) * 10000) / 10000;
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

    // Gradient plot
    thrustErrorPlot.data = [
        {
            x: array_scale(
                array_offset(
                    actuator_test_values.slice(0, -1),
                    actuator_test_step * 0.5
                ),
                100.0
            ),
            y: result.gradient,
            name:
                "Linearized Thrust<br>Std dev: " +
                result.std_deviation.toFixed(3),
            mode: "lines",
            line: {
                color: "indianred",
            },
        },
    ];
    thrustErrorPlot.layout.shapes[0].y0 = result.mean;
    thrustErrorPlot.layout.shapes[0].y1 = result.mean;
    Plotly.react(
        thrustErrorPlot.plot,
        thrustErrorPlot.data,
        thrustErrorPlot.layout
    );
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
}

function initThrustExpoPlot() {
    thrustExpoPlot.layout = {
        autosize: true,
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
        autosize: true,
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
        autosize: true,
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
            width: 42,
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
            width: 132,
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
        //update table height as necessary
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

function loadExample() {
    thrustTable.setData([
        // https://docs.google.com/spreadsheets/d/1_75aZqiT_K1CdduhUe4-DjRgx3Alun4p8V2pt6vM5P8/edit?gid=0#gid=0
        { pwm: 1000, thrust: 0.196, voltage: 21.72, current: 0.042 },
        { pwm: 1001, thrust: 0.196, voltage: 21.72, current: 0.042 },
        { pwm: 1012, thrust: 0.196, voltage: 21.72, current: 0.041 },
        { pwm: 1024, thrust: 0.196, voltage: 21.72, current: 0.041 },
        { pwm: 1038, thrust: 0.196, voltage: 21.72, current: 0.042 },
        { pwm: 1051, thrust: 0.196, voltage: 21.72, current: 0.042 },
        { pwm: 1065, thrust: 0.196, voltage: 21.72, current: 0.042 },
        { pwm: 1078, thrust: 0.197, voltage: 21.72, current: 0.046 },
        { pwm: 1092, thrust: 0.204, voltage: 21.71, current: 0.315 },
        { pwm: 1105, thrust: 0.237, voltage: 21.72, current: 0.23 },
        { pwm: 1118, thrust: 0.245, voltage: 21.72, current: 0.178 },
        { pwm: 1130, thrust: 0.25, voltage: 21.72, current: 0.187 },
        { pwm: 1145, thrust: 0.261, voltage: 21.72, current: 0.217 },
        { pwm: 1158, thrust: 0.271, voltage: 21.72, current: 0.238 },
        { pwm: 1172, thrust: 0.287, voltage: 21.72, current: 0.297 },
        { pwm: 1186, thrust: 0.303, voltage: 21.72, current: 0.311 },
        { pwm: 1198, thrust: 0.314, voltage: 21.71, current: 0.354 },
        { pwm: 1212, thrust: 0.335, voltage: 21.71, current: 0.428 },
        { pwm: 1225, thrust: 0.358, voltage: 21.71, current: 0.482 },
        { pwm: 1239, thrust: 0.378, voltage: 21.71, current: 0.547 },
        { pwm: 1252, thrust: 0.398, voltage: 21.71, current: 0.608 },
        { pwm: 1266, thrust: 0.418, voltage: 21.71, current: 0.665 },
        { pwm: 1279, thrust: 0.439, voltage: 21.71, current: 0.722 },
        { pwm: 1292, thrust: 0.451, voltage: 21.71, current: 0.771 },
        { pwm: 1306, thrust: 0.472, voltage: 21.71, current: 0.849 },
        { pwm: 1319, thrust: 0.514, voltage: 21.7, current: 1.025 },
        { pwm: 1332, thrust: 0.546, voltage: 21.7, current: 1.11 },
        { pwm: 1346, thrust: 0.574, voltage: 21.7, current: 1.191 },
        { pwm: 1360, thrust: 0.6, voltage: 21.7, current: 1.302 },
        { pwm: 1373, thrust: 0.624, voltage: 21.7, current: 1.391 },
        { pwm: 1386, thrust: 0.647, voltage: 21.7, current: 1.493 },
        { pwm: 1400, thrust: 0.672, voltage: 21.7, current: 1.584 },
        { pwm: 1414, thrust: 0.699, voltage: 21.69, current: 1.704 },
        { pwm: 1429, thrust: 0.726, voltage: 21.69, current: 1.796 },
        { pwm: 1443, thrust: 0.748, voltage: 21.69, current: 1.919 },
        { pwm: 1457, thrust: 0.774, voltage: 21.69, current: 2.05 },
        { pwm: 1470, thrust: 0.804, voltage: 21.69, current: 2.192 },
        { pwm: 1484, thrust: 0.838, voltage: 21.69, current: 2.369 },
        { pwm: 1498, thrust: 0.872, voltage: 21.69, current: 2.513 },
        { pwm: 1512, thrust: 0.915, voltage: 21.68, current: 2.788 },
        { pwm: 1526, thrust: 0.964, voltage: 21.67, current: 3.025 },
        { pwm: 1540, thrust: 1.001, voltage: 21.67, current: 3.215 },
        { pwm: 1555, thrust: 1.039, voltage: 21.68, current: 3.482 },
        { pwm: 1568, thrust: 1.082, voltage: 21.67, current: 3.699 },
        { pwm: 1583, thrust: 1.113, voltage: 21.67, current: 3.851 },
        { pwm: 1596, thrust: 1.15, voltage: 21.66, current: 4.103 },
        { pwm: 1609, thrust: 1.184, voltage: 21.66, current: 4.386 },
        { pwm: 1623, thrust: 1.224, voltage: 21.65, current: 4.57 },
        { pwm: 1636, thrust: 1.261, voltage: 21.65, current: 4.808 },
        { pwm: 1650, thrust: 1.289, voltage: 21.65, current: 5 },
        { pwm: 1664, thrust: 1.321, voltage: 21.64, current: 5.245 },
        { pwm: 1676, thrust: 1.352, voltage: 21.65, current: 5.509 },
        { pwm: 1690, thrust: 1.388, voltage: 21.64, current: 5.748 },
        { pwm: 1704, thrust: 1.428, voltage: 21.63, current: 6.026 },
        { pwm: 1717, thrust: 1.463, voltage: 21.63, current: 6.275 },
        { pwm: 1730, thrust: 1.493, voltage: 21.62, current: 6.564 },
        { pwm: 1746, thrust: 1.519, voltage: 21.62, current: 6.887 },
        { pwm: 1759, thrust: 1.554, voltage: 21.62, current: 7.172 },
        { pwm: 1773, thrust: 1.596, voltage: 21.61, current: 7.481 },
        { pwm: 1786, thrust: 1.637, voltage: 21.61, current: 7.821 },
        { pwm: 1800, thrust: 1.674, voltage: 21.6, current: 8.143 },
        { pwm: 1814, thrust: 1.711, voltage: 21.6, current: 8.469 },
        { pwm: 1827, thrust: 1.742, voltage: 21.59, current: 8.812 },
        { pwm: 1840, thrust: 1.774, voltage: 21.59, current: 9.125 },
        { pwm: 1854, thrust: 1.809, voltage: 21.58, current: 9.423 },
        { pwm: 1867, thrust: 1.846, voltage: 21.58, current: 9.784 },
        { pwm: 1881, thrust: 1.882, voltage: 21.57, current: 10.161 },
        { pwm: 1895, thrust: 1.936, voltage: 21.56, current: 10.602 },
        { pwm: 1909, thrust: 1.987, voltage: 21.56, current: 10.993 },
        { pwm: 1923, thrust: 2.028, voltage: 21.55, current: 11.387 },
        { pwm: 1937, thrust: 2.07, voltage: 21.55, current: 11.823 },
        { pwm: 1950, thrust: 2.107, voltage: 21.54, current: 12.235 },
        { pwm: 1963, thrust: 2.152, voltage: 21.53, current: 12.671 },
        { pwm: 1977, thrust: 2.195, voltage: 21.53, current: 13.078 },
        { pwm: 1989, thrust: 2.233, voltage: 21.52, current: 13.511 },
        { pwm: 2000, thrust: 2.254, voltage: 21.52, current: 13.854 },
    ]);
    const copterAuwElement = document.getElementById("COPTER_AUW");
    copterAuwElement.value = 2.5;
    copterAuwElement.dispatchEvent(new Event("change"));
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
window.addEventListener("beforeunload", cleanup);

// add listeners here rather than using event attributes in html
document.addEventListener("DOMContentLoaded", async () => {
    // clear any existing event listeners before adding new ones
    const saveParamsBtn = document.getElementById("save-params");
    const exampleBtn = document.getElementById("load-example");
    const resetBtn = document.getElementById("reset");

    // remove old listeners if they exist
    const newSaveParamsBtn = saveParamsBtn.cloneNode(true);
    const newExampleBtn = exampleBtn.cloneNode(true);
    const newResetBtn = resetBtn.cloneNode(true);
    saveParamsBtn.parentNode.replaceChild(newSaveParamsBtn, saveParamsBtn);
    exampleBtn.parentNode.replaceChild(newExampleBtn, exampleBtn);
    resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);

    // add new listeners
    newSaveParamsBtn.addEventListener("click", saveParamFile);
    newExampleBtn.addEventListener("click", loadExample);
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
