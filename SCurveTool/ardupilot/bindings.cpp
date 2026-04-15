#include <emscripten/bind.h>
#include "../../modules/ardupilot/libraries/AC_WPNav/AC_WPNav.h"

// Sneaky class to get at protected members of AC_WPNav
class AC_WPNav_helper : public AC_WPNav {
public:
    using AC_WPNav::AC_WPNav;

    void set_params(float speed_ms, float speed_up_ms, float speed_down_ms, float radius_m, float accel_mss, float accel_c_mss, float accel_z_mss, float jerk_msss, float terrain_margin_m) {
        _wp_speed_ms.set(speed_ms);
        _wp_speed_up_ms.set(speed_up_ms);
        _wp_speed_down_ms.set(speed_down_ms);
        _wp_radius_m.set(radius_m);
        _wp_accel_mss.set(accel_mss);
        _wp_accel_c_mss.set(accel_c_mss);
        _wp_accel_z_mss.set(accel_z_mss);
        _wp_jerk_msss.set(jerk_msss);
        _terrain_margin_m.set(terrain_margin_m);
    }

    emscripten::val get_current_1D_curve(float dt) {
        // Declare arrays
        emscripten::val time = emscripten::val::array();
        emscripten::val pos = emscripten::val::array();
        emscripten::val vel = emscripten::val::array();
        emscripten::val accel = emscripten::val::array();
        emscripten::val jerk = emscripten::val::array();
        emscripten::val snap = emscripten::val::array();

        // Start at 0
        time.set(0, 0);
        pos.set(0, 0);
        vel.set(0, 0);
        accel.set(0, 0);
        jerk.set(0, 0);
        snap.set(0, 0);

        // Run until the end
        const float time_end = _scurve_this_leg.time_end();
        const int end_index = (time_end / dt) + 1;

        float time_s = 0;
        float last_j = 0;
        for (int i = 1; i <= end_index; i++) {
            // Update time
            time_s += dt;
            time.set(i, time_s);

            // Get values
            float p = 0.0;
            float v = 0.0;
            float a = 0.0;
            float j = 0.0;
            _scurve_this_leg.get_jerk_accel_vel_pos_at_time(time_s, j, a, v, p);

            // Add to array
            pos.set(i, p);
            vel.set(i, v);
            accel.set(i, a);
            jerk.set(i, j);

            // Differentiate to get snap
            snap.set(i, (j - last_j) / dt);
            last_j = j;
        }

        // Pack into a object
        emscripten::val obj = emscripten::val::object();

        obj.set("time", time);
        obj.set("pos", pos);
        obj.set("vel", vel);
        obj.set("accel", accel);
        obj.set("jerk", jerk);
        obj.set("snap", snap);

        return obj;
    }
};


class AC_WPNav_wrapper {
public:

    // Initializes waypoint and spline navigation using inputs in meters.
    // Sets speed and acceleration limits, calculates jerk constraints,
    // and initializes spline or S-curve leg with a defined starting point.
    void wp_and_spline_init_m(float n, float e, float d) {
        Vector3p stopping_point_ned_m { n, e, d };
        wp_nav.wp_and_spline_init_m(0.0, stopping_point_ned_m);
    };

    // Sets waypoint destination using NED position vector in meters from EKF origin.
    // If `is_terrain_alt` is true, altitude is interpreted as height above terrain.
    // Reinitializes the current leg if interrupted, updates origin, and computes trajectory.
    // arc_rad specifies the signed arc angle in radians for an ARC_WAYPOINT segment (0 for straight path)
    // Returns false if terrain offset cannot be determined when required.
    bool set_wp_destination_NED_m(float n, float e, float d) {
        Vector3p destination_ned_m { n, e, d };
        return wp_nav.set_wp_destination_NED_m(destination_ned_m);
    }

    // Sets the next waypoint destination using a NED position vector in meters.
    // Only updates if terrain frame matches current leg.
    // Calculates trajectory preview for smoother transition into next segment.
    // Updates velocity handoff if previous leg is a spline.
    // arc_rad specifies the signed arc angle in radians for an ARC_WAYPOINT segment (0 for straight path)
    bool set_wp_destination_next_NED_m(float n, float e, float d) {
        Vector3p destination_ned_m { n, e, d };
        return wp_nav.set_wp_destination_next_NED_m(destination_ned_m);
    }

    // Advances the target location along the current path segment.
    // Updates target position, velocity, and acceleration based on jerk-limited profile (or spline).
    // Returns true if the update succeeded (e.g., terrain data was available).
    bool advance_wp_target_along_track(float dt) {
        return wp_nav.advance_wp_target_along_track(dt);
    }

