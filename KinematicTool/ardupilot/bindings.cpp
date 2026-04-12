#include "../../modules/ardupilot/libraries/AP_Math/control.h"

extern "C" {

float shape_angle_vel_accel_wrapper(float angle_desired, float angle_vel_desired, float angle_accel_desired,
                           float angle, float angle_vel, float angle_accel,
                           float angle_vel_min, float angle_vel_max, float angle_accel_max,
                           float angle_jerk_max, float dt, bool limit_total) {
    shape_angle_vel_accel(angle_desired, angle_vel_desired, angle_accel_desired, angle, angle_vel, angle_accel, angle_vel_min, angle_vel_max, angle_accel_max, angle_jerk_max, dt, limit_total);
    return angle_accel;
}

float sqrt_controller_wrapper(float error, float p, float second_ord_lim, float dt) {
    return sqrt_controller(error, p, second_ord_lim, dt);
}

}
