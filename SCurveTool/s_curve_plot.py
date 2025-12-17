from matplotlib import pyplot as plt
import numpy as np



# S-curve definition
tj = 2.0 # time period max
jm = 15.0 # (m/s/s/s) max jerk

# Initial conditions
A_initial = 0.0
V_initial = 0.0
P_initial = 0.0

# derived constants
Alpha = jm / 2.0
beta = np.pi / tj


# Kinematic equations
def get_zero_snap(t):
    return np.zeros(t.shape)

def calc_scurve_snap(t, alpha):
    return alpha * beta * np.sin(beta * t)

def get_const_jerk(t, J0):
    return np.ones(t.shape) * J0

def calc_scurve_jerk(t, J0, alpha):
    return J0 + alpha * (1 - np.cos(beta * t))



def calc_linear_accel_constant_jerk(t, A0, J):
    # time has to be zeroed for this period
    t = t - t[0]
    return A0 + t*J

def get_constant_accel(t, A0):
    return A0 * np.ones(t.shape)

def calc_scurve_accel(t, A0, alpha):
    # time has to be zeroed for this period
    t = t - t[0]
    return A0 + alpha * t - (alpha/beta) * np.sin(beta * t)



def calc_linear_vel_constant_jerk(t, V0, A0, J):
    # time has to be zeroed for this period
    t = t - t[0]
    return V0 + A0*t + J/2*t*t

def calc_scurve_vel(t, V0, A0, alpha):
    # time has to be zeroed for this period
    t = t - t[0]
    return V0 + A0*t + alpha*t*t/2.0 + alpha/(beta*beta)*(np.cos(beta * t) - 1)



def calc_linear_pos_constant_jerk(t, P0, V0, A0, J):
    # time has to be zeroed for this period
    t = t - t[0]
    return P0 + V0*t + A0*t*t/2.0 + J/6.0*t*t*t

def calc_scurve_pos(t, P0, V0, A0, alpha):
    return P0 + V0*t + A0*t*t/2.0 - alpha/(beta*beta)*t + alpha*t*t*t/6.0 + alpha/(beta*beta*beta)*np.sin(beta*t)



# Defining timer periods
n = 100
t1 = np.linspace(0, tj, n) # Positive Snap
t2 = np.linspace(tj, 2*tj, n) # Constant Jerk
t3 = np.linspace(2*tj, 3*tj, n) # Negative Snap
t4 = np.linspace(3*tj, 4*tj, n) # Constant Accel
t5 = np.linspace(4*tj, 5*tj, n) # Negative Snap
t6 = np.linspace(5*tj, 6*tj, n) # Constant Negative Jerk
t7 = np.linspace(6*tj, 7*tj, n) # Maximum velocity


time_periods = (t1, t2, t3, t4, t5, t6)

# Plotting
fig, ax = plt.subplots(5, 1, sharex=True, figsize=(8, 10))





# Step 1 - Positive Snap Curve, Increasing Jerk
# ============================
J0 = 0.0
A0 = A_initial
V0 = V_initial
P0 = P_initial

snap = calc_scurve_snap(t1, Alpha)
ax[0].plot(t1, snap, linewidth=3.0)

jerk = calc_scurve_jerk(t1, J0, Alpha)
ax[1].plot(t1, jerk, linewidth=3.0)

accel = calc_scurve_accel(t1, A0, Alpha)
ax[2].plot(t1, accel, linewidth=3.0)

vel = calc_scurve_vel(t1, V0, A0, Alpha)
ax[3].plot(t1, vel, linewidth=3.0)

pos = calc_scurve_pos(t1, P0, V0, A0, Alpha)
ax[4].plot(t1, pos, linewidth=3.0)



# Step 2 - constant jerk
# ============================
J0 = jerk[-1]
A0 = accel[-1]
V0 = vel[-1]
P0 = pos[-1]

snap = get_zero_snap(t2)
ax[0].plot(t2, snap, linewidth=3.0)

jerk = get_const_jerk(t2, J0)
ax[1].plot(t2, jerk, linewidth=3.0)

accel = calc_linear_accel_constant_jerk(t2, A0, J0)
ax[2].plot(t2, accel, linewidth=3.0)

vel = calc_linear_vel_constant_jerk(t2, V0, A0, J0)
ax[3].plot(t2, vel, linewidth=3.0)

pos = calc_linear_pos_constant_jerk(t2, P0, V0, A0, J0)
ax[4].plot(t2, pos, linewidth=3.0)



# Step 3 - negative snap, decreasing jerk
# ============================
J0 = jerk[-1]
A0 = accel[-1]
V0 = vel[-1]
P0 = pos[-1]

snap = calc_scurve_snap(t3, -Alpha)
ax[0].plot(t3, snap, linewidth=3.0)

jerk = calc_scurve_jerk(t3, J0, -Alpha)
ax[1].plot(t3, jerk, linewidth=3.0)

accel = calc_scurve_accel(t3, A0, -Alpha)
ax[2].plot(t3, accel, linewidth=3.0)

vel = calc_linear_vel_constant_jerk(t2, V0, A0, J0)
ax[3].plot(t2, vel, linewidth=3.0)

pos = calc_linear_pos_constant_jerk(t2, P0, V0, A0, J0)
ax[4].plot(t2, pos, linewidth=3.0)







# Add formating and labels to graphs
ax[0].set_ylabel("Snap (m/s/s/s/s)")
ax[0].grid(True)

# Jerk
ax[1].set_ylabel("Jerk (m/s/s/s)")
ax[1].grid(True)

# Accel
ax[2].set_ylabel("Accel (m/s/s)")
ax[2].grid(True)

# vel
ax[3].set_ylabel("Vel (m/s)")
ax[3].grid(True)

# pos
ax[4].set_ylabel("Pos (m)")
ax[4].grid(True)

# bottom axis
ax[4].set_xlabel("Time (s)")

plt.show()










