// World Magnetic Model (WMM2025)
// Coefficients from WMM2025.COF (WMM-2025, 11/13/2024) published by NOAA NCEI, https://www.ncei.noaa.gov/products/world-magnetic-model
// The WMM is a product of the U.S. government and is not subject to copyright protection.
// Implementation follows the WMM2025 technical report, checked against the published WMM2025 test values.

const WMM_EPOCH = 2025.0
const WMM_COEFFICIENTS = [
    // n, m, g (nT), h (nT), g rate (nT/yr), h rate (nT/yr)
    [1, 0, -29351.8, 0.0, 12.0, 0.0],
    [1, 1, -1410.8, 4545.4, 9.7, -21.5],
    [2, 0, -2556.6, 0.0, -11.6, 0.0],
    [2, 1, 2951.1, -3133.6, -5.2, -27.7],
    [2, 2, 1649.3, -815.1, -8.0, -12.1],
    [3, 0, 1361.0, 0.0, -1.3, 0.0],
    [3, 1, -2404.1, -56.6, -4.2, 4.0],
    [3, 2, 1243.8, 237.5, 0.4, -0.3],
    [3, 3, 453.6, -549.5, -15.6, -4.1],
    [4, 0, 895.0, 0.0, -1.6, 0.0],
    [4, 1, 799.5, 278.6, -2.4, -1.1],
    [4, 2, 55.7, -133.9, -6.0, 4.1],
    [4, 3, -281.1, 212.0, 5.6, 1.6],
    [4, 4, 12.1, -375.6, -7.0, -4.4],
    [5, 0, -233.2, 0.0, 0.6, 0.0],
    [5, 1, 368.9, 45.4, 1.4, -0.5],
    [5, 2, 187.2, 220.2, 0.0, 2.2],
    [5, 3, -138.7, -122.9, 0.6, 0.4],
    [5, 4, -142.0, 43.0, 2.2, 1.7],
    [5, 5, 20.9, 106.1, 0.9, 1.9],
    [6, 0, 64.4, 0.0, -0.2, 0.0],
    [6, 1, 63.8, -18.4, -0.4, 0.3],
    [6, 2, 76.9, 16.8, 0.9, -1.6],
    [6, 3, -115.7, 48.8, 1.2, -0.4],
    [6, 4, -40.9, -59.8, -0.9, 0.9],
    [6, 5, 14.9, 10.9, 0.3, 0.7],
    [6, 6, -60.7, 72.7, 0.9, 0.9],
    [7, 0, 79.5, 0.0, -0.0, 0.0],
    [7, 1, -77.0, -48.9, -0.1, 0.6],
    [7, 2, -8.8, -14.4, -0.1, 0.5],
    [7, 3, 59.3, -1.0, 0.5, -0.8],
    [7, 4, 15.8, 23.4, -0.1, 0.0],
    [7, 5, 2.5, -7.4, -0.8, -1.0],
    [7, 6, -11.1, -25.1, -0.8, 0.6],
    [7, 7, 14.2, -2.3, 0.8, -0.2],
    [8, 0, 23.2, 0.0, -0.1, 0.0],
    [8, 1, 10.8, 7.1, 0.2, -0.2],
    [8, 2, -17.5, -12.6, 0.0, 0.5],
    [8, 3, 2.0, 11.4, 0.5, -0.4],
    [8, 4, -21.7, -9.7, -0.1, 0.4],
    [8, 5, 16.9, 12.7, 0.3, -0.5],
    [8, 6, 15.0, 0.7, 0.2, -0.6],
    [8, 7, -16.8, -5.2, -0.0, 0.3],
    [8, 8, 0.9, 3.9, 0.2, 0.2],
    [9, 0, 4.6, 0.0, -0.0, 0.0],
    [9, 1, 7.8, -24.8, -0.1, -0.3],
    [9, 2, 3.0, 12.2, 0.1, 0.3],
    [9, 3, -0.2, 8.3, 0.3, -0.3],
    [9, 4, -2.5, -3.3, -0.3, 0.3],
    [9, 5, -13.1, -5.2, 0.0, 0.2],
    [9, 6, 2.4, 7.2, 0.3, -0.1],
    [9, 7, 8.6, -0.6, -0.1, -0.2],
    [9, 8, -8.7, 0.8, 0.1, 0.4],
    [9, 9, -12.9, 10.0, -0.1, 0.1],
    [10, 0, -1.3, 0.0, 0.1, 0.0],
    [10, 1, -6.4, 3.3, 0.0, 0.0],
    [10, 2, 0.2, 0.0, 0.1, -0.0],
    [10, 3, 2.0, 2.4, 0.1, -0.2],
    [10, 4, -1.0, 5.3, -0.0, 0.1],
    [10, 5, -0.6, -9.1, -0.3, -0.1],
    [10, 6, -0.9, 0.4, 0.0, 0.1],
    [10, 7, 1.5, -4.2, -0.1, 0.0],
    [10, 8, 0.9, -3.8, -0.1, -0.1],
    [10, 9, -2.7, 0.9, -0.0, 0.2],
    [10, 10, -3.9, -9.1, -0.0, -0.0],
    [11, 0, 2.9, 0.0, 0.0, 0.0],
    [11, 1, -1.5, 0.0, -0.0, -0.0],
    [11, 2, -2.5, 2.9, 0.0, 0.1],
    [11, 3, 2.4, -0.6, 0.0, -0.0],
    [11, 4, -0.6, 0.2, 0.0, 0.1],
    [11, 5, -0.1, 0.5, -0.1, -0.0],
    [11, 6, -0.6, -0.3, 0.0, -0.0],
    [11, 7, -0.1, -1.2, -0.0, 0.1],
    [11, 8, 1.1, -1.7, -0.1, -0.0],
    [11, 9, -1.0, -2.9, -0.1, 0.0],
    [11, 10, -0.2, -1.8, -0.1, 0.0],
    [11, 11, 2.6, -2.3, -0.1, 0.0],
    [12, 0, -2.0, 0.0, 0.0, 0.0],
    [12, 1, -0.2, -1.3, 0.0, -0.0],
    [12, 2, 0.3, 0.7, -0.0, 0.0],
    [12, 3, 1.2, 1.0, -0.0, -0.1],
    [12, 4, -1.3, -1.4, -0.0, 0.1],
    [12, 5, 0.6, -0.0, -0.0, -0.0],
    [12, 6, 0.6, 0.6, 0.1, -0.0],
    [12, 7, 0.5, -0.1, -0.0, -0.0],
    [12, 8, -0.1, 0.8, 0.0, 0.0],
    [12, 9, -0.4, 0.1, 0.0, -0.0],
    [12, 10, -0.2, -1.0, -0.1, -0.0],
    [12, 11, -1.3, 0.1, -0.0, 0.0],
    [12, 12, -0.7, 0.2, -0.1, -0.1]
]

