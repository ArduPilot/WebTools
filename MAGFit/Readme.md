## MAGFit

A tool for calibrating compass from a flight log. Measured mag field from the log is compared to the expected field for the given location and attitude. A number of fits are done with varying degrees of freedom to allow the user to select the best.

## Calibration

This tool calculates the calibration parameters these are (first compass):

### Offsets
COMPASS_OFS_X: $o_x$\
COMPASS_OFS_Y: $o_y$\
COMPASS_OFS_Z: $o_z$

### Scale
COMPASS_SCALE: $s$

### Iron correction

COMPASS_DIA_X: $I_{xx}$\
COMPASS_DIA_Y: $I_{yy}$\
COMPASS_DIA_Z: $I_{zz}$

COMPASS_ODI_X: $I_{xy}$\
COMPASS_ODI_Y: $I_{xz}$\
COMPASS_ODI_Z: $I_{yz}$

These form the symmetrical iron correction matrix:

$$
I = 
\begin{bmatrix} 
I_{xx} & I_{xy} & I_{xz} \\
I_{xy} & I_{yy} & I_{yz} \\
I_{xz} & I_{yz} & I_{zz} \\
\end{bmatrix}
$$

### Motor

COMPASS_MOT_X: $m_x$\
COMPASS_MOT_Y: $m_y$\
COMPASS_MOT_Z: $m_z$

### Application

Raw readings from the compass are given by:

$$
r_x, r_y, r_z
$$

Motor calibration values from either battery current or throttle level are given by:

$$
t
$$

The calibration is then applied:

$$
\begin{bmatrix} 
r_x + o_x\\
r_y + o_y\\
r_z + o_z
\end{bmatrix}
s
I
+
\begin{bmatrix} 
m_x\\
m_y\\
m_z
\end{bmatrix}
t
$$


## Maths

This tool assembles the measured and expected earth field into a matrix in the form $Ax = B$. This allows a fast least squares fit for the calibration parameters $x$ using matrix decomposition.

Is solved resulting in the value of $x$ such that:

$$
min \lVert Ax - B \rVert_2^2
$$

This can also be written as:

$$
min \sum_{i=1}^n (A_ix - B_i)^2
$$

At each logged compass data point the vehicles attitude is interpolated from the selected attitude source. This is then used to calculate the expected earth field in body frame.

x, y and z axis measurements:

$$
r_{x1}, r_{x2}\ ...\ r_{xn}
$$

$$
r_{y1}, r_{y2}\ ...\ r_{yn}
$$

$$
r_{z1}, r_{z2}\ ...\ r_{zn}
$$

x, y and z axis expected:

$$
e_{x1}, e_{x2}\ ...\ e_{xn}
$$

$$
e_{y1}, e_{y2}\ ...\ e_{yn}
$$

$$
e_{z1}, e_{z2}\ ...\ e_{zn}
$$

Motor calibration value, either battery current or throttle is also interpolated:

$$
t_{1}, t_{2}\ ...\ t_{n} \\
$$

The matrices for $A$ and $B$ are given for each point, these are then combined and solved as one.

$$
\begin{bmatrix} 
A_1 \\
A_2 \\
... \\
A_n
\end{bmatrix}
x =
\begin{bmatrix} 
B_1 \\
B_2 \\
... \\
B_n
\end{bmatrix}
$$



### Offsets only

If only the offsets are being fitted the formulation is as follows.

Solution array $x$:

$$
x = \begin{bmatrix}
o_x & o_y & o_z
\end{bmatrix}
$$

Matrix $A$ for each point $i$:

$$
A_i = 
\begin{bmatrix} 
1 & 0 & 0 \\
0 & 1 & 0 \\
0 & 0 & 1 \\
\end{bmatrix}
$$

Array $B$ for each point $i$:

$$
B_i = 
\begin{bmatrix} 
e_{xi} - r_{xi}\\
e_{yi} - r_{yi}\\
e_{zi} - r_{zi}\\
\end{bmatrix}
$$

### Offsets and scale

If offsets and scale are being fitted the formulation is as follows.


Solution array $x$:

$$
x = \begin{bmatrix}
o_xs & o_ys & o_zs & s
\end{bmatrix}
$$

The offsets are extracted by removing the scale factor given by the last item in the array.

Matrix $A$ for each point i:

$$
A_i = 
\begin{bmatrix} 
1 & 0 & 0 & r_{xi} \\
0 & 1 & 0 & r_{yi} \\
0 & 0 & 1 & r_{zi} \\
\end{bmatrix}
$$

Array $B$ for each point $i$:

$$
B_i = 
\begin{bmatrix} 
e_{xi}\\
e_{yi}\\
e_{zi}\\
\end{bmatrix}
$$

### Offsets and iron

If offsets and iron matrix are being fitted the formulation is as follows.

$$
x = \begin{bmatrix}
x_1 & x_2 & x_3 & I_{xx} & I_{yy} & I_{zz} & I_{xy} & I_{xz} & I_{yz}
\end{bmatrix}
$$

The values $x_1$, $x_2$ and $x_3$ are the offsets with the iron matrix applied. The inverse of the iron matrix is used to recover the offset values.

$$ 
\begin{bmatrix}
o_x & o_y & o_z
\end{bmatrix} = 
\begin{bmatrix}
x_1 & x_2 & x_3
\end{bmatrix}
I^{-1}
$$

The iron matrix is then normalized to give a value for the scale.

$$
s = \frac{I_{xx} + I_{yy} + I_{zz}}{3}
$$

$$
I = \frac{I}{s}
$$

Matrix $A$ for each point $i$:

$$
A_i = 
\begin{bmatrix} 
1 & 0 & 0 & r_{xi} & 0     & 0      & r_{yi} & r_{zi} & 0      \\
0 & 1 & 0 & 0      & r_{yi} & 0      & r_{xi} & 0      & r_{zi} \\
0 & 0 & 1 & 0      & 0     & r_{zi} & 0      & r_{xi} & r_{yi} \\
\end{bmatrix}
$$

As before the array $B$ for each point $i$ is:

$$
B_i = 
\begin{bmatrix} 
e_{xi}\\
e_{yi}\\
e_{zi}\\
\end{bmatrix}
$$

### Motor

Motor calibration is added by extending the $x$ and $A$ matrices from the previous methods:

$$
x = \begin{bmatrix}
... & m_x & m_y & m_z
\end{bmatrix}
$$

$$
A_i = 
\begin{bmatrix} 
... & t_i & 0   & 0   \\
... & 0   & t_i & 0   \\
... & 0   & 0   & t_i \\
\end{bmatrix}
$$

### Weights

Each data point is assigned a weighting based on the the vehicles attitude. Attitudes that occur less frequently get a larger weighting that those which are seen frequently.

$$
w_1, w_2, ... w_n
$$

The equation then becomes:

$$
min \sum_{i=1}^n w_i (A_ix - B_i)^2
$$

To restore the standard $Ax = B$ form the weightings are pre-applied to the $A$ and $B$ matrices:

$$
min \sum_{i=1}^n (\sqrt{w_i}A_ix - \sqrt{w_i}B_i)^2
$$
