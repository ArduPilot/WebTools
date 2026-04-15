#pragma once

#include <AP_Common/Location.h>

class AP_AHRS {
public:

    AP_AHRS() {
        _singleton = this;
    }

    // get singleton instance
    static AP_AHRS *get_singleton() {
        return _singleton;
    }

    // returns the inertial navigation origin in lat/lon/alt
    bool get_origin(Location &ret) const WARN_IF_UNUSED { return false; };

private:
    static AP_AHRS *_singleton;

};

namespace AP {
    inline AP_AHRS &ahrs()
    {
        return *AP_AHRS::get_singleton();
    }
};