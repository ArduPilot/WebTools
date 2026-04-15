#pragma once

// Global stubs

#define __AP_LINE__ 0

#define AP_MATH_FILL_NANF_USE_MEMCPY 0

#define CONFIG_HAL_BOARD 100


#define HAL_GCS_ENABLED 0
#define AP_TERRAIN_AVAILABLE 0
#define AP_AVOIDANCE_ENABLED 0

#define APM_BUILD_DIRECTORY 2

#define HAL_LOGGING_ENABLED 0

// This is very sketchy, but it means we can get at the
// time_end and get_jerk_accel_vel_pos_at_time SCurve class functions
#define private public
