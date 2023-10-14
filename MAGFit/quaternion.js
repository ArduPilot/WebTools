
// Quaternion rotation helpers

function get_rotation_name(rotation) {

    const names = {
        "0": "None",
        "1": "Yaw45",
        "10": "Yaw90Roll180",
        "100": "Custom 4.1 and older",
        "101": "Custom 1",
        "102": "Custom 2",
        "11": "Yaw135Roll180",
        "12": "Pitch180",
        "13": "Yaw225Roll180",
        "14": "Yaw270Roll180",
        "15": "Yaw315Roll180",
        "16": "Roll90",
        "17": "Yaw45Roll90",
        "18": "Yaw90Roll90",
        "19": "Yaw135Roll90",
        "2": "Yaw90",
        "20": "Roll270",
        "21": "Yaw45Roll270",
        "22": "Yaw90Roll270",
        "23": "Yaw135Roll270",
        "24": "Pitch90",
        "25": "Pitch270",
        "26": "Yaw90Pitch180",
        "27": "Yaw270Pitch180",
        "28": "Pitch90Roll90",
        "29": "Pitch90Roll180",
        "3": "Yaw135",
        "30": "Pitch90Roll270",
        "31": "Pitch180Roll90",
        "32": "Pitch180Roll270",
        "33": "Pitch270Roll90",
        "34": "Pitch270Roll180",
        "35": "Pitch270Roll270",
        "36": "Yaw90Pitch180Roll90",
        "37": "Yaw270Roll90",
        "38": "Yaw293Pitch68Roll180",
        "39": "Pitch315",
        "4": "Yaw180",
        "40": "Pitch315Roll90",
        "42": "Roll45",
        "43": "Roll315",
        "5": "Yaw225",
        "6": "Yaw270",
        "7": "Yaw315",
        "8": "Roll180",
        "9": "Yaw45Roll180"
    }

    for (const [rot, name] of Object.entries(names)) {
        if (rot == rotation) {
            return rot.toString() + ":" + name
        }
    }
}

