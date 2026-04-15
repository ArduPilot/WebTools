#pragma once

#include <stdint.h>

#define HAL_WITH_EKF_DOUBLE 0

namespace AP_HAL {

    /* Toplevel pure virtual class Hal.*/
    class HAL;

    inline uint32_t millis()
    {
        return 0U;
    }

};

class AP_HAL::HAL {

};