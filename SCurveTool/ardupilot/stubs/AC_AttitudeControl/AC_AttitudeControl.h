#pragma once

#include <AP_AHRS/AP_AHRS_View.h>
#include <AP_AHRS/AP_AHRS.h>

class AC_AttitudeControl {
public:

    // get the roll angular velocity limit in radians/s
    float get_ang_vel_roll_max_rads() const { return radians(_ang_vel_roll_max_degs); }

    // get the pitch angular velocity limit in radians/s
    float get_ang_vel_pitch_max_rads() const { return radians(_ang_vel_pitch_max_degs); }

    // get the roll acceleration limit in radians/s/s
    float get_accel_roll_max_radss() const { return radians(_accel_roll_max_degss); }

    // get the pitch acceleration limit in radians/s/s
    float get_accel_pitch_max_radss() const { return radians(_accel_pitch_max_degss); }

    // get the rate control input smoothing time constant
    float get_input_tc() const { return _input_tc; }

    // Return body-frame feed forward setting
    bool get_bf_feedforward() { return _rate_bf_ff_enabled; }

    void set_params(float ang_vel_roll_max_degs, float ang_vel_pitch_max_degs, float accel_roll_max_degss, float accel_pitch_max_degss, float input_tc, bool rate_bf_ff_enabled) {
        _ang_vel_roll_max_degs = ang_vel_roll_max_degs;
        _ang_vel_pitch_max_degs = ang_vel_pitch_max_degs;
        _accel_roll_max_degss = accel_roll_max_degss;
        _accel_pitch_max_degss = accel_pitch_max_degss;
        _input_tc = input_tc;
        _rate_bf_ff_enabled = rate_bf_ff_enabled;
    }

private:

    float _ang_vel_roll_max_degs;
    float _accel_pitch_max_degss;
    float _ang_vel_pitch_max_degs;
    float _input_tc;
    float _accel_roll_max_degss;
    bool _rate_bf_ff_enabled;

};