function Quaternion() {

    this.q1
    this.q2
    this.q3
    this.q4

    // Get rotation from ArduPilot numbering
    this.from_rotation = function(rotation) {

        // From Rotation enum
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
        //const ROTATION_PITCH_180_YAW_90    = 26 // same as ROTATION_ROLL_180_YAW_270
        //const ROTATION_PITCH_180_YAW_270   = 27 // same as ROTATION_ROLL_180_YAW_90
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
        const ROTATION_ROLL_90_PITCH_68_YAW_293 = 38 // this is actually, roll 90, pitch 68.8, yaw 293.3
        const ROTATION_PITCH_315           = 39
        const ROTATION_ROLL_90_PITCH_315   = 40
        const ROTATION_PITCH_7             = 41
        const ROTATION_ROLL_45             = 42
        const ROTATION_ROLL_315            = 43

        const HALF_SQRT_2 = 0.70710678118654752440084436210485
        const HALF_SQRT_2_PlUS_SQRT_2 = 0.92387953251128673848313610506011 // sqrt(2 + sqrt(2)) / 2
        const HALF_SQRT_2_MINUS_SQTR_2 = 0.38268343236508972626808144923416 // sqrt(2 - sqrt(2)) / 2
        const HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO = 0.65328148243818828788676000840496 // sqrt((2 + sqrt(2))/2) / 2
        const HALF_SQRT_HALF_TIMES_TWO_MINUS_SQRT_TWO = 0.27059805007309845059637609665515 // sqrt((2 - sqrt(2))/2) / 2

        let q1, q2, q3, q4

        switch (rotation) {
            case ROTATION_NONE:
                q1 = 1
                q2 = q3 = q4 = 0
                break

            case ROTATION_YAW_45:
                q1 = HALF_SQRT_2_PlUS_SQRT_2
                q2 = q3 = 0
                q4 = HALF_SQRT_2_MINUS_SQTR_2
                break

            case ROTATION_YAW_90:
                q1 = HALF_SQRT_2
                q2 = q3 = 0
                q4 = HALF_SQRT_2
                break

            case ROTATION_YAW_135:
                q1 = HALF_SQRT_2_MINUS_SQTR_2
                q2 = q3 = 0
                q4 = HALF_SQRT_2_PlUS_SQRT_2
                break

            case ROTATION_YAW_180:
                q1 = q2 = q3 = 0
                q4=1
                break

            case ROTATION_YAW_225:
                q1 = -HALF_SQRT_2_MINUS_SQTR_2
                q2 = q3 = 0
                q4 = HALF_SQRT_2_PlUS_SQRT_2
                break

            case ROTATION_YAW_270:
                q1 = HALF_SQRT_2
                q2 = q3 = 0
                q4 = -HALF_SQRT_2
                break

            case ROTATION_YAW_315:
                q1 = HALF_SQRT_2_PlUS_SQRT_2
                q2 = q3 = 0
                q4 = -HALF_SQRT_2_MINUS_SQTR_2
                break

            case ROTATION_ROLL_180:
                q1 = q3 = q4 = 0
                q2 = 1
                break

            case ROTATION_ROLL_180_YAW_45:
                q1 = q4 = 0
                q2 = HALF_SQRT_2_PlUS_SQRT_2
                q3 = HALF_SQRT_2_MINUS_SQTR_2
                break

            case ROTATION_ROLL_180_YAW_90:
        //case ROTATION_PITCH_180_YAW_270:
                q1 = q4 = 0
                q2 = q3 = HALF_SQRT_2
                break

            case ROTATION_ROLL_180_YAW_135:
                q1 = q4 = 0
                q2 = HALF_SQRT_2_MINUS_SQTR_2
                q3 = HALF_SQRT_2_PlUS_SQRT_2
                break

            case ROTATION_PITCH_180:
                q1 = q2 = q4 = 0
                q3 = 1
                break

            case ROTATION_ROLL_180_YAW_225:
                q1 = q4 = 0
                q2 = -HALF_SQRT_2_MINUS_SQTR_2
                q3 = HALF_SQRT_2_PlUS_SQRT_2
                break

            case ROTATION_ROLL_180_YAW_270:
        //case ROTATION_PITCH_180_YAW_90:
                q1 = q4 = 0
                q2 = -HALF_SQRT_2
                q3 = HALF_SQRT_2
                break

            case ROTATION_ROLL_180_YAW_315:
                q1 = q4 = 0
                q2 = HALF_SQRT_2_PlUS_SQRT_2
                q3 = -HALF_SQRT_2_MINUS_SQTR_2
                break

            case ROTATION_ROLL_90:
                q1 = q2 = HALF_SQRT_2
                q3 = q4 = 0
                break

            case ROTATION_ROLL_90_YAW_45:
                q1 = HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                q2 = HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                q3 = q4 = HALF_SQRT_HALF_TIMES_TWO_MINUS_SQRT_TWO
                break

            case ROTATION_ROLL_90_YAW_90:
                q1 = q2 = q3 = q4 = 0.5
                break

            case ROTATION_ROLL_90_YAW_135:
                q1 = q2 = HALF_SQRT_HALF_TIMES_TWO_MINUS_SQRT_TWO
                q3 = HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                q4 = HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                break

            case ROTATION_ROLL_270:
                q1 = HALF_SQRT_2
                q2 = -HALF_SQRT_2
                q3 = q4 = 0
                break

            case ROTATION_ROLL_270_YAW_45:
                q1 = HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                q2 = -HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                q3 = -HALF_SQRT_HALF_TIMES_TWO_MINUS_SQRT_TWO
                q4 = HALF_SQRT_HALF_TIMES_TWO_MINUS_SQRT_TWO
                break

            case ROTATION_ROLL_270_YAW_90:
                q1 = q4 = 0.5
                q2 = q3 = -0.5
                break

            case ROTATION_ROLL_270_YAW_135:
                q1 = HALF_SQRT_HALF_TIMES_TWO_MINUS_SQRT_TWO
                q2 = -HALF_SQRT_HALF_TIMES_TWO_MINUS_SQRT_TWO
                q3 = -HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                q4 = HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                break

            case ROTATION_PITCH_90:
                q1 = q3 = HALF_SQRT_2
                q2 = q4 = 0
                break

            case ROTATION_PITCH_270:
                q1 = HALF_SQRT_2
                q2 = q4 = 0
                q3 = -HALF_SQRT_2
                break

            case ROTATION_ROLL_90_PITCH_90:
                q1 = q2 = q3 = -0.5
                q4 = 0.5
                break

            case ROTATION_ROLL_180_PITCH_90:
                q1 = q3 = 0
                q2 = -HALF_SQRT_2
                q4 = HALF_SQRT_2
                break

            case ROTATION_ROLL_270_PITCH_90:
                q1 = q3 = q4 = 0.5
                q2 = -0.5
                break

            case ROTATION_ROLL_90_PITCH_180:
                q1 = q2 = 0
                q3 = -HALF_SQRT_2
                q4 = HALF_SQRT_2
                break

            case ROTATION_ROLL_270_PITCH_180:
                q1 = q2 = 0
                q3 = q4 = HALF_SQRT_2
                break

            case ROTATION_ROLL_90_PITCH_270:
                q1 = q2 = q4 = 0.5
                q3 = -0.5
                break

            case ROTATION_ROLL_180_PITCH_270:
                q1 = q3 = 0
                q2 = q4 = HALF_SQRT_2
                break

            case ROTATION_ROLL_270_PITCH_270:
                q1 = -0.5
                q2 = q3 = q4 = 0.5
                break

            case ROTATION_ROLL_90_PITCH_180_YAW_90:
                q1 = q3 = -0.5
                q2 = q4 = 0.5
                break

            case ROTATION_ROLL_90_YAW_270:
                q1 = q2 = -0.5
                q3 = q4 = 0.5
                break

            case ROTATION_ROLL_90_PITCH_68_YAW_293:
                q1 = 0.26774500501681575137524760066299
                q2 = 0.70698804688952421315661922562867
                q3 = 0.012957683254962659713527273197542
                q4 = -0.65445596665363614530264158020145
                break

            case ROTATION_PITCH_315:
                q1 = HALF_SQRT_2_PlUS_SQRT_2
                q2 = q4 = 0
                q3 = -HALF_SQRT_2_MINUS_SQTR_2
                break

            case ROTATION_ROLL_90_PITCH_315:
                q1 = HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                q2 = HALF_SQRT_HALF_TIMES_TWO_PLUS_SQRT_TWO
                q3 = -HALF_SQRT_HALF_TIMES_TWO_MINUS_SQRT_TWO
                q4 = HALF_SQRT_HALF_TIMES_TWO_MINUS_SQRT_TWO
                break

            case ROTATION_PITCH_7:
                q1 = 0.99813479842186692003735970502021
                q2 = q4 = 0
                q3 = 0.061048539534856872956769535676358
                break

            case ROTATION_ROLL_45:
                q1 = HALF_SQRT_2_PlUS_SQRT_2
                q2 = HALF_SQRT_2_MINUS_SQTR_2
                q3 = q4 = 0.0
                break

            case ROTATION_ROLL_315:
                q1 = HALF_SQRT_2_PlUS_SQRT_2
                q2 = -HALF_SQRT_2_MINUS_SQTR_2
                q3 = q4 = 0.0
                break
        
            default:
                return false
        }

        this.q1 = q1
        this.q2 = q2
        this.q3 = q3
        this.q4 = q4

        return true

    }

    this.invert = function() {
        this.q2 *= -1
        this.q3 *= -1
        this.q4 *= -1
    }

    this.rotate = function(vec) {

        let uv = [
            (this.q3 * vec[2] - this.q4 * vec[1]) * 2.0,
            (this.q4 * vec[0] - this.q2 * vec[2]) * 2.0,
            (this.q2 * vec[1] - this.q3 * vec[0]) * 2.0
        ]

        return [
            vec[0] + (this.q1 * uv[0] + this.q3 * uv[2] - this.q4 * uv[1]),
            vec[1] + (this.q1 * uv[1] + this.q4 * uv[0] - this.q2 * uv[2]),
            vec[2] + (this.q1 * uv[2] + this.q2 * uv[1] - this.q3 * uv[0])
        ]
    }

    this.from_euler = function(roll, pitch, yaw) {

        const cr2 = Math.cos(roll*0.5);
        const cp2 = Math.cos(pitch*0.5);
        const cy2 = Math.cos(yaw*0.5);
        const sr2 = Math.sin(roll*0.5);
        const sp2 = Math.sin(pitch*0.5);
        const sy2 = Math.sin(yaw*0.5);

        this.q1 = cr2*cp2*cy2 + sr2*sp2*sy2;
        this.q2 = sr2*cp2*cy2 - cr2*sp2*sy2;
        this.q3 = cr2*sp2*cy2 + sr2*cp2*sy2;
        this.q4 = cr2*cp2*sy2 - sr2*sp2*cy2;
    }

}