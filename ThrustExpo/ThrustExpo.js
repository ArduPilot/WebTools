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

    // calculate fitness for a given expo value
    function calculateFitness(expoValue) {
        const linearizedData = [];
        const errorData = [];
        const minThrottle = params.MOT_SPIN_MIN.value * 100;
        const maxThrottle = params.MOT_SPIN_MAX.value * 100;

        // calculate full range for plotting
        for (let desired = 0; desired <= 100; desired += 1) {
            // calculate expo curve value
            const expoThrottle =
                ((expoValue -
                    1 +
                    Math.sqrt(
                        (1 - expoValue) * (1 - expoValue) +
                            4 * expoValue * (desired / 100)
                    )) /
                    (2 * expoValue)) *
                100;

            // interpolate thrust value from measured data
            const measuredPoint =
                measuredThrustData.find((p) => p.x >= expoThrottle) ||
                measuredThrustData[measuredThrustData.length - 1];
            const prevPoint =
                measuredThrustData[
                    Math.max(0, measuredThrustData.indexOf(measuredPoint) - 1)
                ];

            let interpolatedThrust;
            if (prevPoint && measuredPoint.x !== prevPoint.x) {
                const t =
                    (expoThrottle - prevPoint.x) /
                    (measuredPoint.x - prevPoint.x);
                interpolatedThrust =
                    prevPoint.y + t * (measuredPoint.y - prevPoint.y);
            } else {
                interpolatedThrust = measuredPoint.y;
            }

            linearizedData.push({ x: desired, y: interpolatedThrust });
        }

        // calculate R-squared only for points within the operating range
        const operatingPoints = linearizedData.filter(
            p => p.x >= minThrottle && p.x <= maxThrottle
        );

        const n = operatingPoints.length;
        const sumX = operatingPoints.reduce((sum, p) => sum + p.x, 0);
        const sumY = operatingPoints.reduce((sum, p) => sum + p.y, 0);
        const sumXY = operatingPoints.reduce((sum, p) => sum + p.x * p.y, 0);
        const sumXX = operatingPoints.reduce((sum, p) => sum + p.x * p.x, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const yMean = sumY / n;
        const ssTotal = operatingPoints.reduce(
            (sum, p) => sum + Math.pow(p.y - yMean, 2),
            0
        );

        // calculate error data for the full range but only use operating range for optimization
        const ssResidual = linearizedData.reduce((sum, p) => {
            const yPredicted = slope * p.x + intercept;
            const error = ((p.y - yPredicted) / yPredicted) * 100;
            errorData.push({ x: p.x, y: error });
            
            // only include points within operating range for fitness calculation
            if (p.x >= minThrottle && p.x <= maxThrottle) {
                return sum + Math.pow(p.y - yPredicted, 2);
            }
            return sum;
        }, 0);

        return {
            rSquared: 1 - ssResidual / ssTotal,
            linearizedData,
            errorData,
            slope,
            intercept,
        };
    }

    const pwmMin =
        params.MOT_PWM_MIN.value +
        params.MOT_SPIN_MIN.value *
            (params.MOT_PWM_MAX.value - params.MOT_PWM_MIN.value);
    const pwmMax =
        params.MOT_PWM_MIN.value +
        params.MOT_SPIN_MAX.value *
            (params.MOT_PWM_MAX.value - params.MOT_PWM_MIN.value);
    const maxVoltage =
        Math.max(...thrustData.map((row) => Number(row.voltage))) || 1;

    const measuredThrustData = thrustData.reduceRight((acc, row) => {
        // normalize throttle across voltage and pwm range
        const voltage = row.voltage || 1;
        const x =
            ((100 * voltage) / maxVoltage) *
            Math.max(0, (row.pwm - pwmMin) / (pwmMax - pwmMin));
        // only include data points where throttle is between 0 and 100
        if (x > 0 && x <= 100) {
            acc.unshift({ x, y: row.thrust });
        }
        return acc;
    }, []);

    let fitness = 0;
    let linearizedResult = null;

    if (thrustExpo) {
        // don't optimize if user has provided a value
        const result = calculateFitness(thrustExpo);
        fitness = result.rSquared;
        linearizedResult = result;
    } else {
        // find optimal expo value
        // test expo values from -1 to 1 in steps of 0.005
        for (let expo = -1; expo <= 1; expo += 0.005) {
            const result = calculateFitness(expo);
            if (result.rSquared > fitness) {
                fitness = result.rSquared;
                thrustExpo = expo;
                linearizedResult = result;
            }
        }
    }

    // update the parameter with the optimal value
    params.MOT_THST_EXPO.value = thrustExpo;
    document.getElementById("MOT_THST_EXPO").value = thrustExpo.toFixed(3);

    const linearizedThrustData = linearizedResult.linearizedData;

    // generate linear regression line
    const linearFitnessData = [
        { x: 0, y: linearizedResult.intercept },
        {
            x: 100,
            y: linearizedResult.slope * 100 + linearizedResult.intercept,
        },
    ];

    thrustExpoPlot.data = [
        {
            x: measuredThrustData.map((point) => point.x),
            y: measuredThrustData.map((point) => point.y),
            name: "Measured Thrust",
            mode: "lines",
        },
        {
            x: linearizedThrustData.map((point) => point.x),
            y: linearizedThrustData.map((point) => point.y),
            name: "Linearized Thrust",
            mode: "lines",
        },
        {
            x: linearFitnessData.map((point) => point.x),
            y: linearFitnessData.map((point) => point.y),
            name: `Fitness: ${(linearizedResult.rSquared * 100).toFixed(3)}%`,
            mode: "lines",
            line: {
                dash: "4px,3px",
                width: 1,
                color: "gray",
            },
        },
    ];

    // estimate hover thrust if mass is provided
    if (params.COPTER_MASS.value > 0 && params.MOTOR_COUNT.value > 0) {
        const requiredThrust =
            params.COPTER_MASS.value / params.MOTOR_COUNT.value;

        // find two points that bound required thrust
        let lowerPoint = null;
        let upperPoint = null;

        for (let i = 0; i < linearizedThrustData.length; i++) {
            if (linearizedThrustData[i].y > requiredThrust) {
                upperPoint = linearizedThrustData[i];
                lowerPoint = linearizedThrustData[i - 1];
                break;
            }
        }

        if (lowerPoint && upperPoint) {
            // interpolate between the bounding points
            const ratio =
                (requiredThrust - lowerPoint.y) / (upperPoint.y - lowerPoint.y);
            const hoverThrottle =
                lowerPoint.x + ratio * (upperPoint.x - lowerPoint.x);

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
    }

    // update layout with vertical markers
    const { shapes, annotations } = createSpinMarkers();
    thrustExpoPlot.layout.shapes = shapes;
    thrustExpoPlot.layout.annotations = annotations;

    Plotly.react(
        thrustExpoPlot.plot,
        thrustExpoPlot.data,
        thrustExpoPlot.layout
    );
    thrustExpoPlot.plot.style.display = "block";
    return linearizedResult.errorData;
}

function updateThrustErrorPlot(errorData) {
    if (!errorData) {
        thrustErrorPlot.data = [];
        Plotly.react(
            thrustErrorPlot.plot,
            thrustErrorPlot.data,
            thrustErrorPlot.layout
        );
        return;
    }

    thrustErrorPlot.data = [
        {
            x: errorData.map((point) => point.x),
            y: errorData.map((point) => point.y),
            name: "Linearization<br>Error (%)",
            mode: "lines",
            line: {
                color: "indianred",
            },
        },
    ];

    // get vertical markers
    const { shapes: verticalMarkers, annotations } = createSpinMarkers();

    // add a zero reference line at y=0
    const allShapes = [
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
        ...verticalMarkers
    ];

    thrustErrorPlot.layout.shapes = allShapes;
    thrustErrorPlot.layout.annotations = annotations;

    // update the plot
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
            title: { text: "Thrust (kgf)" },
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
            title: { text: "Error (%)" },
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
            title: { text: "Thrust (kgf)" },
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
                title: "Thrust (kgf)",
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
    const thrustErrorData = updateThrustExpoPlot(thrustExpo);
    updateThrustErrorPlot(thrustErrorData);
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
