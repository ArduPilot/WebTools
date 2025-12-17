### Defining Equations:

**Equation 1:**

$P_1 = P_0 + 2V_0 t_j + 2A_0 t_j^2 + \alpha_1 t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} \right)$

**Equation 2:**

$P_2 = P_1 + 2V_1 t_j + 2A_1 t_j^2 + \alpha_2 t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} \right)$


---

### Rearranging and Deriving Equations:

#### Rearranging Equation 2 to Solve for \(P_1\):

$P_1 = P_2 - 2V_1 t_j - 2A_1 t_j^2 - \alpha_2 t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} \right)$

Equating with Equation 1:

$P_0 + 2V_0 t_j + 2A_0 t_j^2 + \alpha_1 t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} \right) = P_2 - 2V_1 t_j - 2A_1 t_j^2 - \alpha_2 t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} \right)$

Rearranging for conservation:

$P_0 - P_2 + 2V_0 t_j + 2A_0 t_j^2 + \alpha_1 t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} \right) + 2V_1 t_j + 2A_1 t_j^2 + \alpha_2 t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} \right) = 0$

This is **Equation 3**.

---

#### Defining Equation 4:

**Equation 4:**
$V_2 = V_1 + 2A_1 t_j + 2\alpha_2 t_j^2$

---

#### Substituting Equation 4 into Equation 3:

Substitute $(V_1 = V_2 - 2A_1 t_j - 2\alpha_2 t_j^2)$ into Equation 3:

$P_0 - P_2 + 2V_0 t_j + 2A_0 t_j^2 + \alpha_1 t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} \right) + 2(V_2 - 2A_1 t_j - 2\alpha_2 t_j^2)t_j + 2A_1 t_j^2 + \alpha_2 t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} \right) = 0$

Simplifying:

$P_0 - P_2 + 2V_0 t_j + 2V_2 t_j + (2A_0 - 2A_1) t_j^2 + \left( \alpha_1 \left( \frac{4}{3} - \frac{2}{\pi^2} \right) - 3\alpha_2 \right) t_j^3 = 0$

This is **Equation 5**.

---

#### Defining Equation 6:

**Equation 6:**
$A_1 = A_0 + 2 t_j \alpha_1$

---

#### Substituting Equation 6 into Equation 5:

Substitute \( A_1 = A_0 + 2 t_j \alpha_1 \) into Equation 5:

$P_0 - P_2 + 2V_0 t_j + 2V_2 t_j + (-4 t_j \alpha_1) t_j^2 + \left( \alpha_1 \left( \frac{4}{3} - \frac{2}{\pi^2} \right) - 3\alpha_2 \right) t_j^3 = 0$

Simplifying:

$P_0 - P_2 + 2V_0 t_j + 2V_2 t_j + \left( \alpha_1 \left( \frac{4}{3} - \frac{2}{\pi^2} \right) - 4 \alpha_1 - 3\alpha_2 \right) t_j^3 = 0$

Further simplification:

$P_0 - P_2 + 2V_0 t_j + 2V_2 t_j + \left( \alpha_1 \left( \frac{4}{3} - \frac{2}{\pi^2} - 4 \right) - 3\alpha_2 \right) t_j^3 = 0$

---

### Rearranging to Solve for \( \alpha_1 \):

$\alpha_1 = \frac{P_2 - P_0 - 2V_0 t_j - 2V_2 t_j + 3\alpha_2 t_j^3}{t_j^3 \left( \frac{4}{3} - \frac{2}{\pi^2} - 4 \right)}$

**JavaScript Function to Calculate \( \alpha_1 \):**

```javascript
function calculateAlpha1(P0, P2, V0, V2, alpha2, tj) {
    const pi = Math.PI;
    const denominatorFactor = (4 / 3) - (2 / (pi * pi)) - 4;
    if (tj === 0) throw new Error("t_j cannot be zero.");
    const numerator = P2 - P0 - 2 * V0 * tj - 2 * V2 * tj + 3 * alpha2 * Math.pow(tj, 3);
    const denominator = Math.pow(tj, 3) * denominatorFactor;
    return numerator / denominator;
}
```

