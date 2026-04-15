#pragma once

#include <AP_Math/AP_Math.h>
#include "AC_AttitudeControl.h"

class AC_P_2D
{
public:

    // get accessors
    AP_Float &kP() WARN_IF_UNUSED { return _kp; }
    const AP_Float &kP() const WARN_IF_UNUSED { return _kp; }

private:
    AP_Float _kp;

};

class AC_PID
{
public:

    AP_Float &filt_T_hz() { return _filt_T_hz; }
    AP_Float &filt_E_hz() { return _filt_E_hz; }

private:
    AP_Float _filt_T_hz;
    AP_Float _filt_E_hz;

};

class AC_PosControl
{
public:

    AC_PosControl(AC_AttitudeControl& attitude_control);


    void set_params(float xy_kp, float accel_z_filt_t, float accel_z_filt_e, float shaping_jerk_ne_msss, float shaping_jerk_d_msss, float dt_s) {
        _p_pos_ne_m.kP().set(xy_kp);
        _pid_accel_d_m.filt_T_hz().set(accel_z_filt_t);
        _pid_accel_d_m.filt_E_hz().set(accel_z_filt_e);
        _shaping_jerk_ne_msss = shaping_jerk_ne_msss;
        _shaping_jerk_d_msss = shaping_jerk_d_msss;
        _dt_s = dt_s;
    }

// These functions are implemented because they are used.

    // Initializes U-axis controller to a stationary stopping point with zero velocity and acceleration.
    // Used when the trajectory starts at rest but the initial altitude is unspecified.
    // The resulting position target can be retrieved with get_pos_target_NED_m().
    void D_init_controller_stopping_point() {};

    // Initializes NE controller to a stationary stopping point with zero velocity and acceleration.
    // Use when the expected trajectory begins at rest but the starting position is unspecified.
    // The starting position can be retrieved with get_pos_target_NED_m().
    void NE_init_controller_stopping_point() {};

    // Sets maximum horizontal speed (m/s) and acceleration (m/s²) for NE-axis shaping.
    // These values constrain the kinematic trajectory used by the lateral controller.
    // All arguments should be positive.
    void NE_set_max_speed_accel_m(float speed_ms, float accel_mss);

    // Sets horizontal correction limits for velocity (m/s) and acceleration (m/s²).
    // These values constrain the PID correction path, not the desired trajectory.
    // All arguments should be positive.
    void NE_set_correction_speed_accel_m(float speed_ms, float accel_mss) {};

    // Sets maximum climb/descent rate (m/s) and vertical acceleration (m/s²) for the U-axis.
    // These values are used for jerk-limited kinematic shaping of the vertical trajectory.
    // All values must be positive.
    void D_set_max_speed_accel_m(float decent_speed_max_ms, float climb_speed_max_ms, float accel_max_d_mss);

    // Sets vertical correction velocity and acceleration limits (m/s, m/s²).
    // These values constrain the correction output of the PID controller.
    // All values must be positive.
    void D_set_correction_speed_accel_m(float decent_speed_max_ms, float climb_speed_max_ms, float accel_max_d_mss) {};

    // Computes NE stopping point in meters based on current position, velocity, and acceleration.
    void get_stopping_point_NE_m(Vector2p &stopping_point_ne_m) const {
        stopping_point_ne_m.zero();
    };

    // Computes vertical stopping point relative to EKF origin in meters, Down-positive. based on current velocity and acceleration.
    void get_stopping_point_D_m(postype_t &stopping_point_d_m) const {
        stopping_point_d_m = 0.0;
    };

    // Returns maximum horizontal speed in m/s used for shaping the trajectory.
    float NE_get_max_speed_ms() const { return _vel_max_ne_ms; }

    // Returns maximum climb rate in m/s used for shaping the vertical trajectory.
    float get_max_speed_up_ms() const { return _vel_max_up_ms; }

    // Returns maximum descent rate in m/s (zero or positive).
    float get_max_speed_down_ms() const { return _vel_max_down_ms; }

    // Returns desired velocity in NEU frame in m/s.
    const Vector3f get_vel_desired_NED_ms() const { return _vel_desired_ned_ms; }

    // Returns vertical velocity offset in m/s.
    float get_vel_offset_D_ms() const { return 0.0; }

    // Initializes both the terrain altitude and terrain target to the same value
    // (relative to EKF origin in meters, Down-positive).
    void init_pos_terrain_D_m(float pos_terrain_d_m) {};

    // Sets both the terrain altitude and terrain target to the same value
    // (relative to EKF origin in meters, Down-positive).
    void set_pos_terrain_target_D_m(float pos_terrain_target_d_m) {};

    // Returns a scaling factor for horizontal velocity in m/s to ensure
    // the vertical controller maintains a safe distance above terrain.
    float terrain_scaler_D_m(float pos_terrain_d_m, float terrain_margin_m) const { return 1.0; }

