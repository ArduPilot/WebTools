## AirspeedFit

A tool for calibrating the airspeed ratio (`ARSPD_RATIO`) of one or more airspeed sensors from a flight log. The GPS/EKF ground velocity and an estimated wind vector are used as the truth source for the airspeed: the wind triangle is fitted over a selected window. This is the same physical relationship ArduPilot's in-flight autocalibration uses, but solved offline as a batch (forward and backward in time) rather than recursively.

This document explains the math; see the tool's tool-tips for the UI.

## Model

ArduPilot computes airspeed from the pitot differential pressure as:

$$
\text{EAS} = \sqrt{\Delta p \cdot \text{ARSPD\_RATIO}}, \qquad \text{TAS} = \text{EAS} \cdot \text{EAS2TAS}
$$

where EAS is equivalent airspeed, TAS is true airspeed and $\Delta p$ is the (offset-corrected) differential pressure from the `ARSP` message. Write $r \equiv \text{ARSPD\_RATIO}$ for the unknown we solve for, and let

$$
u = \sqrt{\Delta p} \cdot \text{EAS2TAS}
$$

be the true airspeed a ratio of $1$ would give (the same quantity ArduPilot's autocal forms as its measurement). The airspeed the aircraft actually flew is then

$$
\text{TAS} = \sqrt{r}\,u, \qquad \text{equivalently} \quad \text{TAS}^2 = r\,u^2 .
$$

### EAS2TAS

$$
\text{EAS2TAS} = \sqrt{\frac{\rho_\text{SSL}}{\rho}}, \qquad \rho = \frac{P}{R\,T}
$$

with static pressure $P$ from `BARO`, the specific gas constant for air $R$, sea-level standard density $\rho_\text{SSL}$, and air temperature $T$. You enter a single **ground-level temperature**, which is lapsed to each sample's altitude with the standard lapse rate, $T = T_\text{ground} - L\,h$, using `POS.RelHomeAlt`. This mirrors `AP_Baro::get_EAS2TAS_simple`.

A **Source** dropdown fills the box (or type your own, which shows as *Custom*):

- **Open-Meteo** — the 2&nbsp;m weather temperature at the takeoff location (`POS.Lat/Lng`) and UTC time (from `GPS`), looked up from [Open-Meteo](https://open-meteo.com). Recent flights (within ~90 days) use the forecast API, which stays current right up to now; older flights use the historical reanalysis archive. This is the default when the lookup succeeds.
- **ISA** — the standard atmosphere at the ground altitude, $T_0 - L\,h_\text{field}$ with $T_0 = 15\,°\text{C}$. The fallback default when Open-Meteo is unavailable (offline, no coverage).
- **BARO.GndTemp** — the ground temperature recorded in the log. Notoriously unreliable when the autopilot's IMU heaters warm the barometer, but meaningful if the operator set `BARO_GND_TEMP` deliberately (some use it to note the day's outside air temperature). Reference only; never auto-selected.

## Math

### The wind triangle

Ground velocity is the sum of air velocity and wind velocity, $\vec{V_g} = \vec{V_a} + \vec{W}$. Taking magnitudes (the same magnitude-only constraint ArduPilot's autocal uses) with a purely horizontal wind $\vec{W} = (W_n, W_e)$:

$$
\lvert \vec{V_g} - \vec{W} \rvert = \sqrt{r}\,u
$$

The wind is horizontal, so the vertical ground velocity stays inside the magnitude: $\lvert \vec{V_g} - \vec{W} \rvert = \sqrt{(V_n - W_n)^2 + (V_e - W_e)^2 + V_d^2}$.

### Constant-wind fit

Assuming a single constant wind over the window, the wind $(W_n, W_e)$ and the ratio $r$ are fit **together** by minimizing the airspeed residual directly:

$$
\min_{W_n,\,W_e,\,r} \; \sum_i \Big( \lvert \vec{V_g}_i - \vec{W} \rvert - \sqrt{r}\,u_i \Big)^2
$$

Wind and ratio are only separable when the ground-course direction varies across the window: a single straight, constant-speed cruise leg is degenerate, while turns and loiters are ideal.

## Time-varying wind (iterated extended Kalman smoother)

A single constant wind is wrong over a long window where the wind actually shifts. The reported `ARSPD_RATIO` comes from a time-varying-wind estimator that **starts from the constant-wind fit above** and then relaxes the constant-wind assumption. Rather than estimating the wind and the ratio jointly — which would let a fast-varying wind quietly absorb a ratio error — it **alternates** two steps to convergence:

1. **Wind, with the ratio held fixed.** Smooth the 2-state wind $\begin{bmatrix} W_n & W_e \end{bmatrix}$, modeled as a random walk with process noise `q`, against the scalar wind-triangle measurement $\lvert \vec{V_g} - \vec{W} \rvert - \sqrt{r}\,u = 0$.
2. **Ratio, with the wind held fixed.** With the wind trajectory frozen, $D_i = \lvert \vec{V_g}_i - \vec{W}(t_i) \rvert$ is known and the residual is linear in $\sqrt{r}$, so the ratio drops out in closed form: $\sqrt{r} = \dfrac{\sum D_i u_i}{\sum u_i^2}$.

These two typically converge in 2–4 rounds. Because the ratio is re-derived by a global fit over the whole window — not carried as a filter state the wind can bend locally — once the wind has absorbed the genuine drift the ratio step becomes a fixed point. So **the ratio stays robust across the whole `q` range** while the wind is free to track real weather. (A joint wind+ratio filter, by contrast, lets a high-`q` wind heading-lock and drag the ratio off — precisely what the alternation avoids.)

### Multiple sensors

The wind step is driven by the equal-weight average of the sensors' calibrated true airspeeds $\text{mean}_s(\sqrt{r_s}\,u_s)$; the scale step then re-solves each sensor's own $r_s$ against that common $\lvert \vec{V_g} - \vec{W} \rvert$. Both steps alternate together to convergence, so every sensor keeps its own `ARSPD_RATIO` while sharing one wind.

### Wind process noise `q`

The `q` slider is the single physical regularizer. Low `q` pins the wind nearly constant (recovering the constant-wind fit); higher `q` lets the wind drift to track weather changes over a long flight. With the alternating scheme the ratio is robust to `q`, so you can raise `q` to follow genuine wind drift without corrupting the ratio (unlike a joint wind+scale filter, where high `q` drags the ratio off as the wind heading-locks). The default (0.032) seems to be a good balance for all the logs I have analyzed.

## Log messages used

| Message | Fields | Use |
|---------|--------|-----|
| `ARSP` (per instance) | `DiffPress`, `Airspeed` | differential pressure (the fit) and reported airspeed (Flight Data plot) |
| `BARO` | `Press`, `GndTemp` | static pressure for EAS2TAS (`Press`); logged ground-temperature source (`GndTemp`) |
| `XKF1` / `NKF1` (per core) | `VN`, `VE`, `VD` | EKF ground velocity (truth) |
| `XKF2` / `NKF2` (per core) | `VWN`, `VWE` | onboard EKF wind (diagnostic overlay) |
| `POS` | `Alt`, `RelHomeAlt`, `Lat`, `Lng` | ground elevation for the ISA source (`Alt`); height above home for the lapse (`RelHomeAlt`); takeoff location for the weather lookup (`Lat`, `Lng`) |
| `GPS` | `GWk`, `GMS`, `Status` | UTC time of takeoff for the weather lookup |
| `MSG` | `Message` | METAR temperature source from a `GCS:WX` uplink (Carbonix-specific; only when present) |
| `ATT` | `Roll` | roll angle on the Flight Data plot |
| `STAT` | `isFlying` | flight span for the auto window |
| `PARM` | `ARSPD_RATIO`, `ARSPD2_RATIO` | current ratio in the log |

All streams are interpolated onto each airspeed sensor's timestamps before fitting.
