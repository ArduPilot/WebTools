#include "AC_PosControl.h"

AC_PosControl::AC_PosControl(AC_AttitudeControl& attitude_control) :
    _attitude_control(attitude_control)
{}

// Sets maximum horizontal speed (m/s) and acceleration (m/s²) for NE-axis shaping.
// These values constrain the kinematic trajectory used by the lateral controller.
// All arguments should be positive.
void AC_PosControl::NE_set_max_speed_accel_m(float speed_ne_ms, float accel_ne_mss)
{
    _vel_max_ne_ms = fabsf(speed_ne_ms);
    _accel_max_ne_mss = fabsf(accel_ne_mss);

    // ensure the horizontal jerk is less than the vehicle is capable of
    const float jerk_max_msss = MIN(_attitude_control.get_ang_vel_roll_max_rads(), _attitude_control.get_ang_vel_pitch_max_rads()) * GRAVITY_MSS;
    const float snap_max_mssss = MIN(_attitude_control.get_accel_roll_max_radss(), _attitude_control.get_accel_pitch_max_radss()) * GRAVITY_MSS;

    // get specified jerk limit
    _jerk_max_ne_msss = _shaping_jerk_ne_msss;

    // limit maximum jerk based on maximum angular rate
    if (is_positive(jerk_max_msss) && _attitude_control.get_bf_feedforward()) {
        _jerk_max_ne_msss = MIN(_jerk_max_ne_msss, jerk_max_msss);
    }

    // limit maximum jerk to maximum possible average jerk based on angular acceleration
    if (is_positive(snap_max_mssss) && _attitude_control.get_bf_feedforward()) {
        _jerk_max_ne_msss = MIN(0.5 * safe_sqrt(_accel_max_ne_mss * snap_max_mssss), _jerk_max_ne_msss);
    }
}

// Sets maximum climb/descent rate (m/s) and vertical acceleration (m/s²) for the U-axis.
// These values are used for jerk-limited kinematic shaping of the vertical trajectory.
// All values must be positive.
void AC_PosControl::D_set_max_speed_accel_m(float decent_speed_max_ms, float climb_speed_max_ms, float accel_max_d_mss)
{
    // sanity check and update
    if (!is_zero(decent_speed_max_ms)) {
        _vel_max_down_ms = fabsf(decent_speed_max_ms);
    }
    if (!is_zero(climb_speed_max_ms)) {
        _vel_max_up_ms = fabsf(climb_speed_max_ms);
    }
    if (!is_zero(accel_max_d_mss)) {
        _accel_max_d_mss = fabsf(accel_max_d_mss);
    }

    // ensure the vertical Jerk is not limited by the filters in the Z acceleration PID object
    _jerk_max_d_msss = _shaping_jerk_d_msss;
    if (is_positive(_pid_accel_d_m.filt_T_hz())) {
        _jerk_max_d_msss = MIN(_jerk_max_d_msss, MIN(GRAVITY_MSS, _accel_max_d_mss) * (M_2PI * _pid_accel_d_m.filt_T_hz()) / 5.0);
    }
    if (is_positive(_pid_accel_d_m.filt_E_hz())) {
        _jerk_max_d_msss = MIN(_jerk_max_d_msss, MIN(GRAVITY_MSS, _accel_max_d_mss) * (M_2PI * _pid_accel_d_m.filt_E_hz()) / 5.0);
    }
}