    // Returns current NED position offset in meters.
    const Vector3p& get_pos_offset_NED_m() const { return zero; }

    // Returns the estimated position in NED frame, in meters relative to EKF origin.
    const Vector3p& get_pos_estimate_NED_m() const { return _pos_desired_ned_m; }

    // Returns NED position error vector in meters between current and target positions.
    const Vector3f get_pos_error_NED_m() const { return Vector3f(); }

    // Returns current velocity estimate in NED frame in m/s.
    const Vector3f& get_vel_estimate_NED_ms() const { return _vel_desired_ned_ms; }

    // Returns reference to the NE position P controller.
    AC_P_2D& NE_get_pos_p() { return _p_pos_ne_m; }

    // Returns the jerk limit for horizontal path shaping in m/s³.
    // Used to constrain acceleration changes in trajectory generation.
    float get_shaping_jerk_NE_msss() const { return _shaping_jerk_ne_msss; }

    // Sets externally computed NED position, velocity, and acceleration in meters, m/s, and m/s².
    // Use when path planning or shaping is done outside this controller.
    void set_pos_vel_accel_NED_m(const Vector3p& pos_ned_m, const Vector3f& vel_ned_ms, const Vector3f& accel_ned_mss) {
        _pos_desired_ned_m = pos_ned_m;
        _vel_desired_ned_ms = vel_ned_ms;
        _accel_desired_ned_mss = accel_ned_mss;
    };

    // Returns maximum vertical acceleration in m/s² used for shaping the climb/descent trajectory.
    float D_get_max_accel_mss() const { return _accel_max_d_mss; };

    // Returns the time step used in the controller update (seconds).
    float get_dt_s() const  { return _dt_s; };

    // Runs the NE-axis position controller, computing output acceleration from position and velocity errors.
    // Uses P and PID controllers to generate corrections which are added to feedforward velocity/acceleration.
    // Requires all desired targets to be pre-set using the input_* or set_* methods.
    void NE_update_controller() {};

    // Returns current velocity estimate in NED frame in m/s.
    const Vector3f& get_accel_desired_ned_mss() const { return _accel_desired_ned_mss; }

// Remaining functions are just definitions, they are not used but are needed to build.

    // Returns desired roll angle in radians for the attitude controller
    float get_roll_rad() const;

    // Returns desired pitch angle in radians for the attitude controller.
    float get_pitch_rad() const;

    // Returns desired yaw angle in radians for the attitude controller.
    float get_yaw_rad() const;

    // Sets maximum horizontal speed (cm/s) and acceleration (cm/s²) for NE-axis shaping.
    // Can be called anytime; transitions are handled smoothly.
    // All arguments should be positive.
    // See NE_set_max_speed_accel_m() for full details.
    void NE_set_max_speed_accel_cm(float speed_cms, float accel_cmss);

    // Returns maximum horizontal acceleration in m/s² used for trajectory shaping.
    float NE_get_max_accel_mss() const;

    // Returns desired thrust direction as a unit vector in the body frame.
    Vector3f get_thrust_vector() const;

    // Returns lateral distance to closest point on active trajectory in meters.
    // Used to assess horizontal deviation from path.
    float crosstrack_error_m() const;

    // Sets horizontal correction limits for velocity (cm/s) and acceleration (cm/s²).
    // Should be called only during initialization to avoid control discontinuities.
    // All arguments should be positive.
    // See NE_set_correction_speed_accel_m() for full details.
    void NE_set_correction_speed_accel_cm(float speed_cms, float accel_cmss);

private:
    Vector3p zero{};

    float _dt_s;

    AC_P_2D         _p_pos_ne_m;            // XY axis position controller to convert target distance (m) to target velocity (m/s)
    AC_PID          _pid_accel_d_m;         // Z axis acceleration controller to convert target acceleration (in units of gravity) to normalised throttle output

    Vector3p    _pos_desired_ned_m;         // desired location, frame NED in m relative to the EKF origin. This is equal to the _pos_target_ned_m minus offsets
    Vector3f    _vel_desired_ned_ms;        // desired velocity in NED m/s
    Vector3f    _accel_desired_ned_mss;     // desired acceleration in NED m/s² (feed forward)

    float _shaping_jerk_ne_msss;
    float _shaping_jerk_d_msss;

    float _vel_max_ne_ms;
    float _accel_max_ne_mss;
    float _jerk_max_ne_msss;

    float       _vel_max_up_ms;             // max climb rate in m/s used for kinematic shaping
    float       _vel_max_down_ms;           // max descent rate in m/s used for kinematic shaping
    float       _accel_max_d_mss;           // max vertical acceleration in m/s² used for kinematic shaping
    float       _jerk_max_d_msss;           // Jerk limit of the z kinematic path generation in m/s³ used to determine how quickly the aircraft varies the acceleration target

    AC_AttitudeControl&     _attitude_control;

};
