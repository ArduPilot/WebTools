// AirspeedFit tool for log-based airspeed ratio (ARSPD_RATIO) calibration.
//
// The numeric estimators live in airspeedfit_core.js. This file is the log
// adapter and UI glue.

var DataflashParser
const import_done = import('../modules/JsDataflashParser/parser.js').then((mod) => { DataflashParser = mod.default });

const US2S = 1 / 1000000
function TimeUS_to_seconds(TimeUS) {
    return array_scale(Array.from(TimeUS), US2S)
}

// Slider maps to log10(q); keep in sync with index.html range min/max.
function slider_to_q(v) { return Math.pow(10, parseFloat(v)) }

// Airspeed sensor colors: sensor 1 blue, sensor 2+ progressively lighter blue
// so they can be told apart on the Flight Data plot.
const airspeed_colors = ["#1f77b4", "#6baed6", "#9ecae1", "#c6dbef"]
function airspeed_color(i) { return airspeed_colors[Math.min(i, airspeed_colors.length - 1)] }
var flight_data = {}

// -------------------------------------------------------------------------
// Flight data plot (top): airspeed per sensor, ground speed, altitude
// -------------------------------------------------------------------------
function setup_plots() {

    document.title = "ArduPilot AirspeedFit"

    document.getElementById("calculate").disabled = true
    document.getElementById("SaveParams").disabled = true

    const time_scale_label = "Time (s)"

    flight_data.data = []
    flight_data.layout = {
        xaxis: { title: { text: time_scale_label },
                 domain: [0.07, 0.93],
                 type: "linear",
                 zeroline: false,
                 showline: true,
                 mirror: true,
                 rangeslider: {} },
        yaxis:  { title: { text: "Airspeed (m/s)" },     zeroline: false, showline: true, mirror: true, side: "left",  position: 0,    color: airspeed_colors[0] },
        yaxis2: { title: { text: "Ground speed (m/s)" }, zeroline: false, showline: true, mirror: true, side: "left",  position: 0.06, color: plot_default_color(2), overlaying: 'y' },
        yaxis3: { title: { text: "Altitude (m)" },       zeroline: false, showline: true, mirror: true, side: "right", position: 1,    color: plot_default_color(3), overlaying: 'y' },
        yaxis4: { title: { text: "Roll (deg)" },         zeroline: false, showline: true, mirror: true, side: "right", position: 0.94, color: plot_default_color(4), overlaying: 'y' },
        showlegend: true,
        legend: { itemclick: false, itemdoubleclick: false },
        margin: { b: 50, l: 50, r: 50, t: 20 },
    }

    let plot = document.getElementById("FlightData")
    Plotly.purge(plot)
    Plotly.newPlot(plot, flight_data.data, flight_data.layout, { displaylogo: false })
    attach_flight_data_relayout()
}

// Attach the range-selection listener that mirrors a zoom on the Flight Data
// plot into the analysis time inputs (and enables Calculate). Plotly.newPlot
// drops existing listeners, so this must be re-called after every newPlot of
// the FlightData plot.
function attach_flight_data_relayout() {
    const el = document.getElementById("FlightData")
    el.removeAllListeners("plotly_relayout")
    el.on('plotly_relayout', function (data) {
        function range_update(range) {
            document.getElementById("TimeStart").value = Math.floor(range[0])
            document.getElementById("TimeEnd").value = Math.ceil(range[1])
            if (ASP_Data != null) {
                set_need_calc(true)
            }
            update_temp_debug()
        }

        if (data['xaxis.range'] !== undefined) {
            range_update(data['xaxis.range'])
            return
        }
        if ((data['xaxis.range[0]'] !== undefined) && (data['xaxis.range[1]'] !== undefined)) {
            range_update([data['xaxis.range[0]'], data['xaxis.range[1]']])
            return
        }
        if ((data['xaxis.autorange'] !== undefined) && (data['xaxis.autorange'] == true) && (log_data != null)) {
            range_update([log_data.start_time, log_data.end_time])
        }
    })
}

// Enable/disable calculate and save params buttons
function set_need_calc(b) {
    document.getElementById('calculate').disabled = !b
    document.getElementById('SaveParams').disabled = b
    // Hide the now out-of-date results while a recalculation is pending, so no
    // stale plots or ratios are on screen. calculate() reveals them again.
    set_results_shown(!b)
}

// Show or hide the whole results region (all result plots + the suggested
// parameters + Save). Everything in it is derived from the last calculate().
// While it is hidden, a "hit Calculate" prompt takes its place.
function set_results_shown(shown) {
    const r = document.getElementById("results")
    if (r != null) r.style.display = shown ? "" : "none"
    const m = document.getElementById("results_msg")
    if (m != null) m.style.display = shown ? "none" : ""
}
function recalc_needed() {
    if (ASP_Data != null) {
        set_need_calc(true)
    }
}

// The temperature is always a single ground-level value lapsed to altitude; the
// dropdown just fills the box from a preset source (Open-Meteo / ISA / etc.).
function temp_source_changed() {
    const key = document.getElementById("temp_source").value
    const src = (log_data != null && log_data.temp_sources != null) ? log_data.temp_sources : {}
    if (key !== "custom" && src[key] != null) {
        document.getElementById("ground_temp").value = src[key].value.toFixed(0)
    }
    update_temp_debug()
    recalc_needed()
}

// A hand edit of the box no longer matches any preset, so mark the source Custom.
function ground_temp_edited() {
    document.getElementById("temp_source").value = "custom"
    update_temp_debug()
    recalc_needed()
}

// Mean of values whose timestamps fall in [t0, t1], falling back to the overall
// mean if the window is empty. Reads raw log arrays, so it is cheap enough to
// call on every window/temperature change without a full recalculation.
function window_mean(values, times, t0, t1) {
    let s = 0, n = 0
    for (let i = 0; i < values.length; i++) {
        if (times[i] < t0 || times[i] > t1) continue
        s += values[i]; n++
    }
    if (n == 0) {
        for (let i = 0; i < values.length; i++) s += values[i]
        n = values.length
    }
    return n > 0 ? s / n : NaN
}