    // Returns true if the vehicle has reached the waypoint destination.
    // A waypoint is considered reached when the vehicle comes within the defined radius threshold.
    bool reached_wp_destination() const {
        return wp_nav.reached_wp_destination();
    }

    // Set initial position
    void set_initial_position(float n, float e, float d) {
        Vector3p pos { n, e, d };
        Vector3f vel {};
        Vector3f accel {};
        pos_control.set_pos_vel_accel_NED_m(pos, vel, accel);
    }

    // Parameter setters
    void set_wp_nav_params(float speed_ms, float speed_up_ms, float speed_down_ms, float radius_m, float accel_mss, float accel_c_mss, float accel_z_mss, float jerk_msss, float terrain_margin_m) {
        wp_nav.set_params(speed_ms, speed_up_ms, speed_down_ms, radius_m, accel_mss, accel_c_mss, accel_z_mss, jerk_msss, terrain_margin_m);
    }

    void set_psc_params(float xy_kp, float accel_z_filt_t, float accel_z_filt_e, float shaping_jerk_ne_msss, float shaping_jerk_d_msss, float dt_s) {
        pos_control.set_params(xy_kp, accel_z_filt_t, accel_z_filt_e, shaping_jerk_ne_msss, shaping_jerk_d_msss, dt_s);
    }

    void set_atc_params(float ang_vel_roll_max_degs, float ang_vel_pitch_max_degs, float accel_roll_max_degss, float accel_pitch_max_degss, float input_tc, bool rate_bf_ff_enabled) {
        attitude_control.set_params(ang_vel_roll_max_degs, ang_vel_pitch_max_degs, accel_roll_max_degss, accel_pitch_max_degss, input_tc, rate_bf_ff_enabled);
    }

    // Get results
    emscripten::val get_pos() {
        Vector3p ret = pos_control.get_pos_estimate_NED_m();
        emscripten::val arr = emscripten::val::array();
        arr.set(0, ret.x);
        arr.set(1, ret.y);
        arr.set(2, ret.z);
        return arr;
    }

    emscripten::val get_vel() {
        Vector3f ret = pos_control.get_vel_desired_NED_ms();
        emscripten::val arr = emscripten::val::array();
        arr.set(0, ret.x);
        arr.set(1, ret.y);
        arr.set(2, ret.z);
        return arr;
    }

    emscripten::val get_accel() {
        Vector3f ret = pos_control.get_accel_desired_ned_mss();
        emscripten::val arr = emscripten::val::array();
        arr.set(0, ret.x);
        arr.set(1, ret.y);
        arr.set(2, ret.z);
        return arr;
    }

    emscripten::val get_current_1D_curve(float dt) {
        return wp_nav.get_current_1D_curve(dt);
    }

private:
    AP_AHRS_View ahrs;
    AC_AttitudeControl attitude_control;
    AC_PosControl pos_control { attitude_control };

    AC_WPNav_helper wp_nav {ahrs, pos_control, attitude_control};
};

using namespace emscripten;

EMSCRIPTEN_BINDINGS(my_module) {
    class_<AC_WPNav_wrapper>("AC_WPNav_wrapper")
        .constructor<>()
        .function("wp_and_spline_init_m", &AC_WPNav_wrapper::wp_and_spline_init_m)
        .function("set_wp_destination_NED_m", &AC_WPNav_wrapper::set_wp_destination_NED_m)
        .function("set_wp_destination_next_NED_m", &AC_WPNav_wrapper::set_wp_destination_next_NED_m)
        .function("advance_wp_target_along_track", &AC_WPNav_wrapper::advance_wp_target_along_track)
        .function("reached_wp_destination", &AC_WPNav_wrapper::reached_wp_destination)
        .function("set_initial_position", &AC_WPNav_wrapper::set_initial_position)
        .function("set_wp_nav_params", &AC_WPNav_wrapper::set_wp_nav_params)
        .function("set_psc_params", &AC_WPNav_wrapper::set_psc_params)
        .function("set_atc_params", &AC_WPNav_wrapper::set_atc_params)
        .function("get_pos", &AC_WPNav_wrapper::get_pos)
        .function("get_vel", &AC_WPNav_wrapper::get_vel)
        .function("get_accel", &AC_WPNav_wrapper::get_accel)
        .function("get_current_1D_curve", &AC_WPNav_wrapper::get_current_1D_curve);
}


