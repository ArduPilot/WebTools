// Helpers for Array and complex maths

function complex_mul(C1, C2) {
    const len = C1[0].length
    let ret = [new Array(len), new Array(len)]
    for (let i = 0; i<len; i++) {
        const ac = C1[0][i] * C2[0][i]
        const bd = C1[1][i] * C2[1][i]
        const ad = C1[0][i] * C2[1][i]
        const bc = C1[1][i] * C2[0][i]
        ret[0][i] = ac - bd
        ret[1][i] = ad + bc
    }
    return ret
}

function complex_div(C1, C2) {
    const len = C1[0].length
    let ret = [new Array(len), new Array(len)]
    for (let i = 0; i<len; i++) {
        const ac = C1[0][i] * C2[0][i]
        const bd = C1[1][i] * C2[1][i]
        const ad = C1[0][i] * C2[1][i]
        const bc = C1[1][i] * C2[0][i]
        const denominator = 1 / (C2[0][i]**2 + C2[1][i]**2)
        ret[0][i] = (ac + bd) * denominator
        ret[1][i] = (bc - ad) * denominator
    }
    return ret
}

function complex_abs(C) {
    const len = C[0].length
    let ret = new Array(len)
    for (let i = 0; i<len; i++) {
        ret[i] = ((C[0][i]**2) + (C[1][i]**2))**0.5
    }
    return ret
}

function complex_inverse(C) {
    const len = C[0].length
    let ret = [new Array(len), new Array(len)]
    for (let i = 0; i<len; i++) {
        const denominator = 1 / ((C[0][i]**2) + (C[1][i]**2))
        ret[0][i] = C[0][i] * denominator
        ret[1][i] = C[1][i] * -denominator
    }
    return ret
}

function complex_square(C) {
    const len = C[0].length
    let ret = [new Array(len), new Array(len)]
    for (let i = 0; i<len; i++) {
        ret[0][i] = (C[0][i]**2) - (C[1][i]**2)
        ret[1][i] = C[0][i] * C[1][i] * 2
    }
    return ret
}

function complex_phase(C) {
    const len = C[0].length
    let ret = new Array(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.atan2(C[1][i], C[0][i])
    }
    return ret
}

function exp_jw(freq, rate) {
    const scale = (2*Math.PI) / rate
    const len = freq.length
    let ret = [new Array(len), new Array(len)]
    for (let i = 0; i<len; i++) {
        // e^(ic) = (cos c) + i(sin c)
        // no real component in jw
        const jw = freq[i] * scale
        ret[0][i] = Math.cos(jw)
        ret[1][i] = Math.sin(jw)
    }
    return ret
}

function array_max(A, B) {
    const len = A.length
    let ret = new Array(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.max(A[i], B[i])
    }
    return ret
}

function array_min(A, B) {
    const len = A.length
    let ret = new Array(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.min(A[i], B[i])
    }
    return ret
}

function array_scale(A, scale) {
    const len = A.length
    let ret = new Array(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i] * scale
    }
    return ret
}

function array_mul(A, B) {
    const len = A.length
    let ret = new Array(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i] * B[i]
    }
    return ret
}

function array_offset(A, offset) {
    const len = A.length
    let ret = new Array(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i] + offset
    }
    return ret
}

function array_add(A, B) {
    const len = A.length
    let ret = new Array(len)
    for (let i = 0; i<len; i++) {
        ret[i] = A[i] + B[i]
    }
    return ret
}

function array_log10(A) {
    const len = A.length
    let ret = new Array(len)
    for (let i = 0; i<len; i++) {
        ret[i] = Math.log10(A[i])
    }
    return ret
}