// Live readout under the air-temperature controls: field elevation, the field
// density altitude, and the average EAS2TAS over the selected window. All three
// are computed from raw-log aggregates (window means), independent of the fit, so
// they update immediately on any window/temperature change with no recalculation.
// The Avg EAS2TAS uses the window-mean pressure and window-mean altitude rather
// than averaging the per-sample EAS2TAS, so it needs no interpolated grid.
function update_temp_debug() {
    const el = document.getElementById("temp_debug")
    if (el == null) return
    if (log_data == null) { el.innerHTML = ""; return }

    const ground_temp = get_ground_temp()
    const fe = log_data.field_elevation

    // field density altitude (field pressure + the ground temperature)
    let da = null
    if (fe != null && log_data.field_time != null) {
        const p_field = linear_interp(log_data.baro.press, log_data.baro.time, [log_data.field_time])[0]
        da = density_altitude_m(eas2tas(p_field, ground_temp))
    }

    // average EAS2TAS over the window, from window-mean pressure and temperature
    const t0 = parseFloat(document.getElementById("TimeStart").value)
    const t1 = parseFloat(document.getElementById("TimeEnd").value)
    const mean_p = window_mean(log_data.baro.press, log_data.baro.time, t0, t1)
    const mean_t = air_temperature_c(ground_temp, window_mean(log_data.pos.rel_alt, log_data.pos.time, t0, t1))
    const e2t = eas2tas(mean_p, mean_t)
    const pct = isFinite(e2t) ? (e2t - 1) * 100 : null

    el.innerHTML =
        "Field elevation: " + (fe != null ? fe.toFixed(0) + " m" : "n/a") + "<br>" +
        "Density altitude: " + (da != null && isFinite(da) ? da.toFixed(0) + " m" : "n/a") + "<br>" +
        "Avg EAS2TAS: " + (pct != null ? (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%" : "n/a")
}

function time_range_changed() {
    flight_data.layout.xaxis.range = [ parseFloat(document.getElementById("TimeStart").value),
                                       parseFloat(document.getElementById("TimeEnd").value)]
    flight_data.layout.xaxis.autorange = false
    Plotly.redraw("FlightData")
    set_need_calc(true)
    update_temp_debug()
}

// Window index helpers (as in MAGFit)
function find_start_index(time) {
    const start_time = parseFloat(document.getElementById("TimeStart").value)
    let start_index = 0
    for (let j = 0; j < time.length; j++) {
        if (time[j] < start_time) {
            start_index = j
        }
    }
    return start_index
}
function find_end_index(time) {
    const end_time = parseFloat(document.getElementById("TimeEnd").value)
    let end_index = 0
    for (let j = 0; j < time.length - 1; j++) {
        if (time[j] <= end_time) {
            end_index = j + 1
        }
    }
    return end_index
}

// -------------------------------------------------------------------------
// Velocity sources (EKF cores)
// -------------------------------------------------------------------------
var velocity_source
function get_velocity_sources(log) {
    const sources = []
    const variants = [ { p1: "XKF1", p2: "XKF2", label: "EKF3" },
                       { p1: "NKF1", p2: "NKF2", label: "EKF2" } ]
    for (const v of variants) {
        if (!(v.p1 in log.messageTypes) || !("instances" in log.messageTypes[v.p1])) {
            continue
        }
        for (const core_key of Object.keys(log.messageTypes[v.p1].instances)) {
            const core = Number(core_key)
            const time = TimeUS_to_seconds(log.get_instance(v.p1, core, "TimeUS"))
            if (time == null || time.length == 0) {
                continue
            }
            const roll = log.get_instance(v.p1, core, "Roll")
            const pitch = log.get_instance(v.p1, core, "Pitch")
            const yaw = log.get_instance(v.p1, core, "Yaw")
            const source = {
                name: v.label + " core " + core,
                time,
                vn: Array.from(log.get_instance(v.p1, core, "VN")),
                ve: Array.from(log.get_instance(v.p1, core, "VE")),
                vd: Array.from(log.get_instance(v.p1, core, "VD")),
                roll: roll != null ? Array.from(roll) : null,
                pitch: pitch != null ? Array.from(pitch) : null,
                yaw: yaw != null ? Array.from(yaw) : null,
                wind: null,
                select: null,
            }
            if ((v.p2 in log.messageTypes) && ("instances" in log.messageTypes[v.p2]) &&
                (core in log.messageTypes[v.p2].instances)) {
                source.wind = {
                    time: TimeUS_to_seconds(log.get_instance(v.p2, core, "TimeUS")),
                    n: Array.from(log.get_instance(v.p2, core, "VWN")),
                    e: Array.from(log.get_instance(v.p2, core, "VWE")),
                }
            }
            sources.push(source)
        }
    }
    return sources
}

function add_velocity_source(source, checked) {
    let section = document.getElementById("VELOCITY")

    let radio = document.createElement("input")
    radio.setAttribute('type', 'radio')
    radio.setAttribute('id', "VEL" + source.name)
    radio.setAttribute('name', "velocity_source")
    radio.checked = checked === true
    radio.addEventListener('change', function () {
        set_need_calc(true)
    })

    let label = document.createElement("label")
    label.setAttribute('for', "VEL" + source.name)
    label.innerHTML = source.name

    section.appendChild(radio)
    section.appendChild(label)
    section.appendChild(document.createElement("br"))

    source.select = radio
}

function select_velocity_source() {
    velocity_source = null
    for (const s of log_data.sources) {
        if (s.select.checked) {
            velocity_source = s
        }
    }
    if (velocity_source == null) {
        alert("No velocity source selected")
        throw new Error()
    }
}

// -------------------------------------------------------------------------
// Air temperature sources (ISA / BARO.GndTemp / METAR / Open-Meteo)
// -------------------------------------------------------------------------

// BARO.GndTemp at takeoff (deg C), or null. Reference only: it is notoriously
// wrong when the autopilot's IMU heaters warm the baro, but some operators
// deliberately set BARO_GND_TEMP to record the day's outside air temperature as a
// note to their future selves, so it is offered as a pick (never a default).
function baro_gnd_temp_at(log, t_seconds) {
    if (t_seconds == null || !("BARO" in log.messageTypes)) return null
    const insts = log.messageTypes.BARO.instances
    if (insts == null) return null
    const inst = (0 in insts) ? 0 : Number(Object.keys(insts)[0])
    let gt
    try { gt = log.get_instance("BARO", inst, "GndTemp") } catch (e) { return null }
    if (gt == null || gt.length == 0) return null
    const time = TimeUS_to_seconds(log.get_instance("BARO", inst, "TimeUS"))
    const v = linear_interp(Array.from(gt), time, [t_seconds])[0]
    return isFinite(v) ? v : null
}

// Carbonix-specific behaviour, sneaked harmlessly into upstream: our GCS sends
// a statustext to the aircraft with the nearest airfield's METAR as "WX:..."
// status text (split into "WX1:", "WX2:", ... when it is long). Parse the air
// temperature out of the METAR "TT/DD" temperature/dewpoint group. The METAR
// source only appears when such a message is present in the log, so it stays
// invisible to every other operator.
const WX_TEMP_RE = /GCS:WX.*[^0-9A-Za-z](M?\d\d)\/M?\d\d/
function metar_temp_from_msg(log, t_seconds) {
    if (!("MSG" in log.messageTypes)) return null
    const msgs = log.get("MSG", "Message")
    if (msgs == null || msgs.length == 0) return null
    const times = log.get("MSG", "TimeUS")
    let best = null, bestDiff = Infinity
    for (let i = 0; i < msgs.length; i++) {
        if (msgs[i] == null) continue
        const m = WX_TEMP_RE.exec(msgs[i])
        if (m == null) continue
        const g = m[1]
        const val = (g[0] === "M") ? -parseInt(g.slice(1), 10) : parseInt(g, 10)
        if (!isFinite(val)) continue
        const tt = (times != null && times[i] != null) ? times[i] * US2S : (t_seconds || 0)
        const diff = (t_seconds != null) ? Math.abs(tt - t_seconds) : 0
        if (diff < bestDiff) { bestDiff = diff; best = val }
    }
    return best
}

// Preset temperature sources for the ground-temp box, each { label, value } in
// deg C. Open-Meteo is added later by fill_weather_temp() once its network lookup
// returns. Sources with no data are simply omitted.
function build_temp_sources(log) {
    const src = {}
    const fe = log_data.field_elevation
    if (fe != null) src.isa = { label: "ISA", value: isa_temperature_at_alt_c(fe) }
    const gt = baro_gnd_temp_at(log, log_data.field_time)
    if (gt != null) src.baro = { label: "BARO.GndTemp", value: gt }
    const metar = metar_temp_from_msg(log, log_data.field_time)
    if (metar != null) src.metar = { label: "METAR", value: metar }
    return src
}

// Rebuild the source dropdown from the available presets (in preference order),
// select `key` (falling back to the first available, else Custom), and fill the
// box from the chosen source.
function set_temp_select(key) {
    const sel = document.getElementById("temp_source")
    const src = (log_data != null && log_data.temp_sources != null) ? log_data.temp_sources : {}
    sel.replaceChildren()
    let first = null
    for (const k of ["openmeteo", "isa", "baro", "metar"]) {
        if (src[k] == null) continue
        if (first == null) first = k
        const o = document.createElement("option")
        o.value = k
        o.textContent = src[k].label + " (" + src[k].value.toFixed(0) + " °C)"
        sel.appendChild(o)
    }
    const oc = document.createElement("option")
    oc.value = "custom"; oc.textContent = "Custom"
    sel.appendChild(oc)

    const chosen = (key != null && src[key] != null) ? key : first
    if (chosen != null) {
        sel.value = chosen
        document.getElementById("ground_temp").value = src[chosen].value.toFixed(0)
    } else {
        sel.value = "custom"
    }
}

// 2 m air temperature (deg C) at a location and UTC time from Open-Meteo.
// Returns null on any failure (offline, no data, etc.) so the caller can fall
// back to ISA. Endpoint is picked by recency: the forecast API's `past_days`
// carries the last few months right up to now (so a just-landed flight still
// resolves, avoiding the archive's ~1-day current-day cutoff and any timezone
// gap), while the historical reanalysis archive covers everything older.
async function fetch_ground_temp(lat, lng, when) {
    const base = "latitude=" + lat.toFixed(4) + "&longitude=" + lng.toFixed(4)
        + "&hourly=temperature_2m&temperature_unit=celsius&timezone=GMT"
    const days_ago = (Date.now() - when.getTime()) / 86400000
    let url
    if (days_ago <= 90) {
        // Recent (or same-day / slightly future): forecast API, past_days max 92.
        const past = Math.min(92, Math.max(1, Math.ceil(days_ago) + 1))
        url = "https://api.open-meteo.com/v1/forecast?" + base + "&past_days=" + past + "&forecast_days=1"
    } else {
        // Older: historical reanalysis archive for the takeoff date.
        const day = when.toISOString().slice(0, 10)   // UTC date YYYY-MM-DD
        url = "https://archive-api.open-meteo.com/v1/archive?" + base + "&start_date=" + day + "&end_date=" + day
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    try {
        const resp = await fetch(url, { signal: ctrl.signal })
        if (!resp.ok) return null
        const j = await resp.json()
        const times = j && j.hourly && j.hourly.time
        const temps = j && j.hourly && j.hourly.temperature_2m
        if (times == null || temps == null || temps.length == 0) return null
        // nearest logged hour to the takeoff time (times are GMT, e.g. "2024-07-08T14:00")
        const target = when.getTime()
        let best = -1, bestDiff = Infinity
        for (let i = 0; i < times.length; i++) {
            if (temps[i] == null) continue
            const d = Math.abs(Date.parse(times[i] + ":00Z") - target)
            if (d < bestDiff) { bestDiff = d; best = i }
        }
        const t = (best >= 0) ? temps[best] : null
        return (typeof t === "number" && isFinite(t)) ? t : null
    } catch (e) {
        console.warn("weather lookup failed: " + e)
        return null
    } finally {
        clearTimeout(timer)
    }
}

// Look up the Open-Meteo weather temperature at the takeoff location and time,
// add it as a source, and select it so it becomes the default when available; on
// any failure the previously-selected source (ISA) simply stays. Returns true if
// it updated the temperature (so the caller can recalculate).
async function fill_weather_temp() {
    if (log_data == null || log_data.takeoff == null) return false
    const oat = await fetch_ground_temp(log_data.takeoff.lat, log_data.takeoff.lng, log_data.takeoff.date)
    if (oat == null) return false
    log_data.temp_sources.openmeteo = { label: "Open-Meteo", value: oat }
    set_temp_select("openmeteo")
    return true
}

// -------------------------------------------------------------------------
// Load
// -------------------------------------------------------------------------
var log_data
var ASP_Data
async function load(log_file) {

    // Make sure imports are fully loaded before starting (needed for "open in")
    await import_done

    let log = new DataflashParser()
    log.processData(log_file, [])

    open_in_update(log)

    if (!("ARSP" in log.messageTypes) || !("instances" in log.messageTypes.ARSP)) {
        alert("No airspeed (ARSP) data in log")
        return
    }
    if (!("XKF1" in log.messageTypes) && !("NKF1" in log.messageTypes)) {
        alert("No EKF velocity (XKF1/NKF1) data in log")
        return
    }
    if (!("BARO" in log.messageTypes)) {
        alert("No barometer (BARO) data in log, needed for EAS2TAS")
        return
    }

    const PARM = log.get("PARM")
    function get_param(name) {
        return get_param_value(PARM, name)
    }

    log_data = {}

    // Velocity sources
    let velocity_section = document.getElementById("VELOCITY")
    velocity_section.replaceChildren(velocity_section.children[0])
    log_data.sources = get_velocity_sources(log)
    if (log_data.sources.length == 0) {
        alert("Could not read EKF velocity")
        return
    }
    for (let i = 0; i < log_data.sources.length; i++) {
        add_velocity_source(log_data.sources[i], i == 0)
    }
    if (log_data.sources.length == 1) {
        log_data.sources[0].select.disabled = true
    }

    // Static pressure from first barometer
    const baro_inst = (0 in log.messageTypes.BARO.instances) ? 0 : Number(Object.keys(log.messageTypes.BARO.instances)[0])
    log_data.baro = {
        time: TimeUS_to_seconds(log.get_instance("BARO", baro_inst, "TimeUS")),
        press: Array.from(log.get_instance("BARO", baro_inst, "Press")),
    }

    // Altitude for lapse-rate temperature
    if (!("POS" in log.messageTypes)) {
        alert("No POS data in log, needed for altitude")
        return
    }
    log_data.pos = {
        time: TimeUS_to_seconds(log.get("POS", "TimeUS")),
        rel_alt: Array.from(log.get("POS", "RelHomeAlt")),
        alt: Array.from(log.get("POS", "Alt")),   // AMSL (geometric) altitude, for the ISA temperature
    }

    // Roll angle for the flight-data plot (loiter indicator)
    log_data.att = null
    if ("ATT" in log.messageTypes) {
        log_data.att = {
            time: TimeUS_to_seconds(log.get("ATT", "TimeUS")),
            roll: Array.from(log.get("ATT", "Roll")),
        }
    }

    // Flight span from STAT.isFlying (for auto window)
    log_data.flight_lo = null
    log_data.flight_hi = null
    if (("STAT" in log.messageTypes)) {
        const st = log.get("STAT", "TimeUS")
        const flying = log.get("STAT", "isFlying")
        const stime = TimeUS_to_seconds(st)
        for (let i = 0; i < flying.length; i++) {
            if (flying[i] == 1) {
                if (log_data.flight_lo == null) log_data.flight_lo = stime[i]
                log_data.flight_hi = stime[i]
            }
        }
    }

    // Prefill the manual ground-temperature box with the ISA temperature at the
    // ground altitude. Ground altitude is POS.Alt (AMSL) at the moment the
    // vehicle first starts flying, or the last POS.Alt if it never does.
    // BARO.GndTemp is deliberately not used (IMU-heater self-warming).
    const pos_alt = log_data.pos.alt
    log_data.field_elevation = null
    log_data.field_time = null
    log_data.takeoff = null
    if (pos_alt.length > 0) {
        let ground_alt, field_time
        if (log_data.flight_lo != null) {
            field_time = log_data.flight_lo
            ground_alt = linear_interp(pos_alt, log_data.pos.time, [field_time])[0]
        } else {
            field_time = log_data.pos.time[log_data.pos.time.length - 1]
            ground_alt = pos_alt[pos_alt.length - 1]
        }
        log_data.field_elevation = ground_alt
        log_data.field_time = field_time

        // Takeoff location (POS lat/lng) and UTC time for the weather
        // ground-temperature lookup done later in load(). The time is the log-start
        // UTC from the parser (leap-second correct); it's within the ground roll of
        // takeoff, well inside the hourly resolution the weather lookup needs.
        const pos_lat = log.get("POS", "Lat"), pos_lng = log.get("POS", "Lng")
        const utc = log.extractStartTime()
        if (pos_lat != null && pos_lng != null && utc != null) {
            const lat = linear_interp(Array.from(pos_lat), log_data.pos.time, [field_time])[0] * 1e-7
            const lng = linear_interp(Array.from(pos_lng), log_data.pos.time, [field_time])[0] * 1e-7
            if (isFinite(lat) && isFinite(lng)) log_data.takeoff = { lat, lng, date: utc }
        }
    }

    // Ground-temperature source presets + dropdown; default to ISA until the
    // Open-Meteo lookup (later in load) fills and selects a weather temperature.
    log_data.temp_sources = build_temp_sources(log)
    set_temp_select("isa")

    // Airspeed sensors
    ASP_Data = []
    log_data.start_time = null
    log_data.end_time = null

    const instance_keys = Object.keys(log.messageTypes.ARSP.instances).map(Number).sort((a, b) => a - b)
    for (const inst of instance_keys) {
        const time = TimeUS_to_seconds(log.get_instance("ARSP", inst, "TimeUS"))
        if (time == null || time.length == 0) {
            continue
        }
        const suffix = (inst == 0) ? "" : (inst + 1).toFixed()
        const ratio_name = "ARSPD" + suffix + "_RATIO"
        const use_name = "ARSPD" + suffix + "_USE"

        const data = {
            instance: inst,
            time,
            dpress: Array.from(log.get_instance("ARSP", inst, "DiffPress")),
            asp_reported: Array.from(log.get_instance("ARSP", inst, "Airspeed")),
            ratio_name,
            current_ratio: get_param(ratio_name),
            use: get_param(use_name),
            use_name,
            devid: get_param("ARSPD" + suffix + "_DEVID"),
            health: log.get_instance("ARSP", inst, "H"),
            primary: log.get_instance("ARSP", inst, "Pri"),
            seed: null,
        }

        data.start_time = time[0]
        data.end_time = time[time.length - 1]
        log_data.start_time = (log_data.start_time == null) ? data.start_time : Math.min(log_data.start_time, data.start_time)
        log_data.end_time = (log_data.end_time == null) ? data.end_time : Math.max(log_data.end_time, data.end_time)

        ASP_Data.push(data)
    }

    if (ASP_Data.length == 0) {
        alert("No usable airspeed data in log")
        return
    }

    // Build the (per-log) UI sections
    build_sensor_summaries()
    build_wind_model_ui()
    build_param_rows()

    // Auto window from instance 0 differential pressure over the flight span.
    // Computed before the plot is drawn so the range is baked into the layout at
    // newPlot time -- a separate Plotly.relayout here would fire the range
    // listener after calculate() and spuriously re-flag "needs recalculate".
    let win_start = log_data.start_time
    let win_end = log_data.end_time
    const flo = (log_data.flight_lo != null) ? log_data.flight_lo : log_data.start_time
    const fhi = (log_data.flight_hi != null) ? log_data.flight_hi : log_data.end_time
    try {
        const aw = auto_window(ASP_Data[0].time, ASP_Data[0].dpress, flo, fhi)
        win_start = aw.start
        win_end = aw.end
    } catch (e) {
        console.warn("auto window failed: " + e.message)
    }
    document.getElementById("TimeStart").value = Math.floor(win_start)
    document.getElementById("TimeEnd").value = Math.ceil(win_end)
    flight_data.layout.xaxis.autorange = false
    flight_data.layout.xaxis.range = [win_start, win_end]

    // Flight data plot (range already set in the layout above)
    build_flight_data_plot(log)

    // Enable q slider
    document.getElementById("q_slider").disabled = false
    update_q_readout()

    // Show results immediately using the ISA prefill, then look up the historical
    // weather temperature in the background (up to a 5 s fetch); recalculate with it
    // if it returns, since Open-Meteo is the preferred source when available.
    calculate()

    fill_weather_temp().then((updated) => {
        if (updated) calculate()
    })
}

function build_flight_data_plot(log) {
    flight_data.data = []

    function add_trace(name, yaxis, color, x, y, unit, dp) {
        flight_data.data.push({
            mode: "lines",
            name, meta: name, yaxis,
            line: { color },
            hovertemplate: "<extra></extra>%{meta}<br>%{x:.2f} s<br>%{y:." + dp + "f} " + unit,
            x, y,
        })
    }

    // Airspeed for each sensor (progressively lighter blue)
    for (let i = 0; i < ASP_Data.length; i++) {
        const d = ASP_Data[i]
        add_trace("Airspeed " + (d.instance + 1), "y", airspeed_color(i), d.time, d.asp_reported, "m/s", 2)
    }

    // Ground speed from first source
    const s = log_data.sources[0]
    const gnd = new Array(s.time.length)
    for (let i = 0; i < s.time.length; i++) gnd[i] = Math.hypot(s.vn[i], s.ve[i])
    add_trace("Ground speed", "y2", plot_default_color(2), s.time, gnd, "m/s", 2)

    // Altitude
    add_trace("Altitude", "y3", plot_default_color(3), log_data.pos.time, log_data.pos.rel_alt, "m", 1)

    // Roll angle (a good stand-in for whether the vehicle is loitering)
    if (log_data.att != null) {
        add_trace("Roll", "y4", plot_default_color(4), log_data.att.time, log_data.att.roll, "deg", 1)
    }

    Plotly.newPlot("FlightData", flight_data.data, flight_data.layout, { displaylogo: false })
    attach_flight_data_relayout()
}

// -------------------------------------------------------------------------
// Per-instance UI
// -------------------------------------------------------------------------
function add_tip(parent, text) {
    parent.appendChild(document.createTextNode(" "))
    let img = document.createElement("img")
    parent.appendChild(img)
    img.src = "../images/question-circle.svg"
    img.style.width = "1em"
    img.style.verticalAlign = "bottom"
    img.setAttribute('data-tippy-content', text)
    img.setAttribute('data-tippy-maxWidth', '750px')
    tippy(img)
    return img
}

// Per-sensor summary boxes at the top: device id, Use / Health / Primary.
function build_sensor_summaries() {
    const parent = document.getElementById("SensorSummary")
    parent.replaceChildren()
    let table = document.createElement("table")
    let row = document.createElement("tr")
    table.appendChild(row)

    for (let i = 0; i < ASP_Data.length; i++) {
        const data = ASP_Data[i]
        if (i > 0) { let sp = document.createElement("td"); sp.style.width = "15px"; row.appendChild(sp) }

        let td = document.createElement("td")
        td.style.verticalAlign = "top"
        let fieldset = document.createElement("fieldset")
        fieldset.style.width = "360px"

        const is_primary = data.primary != null && data.primary.length > 0 &&
                           data.primary[data.primary.length - 1] == data.instance
        let legend = document.createElement("legend")
        legend.innerHTML = "Airspeed " + (data.instance + 1) + (is_primary ? " (primary)" : "")
        fieldset.appendChild(legend)

        // device decode
        let dev = document.createElement("p")
        dev.style.margin = "3px 0px"
        const id = (data.devid != null) ? decode_devid(data.devid, DEVICE_TYPE_AIRSPEED) : null
        if (id != null) {
            if (id.bus_type_index == 3) {
                // DRONECAN: bus + node id identify it; sensor_id is devtype-1 and
                // is often -1 (unset), so only show it when it's meaningful.
                dev.textContent = id.bus_type + " bus: " + id.bus + " node id: " + id.address +
                    (id.sensor_id >= 0 ? " sensor: " + id.sensor_id : "")
            } else {
                dev.textContent = id.name + " via " + id.bus_type
            }
        } else {
            dev.textContent = "ARSP instance " + data.instance
        }
        fieldset.appendChild(dev)

        // Use / Health (primary is shown in the box label above). A missing USE
        // param is NOT a disabled sensor: this instance logged ARSP data, so the
        // param should exist -- its absence means the tool failed to read it, so
        // flag it as a warning rather than a normal-looking cross.
        const health_ok = data.health != null && array_all_equal(Array.from(data.health), 1)
        const use_html = (data.use == null)
            ? "<span class='warn'>⚠ " + data.use_name + " not found</span>"
            : (data.use ? "✅" : "❌")
        let status = document.createElement("p")
        status.style.margin = "3px 0px"
        status.innerHTML = "Use: " + use_html + "   Health: " + (health_ok ? "✅" : "❌")
        fieldset.appendChild(status)

        td.appendChild(fieldset)
        row.appendChild(td)
    }
    parent.appendChild(table)
}

// Per-sensor ratio inputs + suggested/current/change readout, near Save.
var param_ui = {}
function build_param_rows() {
    const parent = document.getElementById("ParamRows")
    parent.replaceChildren()
    param_ui = {}
    let fieldset = document.createElement("fieldset")
    let legend = document.createElement("legend"); legend.innerHTML = "Suggested parameters"
    fieldset.appendChild(legend)
    let table = document.createElement("table")
    fieldset.appendChild(table)
    for (const data of ASP_Data) {
        let tr = document.createElement("tr")
        let l = document.createElement("td"); l.style.padding = "3px 12px 3px 0px"
        let lab = document.createElement("label"); lab.setAttribute("for", data.ratio_name)
        lab.style.fontWeight = "bold"; lab.textContent = data.ratio_name
        l.appendChild(lab); tr.appendChild(l)
        let it = document.createElement("td"); it.style.padding = "3px 12px 3px 0px"
        let inp = document.createElement("input")
        inp.setAttribute("id", data.ratio_name); inp.setAttribute("name", data.ratio_name)
        inp.setAttribute("type", "number"); inp.style.width = "90px"; inp.disabled = true
        it.appendChild(inp); tr.appendChild(it)
        let info = document.createElement("td"); info.style.padding = "3px 0px"
        let span = document.createElement("span")
        info.appendChild(span); tr.appendChild(info)
        table.appendChild(tr)
        param_ui[data.instance] = span
    }
    // Fit-reliability warnings (populated by render_param_rows).
    let warn = document.createElement("div")
    warn.id = "param_warning"
    warn.style.cssText = "margin-top:8px; display:none"
    fieldset.appendChild(warn)
    parent.appendChild(fieldset)
}

// The wind-model section: a single wind(t)-vs-EKF plot.
function build_wind_model_ui() {
    let parent = document.getElementById("WindModel")
    parent.replaceChildren()
    let fieldset = document.createElement("fieldset")
    fieldset.style.width = "1150px"
    let legend = document.createElement("legend")
    legend.innerHTML = "Wind estimate"
    add_tip(legend, "The estimated wind over the flight, compared against the onboard EKF wind.")
    fieldset.appendChild(legend)
    let div = document.createElement("div")
    div.id = "wm_wind"; div.style.width = "1150px"; div.style.height = "320px"
    fieldset.appendChild(div)
    parent.appendChild(fieldset)
}

// -------------------------------------------------------------------------
// Calculate
// -------------------------------------------------------------------------
// The ground temperature (deg C) currently in the box; it is lapsed to each
// sample's altitude to give the air temperature used for EAS2TAS.
function get_ground_temp() {
    return parseFloat(document.getElementById("ground_temp").value)
}

// Build per-sample arrays on ONE common time grid for all sensors. The grid is
// the first sensor's ARSP timestamps over the window; every other stream
// (velocity, pressure, altitude, EKF wind, and each sensor's airspeed) is
// interpolated onto it. A sample is kept only if every sensor has positive
// differential pressure at it, so the sensors can be averaged.
function build_combined(sensors, source, ground_temp) {
    const ref = sensors[0]
    const start_index = find_start_index(ref.time)
    const end_index = find_end_index(ref.time) + 1
    const ct = ref.time.slice(start_index, end_index)

    const vn = linear_interp(source.vn, source.time, ct)
    const ve = linear_interp(source.ve, source.time, ct)
    const vd = linear_interp(source.vd, source.time, ct)
    const static_press = linear_interp(log_data.baro.press, log_data.baro.time, ct)
    const rel_alt = linear_interp(log_data.pos.rel_alt, log_data.pos.time, ct)

    let ekf_n = null, ekf_e = null
    if (source.wind != null) {
        ekf_n = linear_interp(source.wind.n, source.wind.time, ct)
        ekf_e = linear_interp(source.wind.e, source.wind.time, ct)
    }

    // per-sensor differential pressure on the common grid
    const dp = sensors.map((s) => linear_interp(s.dpress, s.time, ct))
    const S = sensors.length

    // Only positive differential pressure is required (needed for sqrt and to
    // exclude bad samples); selecting the flight regime is left to the window.
    const t = [], gvn = [], gve = [], gvd = [], gwn = [], gwe = []
    const u_list = sensors.map(() => [])
    for (let i = 0; i < ct.length; i++) {
        // Air temperature for EAS2TAS: the ground temperature lapsed over the
        // height above home (never derived from the pressure reading). Density in
        // eas2tas() still uses the real static pressure.
        const temp_c = air_temperature_c(ground_temp, rel_alt[i])
        const e2t = eas2tas(static_press[i], temp_c)

        let ok = true
        const us = new Array(S)
        for (let s = 0; s < S; s++) {
            us[s] = Math.sqrt(Math.max(dp[s][i], 0)) * e2t
            if (!(dp[s][i] > 0)) ok = false
        }
        if (!ok) continue

        t.push(ct[i]); gvn.push(vn[i]); gve.push(ve[i]); gvd.push(vd[i])
        for (let s = 0; s < S; s++) {
            u_list[s].push(us[s])
        }
        if (ekf_n != null) { gwn.push(ekf_n[i]); gwe.push(ekf_e[i]) }
    }

    return {
        t, vn: gvn, ve: gve, vd: gvd, u_list,
        wind_n: ekf_n != null ? gwn : null,
        wind_e: ekf_n != null ? gwe : null,
        n_keep: t.length,
    }
}

var combined = null
var fit_result = null

function run_wind_model() {
    if (combined == null || combined.n_keep < 4) {
        fit_result = null
        return
    }
    const seeds = ASP_Data.map((d) => d.seed)
    const q = slider_to_q(document.getElementById("q_slider").value)
    fit_result = calibrate_combined(combined.t, combined.vn, combined.ve, combined.vd,
                                    combined.u_list, seeds, { q_wind: q })
}

function calculate() {
    select_velocity_source()
    const ground_temp = get_ground_temp()
    if (!isFinite(ground_temp)) {
        alert("Enter a ground temperature before calculating")
        return
    }

    combined = build_combined(ASP_Data, velocity_source, ground_temp)

    // per-sensor constant-wind cross-check (seeds the combined solve)
    for (let i = 0; i < ASP_Data.length; i++) {
        if (combined.n_keep >= 4) {
            ASP_Data[i].seed = calibrate(combined.vn, combined.ve, combined.vd, combined.u_list[i])
        } else {
            ASP_Data[i].seed = null
        }
    }

    run_wind_model()

    // Reveal the results before drawing so Plotly sizes the plots correctly
    // (set_need_calc(false) below also shows them, but redraw must run visible).
    set_results_shown(true)
    redraw()
    update_saved_params()
    update_temp_debug()
    set_need_calc(false)
}

// q slider handlers
function update_q_readout() {
    const q = slider_to_q(document.getElementById("q_slider").value)
    document.getElementById("q_value").textContent = q.toFixed(q < 0.01 ? 4 : q < 0.1 ? 3 : 2)
    let hint = ""
    if (q <= 0.002) hint = "≈ constant wind"
    else if (q >= 0.3) hint = "wind free to drift fast"
    document.getElementById("q_hint").textContent = hint
}
function q_slider_input() {
    update_q_readout()
}
function q_slider_changed() {
    if (ASP_Data == null) {
        return
    }
    loading_call(() => {
        run_wind_model()
        redraw()
        update_saved_params()
    })
}

// -------------------------------------------------------------------------
// Parameters
// -------------------------------------------------------------------------
function sensor_ratio(i) {
    if (fit_result == null || fit_result.per_sensor[i] == null) {
        return null
    }
    const r = fit_result.per_sensor[i].ratio
    return isFinite(r) ? r : null
}

function update_saved_params() {
    for (let i = 0; i < ASP_Data.length; i++) {
        const r = sensor_ratio(i)
        if (r != null) {
            parameter_set_value(ASP_Data[i].ratio_name, r.toFixed(3))
        } else {
            document.getElementById(ASP_Data[i].ratio_name).value = ""
        }
    }
}

const ratio_typical_range = [1.0, 3.0]
function save_parameters() {
    function param_string(name, value) {
        return name + "," + param_to_string(value) + "\n"
    }

    let params = ""
    let saved = "Saved:\n"
    let warning = ""

    for (let i = 0; i < ASP_Data.length; i++) {
        const raw = sensor_ratio(i)
        if (raw == null) {
            continue
        }
        // Round the saved ratio to the same 3 dp shown in the UI.
        const ratio = +raw.toFixed(3)
        const name = ASP_Data[i].ratio_name
        if (ratio < ratio_typical_range[0] || ratio > ratio_typical_range[1]) {
            warning += name + " = " + ratio.toFixed(3) + " outside typical range " +
                       ratio_typical_range[0] + " to " + ratio_typical_range[1] + "\n"
        }
        params += param_string(name, ratio)
        saved += "\t" + name + ": " + ratio.toFixed(3) + "\n"
    }

    if (params == "") {
        alert("No valid calibration to save")
        return
    }

    if (warning != "") {
        if (!confirm("Warning:\n" + warning + "\nSave anyway?")) {
            return
        }
    }

    var blob = new Blob([params], { type: "text/plain;charset=utf-8" })
    saveAs(blob, "AirspeedFit.param")
    alert(saved)
}

// -------------------------------------------------------------------------
// Redraw
// -------------------------------------------------------------------------
function fmt(v, d) { return (v == null || !isFinite(v)) ? "n/a" : v.toFixed(d) }

function redraw() {
    render_param_rows()
    redraw_combined_tas()
    redraw_combined_resid()
    redraw_rms_bar()
    redraw_wind_model()
}

// Per-sensor before/after series against the shared measured TAS (|Vg−W|).
// "before" uses the ratio currently in the log; "after" uses the fitted ratio;
// they differ only by the scale k, so the improvement is purely the ratio.
function sensor_series(i) {
    if (fit_result == null) return null
    const ps = fit_result.per_sensor[i]
    if (ps == null) return null
    const D = fit_result.D
    const n = D.length
    const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length }
    const out = {
        pred_after: ps.pred, resid_after: ps.resid, rms_after: ps.residual_rms,
        mean_after: mean(ps.resid),
        ratio_after: ps.ratio, ratio_before: ASP_Data[i].current_ratio,
        pred_before: null, resid_before: null, rms_before: null, mean_before: null,
    }
    const rb = ASP_Data[i].current_ratio
    if (rb != null && isFinite(rb) && rb > 0) {
        const kb = Math.sqrt(rb)
        const pb = new Array(n), res = new Array(n)
        let s2 = 0
        for (let m = 0; m < n; m++) {
            pb[m] = kb * ps.u[m]
            res[m] = D[m] - pb[m]
            s2 += res[m] * res[m]
        }
        out.pred_before = pb
        out.resid_before = res
        out.rms_before = Math.sqrt(s2 / n)
        out.mean_before = mean(res)
    }
    return out
}

const sensor_line_colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]
function sensor_line_color(i) { return sensor_line_colors[Math.min(i, sensor_line_colors.length - 1)] }

// Combined "expected vs measured airspeed": the truth |Vg−W| (black) plus each
// sensor's calibrated airspeed before (dotted) and after (solid). Legend entries
// toggle individual lines (there are no checkboxes).
function redraw_combined_tas() {
    if (fit_result == null) { Plotly.purge("tas_combined"); return }
    const wm = fit_result
    const t0 = wm.t[0]
    const tmin = wm.t.map((x) => x - t0)
    const traces = []
    for (let i = 0; i < ASP_Data.length; i++) {
        const s = sensor_series(i)
        if (s == null) continue
        const col = sensor_line_color(i)
        const grp = "s" + i, gt = { text: "Sensor " + (ASP_Data[i].instance + 1) }
        if (s.pred_before != null) {
            traces.push({ mode: "lines", name: "before", legendgroup: grp, legendgrouptitle: gt,
                line: { color: col, width: 1, dash: "dot" }, opacity: 0.7,
                hovertemplate: "<extra></extra>%{y:.2f} m/s at %{x:.1f} s", x: tmin, y: s.pred_before })
        }
        traces.push({ mode: "lines", name: "after", legendgroup: grp, legendgrouptitle: gt,
            line: { color: col, width: 1.2 },
            hovertemplate: "<extra></extra>%{y:.2f} m/s at %{x:.1f} s", x: tmin, y: s.pred_after })
    }
    // Expected (truth) drawn last so it sits on top of the noisy pitot lines.
    traces.push({ mode: "lines", name: "Expected", line: { color: "#000000", width: 1.5 },
        hovertemplate: "<extra></extra>%{y:.2f} m/s at %{x:.1f} s", x: tmin, y: wm.D })
    Plotly.react("tas_combined", traces, {
        xaxis: { title: { text: "time in window (s)" }, zeroline: false, showline: true, mirror: true },
        yaxis: { title: { text: "true airspeed (m/s)" }, zeroline: false, showline: true, mirror: true },
        showlegend: true, legend: { itemclick: "toggle", itemdoubleclick: "toggleothers", groupclick: "toggleitem" },
        margin: { b: 50, l: 60, r: 30, t: 20 },
    }, { displaylogo: false })
}

// Combined residuals (truth − calibrated), before (dotted) and after (solid)
// for each sensor. Legend entries toggle lines.
function redraw_combined_resid() {
    if (fit_result == null) { Plotly.purge("resid_combined"); return }
    const wm = fit_result
    const t0 = wm.t[0]
    const tmin = wm.t.map((x) => x - t0)
    const traces = []
    for (let i = 0; i < ASP_Data.length; i++) {
        const s = sensor_series(i)
        if (s == null) continue
        const col = sensor_line_color(i)
        const grp = "s" + i, gt = { text: "Sensor " + (ASP_Data[i].instance + 1) }
        if (s.resid_before != null) {
            traces.push({ mode: "lines", name: "before", legendgroup: grp, legendgrouptitle: gt,
                line: { color: col, width: 0.8, dash: "dot" }, opacity: 0.7,
                hovertemplate: "<extra></extra>%{y:.2f} m/s at %{x:.1f} s", x: tmin, y: s.resid_before })
        }
        traces.push({ mode: "lines", name: "after", legendgroup: grp, legendgrouptitle: gt,
            line: { color: col, width: 0.9 },
            hovertemplate: "<extra></extra>%{y:.2f} m/s at %{x:.1f} s", x: tmin, y: s.resid_after })
    }
    Plotly.react("resid_combined", traces, {
        xaxis: { title: { text: "time in window (s)" }, zeroline: false, showline: true, mirror: true },
        yaxis: { title: { text: "residual (m/s)" }, zeroline: true, showline: true, mirror: true },
        showlegend: true, legend: { itemclick: "toggle", itemdoubleclick: "toggleothers", groupclick: "toggleitem" },
        margin: { b: 50, l: 60, r: 30, t: 20 },
    }, { displaylogo: false })
}

// Residual RMS before vs after, grouped bars per sensor.
function redraw_rms_bar() {
    if (fit_result == null) { Plotly.purge("rms_bar"); return }
    // Grouped by calibration state (existing vs fitted), one bar per sensor. The
    // RMS is the full bar; a narrower dark bar overlaid at the same position (same
    // offsetgroup) shows the magnitude of the mean error (bias). |mean| ≤ RMS, and
    // the fit drives the bias to ~0 by construction, so the dark bar collapsing to
    // nothing after calibration = the bias was removed, leaving only the scatter.
    const cats = ["Existing", "Fitted"]
    const rms_traces = [], mean_traces = []
    for (let i = 0; i < ASP_Data.length; i++) {
        const s = sensor_series(i)
        if (s == null) continue
        const og = "s" + i
        const rms = [s.rms_before, s.rms_after]
        const bias = [Math.abs(s.mean_before), Math.abs(s.mean_after)]
        const signed = [s.mean_before, s.mean_after]
        rms_traces.push({ type: "bar", name: "Sensor " + (ASP_Data[i].instance + 1),
            offsetgroup: og, alignmentgroup: "g", marker: { color: sensor_line_color(i), opacity: 0.55 },
            hovertemplate: "<extra></extra>RMS %{y:.2f} m/s", x: cats, y: rms,
            text: rms.map((v) => fmt(v, 2)), textposition: "outside", cliponaxis: false })
        mean_traces.push({ type: "bar", name: "mean error", legendgroup: "mean",
            offsetgroup: og, alignmentgroup: "g", width: 0.16, showlegend: i == 0,
            marker: { color: "rgba(30,30,30,0.8)" }, customdata: signed,
            hovertemplate: "<extra></extra>mean error %{customdata:.2f} m/s", x: cats, y: bias })
    }
    // Draw the RMS bars first, then the narrower bias bars on top of them.
    Plotly.react("rms_bar", rms_traces.concat(mean_traces), {
        barmode: "group",
        xaxis: { showline: true, mirror: true },
        yaxis: { title: { text: "residual error (m/s)" }, zeroline: true, showline: true, mirror: true, rangemode: "tozero" },
        showlegend: true,
        margin: { b: 40, l: 60, r: 30, t: 20 },
    }, { displaylogo: false })
}

function redraw_wind_model() {
    if (fit_result == null) { Plotly.purge("wm_wind"); return }

    const wm = fit_result
    const n = wm.t.length
    const t0 = wm.t[0]
    const tmin = wm.t.map((x) => x - t0)
    const wn = wm.wind_ne.map((w) => w[0])
    const we = wm.wind_ne.map((w) => w[1])

    // Smoothed wind(t) with 1-sigma bands + onboard EKF overlay
    const wn_hi = wn.map((v, i) => v + wm.wind_sigma[i][0])
    const wn_lo = wn.map((v, i) => v - wm.wind_sigma[i][0])
    const we_hi = we.map((v, i) => v + wm.wind_sigma[i][1])
    const we_lo = we.map((v, i) => v - wm.wind_sigma[i][1])
    const wind_traces = [
        { x: tmin.concat(tmin.slice().reverse()), y: wn_hi.concat(wn_lo.slice().reverse()),
          fill: "toself", fillcolor: "rgba(31,119,180,0.15)", line: { width: 0 }, hoverinfo: "skip", showlegend: false },
        { x: tmin.concat(tmin.slice().reverse()), y: we_hi.concat(we_lo.slice().reverse()),
          fill: "toself", fillcolor: "rgba(255,127,14,0.15)", line: { width: 0 }, hoverinfo: "skip", showlegend: false },
        { mode: "lines", name: "Wn (North)", line: { color: "#1f77b4", width: 2 },
          hovertemplate: "<extra></extra>Wn %{y:.2f} m/s", x: tmin, y: wn },
        { mode: "lines", name: "We (East)", line: { color: "#ff7f0e", width: 2 },
          hovertemplate: "<extra></extra>We %{y:.2f} m/s", x: tmin, y: we },
    ]
    if (combined.wind_n != null) {
        const ekf_wn = linear_interp(combined.wind_n, combined.t, wm.t)
        const ekf_we = linear_interp(combined.wind_e, combined.t, wm.t)
        wind_traces.push({ mode: "lines", name: "EKF Wn", line: { color: "#1f77b4", width: 1, dash: "dot" }, opacity: 0.6,
                           hovertemplate: "<extra></extra>EKF Wn %{y:.2f} m/s", x: tmin, y: ekf_wn })
        wind_traces.push({ mode: "lines", name: "EKF We", line: { color: "#ff7f0e", width: 1, dash: "dot" }, opacity: 0.6,
                           hovertemplate: "<extra></extra>EKF We %{y:.2f} m/s", x: tmin, y: ekf_we })
    }
    Plotly.react("wm_wind", wind_traces, {
        title: { text: "Estimated wind vs onboard EKF wind (drift " + fmt(wm.wind_drift, 2) + " m/s)" },
        xaxis: { title: { text: "time in window (s)" }, zeroline: false, showline: true, mirror: true },
        yaxis: { title: { text: "wind component (m/s)" }, zeroline: true, showline: true, mirror: true },
        showlegend: true, legend: { itemclick: "toggle", itemdoubleclick: "toggleothers", orientation: "h" },
        margin: { b: 50, l: 60, r: 30, t: 40 },
    }, { displaylogo: false })
}

// Fill the per-sensor readout beside the Save button: the ratio currently in the
// log and the percentage change to it. The suggested value itself goes into the
// number input by update_saved_params().
function render_param_rows() {
    for (let i = 0; i < ASP_Data.length; i++) {
        const data = ASP_Data[i]
        const span = param_ui[data.instance]
        if (span == null) continue
        const ps = (fit_result != null) ? fit_result.per_sensor[i] : null
        if (ps == null || data.seed == null) {
            span.innerHTML = "<span class='warn'>not enough valid samples in the selected window</span>"
            continue
        }
        let html = ""
        if (data.current_ratio != null) {
            const delta = 100 * (ps.ratio - data.current_ratio) / data.current_ratio
            html = "current " + fmt(data.current_ratio, 3) + " &nbsp; (" +
                   (delta >= 0 ? "+" : "") + fmt(delta, 1) + "%)"
        }
        span.innerHTML = html
    }

    // Reliability warnings from the constant-wind observability check, deduped:
    // the "little heading change" warning is identical across sensors, while the
    // "ratio weakly determined" one differs per sensor.
    const wel = document.getElementById("param_warning")
    if (wel != null) {
        const seen = new Set(), items = []
        for (const d of ASP_Data) {
            const ws = (d.seed != null) ? d.seed.warnings : null
            if (ws == null) continue
            for (const w of ws) { if (!seen.has(w)) { seen.add(w); items.push(w) } }
        }
        wel.innerHTML = items.map((w) => "<span class='warn'>⚠ " + w + "</span>").join("<br>")
        wel.style.display = items.length > 0 ? "" : "none"
    }
}
