#import sys

#sys.path.insert(0, '../')
from AircraftIden import FreqIdenSIMO, TransferFunctionFit
import math
import matplotlib
plt = matplotlib.pyplot
#import pickle
#import multiprocessing

matplotlib.use("module://matplotlib_pyodide.html5_canvas_backend")

import sympy as sp
from AircraftIden.StateSpaceIden import StateSpaceIdenSIMO, StateSpaceParamModel
import numpy as np
import csv
import sympy as sp

M = sp.Matrix([[1, 0],
               [0, 1]])

g = 9.78


Nr, wlag, wlg, wlead, Nped = sp.symbols('Nr wlag wlg wlead Nped')


def callback(xk, state):
    print(xk)
    print(state)

def process_ssm(data):

    arr = np.array(data)
    arr = np.array(data, dtype=float)

    time_seq_source = arr[:, 0]
    yout_source = arr[:, 1]
    gz_source = arr[:, 2]*math.pi / 180

    simo_iden = FreqIdenSIMO(time_seq_source,1, 15, yout_source, gz_source, win_num=None)

    plt.rc("figure", figsize=(15,10))
    plt.figure("pout->udot")
    simo_iden.plt_bode_plot(0)

    #plt.plot(time_seq_source, gx_source, color="red")
    plt.show()

#    plt.figure("pout->q")
#    simo_iden.plt_bode_plot(1)

#    plt.show()

    F = sp.Matrix([[Nr, Nped],
                   [0, -wlag]])
    G = sp.Matrix([[wlead], 
                   [wlg]])

    H0 = sp.Matrix([
        [1, 0]])
    H1 = sp.Matrix([
        [0, 0]])
    syms = [Nr, wlag, wlg, wlead, Nped]
    LatdynSSPM = StateSpaceParamModel(M, F, G, H0, H1, syms)

    plt.rc('figure', figsize=(10.0, 5.0))
    freqres = simo_iden.get_freqres()
    ssm_iden = StateSpaceIdenSIMO(freqres, accept_J=100,
                                  enable_debug_plot=False,
                                  y_names=["r"], reg=0.1, iter_callback=callback, max_sample_times=1)
    J, ssm = ssm_iden.estimate(LatdynSSPM, syms, constant_defines={}, rand_init_max=10)
    ssm.check_stable()
    ssm_iden.draw_freq_res()
    ssm_iden.print_res()

    plt.show()

def from_python():
    with open('./Tests/x8yaw.csv', 'r') as f:
       reader = csv.reader(f)
       data = list(reader)

    process_ssm(data)


async def from_js(event):
    fileList = event.target.files.to_py()

    for file in fileList:
        raw = await file.text()
        reader = csv.reader(raw.splitlines())
        data = list(reader)

        process_ssm(data)

        return

def js_setup():
    from js import document
    from pyodide.ffi import create_proxy

    file_event = create_proxy(from_js)

    e = document.getElementById("input_data")
    e.addEventListener("change", file_event, False)
