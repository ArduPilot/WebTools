
// Import log parser
var DataflashParser
import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default })

// Init pyodide environment
let pyodide
async function init_pyodide() {
    addToOutput("Initializing Pyodide...")
    pyodide = await loadPyodide()

    addToOutput("Loading micropip package...")
    await pyodide.loadPackage("micropip")
    const micropip = pyodide.pyimport("micropip")

    addToOutput("Installing matplotlib package...")
    await micropip.install("matplotlib", deps=false)

    addToOutput("Installing control package...")
    await micropip.install("control", keep_going=true, deps=false)

    const packageUrl = "../modules/build/pyAircraftIden-1.0-py3-none-any.whl"

    addToOutput(`Installing pyAircraftIden package from ${packageUrl}...`)
    try {
        await micropip.install(packageUrl, { keep_going: true, upgrade: true })
        addToOutput("pyAircraftIden package installed successfully.")
    } catch (error) {
        addToOutput(`Failed to install pyAircraftIden package: ${error}`)
    }

    // Define a custom Python function to capture print statements
    await pyodide.runPython(`
      import sys
      from js import document

      class JsOutput:
          def __init__(self):
              self.output_element = document.getElementById("output")

          def write(self, message):
              self.output_element.value += message

          def flush(self):
              pass

      sys.stdout = JsOutput()
      sys.stderr = JsOutput()
    `)
}

