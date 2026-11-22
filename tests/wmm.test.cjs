// Check the MAGFit WMM2025 implementation against the test values published with the model by NOAA NCEI
// https://www.ncei.noaa.gov/products/world-magnetic-model, WMM2025_TEST_VALUES.txt
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// wmm2025.js is a plain browser script, run it to get its functions
const context = {}
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../MAGFit/wmm2025.js'), 'utf8'), context)

// Decimal year, height above WGS84 ellipsoid (km), geodetic latitude and longitude (deg), X, Y, Z (nT), declination (deg)
const test_values = [
    [2025.0,   0.0,  80.0,   0.0,  6521.6,    145.9,  54791.5,  1.28],
    [2025.0,   0.0,   0.0, 120.0, 39677.8,   -109.6, -10580.2, -0.16],
    [2025.0,   0.0, -80.0, 240.0,  6117.5,  15751.9, -52022.5, 68.78],
    [2025.0, 100.0,  80.0,   0.0,  6216.0,     92.4,  52598.8,  0.85],
    [2025.0, 100.0,   0.0, 120.0, 37688.6,    -96.2, -10152.1, -0.15],
    [2025.0, 100.0, -80.0, 240.0,  5907.6,  14780.3, -49540.7, 68.21],
    [2027.5,   0.0,  80.0,   0.0,  6500.8,    294.5,  54869.4,  2.59],
    [2027.5,   0.0,   0.0, 120.0, 39701.6,   -167.4, -10381.8, -0.24],
    [2027.5,   0.0, -80.0, 240.0,  6200.7,  15730.3, -51783.7, 68.49],
    [2027.5, 100.0,  80.0,   0.0,  6196.7,    233.8,  52670.5,  2.16],
    [2027.5, 100.0,   0.0, 120.0, 37711.5,   -148.7,  -9969.8, -0.23],
    [2027.5, 100.0, -80.0, 240.0,  5984.0,  14760.1, -49317.7, 67.93],
]

for (const [year, height, lat, lon, X, Y, Z, declination] of test_values) {
    test(`WMM2025 at ${year}, ${height} km, ${lat} lat, ${lon} lon`, () => {
        // Field components are given to 0.1 nT, so must round to the same value
        const field = context.wmm_field(lat, lon, height, year)
        assert.ok(Math.abs(field.x - X) <= 0.05, `X ${field.x} expected ${X}`)
        assert.ok(Math.abs(field.y - Y) <= 0.05, `Y ${field.y} expected ${Y}`)
        assert.ok(Math.abs(field.z - Z) <= 0.05, `Z ${field.z} expected ${Z}`)

        // Same values through the function used by MAGFit, which takes meters and returns milligauss
        const expected = context.expected_earth_field(lat, lon, height * 1000, year)
        assert.ok(Math.abs(expected.vector[0] - X * 0.01) <= 0.0005)
        assert.ok(Math.abs(expected.vector[1] - Y * 0.01) <= 0.0005)
        assert.ok(Math.abs(expected.vector[2] - Z * 0.01) <= 0.0005)
        assert.ok(Math.abs(expected.declination - declination) <= 0.005, `declination ${expected.declination} expected ${declination}`)
    })
}

test('decimal year', () => {
    assert.equal(context.decimal_year(new Date(Date.UTC(2025, 0, 1))), 2025)
    assert.equal(context.decimal_year(new Date(Date.UTC(2027, 6, 2, 12))), 2027.5)
})
