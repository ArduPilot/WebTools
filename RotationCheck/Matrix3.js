

function Matrix3() {

    const ROTATION_NONE                = 0
    const ROTATION_YAW_45              = 1
    const ROTATION_YAW_90              = 2
    const ROTATION_YAW_135             = 3
    const ROTATION_YAW_180             = 4
    const ROTATION_YAW_225             = 5
    const ROTATION_YAW_270             = 6
    const ROTATION_YAW_315             = 7
    const ROTATION_ROLL_180            = 8
    const ROTATION_ROLL_180_YAW_45     = 9
    const ROTATION_ROLL_180_YAW_90     = 10
    const ROTATION_ROLL_180_YAW_135    = 11
    const ROTATION_PITCH_180           = 12
    const ROTATION_ROLL_180_YAW_225    = 13
    const ROTATION_ROLL_180_YAW_270    = 14
    const ROTATION_ROLL_180_YAW_315    = 15
    const ROTATION_ROLL_90             = 16
    const ROTATION_ROLL_90_YAW_45      = 17
    const ROTATION_ROLL_90_YAW_90      = 18
    const ROTATION_ROLL_90_YAW_135     = 19
    const ROTATION_ROLL_270            = 20
    const ROTATION_ROLL_270_YAW_45     = 21
    const ROTATION_ROLL_270_YAW_90     = 22
    const ROTATION_ROLL_270_YAW_135    = 23
    const ROTATION_PITCH_90            = 24
    const ROTATION_PITCH_270           = 25
    const ROTATION_PITCH_180_YAW_90    = 26
    const ROTATION_PITCH_180_YAW_270   = 27
    const ROTATION_ROLL_90_PITCH_90    = 28
    const ROTATION_ROLL_180_PITCH_90   = 29
    const ROTATION_ROLL_270_PITCH_90   = 30
    const ROTATION_ROLL_90_PITCH_180   = 31
    const ROTATION_ROLL_270_PITCH_180  = 32
    const ROTATION_ROLL_90_PITCH_270   = 33
    const ROTATION_ROLL_180_PITCH_270  = 34
    const ROTATION_ROLL_270_PITCH_270  = 35
    const ROTATION_ROLL_90_PITCH_180_YAW_90 = 36
    const ROTATION_ROLL_90_YAW_270     = 37
    const ROTATION_ROLL_90_PITCH_68_YAW_293 = 38
    const ROTATION_PITCH_315           = 39
    const ROTATION_ROLL_90_PITCH_315   = 40
    const ROTATION_PITCH_7             = 41
    const ROTATION_ROLL_45             = 42
    const ROTATION_ROLL_315            = 43
    const ROTATION_MAX                 = 44
    const ROTATION_CUSTOM_OLD          = 100
    const ROTATION_CUSTOM_1            = 101
    const ROTATION_CUSTOM_2            = 102
    const ROTATION_CUSTOM_END          = 103

    this.a = { x: 0.0, y: 0.0, z: 0.0 }
    this.b = { x: 0.0, y: 0.0, z: 0.0 }
    this.c = { x: 0.0, y: 0.0, z: 0.0 }

    function safe_asin(f) {
        if (f >= 1.0) {
            return Math.PI * 0.5
        }
        if (f <= -1.0) {
            return -Math.PI * 0.5
        }
        return Math.asin(f)
    }

    function rotate(rotation, v) {
        let x = v.x
        let y = v.y
        let z = v.z

        const HALF_SQRT_2 = 0.70710678118654752440084436210485

        let tmp
        switch (rotation) {
        case ROTATION_NONE:
            return { x, y, z }
        case ROTATION_YAW_45: {
            tmp = HALF_SQRT_2 * (x - y)
            y   = HALF_SQRT_2 * (x + y)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_YAW_90: {
            tmp = x 
            x = -y
            y = tmp
            return { x, y, z }
        }
        case ROTATION_YAW_135: {
            tmp = -HALF_SQRT_2 * (x + y)
            y   =  HALF_SQRT_2 * (x - y)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_YAW_180:
            x = -x
            y = -y
            return { x, y, z }
        case ROTATION_YAW_225: {
            tmp =  HALF_SQRT_2 * (y - x)
            y   = -HALF_SQRT_2 * (x + y)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_YAW_270: {
            tmp = x
            x = y
            y = -tmp
            return { x, y, z }
        }
        case ROTATION_YAW_315: {
            tmp = HALF_SQRT_2 * (x + y)
            y   = HALF_SQRT_2 * (y - x)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_180: {
            y = -y
            z = -z
            return { x, y, z }
        }
        case ROTATION_ROLL_180_YAW_45: {
            tmp = HALF_SQRT_2 * (x + y)
            y   = HALF_SQRT_2 * (x - y)
            x = tmp
            z = -z
            return { x, y, z }
        }
        case ROTATION_ROLL_180_YAW_90:
        case ROTATION_PITCH_180_YAW_270: {
            tmp = x
            x = y
            y = tmp
            z = -z
            return { x, y, z }
        }
        case ROTATION_ROLL_180_YAW_135: {
            tmp = HALF_SQRT_2 * (y - x)
            y   = HALF_SQRT_2 * (y + x)
            x = tmp
            z = -z
            return { x, y, z }
        }
        case ROTATION_PITCH_180: {
            x = -x
            z = -z
            return { x, y, z }
        }
        case ROTATION_ROLL_180_YAW_225: {
            tmp = -HALF_SQRT_2 * (x + y)
            y   =  HALF_SQRT_2 * (y - x)
            x = tmp
            z = -z
            return { x, y, z }
        }
        case ROTATION_ROLL_180_YAW_270: 
        case ROTATION_PITCH_180_YAW_90: {
            tmp = x
            x = -y
            y = -tmp
            z = -z
            return { x, y, z }
        }
        case ROTATION_ROLL_180_YAW_315: {
            tmp =  HALF_SQRT_2 * (x - y)
            y   = -HALF_SQRT_2 * (x + y)
            x = tmp
            z = -z
            return { x, y, z }
        }
        case ROTATION_ROLL_90: {
            tmp = z
            z = y
            y = -tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_90_YAW_45: {
            tmp = z
            z = y
            y = -tmp
            tmp = HALF_SQRT_2 * (x - y)
            y   = HALF_SQRT_2 * (x + y)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_90_YAW_90: {
            tmp = z
            z = y
            y = -tmp
            tmp = x
            x = -y
            y = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_90_YAW_135: {
            tmp = z
            z = y
            y = -tmp
            tmp = -HALF_SQRT_2 * (x + y)
            y   =  HALF_SQRT_2 * (x - y)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_270: {
            tmp = z
            z = -y
            y = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_270_YAW_45: {
            tmp = z
            z = -y
            y = tmp
            tmp = HALF_SQRT_2 * (x - y)
            y   = HALF_SQRT_2 * (x + y)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_270_YAW_90: {
            tmp = z
            z = -y
            y = tmp
            tmp = x
            x = -y
            y = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_270_YAW_135: {
            tmp = z
            z = -y
            y = tmp
            tmp = -HALF_SQRT_2 * (x + y)
            y   =  HALF_SQRT_2 * (x - y)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_PITCH_90: {
            tmp = z
            z = -x 
            x = tmp
            return { x, y, z }
        }
        case ROTATION_PITCH_270: {
            tmp = z
            z = x
            x = -tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_90_PITCH_90: {
            tmp = z
            z = y
            y = -tmp
            tmp = z
            z = -x
            x = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_180_PITCH_90: {
            y = -y
            z = -z
            tmp = z
            z = -x
            x = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_270_PITCH_90: {
            tmp = z
            z = -y
            y = tmp
            tmp = z
            z = -x
            x = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_90_PITCH_180: {
            tmp = z
            z = y
            y = -tmp
            x = -x
            z = -z
            return { x, y, z }
        }
        case ROTATION_ROLL_270_PITCH_180: {
            tmp = z
            z = -y
            y = tmp
            x = -x
            z = -z
            return { x, y, z }
        }
        case ROTATION_ROLL_90_PITCH_270: {
            tmp = z
            z = y
            y = -tmp
            tmp = z
            z = x
            x = -tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_180_PITCH_270: {
            y = -y
            z = -z
            tmp = z
            z = x
            x = -tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_270_PITCH_270: {
            tmp = z
            z = -y
            y = tmp
            tmp = z
            z = x
            x = -tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_90_PITCH_180_YAW_90: {
            tmp = z
            z = y
            y = -tmp
            x = -x
            z = -z
            tmp = x
            x = -y
            y = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_90_YAW_270: {
            tmp = z
            z = y
            y = -tmp
            tmp = x
            x = y
            y = -tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_90_PITCH_68_YAW_293: {
            const tmp_x = x
            const tmp_y = y
            const tmp_z = z
            x =  0.14303897231223747232853327204793 * tmp_x +  0.36877648650320382639478111741482 * tmp_y + -0.91844638134308709265241077446262 * tmp_z
            y = -0.33213277779664740485543461545603 * tmp_x + -0.85628942146641884303193137384369 * tmp_y + -0.39554550256296522325882847326284 * tmp_z
            z = -0.93232380121551217122544130688766 * tmp_x +  0.36162457008209242248497616856184 * tmp_y +  0.00000000000000002214311861220361 * tmp_z
            return { x, y, z }
        }
        case ROTATION_PITCH_315: {
            tmp = HALF_SQRT_2 * (x - z)
            z   = HALF_SQRT_2 * (x + z)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_90_PITCH_315: {
            tmp = z
            z = y
            y = -tmp
            tmp = HALF_SQRT_2 * (x - z)
            z   = HALF_SQRT_2 * (x + z)
            x = tmp
            return { x, y, z }
        }
        case ROTATION_PITCH_7: {
            const sin_pitch = 0.1218693434051474899781908334262
            const cos_pitch = 0.99254615164132198312785249072476
            const tmp_x = x
            const tmp_z = z
            x =  cos_pitch * tmp_x + sin_pitch * tmp_z
            z = -sin_pitch * tmp_x + cos_pitch * tmp_z
            return { x, y, z }
        }
        case ROTATION_ROLL_45: {
            tmp = HALF_SQRT_2 * (y - z)
            z   = HALF_SQRT_2 * (y + z)
            y = tmp
            return { x, y, z }
        }
        case ROTATION_ROLL_315: {
            tmp = HALF_SQRT_2 * (y + z)
            z   = HALF_SQRT_2 * (z - y)
            y = tmp
            return { x, y, z }
        }
        case ROTATION_CUSTOM_1:
        case ROTATION_CUSTOM_2:
        case ROTATION_MAX:
        case ROTATION_CUSTOM_OLD:
        case ROTATION_CUSTOM_END:
            break
        }
        // rotation invalid
    }

    this.from_euler = function(roll, pitch, yaw) {
        const cp = Math.cos(pitch)
        const sp = Math.sin(pitch)
        const sr = Math.sin(roll)
        const cr = Math.cos(roll)
        const sy = Math.sin(yaw)
        const cy = Math.cos(yaw)

        this.a.x = cp * cy
        this.a.y = (sr * sp * cy) - (cr * sy)
        this.a.z = (cr * sp * cy) + (sr * sy)
        this.b.x = cp * sy
        this.b.y = (sr * sp * sy) + (cr * cy)
        this.b.z = (cr * sp * sy) - (sr * cy)
        this.c.x = -sp
        this.c.y = sr * cp
        this.c.z = cr * cp
    }

    this.to_euler = function() {
        return { x:  Math.atan2(this.c.y, this.c.z),
                 y: -safe_asin(this.c.x),
                 z:  Math.atan2(this.b.x, this.a.x) }
    }

    this.from_rotation = function(rotation) {
        const a_tmp = rotate(rotation, { x: 1.0, y: 0.0, z: 0.0 })
        const b_tmp = rotate(rotation, { x: 0.0, y: 1.0, z: 0.0 })
        const c_tmp = rotate(rotation, { x: 0.0, y: 0.0, z: 1.0 })

        if ((a_tmp == null) || (b_tmp == null) || (c_tmp == null)) {
            return false
        }

        this.a = { x: a_tmp.x, y: b_tmp.x, z: c_tmp.x }
        this.b = { x: a_tmp.y, y: b_tmp.y, z: c_tmp.y }
        this.c = { x: a_tmp.z, y: b_tmp.z, z: c_tmp.z }

        return true
    }

    this.to_euler312 = function() {
        return { x: safe_asin(this.c.y),
                 y: Math.atan2(-this.c.x, this.c.z),
                 z: Math.atan2(-this.a.y, this.b.y) }
    }

    this.from_euler312 = function(roll, pitch, yaw) {

        const c3 = Math.cos(pitch)
        const s3 = Math.sin(pitch)
        const s2 = Math.sin(roll)
        const c2 = Math.cos(roll)
        const s1 = Math.sin(yaw)
        const c1 = Math.cos(yaw)

        this.a.x = c1 * c3 - s1 * s2 * s3
        this.b.y = c1 * c2
        this.c.z = c3 * c2
        this.a.y = -c2*s1
        this.a.z = s3*c1 + c3*s2*s1
        this.b.x = c3*s1 + s3*s2*c1
        this.b.z = s1*s3 - s2*c1*c3
        this.c.x = -s3*c2
        this.c.y = s2
    }

    this.rotate = function(v) {
        return [ this.a.x * v[0] + this.a.y * v[1] + this.a.z * v[2],
                 this.b.x * v[0] + this.b.y * v[1] + this.b.z * v[2],
                 this.c.x * v[0] + this.c.y * v[1] + this.c.z * v[2] ]
    }

}