// Magnetic field (nT, north east down) for geodetic latitude and longitude (deg), height above WGS84 ellipsoid (km) and decimal year
function wmm_field(lat_deg, lon_deg, height_km, year) {
    const max_order = 12
    const a_ref = 6371.2 // geomagnetic reference radius (km)

    // WGS84 ellipsoid
    const a = 6378.137
    const f = 1 / 298.257223563
    const e2 = f * (2 - f)

    const lat = lat_deg * (Math.PI / 180)
    const lon = lon_deg * (Math.PI / 180)

    // Geodetic to geocentric spherical
    const sin_lat = Math.sin(lat)
    const Rc = a / Math.sqrt(1 - e2 * sin_lat * sin_lat)
    const p = (Rc + height_km) * Math.cos(lat)
    const z = (Rc * (1 - e2) + height_km) * sin_lat
    const r = Math.sqrt(p * p + z * z)
    const lat_c = Math.asin(z / r)

    const x = Math.sin(lat_c)
    const cos_lat_c = Math.cos(lat_c)

    // Schmidt semi-normalised associated Legendre functions and derivatives with respect to geocentric latitude
    let P = []
    let dP = []
    for (let n = 0; n <= max_order; n++) {
        P.push(new Array(max_order + 1).fill(0))
        dP.push(new Array(max_order + 1).fill(0))
    }
    P[0][0] = 1
    for (let n = 1; n <= max_order; n++) {
        for (let m = 0; m <= n; m++) {
            if (n == m) {
                P[n][n] = (n == 1) ? cos_lat_c : Math.sqrt((2 * n - 1) / (2 * n)) * cos_lat_c * P[n-1][n-1]
            } else {
                const k = (n >= 2) ? Math.sqrt((n - 1) * (n - 1) - m * m) * P[n-2][m] : 0
                P[n][m] = ((2 * n - 1) * x * P[n-1][m] - k) / Math.sqrt(n * n - m * m)
            }
        }
    }
    for (let n = 1; n <= max_order; n++) {
        for (let m = 0; m <= n; m++) {
            const prev = (m < n) ? Math.sqrt(n * n - m * m) * P[n-1][m] : 0
            dP[n][m] = -(n * x * P[n][m] - prev) / cos_lat_c
        }
    }

    // Sum field in geocentric frame
    const dt = year - WMM_EPOCH
    let X = 0
    let Y = 0
    let Z = 0
    for (const [n, m, g0, h0, g_dot, h_dot] of WMM_COEFFICIENTS) {
        const g = g0 + dt * g_dot
        const h = h0 + dt * h_dot
        const ratio = Math.pow(a_ref / r, n + 2)
        const cos_m = Math.cos(m * lon)
        const sin_m = Math.sin(m * lon)
        X -= ratio * (g * cos_m + h * sin_m) * dP[n][m]
        Y += ratio * m * (g * sin_m - h * cos_m) * P[n][m] / cos_lat_c
        Z -= ratio * (n + 1) * (g * cos_m + h * sin_m) * P[n][m]
    }

    // Rotate to geodetic frame
    const psi = lat_c - lat
    return {
        x: X * Math.cos(psi) - Z * Math.sin(psi),
        y: Y,
        z: X * Math.sin(psi) + Z * Math.cos(psi),
    }
}

// Return expected earth field for a location, height above sea level (m) and decimal year
// vector is in milligauss (north east down), intensity in gauss and angles in degrees
function expected_earth_field(lat, lon, alt, year) {

    if ((lat == null) || (lon == null) || isNaN(lat) || isNaN(lon) || (Math.abs(lat) > 90)) {
        return
    }
    if ((alt == null) || isNaN(alt)) {
        alt = 0
    }
    if ((year == null) || isNaN(year)) {
        return
    }

    const field = wmm_field(lat, lon, alt * 0.001, year)

    // 1 milligauss is 100 nT
    const vector = [field.x * 0.01, field.y * 0.01, field.z * 0.01]
    const horizontal = Math.sqrt(field.x**2 + field.y**2)

    return {
        vector,
        intensity: Math.sqrt(field.x**2 + field.y**2 + field.z**2) * 1e-5,
        declination: Math.atan2(field.y, field.x) * (180 / Math.PI),
        inclination: Math.atan2(field.z, horizontal) * (180 / Math.PI)
    }
}

// Convert a date to decimal year
function decimal_year(date) {
    const year = date.getUTCFullYear()
    const start = Date.UTC(year, 0, 1)
    const end = Date.UTC(year + 1, 0, 1)
    return year + (date.getTime() - start) / (end - start)
}
