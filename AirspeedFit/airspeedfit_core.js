// AirspeedFit numeric core
//
// ArduPilot computes airspeed as:
//     EAS = sqrt(dpress * ARSPD_RATIO)      // equivalent airspeed
//     TAS = EAS * EAS2TAS                    // true airspeed
//
// The wind triangle Vg = Va + W, taken magnitude only, with a horizontal wind
// W = (Wn, We) gives:
//     |Vg - W| = TAS
//
// The airspeed ratio, and a model of the wind over time, are optimized
// iteratively to minimize the residuals of the above equation over a flight
// span.

(function (global) {
'use strict'

// Linear algebra via the ml-matrix library (the same one MAGFit uses): the
// browser global from matrix.umd.js, or required under node.
const mlMatrix = global.mlMatrix || (typeof require !== 'undefined' ? require('../modules/build/matrix/matrix.umd.js') : null)

// Physical constants, matched to ArduPilot (AP_Baro / AP_Math).
const SSL_AIR_DENSITY = 1.225      // kg/m^3, sea-level standard density
const ISA_GAS_CONSTANT = 287.05    // J/(kg.K), specific gas constant for air
const ISA_LAPSE_RATE = 0.0065      // K/m, standard tropospheric lapse rate
const C_TO_KELVIN = 273.15
const ISA_SSL_TEMP_K = 288.15      // 15 C, ISA sea-level temperature
const STANDARD_GRAVITY = 9.80665   // m/s^2

// Default wind random-walk process noise for the smoother (m/s per sqrt(s))
const DEFAULT_Q_WIND = 0.02

// --- physics ---------------------------------------------------------------

// ISA air temperature (deg C) at a geometric altitude (m AMSL)
function isa_temperature_at_alt_c(alt_m) {
    return (ISA_SSL_TEMP_K - C_TO_KELVIN) - ISA_LAPSE_RATE * alt_m
}

// Outside air temperature at altitude from a ground-level temperature:
// T(h) = T_ground - lapse_rate * h, matching AP_Baro::get_EAS2TAS_simple.
function air_temperature_c(ground_temp_c, rel_alt_m, lapse_rate) {
    if (lapse_rate == null) lapse_rate = ISA_LAPSE_RATE
    return ground_temp_c - lapse_rate * rel_alt_m
}

// Equivalent-to-true airspeed scale, sqrt(rho_ssl / rho) with rho = P/(R*T).
// Mirrors AP_Baro::get_EAS2TAS_simple.
function eas2tas(static_pressure_pa, temperature_c) {
    const temp_k = temperature_c + C_TO_KELVIN
    const rho = static_pressure_pa / (ISA_GAS_CONSTANT * temp_k)
    return Math.sqrt(SSL_AIR_DENSITY / rho)
}

// Density altitude (m) implied by an EAS2TAS scale, for reference purposes.
function density_altitude_m(eas2tas) {
    const n = STANDARD_GRAVITY / (ISA_GAS_CONSTANT * ISA_LAPSE_RATE) - 1.0
    const rho_ratio = 1.0 / (eas2tas * eas2tas)
    return (ISA_SSL_TEMP_K / ISA_LAPSE_RATE) * (1.0 - Math.pow(rho_ratio, 1.0 / n))
}

// Heuristic fit window from differential pressure over the flight span. Returns
// {start, end, mean_dp} in the same time units as t: the window runs from the
// first time dpress rises above a quarter of its flight mean to the last time it
// is above it -- the stretch spent above half the mean airspeed (dpress goes as
// speed^2, so a quarter of the mean dpress is half the mean speed). Symmetric.
function auto_window(t, dpress, flight_lo, flight_hi) {
    let sum = 0, n = 0
    for (let i = 0; i < t.length; i++) {
        if (t[i] < flight_lo || t[i] > flight_hi) continue
        sum += dpress[i]
        n++
    }
    if (n === 0) throw new Error("no differential-pressure samples within the flight span")
    const mean_dp = sum / n
    const threshold = 0.25 * mean_dp   // quarter of mean dpress = half the mean airspeed

    let i0 = -1, i1 = -1
    for (let i = 0; i < t.length; i++) {
        if (t[i] < flight_lo || t[i] > flight_hi) continue
        if (dpress[i] > threshold) {
            if (i0 < 0) i0 = i
            i1 = i
        }
    }
    if (i0 < 0) throw new Error("DiffPress never exceeds a quarter of its flight mean")
    return { start: t[i0], end: t[i1], mean_dp }
}

// --- constant-wind batch solve ---------------------------------------------

// Angular spread (deg) of horizontal ground-course directions (circular std).
function course_spread_deg(vn, ve) {
    let sc = 0, ss = 0
    const n = vn.length
    for (let i = 0; i < n; i++) {
        const ang = Math.atan2(ve[i], vn[i])
        sc += Math.cos(ang)
        ss += Math.sin(ang)
    }
    let r = Math.hypot(sc / n, ss / n)
    r = Math.min(Math.max(r, 1e-9), 1.0)
    const circ_std = Math.sqrt(-2.0 * Math.log(r))
    return circ_std * 180 / Math.PI
}

// Gauss-Newton refine on residual r = |Vg - W| - k*u over params [Wn, We, k].
// Returns {Wn, We, k, residual_rms, cov} (cov is 3x3).
function refine(vn, ve, vd, u, Wn, We, k, iters, tol) {
    if (iters == null) iters = 20
    if (tol == null) tol = 1e-9
    const n = u.length
    let p = [Wn, We, k]
    for (let it = 0; it < iters; it++) {
        const JtJ = [[0,0,0],[0,0,0],[0,0,0]]
        const Jtr = [0,0,0]
        for (let i = 0; i < n; i++) {
            const dn = vn[i] - p[0], de = ve[i] - p[1]
            let D = Math.sqrt(dn*dn + de*de + vd[i]*vd[i])
            if (D < 1e-6) D = 1e-6
            const ri = D - p[2]*u[i]
            const j0 = -dn/D, j1 = -de/D, j2 = -u[i]
            const J = [j0, j1, j2]
            for (let a = 0; a < 3; a++) {
                Jtr[a] += J[a]*ri
                for (let b = 0; b < 3; b++) JtJ[a][b] += J[a]*J[b]
            }
        }
        let step
        try { step = mlMatrix.solve(new mlMatrix.Matrix(JtJ), mlMatrix.Matrix.columnVector(Jtr)).to1DArray() }
        catch (e) { break }   // singular normal equations
        p = [p[0]-step[0], p[1]-step[1], p[2]-step[2]]
        if (Math.hypot(step[0], step[1], step[2]) < tol) break
    }
    // final residuals + covariance
    let rss = 0
    const JtJ = [[0,0,0],[0,0,0],[0,0,0]]
    for (let i = 0; i < n; i++) {
        const dn = vn[i] - p[0], de = ve[i] - p[1]
        let D = Math.sqrt(dn*dn + de*de + vd[i]*vd[i])
        if (D < 1e-6) D = 1e-6
        const ri = D - p[2]*u[i]
        rss += ri*ri
        const J = [-dn/D, -de/D, -u[i]]
        for (let a = 0; a < 3; a++)
            for (let b = 0; b < 3; b++) JtJ[a][b] += J[a]*J[b]
    }
    const dof = Math.max(n - 3, 1)
    const sigma2 = rss / dof
    let cov = [[NaN,NaN,NaN],[NaN,NaN,NaN],[NaN,NaN,NaN]]
    try { cov = mlMatrix.inverse(new mlMatrix.Matrix(JtJ)).to2DArray().map((row) => row.map((v) => v * sigma2)) }
    catch (e) { /* singular JtJ -> covariance stays NaN */ }
    return { Wn: p[0], We: p[1], k: p[2], residual_rms: Math.sqrt(rss / n), cov }
}

// Constant-wind calibration from aligned per-sample arrays. A Gauss-Newton fit
// on the un-squared (m/s) residual |Vg - W| - k*u solves for the wind and the
// scale k = sqrt(ratio) directly. It is seeded from zero wind with k0 = the
// wind-free ratio estimate mean(|Vg|/u); because a returning aircraft always has
// wind < airspeed, the objective is unimodal and this start reaches the global
// optimum (no algebraic pre-solve is needed to avoid local minima).
function calibrate(vn, ve, vd, u, opts) {
    opts = opts || {}
    const spread_warn = opts.course_spread_warn_deg != null ? opts.course_spread_warn_deg : 10.0
    const stderr_frac_warn = opts.ratio_stderr_frac_warn != null ? opts.ratio_stderr_frac_warn : 0.1
    const n = u.length
    if (n < 4) throw new Error(`need at least 4 samples to solve, got ${n}`)

    // Seed from zero wind with k0 = mean(|Vg| / u) (the scale implied if there were
    // no wind), then fit the wind and scale together by Gauss-Newton.
    let k0sum = 0
    for (let i = 0; i < n; i++) k0sum += Math.sqrt(vn[i]*vn[i] + ve[i]*ve[i] + vd[i]*vd[i]) / u[i]
    const rf = refine(vn, ve, vd, u, 0, 0, k0sum / n)
    const Wn = rf.Wn, We = rf.We, k = rf.k, m = k*k
    const residual_rms = rf.residual_rms

    const var_k = rf.cov[2][2]
    const ratio_stderr = isFinite(var_k) ? 2.0 * k * Math.sqrt(var_k) : NaN   // d(k^2) = 2k dk

    const warnings = []
    if (!(k > 0)) {
        warnings.push(`fit gave a non-positive ratio (${m.toFixed(3)}); geometry is likely under-excited or the data is bad`)
    }

    // Observability: wind and ratio separate only when the ground-course direction
    // varies enough. The ratio's own standard error (from the fit covariance) is the
    // direct measure -- it grows when they are weakly separated, and a degenerate
    // geometry gives a singular covariance, hence a non-finite stderr.
    const spread = course_spread_deg(vn, ve)
    const stderr_frac = (isFinite(ratio_stderr) && m > 0) ? ratio_stderr / m : Infinity
    if (spread <= spread_warn) {
        warnings.push(`little course variation (${spread.toFixed(0)} deg); window may not contain enough turning to observe wind`)
    }
    if (stderr_frac >= stderr_frac_warn) {
        warnings.push(`ratio weakly determined (+/-${(100*stderr_frac).toFixed(0)}%); wind and ratio are weakly separated -- fly turns / vary speed`)
    }

    return {
        ratio: m, k, ratio_stderr,
        wind_ne: [Wn, We],
        residual_rms, n_samples: n,
        course_spread_deg: spread, warnings,
    }
}

// --- time-varying-wind smoother (alternating wind <-> scale) ---------------
//
// The airspeed scale k and the wind are estimated by alternating minimization
// rather than jointly, so that k cannot be co-opted by a heading-locked wind at
// high process noise:
//   1. hold k fixed, smooth the wind (a 2-state [Wn, We] EKF + RTS smoother);
//   2. hold the wind fixed, solve k by least squares  k = sum(D*u)/sum(u^2);
//   repeat to convergence (typically 2-4 iterations).
// Because k is anchored by a global least-squares fit to the wind-implied true
// airspeed, once the wind has absorbed the residual the scale step is a fixed
// point -- so the ratio stays robust across the whole q range, while the wind
// is still free to drift and track real weather changes.

// 2-state wind-only EKF forward filter + RTS smoother with the scale k held fixed.
// State x = [Wn, We]; wind random-walks with process noise q_wind. Scalar
// measurement per sample: |Vg - W| - k*u = 0. Returns {xs, Ps} smoothed means
// (n x 2) and covariances (n x 2x2).
function wind_smoother(dt, vn, ve, vd, u, k, q_wind, r_meas, x0, P0, iters) {
    if (iters == null) iters = 6
    const n = u.length
    const R = r_meas * r_meas
    const qd = q_wind * q_wind * dt

    let xbar = []
    for (let t = 0; t < n; t++) xbar.push([x0[0], x0[1]])

    let xs = xbar.map((x) => x.slice())
    let Ps = xbar.map(() => [[P0[0][0],P0[0][1]],[P0[1][0],P0[1][1]]])

    for (let iter = 0; iter < iters; iter++) {
        const m_f = new Array(n), P_f = new Array(n)
        const m_p = new Array(n), P_p = new Array(n)
        for (let t = 0; t < n; t++) {
            let mp, Pp
            if (t === 0) {
                mp = [x0[0], x0[1]]
                Pp = [[P0[0][0],P0[0][1]],[P0[1][0],P0[1][1]]]
            } else {
                mp = m_f[t-1].slice()                                  // F = I
                Pp = [[P_f[t-1][0][0]+qd, P_f[t-1][0][1]], [P_f[t-1][1][0], P_f[t-1][1][1]+qd]]
            }
            m_p[t] = mp; P_p[t] = Pp

            const Wb = xbar[t][0], Eb = xbar[t][1]
            let Db = Math.sqrt((vn[t]-Wb)**2 + (ve[t]-Eb)**2 + vd[t]**2)
            if (Db <= 1e-6) Db = 1e-6
            const H = [-(vn[t]-Wb)/Db, -(ve[t]-Eb)/Db]
            const hb = Db - k*u[t]
            // innovation about xbar, measurement z = 0
            const dm = [mp[0]-Wb, mp[1]-Eb]
            const innov = -(hb + H[0]*dm[0] + H[1]*dm[1])
            // S = H Pp H^T + R
            const PpH = [Pp[0][0]*H[0]+Pp[0][1]*H[1], Pp[1][0]*H[0]+Pp[1][1]*H[1]]
            const S = H[0]*PpH[0] + H[1]*PpH[1] + R
            const K = [PpH[0]/S, PpH[1]/S]
            m_f[t] = [mp[0]+K[0]*innov, mp[1]+K[1]*innov]
            // Joseph form: A = I - K H ; P_f = A Pp A^T + K K^T R
            const A = [[1-K[0]*H[0], -K[0]*H[1]], [-K[1]*H[0], 1-K[1]*H[1]]]
            const AP = [
                [A[0][0]*Pp[0][0]+A[0][1]*Pp[1][0], A[0][0]*Pp[0][1]+A[0][1]*Pp[1][1]],
                [A[1][0]*Pp[0][0]+A[1][1]*Pp[1][0], A[1][0]*Pp[0][1]+A[1][1]*Pp[1][1]],
            ]
            const Pft = [
                [AP[0][0]*A[0][0]+AP[0][1]*A[0][1], AP[0][0]*A[1][0]+AP[0][1]*A[1][1]],
                [AP[1][0]*A[0][0]+AP[1][1]*A[0][1], AP[1][0]*A[1][0]+AP[1][1]*A[1][1]],
            ]
            Pft[0][0] += K[0]*K[0]*R; Pft[0][1] += K[0]*K[1]*R
            Pft[1][0] += K[1]*K[0]*R; Pft[1][1] += K[1]*K[1]*R
            P_f[t] = Pft
        }

        // RTS backward smoother (F = I)
        xs[n-1] = m_f[n-1].slice()
        Ps[n-1] = [[P_f[n-1][0][0],P_f[n-1][0][1]],[P_f[n-1][1][0],P_f[n-1][1][1]]]
        for (let t = n-2; t >= 0; t--) {
            const Pn = P_p[t+1]
            const det = Pn[0][0]*Pn[1][1] - Pn[0][1]*Pn[1][0]
            if (Math.abs(det) < 1e-300) { xs[t] = m_f[t].slice(); Ps[t] = P_f[t].map((r)=>r.slice()); continue }
            const inv = [[Pn[1][1]/det, -Pn[0][1]/det], [-Pn[1][0]/det, Pn[0][0]/det]]
            const C = [
                [P_f[t][0][0]*inv[0][0]+P_f[t][0][1]*inv[1][0], P_f[t][0][0]*inv[0][1]+P_f[t][0][1]*inv[1][1]],
                [P_f[t][1][0]*inv[0][0]+P_f[t][1][1]*inv[1][0], P_f[t][1][0]*inv[0][1]+P_f[t][1][1]*inv[1][1]],
            ]
            const dx = [xs[t+1][0]-m_p[t+1][0], xs[t+1][1]-m_p[t+1][1]]
            xs[t] = [m_f[t][0]+C[0][0]*dx[0]+C[0][1]*dx[1], m_f[t][1]+C[1][0]*dx[0]+C[1][1]*dx[1]]
            const dP = [
                [Ps[t+1][0][0]-Pn[0][0], Ps[t+1][0][1]-Pn[0][1]],
                [Ps[t+1][1][0]-Pn[1][0], Ps[t+1][1][1]-Pn[1][1]],
            ]
            const CdP = [
                [C[0][0]*dP[0][0]+C[0][1]*dP[1][0], C[0][0]*dP[0][1]+C[0][1]*dP[1][1]],
                [C[1][0]*dP[0][0]+C[1][1]*dP[1][0], C[1][0]*dP[0][1]+C[1][1]*dP[1][1]],
            ]
            const Pst = [
                [CdP[0][0]*C[0][0]+CdP[0][1]*C[0][1], CdP[0][0]*C[1][0]+CdP[0][1]*C[1][1]],
                [CdP[1][0]*C[0][0]+CdP[1][1]*C[0][1], CdP[1][0]*C[1][0]+CdP[1][1]*C[1][1]],
            ]
            Pst[0][0] += P_f[t][0][0]; Pst[0][1] += P_f[t][0][1]
            Pst[1][0] += P_f[t][1][0]; Pst[1][1] += P_f[t][1][1]
            Ps[t] = Pst
        }

        xbar = xs.map((x) => x.slice())
    }
    return { xs, Ps }
}

// Combined multi-sensor solve: a single wind model drives all airspeed sensors.
// The per-sample airspeed that drives the wind is the equal-weight average of the
// sensors' calibrated true airspeeds, mean_s(k_s * u_s); each sensor keeps its own
// scale k_s, re-solved by least squares against the common |Vg - W|.
// The alternating scheme is the same as the single-sensor case (wind smoother
// with the airspeeds fixed, then scale fits with the wind fixed), so the ratios
// stay robust to the wind process noise. A single sensor is just u_list of
// length 1. All arrays are on one common time grid (built by the caller).
//   u_list : array of per-sensor ratio=1 airspeed arrays (all same length as t)
//   seeds  : array of per-sensor constant-wind CalResults (for init k and wind)
function calibrate_combined(t, vn, ve, vd, u_list, seeds, opts) {
    opts = opts || {}
    const target_rate_hz = opts.target_rate_hz != null ? opts.target_rate_hz : 2.0
    const max_samples = opts.max_samples != null ? opts.max_samples : 8000
    const wind_iters = opts.iters != null ? opts.iters : 5      // inner smoother relinearizations
    const max_outer = opts.max_outer != null ? opts.max_outer : 6   // alternating rounds
    const tol = opts.tol != null ? opts.tol : 1e-4
    const S = u_list.length

    // median dt + decimation (wind is slow)
    const n0 = t.length
    let dt_full = 1.0
    if (n0 > 1) {
        const diffs = new Array(n0 - 1)
        for (let i = 1; i < n0; i++) diffs[i-1] = t[i] - t[i-1]
        diffs.sort((a, b) => a - b)
        dt_full = diffs[diffs.length >> 1]
    }
    if (!isFinite(dt_full) || dt_full <= 0) dt_full = 1.0
    let stride = Math.max(1, Math.round((1.0/target_rate_hz)/dt_full))
    stride = Math.max(stride, Math.ceil(n0 / max_samples))

    const T = [], VN = [], VE = [], VD = []
    const US = []
    for (let s = 0; s < S; s++) US.push([])
    for (let i = 0; i < n0; i += stride) {
        T.push(t[i]); VN.push(vn[i]); VE.push(ve[i]); VD.push(vd[i])
        for (let s = 0; s < S; s++) {
            US[s].push(u_list[s][i])
        }
    }
    const n = T.length
    const dt = dt_full * stride

    // measurement noise + wind seed from the per-sensor constant-wind solves
    let rsum = 0, wn0 = 0, we0 = 0
    for (const sd of seeds) {
        rsum += isFinite(sd.residual_rms) ? sd.residual_rms : 1.0
        wn0 += sd.wind_ne[0]; we0 += sd.wind_ne[1]
    }
    let r_meas = opts.r_meas
    if (r_meas == null) r_meas = Math.max(rsum / S, 0.3)
    let q_wind = opts.q_wind
    if (q_wind == null) q_wind = DEFAULT_Q_WIND

    const x0 = [wn0 / S, we0 / S]
    const P0 = [[25.0, 0], [0, 25.0]]

    // Alternating: smooth the wind against the averaged airspeed, then re-solve
    // every sensor's scale against that wind.
    let k = seeds.map((sd) => isFinite(sd.k) ? sd.k : 1.3)
    let xs, Ps
    let iterations = 0
    const avgTAS = new Array(n)
    for (iterations = 1; iterations <= max_outer; iterations++) {
        for (let i = 0; i < n; i++) {
            let s_tas = 0
            for (let s = 0; s < S; s++) s_tas += k[s] * US[s][i]
            avgTAS[i] = s_tas / S
        }
        // wind smoother with the (per-sample) target airspeed avgTAS: pass it as
        // u with a unit scale so the measurement is |Vg - W| - avgTAS = 0.
        const res = wind_smoother(dt, VN, VE, VD, avgTAS, 1.0, q_wind, r_meas, x0, P0, wind_iters)
        xs = res.xs; Ps = res.Ps
        let maxdelta = 0
        for (let s = 0; s < S; s++) {
            let num = 0, den = 0
            for (let i = 0; i < n; i++) {
                const dn = VN[i]-xs[i][0], de = VE[i]-xs[i][1]
                const D = Math.sqrt(dn*dn + de*de + VD[i]*VD[i])
                num += D*US[s][i]; den += US[s][i]*US[s][i]
            }
            const knew = num/den
            maxdelta = Math.max(maxdelta, Math.abs(knew - k[s]))
            k[s] = knew
        }
        if (maxdelta < tol) break
    }
    iterations = Math.min(iterations, max_outer)

    // wind trajectory
    const wind_ne = xs.map((x) => [x[0], x[1]])
    const wind_sigma = Ps.map((P) => [Math.sqrt(Math.max(P[0][0], 0)), Math.sqrt(Math.max(P[1][1], 0))])
    let mwn = 0, mwe = 0
    for (const w of wind_ne) { mwn += w[0]; mwe += w[1] }
    mwn /= n; mwe /= n
    let wind_drift = 0
    for (const w of wind_ne) { const d = Math.hypot(w[0]-mwn, w[1]-mwe); if (d > wind_drift) wind_drift = d }

    // shared |Vg - W|
    const D = new Array(n)
    for (let i = 0; i < n; i++) D[i] = Math.sqrt((VN[i]-wind_ne[i][0])**2 + (VE[i]-wind_ne[i][1])**2 + VD[i]**2)

    // per-sensor scale, residual, and plot series
    const per_sensor = []
    for (let s = 0; s < S; s++) {
        let rss = 0, den = 0
        const pred = new Array(n), resid = new Array(n)
        for (let i = 0; i < n; i++) {
            pred[i] = k[s]*US[s][i]
            resid[i] = D[i] - pred[i]
            rss += resid[i]*resid[i]
            den += US[s][i]*US[s][i]
        }
        const dof = Math.max(n-1, 1)
        const var_k = (rss/dof)/den
        per_sensor.push({
            k: k[s], ratio: k[s]*k[s], ratio_stderr: 2.0*k[s]*Math.sqrt(var_k),
            residual_rms: Math.sqrt(rss/n), u: US[s], pred, resid,
        })
    }

    return {
        t: T, wind_ne, wind_sigma, wind_drift, r_meas, iterations,
        D, per_sensor, n_samples: n,
    }
}

const api = {
    SSL_AIR_DENSITY, ISA_GAS_CONSTANT, ISA_LAPSE_RATE, DEFAULT_Q_WIND,
    isa_temperature_at_alt_c, air_temperature_c, eas2tas, density_altitude_m, auto_window,
    refine, calibrate, wind_smoother,
    calibrate_combined, course_spread_deg,
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
} else {
    for (const key of Object.keys(api)) global[key] = api[key]
}

})(typeof globalThis !== 'undefined' ? globalThis : this)
