// This is a replication of https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Baro/AP_Baro_atmosphere.cpp
// This is needed to convert from a motor PWM value back to a throttle value which is used for multi notch tracking

function get_air_density_model() {

    /*
    Note parameters are as defined in the 1976 model.
    These are slightly different from the ones in definitions.h
    */
    const radius_earth = 6356.766E3      // Earth's radius (in m)
    const R_specific = 287.053072        // air specific gas constant (J⋅kg−1⋅K−1) in 1976 model, R_universal / M_air

    // acceleration due to gravity in m/s/s
    const GRAVITY_MSS = 9.80665

    const SSL_AIR_DENSITY = 1.225 // kg/m^3

    function get_struct(amsl_m, temp_K, pressure_Pa, density, temp_lapse) {
        return {
            amsl_m,       // geopotential height above mean sea-level (km')
            temp_K,       // Temperature (K)
            pressure_Pa,  // Pressure (Pa)
            density,      // Density (Pa/kg)
            temp_lapse,   // Temperature gradients rates (K/m'), see page 3
        }
    }

    const atmospheric_1976_consts = [
        get_struct( -5000,    320.650,     177687,      1.930467,    -6.5E-3 ),
        get_struct( 11000,    216.650,    22632.1,      0.363918,          0 ),
        get_struct( 20000,    216.650,    5474.89,    8.80349E-2,       1E-3 ),
        get_struct( 32000,    228.650,    868.019,    1.32250E-2,     2.8E-3 ),
        get_struct( 47000,    270.650,    110.906,    1.42753E-3,          0 ),
        get_struct( 51000,    270.650,    66.9389,    8.61606E-4,    -2.8E-3 ),
        get_struct( 71000,    214.650,    3.95642,    6.42110E-5,    -2.0E-3 ),
        get_struct( 84852,    186.946,    0.37338,    6.95788E-6,          0 ),
    ]

    /*
    find table entry given geopotential altitude in meters. This returns at least 1
    */
    function find_atmosphere_layer_by_altitude(alt_m) {
        for (let idx = 1; idx < atmospheric_1976_consts.length; idx++) {
            if(alt_m < atmospheric_1976_consts[idx].amsl_m) {
                return idx - 1
            }
        }

        // Over the largest altitude return the last index
        return atmospheric_1976_consts.length - 1
    }

    function geometric_alt_to_geopotential(alt)
    {
        return (radius_earth * alt) / (radius_earth + alt)
    }

    /*
    Compute expected temperature for a given geopotential altitude and altitude layer.
    */
    function get_temperature_by_altitude_layer(alt, idx)
    {
        if (atmospheric_1976_consts[idx].temp_lapse == 0) {
            return atmospheric_1976_consts[idx].temp_K
        }
        return atmospheric_1976_consts[idx].temp_K + atmospheric_1976_consts[idx].temp_lapse * (alt - atmospheric_1976_consts[idx].amsl_m)
    }

    /*
    return air density (kg/m^3), given geometric altitude (m)
    */
    function get_air_density_for_alt_amsl(alt_amsl)
    {
        alt_amsl = geometric_alt_to_geopotential(alt_amsl)

        const idx = find_atmosphere_layer_by_altitude(alt_amsl)
        const temp_slope = atmospheric_1976_consts[idx].temp_lapse
        const temp =  get_temperature_by_altitude_layer(alt_amsl, idx)

        let rho
        if (temp_slope == 0.0) {    // Iso-thermal layer
            const fac = Math.exp(-GRAVITY_MSS / (temp * R_specific) * (alt_amsl - atmospheric_1976_consts[idx].amsl_m))
            rho      = atmospheric_1976_consts[idx].density     * fac
        } else {            // Gradient temperature layer
            const fac =  GRAVITY_MSS / (temp_slope * R_specific)
            const temp_ratio = temp / atmospheric_1976_consts[idx].temp_K // temperature ratio [unitless]
            rho      = atmospheric_1976_consts[idx].density     * Math.pow(temp_ratio, -(fac + 1))
        }

        return rho
    }

    /*
    return current scale factor that converts from equivalent to true airspeed
    */
    function get_EAS2TAS_extended(altitude)
    {
        let density = get_air_density_for_alt_amsl(altitude)
        if (density <= 0) {
            // above this height we are getting closer to spacecraft territory...
            const table_size = atmospheric_1976_consts.length
            density = atmospheric_1976_consts[table_size-1].density
        }
        return Math.sqrt(SSL_AIR_DENSITY / density)
    }

    this.get_EAS2TAS = (altitude) => { return get_EAS2TAS_extended(altitude) }
    return this
}