// Run transfer function identification
async function run_transfer_function_ID(parser) {
    addToOutput("File Submitted successfully. Please wait!!!!!!")

    const inputValues = getFieldValues('input', 1)
    const outputValues = getFieldValues('output', 1)
    const Numerator = document.getElementById('customNumerator').value.trim()
    const Denominator = document.getElementById('customDenominator').value.trim()
    const symbolic_var = document.getElementById('tf_params').value.trim()
    const t_start = document.getElementById('starttime').value.trim()
    const t_end = document.getElementById('endtime').value.trim()
    const f_start = document.getElementById('startfreq').value.trim()
    const f_end = document.getElementById('endfreq').value.trim()
    const f_cutoff = document.getElementById('cutofffreq').value.trim()

    let timeData_arr = parser.get(inputValues.names[0], "TimeUS")
    const ind1_i = nearestIndex(timeData_arr, t_start*1000000)
    const ind2_i = nearestIndex(timeData_arr, t_end*1000000)
    console.log("ind1: ",ind1_i," ind2: ",ind2_i)

    timeData = Array.from(timeData_arr)
    console.log("time field pre slicing size: ", timeData.length)

    timeData = timeData.slice(ind1_i, ind2_i)
    console.log("time field post slicing size: ", timeData.length)

    ///TODO/// multi-input configuration
    let inputData = Array.from(parser.get(inputValues.names[0], inputValues.fields[0]))
    console.log("input field pre slicing size: ", inputData.length)

    inputData = inputData.slice(ind1_i, ind2_i)
    console.log("input field post slicing size: ", inputData.length)

    const t_data = parser.get(outputValues.names[0], "TimeUS")
    const ind1_d = nearestIndex(t_data, t_start*1000000)
    const ind2_d = nearestIndex(t_data, t_end*1000000)
    let outputData = Array.from(parser.get(outputValues.names[0], outputValues.fields[0]))
    console.log("output field pre slicing size: ", outputData.length)

    outputData = outputData.slice(ind1_d, ind2_d)
    console.log("output field post slicing size: ", outputData.length)

    if (outputValues.multipliers[0]) {
        const multiplier = parseFloat(outputValues.multipliers[0])
        outputData = outputData.map(value => value * multiplier)
    }

    if (outputValues.compensations[0]) {
        const ATT_t_data = parser.get("ATT", "TimeUS")

        const att_ind1 = nearestIndex(ATT_t_data, t_start*1000000)
        const att_ind2 = nearestIndex(ATT_t_data, t_end*1000000)
        let mult = 1
        if (outputValues.multipliers[0]) {
            mult = parseFloat(outputValues.multipliers[0])
        }
        let ang_data = parser.get("ATT", outputValues.compensations[0])
        ang_data_arr = Array.from(ang_data)
        ang_data_arr.slice(att_ind1, att_ind2)
        console.log("data field ", outputValues.compensations[0], " pre slicing size: ", outputData.length)
        const G = 9.81
        if (outputValues.compensations[0] == "Roll") {
            for (let j = 0; j < outputData.length; j++) {
                outputData[j] = outputData[j] + (Math.PI/180) * mult * G * ang_data_arr[att_ind1 + j]
            }
        }
        if (outputValues.compensations[0] == "Pitch") {
            for (let j = 0; j < outputData.length; j++) {
                outputData[j] = outputData[j] - (Math.PI/180) * mult * G *ang_data_arr[att_ind1 + j]
            }
        }

        console.log("data field ", outputValues.fields[0], " compensation added for axis ", outputValues.compensations[0])
        console.log("data field ", outputValues.fields[0], " post compensation size: ", outputData.length)
    }

    console.log("time data length: ", timeData.length)
    console.log("input data length", inputData.length)
    console.log("output data length", outputData.length)

    await pyodide.globals.set("input_data", inputData)
    await pyodide.globals.set("output_data", outputData)
    await pyodide.globals.set("time_data", timeData)
    await pyodide.globals.set("numerator", Numerator)
    await pyodide.globals.set("denominator", Denominator)
    await pyodide.globals.set("symbols", symbolic_var)
    await pyodide.globals.set("t_start", t_start)
    await pyodide.globals.set("t_end", t_end)
    await pyodide.globals.set("f_start", f_start)
    await pyodide.globals.set("f_end", f_end)
    await pyodide.globals.set("f_cutoff", f_cutoff)

    await pyodide.runPython(`
    from pyodide.ffi import to_js
    import numpy as np
    import math
    from scipy.signal import butter,filtfilt
    import sympy as sp
    from AircraftIden import FreqIdenSIMO, TransferFunctionFit, TransferFunctionParamModel
    from AircraftIden.TransferFunctionFit import plot_fitter
    from AircraftIden.FreqIden import time_seq_preprocess
    import matplotlib
    plt = matplotlib.pyplot
    t_start = float(t_start)
    t_end = float(t_end)
    f_start = float(f_start)
    f_end = float(f_end)
    f_cutoff = float(f_cutoff)/(2*3.14)
    matplotlib.use("module://matplotlib_pyodide.html5_canvas_backend")
    
    def butter_lowpass(cutoff, fs, order=5):
        nyquist = 0.5 * fs
        normal_cutoff = cutoff / nyquist
        b, a = butter(order, normal_cutoff, btype='low', analog=False)
        return b, a


    def apply_lowpass_filter(data, cutoff, fs, order=5):
        b, a = butter_lowpass(cutoff, fs, order=order)
        y = filtfilt(b, a, data)
        return y

    time_seq_source = np.array(time_data).flatten()/1000000
    input_data = np.array(input_data)
    output_data = np.array(output_data)
    dt = np.mean(np.diff(time_seq_source))

    u = apply_lowpass_filter(input_data, f_cutoff, 1/dt)
    y = apply_lowpass_filter(output_data, f_cutoff, 1/dt)
    simo_iden = FreqIdenSIMO(time_seq_source,f_start, f_end, u, y, win_num=None)

    plt.rc("figure", figsize=(15,10))
    plt.figure("pout->udot")
    simo_iden.plt_bode_plot(0)

    s = sp.symbols("s")
    tau = sp.symbols("tau")

    freq, H, gamma2, gxx, gxy, gyy = simo_iden.get_freq_iden(0)

    tf_params = sp.symbols(str(symbols))
    num = sp.simplify(str(numerator))
    den = sp.simplify(str(denominator))
    tfpm = TransferFunctionParamModel(num, den, tau)
    fitter = TransferFunctionFit(freq, H, gamma2, tfpm, nw=20, iter_times=1, reg = 0.1)
    init_val = fitter.setup_initvals_ARX(num, den, u, y, dt)

    tf = fitter.estimate(f_start, f_end, accept_J=100, init_val=init_val)
    num, den, tau = fitter.get_coefficients()
    print("numerator: ",num)
    print("denominator: ",den)
    print("tau: ",tau)
    #plot_fitter(fitter,str(input_field)+"->"+str(output_field))
    #plt.show()
    H, freq, mag, phase, h_amp, h_phase, coherence = fitter.provide_plot_arrays()

    # Export arrays to JavaScript
    H_js = to_js(H.tolist())
    freq_js = to_js(freq.tolist())
    mag_js = to_js(mag.tolist())
    phase_js = to_js(phase.tolist())
    h_amp_js = to_js(h_amp.tolist())
    h_phase_js = to_js(h_phase.tolist())
    coherence_js = to_js(coherence.tolist())

    `)

    const freq_js = await pyodide.globals.get('freq_js')
    const mag_js = await pyodide.globals.get('mag_js')
    const phase_js = await pyodide.globals.get('phase_js')
    const h_amp_js = await pyodide.globals.get('h_amp_js')
    const h_phase_js = await pyodide.globals.get('h_phase_js')
    const coherence_js = await pyodide.globals.get('coherence_js')

    const traces = [
        {
            x: freq_js,
            y: h_amp_js,
            type: 'scatter',
            mode: 'lines',
            name: 'source H Amp',
            xaxis: 'x1',
            yaxis: 'y1'
        },
        {
            x: freq_js,
            y: mag_js,
            type: 'scatter',
            mode: 'lines',
            name: 'fit H Amp',
            xaxis: 'x1',
            yaxis: 'y1'
        },
        {
            x: freq_js,
            y: h_phase_js,
            type: 'scatter',
            mode: 'lines',
            name: 'source H Phase',
            xaxis: 'x2',
            yaxis: 'y2'
        },
        {
            x: freq_js,
            y: phase_js,
            type: 'scatter',
            mode: 'lines',
            name: 'fit H Phase',
            xaxis: 'x2',
            yaxis: 'y2'
        },
        {
            x: freq_js,
            y: coherence_js,
            type: 'scatter',
            mode: 'lines',
            name: 'Coherence of xy',
            xaxis: 'x3',
            yaxis: 'y3'
        }
    ]

    const layout = {
        title: 'Frequency Response Data',
        grid: { rows: 3, columns: 1, pattern: 'independent' },
        xaxis1: {
            type: 'log',
            title: 'Frequency (rad/sec)'
        },
        yaxis1: {
            title: 'H Amp'
        },
        xaxis2: {
            type: 'log',
            title: 'Frequency (rad/sec)'
        },
        yaxis2: {
            title: 'H Phase'
        },
        xaxis3: {
            type: 'log',
            title: 'Frequency (rad/sec)'
        },
        yaxis3: {
            title: 'Coherence'
        },
        legend: {
            x: 1,
            xanchor: 'right',
            y: 1
        }
    }

    Plotly.newPlot('plotDiv', traces, layout)
}

// Run state space identification
async function run_SS_ID(parser) {
    const numOutputs = parseInt(document.getElementById('num_Outputs').value.trim())
    const orderA = parseInt(document.getElementById('A_order').value, 10)
    const numParams = parseInt(document.getElementById('num_params').value, 10)

    if (isNaN(numOutputs) || numOutputs <= 0) {
        alert('Please enter valid numbers for inputs and outputs.')
        return
    }

    const inputValues = getFieldValues('input', 1)
    const outputValues = getFieldValues('output', numOutputs)
    const symbolic_var = getParamValues(numParams)
    const t_start_ss = parseFloat(document.getElementById('starttime').value.trim(), 10)
    const t_end_ss = parseFloat(document.getElementById('endtime').value.trim(), 10)
    const num_constraints = parseInt(document.getElementById('num_cons').value, 10)


    let outputData = []
    let timeData_arr = parser.get(inputValues.names[0], "TimeUS")
    const ind1_i = nearestIndex(timeData_arr, t_start_ss*1000000)
    const ind2_i = nearestIndex(timeData_arr, t_end_ss*1000000)
    console.log("ind1: ",ind1_i," ind2: ",ind2_i)

    timeData = Array.from(timeData_arr)
    console.log("time field pre slicing size: ",timeData.length)

    timeData = timeData.slice(ind1_i, ind2_i)
    console.log("time field post slicing size: ",timeData.length)

    ///TODO/// multi-input configuration
    let inputData = Array.from(parser.get(inputValues.names[0], inputValues.fields[0]))
    console.log("input field pre slicing size: ",inputData.length)

    inputData = inputData.slice(ind1_i, ind2_i)
    console.log("input field post slicing size: ",inputData.length)


    for (let i = 0; i < numOutputs; i++) {
        const t_data = parser.get(outputValues.names[i], "TimeUS")
        const ind1_d = nearestIndex(t_data, t_start_ss*1000000)
        const ind2_d = nearestIndex(t_data, t_end_ss*1000000)
        let data = parser.get(outputValues.names[i], outputValues.fields[i])
        let data_arr = Array.from(data)
        console.log("data field ",outputValues.fields[i]," pre slicing size: ",data_arr.length)
        console.log("ind1: ",ind1_d," ind2: ",ind2_d)
        data_arr = data_arr.slice(ind1_d, ind2_d)
        console.log("data field ",outputValues.fields[i]," post slicing size: ",data_arr.length)


        if (outputValues.multipliers[i]) {
            const multiplier = parseFloat(outputValues.multipliers[i])
            data_arr = data_arr.map(value => value * multiplier)
        }

        if (outputValues.compensations[i]) {
            const ATT_t_data = parser.get("ATT", "TimeUS")

            const att_ind1 = nearestIndex(ATT_t_data, t_start_ss*1000000)
            const att_ind2 = nearestIndex(ATT_t_data, t_end_ss*1000000)
            let mult = 1
            if (outputValues.multipliers[i]) {
                mult = parseFloat(outputValues.multipliers[i])
            }
            let ang_data = parser.get("ATT", outputValues.compensations[i])
            ang_data_arr = Array.from(ang_data)
            ang_data_arr.slice(att_ind1, att_ind2)
            console.log("data field ", outputValues.compensations[i], " pre slicing size: ", data_arr.length)
            const G = 9.81
            if (outputValues.compensations[i] == "Roll") {
                for (let j = 0; j < data_arr.length; j++) {
                    temp_data = data_arr[j]
                    data_arr[j] = data_arr[j] + (Math.PI/180) * mult * G * ang_data_arr[att_ind1 + j]
                }
            }
            if (outputValues.compensations[i] == "Pitch") {
                for (let j = 0; j < data_arr.length; j++) {
                    temp_data = data_arr[j]
                    data_arr[j] = data_arr[j] - (Math.PI/180) * mult * G * ang_data_arr[att_ind1 + j]
                }
            }

            console.log("data field ",outputValues.fields[i]," compensation added for axis ",outputValues.compensations[i])
            console.log("data field ",outputValues.fields[i]," post compensation size: ",data_arr.length)
        }
        outputData.push(data_arr)
    }

    console.log("time data length: ",timeData.length)
    console.log("input data length",inputData.length)
    for (let i = 0; i < numOutputs; i++) {
        console.log("output data ", i, " size ", outputData[i].length)
    }

    outputData = outputData.map(arr => Array.from(arr))
    const bounds_array = getBounds(numParams)
    const matrixA = getMatrixValues('matrixA', orderA, orderA)
    const matrixB = getMatrixValues('matrixB', orderA, 1)
    const H0 = getMatrixValues('H0',numOutputs,orderA)
    const H1 = getMatrixValues('H1',numOutputs,orderA)
    let constraints_array = [[]]
    if (num_constraints > 0) {
        constraints_array = getConstraintList(num_constraints)
    }

    const f_start_ss = document.getElementById('startfreq').value.trim()
    const f_end_ss = document.getElementById('endfreq').value.trim()
    const f_cutoff_ss = document.getElementById('cutofffreq').value.trim()

    await pyodide.globals.set("input_data", inputData)
    await pyodide.globals.set("output_data", outputData)
    await pyodide.globals.set("time_data", timeData)
    await pyodide.globals.set("numInputs",1)
    await pyodide.globals.set("numOutputs",numOutputs)
    await pyodide.globals.set("sym_var", symbolic_var)
    await pyodide.globals.set("matrixA", matrixA)
    await pyodide.globals.set("matrixB", matrixB)
    await pyodide.globals.set("matrixH0", H0)
    await pyodide.globals.set("matrixH1",H1)
    await pyodide.globals.set("orderA", orderA)
    await pyodide.globals.set("bounds_array", bounds_array)
    await pyodide.globals.set("con_str", constraints_array)
    await pyodide.globals.set("t_start", t_start_ss)
    await pyodide.globals.set("t_end", t_end_ss)
    await pyodide.globals.set("f_start", f_start_ss)
    await pyodide.globals.set("f_end", f_end_ss)
    await pyodide.globals.set("f_cutoff", f_cutoff_ss)

    await pyodide.runPython(`
      from pyodide.ffi import to_js
      from AircraftIden import FreqIdenSIMO, TransferFunctionFit
      import math
      import matplotlib.pyplot as plt
      import control
      from scipy.signal import butter,filtfilt

      import sympy as sp
      from AircraftIden.StateSpaceIden import StateSpaceIdenSIMO, StateSpaceParamModel
      from AircraftIden.FreqIden import time_seq_preprocess

      import numpy as np
      import csv
      import sympy as sp

      M = sp.Matrix(np.eye(int(orderA)))

      def butter_lowpass(cutoff, fs, order=5):
        nyquist = 0.5 * fs
        normal_cutoff = cutoff / nyquist
        b, a = butter(order, normal_cutoff, btype='low', analog=False)
        return b, a


      def apply_lowpass_filter(data, cutoff, fs, order=5):
        b, a = butter_lowpass(cutoff, fs, order=order)
        y = filtfilt(b, a, data)
        return y

      time_seq_source = np.array(time_data).flatten()/1000000

      input_data = np.array(input_data)

      output_data = [np.array(data) for data in output_data]

      f_cutoff = float(f_cutoff)/(2*3.14)

      dt = np.mean(np.diff(time_seq_source))

      input_data = apply_lowpass_filter(input_data, f_cutoff, 1/dt)
      output_data = [apply_lowpass_filter(data, f_cutoff, 1/dt) for data in output_data]

      syms = []
      sym_var = list(sym_var)
      
      def tofloat(element):
        try:
          float(element)
          return True
        except ValueError:
          return False
    
      def callback(xk, state):
        print(xk)
        print(state)

      def getMatrixJs(mjs, num_rows, num_cols, sym_var):
        ans = []
        for i in range(num_rows):
          empty_row = []
          for j in range(num_cols):
            if tofloat(str(mjs[i][j])):
              empty_row.append(float(str(mjs[i][j])))
            elif mjs[i][j][0] == '-':
              temp = sp.Symbol(mjs[i][j][1:])
              if temp in syms:
                raise TypeError("duplicate symbol")
              syms.append(temp)
              empty_row.append(-temp)
            else:
              temp = sp.Symbol(mjs[i][j])
              if temp in syms:
                raise TypeError("duplicate symbol")
              syms.append(temp)
              empty_row.append(temp)
          ans.append(empty_row)
        
        return ans

      F = getMatrixJs(matrixA, orderA, orderA, sym_var)
      G = getMatrixJs(matrixB, orderA, numInputs, sym_var)
      H0 = getMatrixJs(matrixH0, numOutputs, orderA, sym_var)
      H1 = getMatrixJs(matrixH1, numOutputs, orderA, sym_var)
      
      t_start = float(t_start)
      t_end = float(t_end)

      F = sp.Matrix(F)
      G = sp.Matrix(G)
      H0 = sp.Matrix(H0)
      H1 = sp.Matrix(H1)
      bnd = tuple(bounds_array)
      con_str = list(con_str)

      f_start = float(f_start)
      f_end = float(f_end)
      simo_iden = FreqIdenSIMO(time_seq_source, f_start, f_end, input_data, *output_data, win_num=None)

      plt.rc("figure", figsize=(15,10))
      plt.figure("pout->udot")
      simo_iden.plt_bode_plot(0)
      LatdynSSPM = StateSpaceParamModel(M, F, G, H0, H1, syms)

      plt.rc('figure', figsize=(10.0, 5.0))
      freqres = simo_iden.get_freqres()
      if len(con_str[0]) == 0:
        ssm_iden = StateSpaceIdenSIMO(freqres, accept_J=100,
                            enable_debug_plot=False,
                            y_names=["r"], reg=0.1, iter_callback=callback, max_sample_times=1)

      else:
        ssm_iden = StateSpaceIdenSIMO(freqres, accept_J=100,
                            enable_debug_plot=False,
                            y_names=["r"], reg=0.1, iter_callback=callback, max_sample_times=1, con_str = con_str)


      J, ssm = ssm_iden.estimate(LatdynSSPM, syms, constant_defines={}, rand_init_max=10, bounds = bnd)
      ssm.check_stable()
      ssm_iden.print_res()
      #ssm_iden.draw_freq_res()
      #plt.show()
      freq_res_data = ssm_iden.get_freq_res_data()

      freq_js = to_js(freq_res_data["freq"])
      Hs_amp_js = to_js(freq_res_data["Hs_amp"])
      Hs_pha_js = to_js(freq_res_data["Hs_pha"])
      Hest_amp_js = to_js(freq_res_data["Hest_amp"])
      Hest_pha_js = to_js(freq_res_data["Hest_pha"])
      coherence_js = to_js(freq_res_data["coherence"])

    `)
    const freq_js = await pyodide.globals.get('freq_js')
    const Hs_amp_js = await pyodide.globals.get('Hs_amp_js')
    const Hs_pha_js = await pyodide.globals.get('Hs_pha_js')
    const Hest_amp_js = await pyodide.globals.get('Hest_amp_js')
    const Hest_pha_js = await pyodide.globals.get('Hest_pha_js')
    const coherence_js = await pyodide.globals.get('coherence_js')

    // Plotting using Plotly
    const traces = []

    for (let y_index = 0; y_index < Hs_amp_js.length; y_index++) {
        traces.push(
            {
            x: freq_js,
            y: Hs_amp_js[y_index],
            type: 'scatter',
            mode: 'lines',
            name: `Hs Amp ${y_index}`,
            xaxis: 'x1',
            yaxis: 'y1'
            },
            {
            x: freq_js,
            y: Hest_amp_js[y_index],
            type: 'scatter',
            mode: 'lines',
            name: `Hest Amp ${y_index}`,
            xaxis: 'x1',
            yaxis: 'y1'
            },
            {
            x: freq_js,
            y: Hs_pha_js[y_index],
            type: 'scatter',
            mode: 'lines',
            name: `Hs Pha ${y_index}`,
            xaxis: 'x2',
            yaxis: 'y2'
            },
            {
            x: freq_js,
            y: Hest_pha_js[y_index],
            type: 'scatter',
            mode: 'lines',
            name: `Hest Pha ${y_index}`,
            xaxis: 'x2',
            yaxis: 'y2'
            },
            {
            x: freq_js,
            y: coherence_js[y_index],
            type: 'scatter',
            mode: 'lines',
            name: `Coherence ${y_index}`,
            xaxis: 'x3',
            yaxis: 'y3'
            }
        )
    }

    const layout = {
        title: 'State Space Frequency Response Data',
        grid: { rows: 3, columns: 1, pattern: 'independent' },
        xaxis1: { type: 'log', title: 'Frequency (rad/sec)' },
        yaxis1: { title: 'Amplitude' },
        xaxis2: { type: 'log', title: 'Frequency (rad/sec)' },
        yaxis2: { title: 'Phase' },
        xaxis3: { type: 'log', title: 'Frequency (rad/sec)' },
        yaxis3: { title: 'Coherence' },
        legend: { x: 1, xanchor: 'right', y: 1 }
    }

    Plotly.newPlot('plotDiv_ss', traces, layout)
}