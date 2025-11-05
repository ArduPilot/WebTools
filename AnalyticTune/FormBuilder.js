// Data structure for table definitions
const tableData = {
    // RollPitchTC Prefix Tables
    "RollPitchTC": [
        {
            id: "RollPitchTC",
            inputs: [
                { id: "ATC_INPUT_TC", name: "ATC_INPUT_TC", type: "number", step: "0.01", value: "0.15" }
            ]
        }
    ],
    // RollPIDS Prefix Tables
    "RollPIDS": [
        {
            id: "RollPIDS",
            inputs: [
                { id: "ATC_ANG_RLL_P", name: "ATC_ANG_RLL_P", type: "number", step: "0.1", value: "4.5" },
                { id: "ATC_RAT_RLL_FF", name: "ATC_RAT_RLL_FF", type: "number", step: "0.01", value: "0.0" },
                { id: "ATC_RAT_RLL_P", name: "ATC_RAT_RLL_P", type: "number", step: "0.01", value: "0.288" },
                { id: "ATC_RAT_RLL_I", name: "ATC_RAT_RLL_I", type: "number", step: "0.01", value: "0.288" },
                { id: "ATC_RAT_RLL_D", name: "ATC_RAT_RLL_D", type: "number", step: "0.0001", value: "0.0117" },
                { id: "ATC_RAT_RLL_D_FF", name: "ATC_RAT_RLL_D_FF", type: "number", step: "0.0001", value: "0.0" },
                { id: "ATC_RAT_RLL_FLTT", name: "ATC_RAT_RLL_FLTT", type: "number", step: "0.01", value: "1.77" },
                { id: "ATC_RAT_RLL_FLTE", name: "ATC_RAT_RLL_FLTE", type: "number", step: "0.01", value: "0" },
                { id: "ATC_RAT_RLL_FLTD", name: "ATC_RAT_RLL_FLTD", type: "number", step: "0.01", value: "20" }
            ]
        }
    ],
    // PitchPIDS Prefix Tables
    "PitchPIDS": [
        {
            id: "PitchPIDS",
            inputs: [
                { id: "ATC_ANG_PIT_P", name: "ATC_ANG_PIT_P", type: "number", step: "0.1", value: "4.5" },
                { id: "ATC_RAT_PIT_FF", name: "ATC_RAT_PIT_FF", type: "number", step: "0.01", value: "0.0" },
                { id: "ATC_RAT_PIT_P", name: "ATC_RAT_PIT_P", type: "number", step: "0.01", value: "0.288" },
                { id: "ATC_RAT_PIT_I", name: "ATC_RAT_PIT_I", type: "number", step: "0.01", value: "0.288" },
                { id: "ATC_RAT_PIT_D", name: "ATC_RAT_PIT_D", type: "number", step: "0.0001", value: "0.0117" },
                { id: "ATC_RAT_PIT_D_FF", name: "ATC_RAT_PIT_D_FF", type: "number", step: "0.0001", value: "0.0" },
                { id: "ATC_RAT_PIT_FLTT", name: "ATC_RAT_PIT_FLTT", type: "number", step: "0.01", value: "1.77" },
                { id: "ATC_RAT_PIT_FLTE", name: "ATC_RAT_PIT_FLTE", type: "number", step: "0.01", value: "0" },
                { id: "ATC_RAT_PIT_FLTD", name: "ATC_RAT_PIT_FLTD", type: "number", step: "0.01", value: "20" }
            ]
        }
    ],
    // YawTC Prefix Tables
    "YawTC": [
        {
            id: "YawTC",
            inputs: [
                { id: "PILOT_Y_RATE_TC", name: "PILOT_Y_RATE_TC", type: "number", step: "0.01", value: "0.0" }
            ]
        }
    ],
    // YawPIDS Prefix Tables
    "YawPIDS": [
        {
            id: "YawPIDS",
            inputs: [
                { id: "ATC_ANG_YAW_P", name: "ATC_ANG_YAW_P", type: "number", step: "0.1", value: "4.5" },
                { id: "ATC_RAT_YAW_FF", name: "ATC_RAT_YAW_FF", type: "number", step: "0.01", value: "0.0" },
                { id: "ATC_RAT_YAW_P", name: "ATC_RAT_YAW_P", type: "number", step: "0.01", value: "0.288" },
                { id: "ATC_RAT_YAW_I", name: "ATC_RAT_YAW_I", type: "number", step: "0.01", value: "0.288" },
                { id: "ATC_RAT_YAW_D", name: "ATC_RAT_YAW_D", type: "number", step: "0.0001", value: "0.0117" },
                { id: "ATC_RAT_YAW_D_FF", name: "ATC_RAT_YAW_D_FF", type: "number", step: "0.0001", value: "0.0" },
                { id: "ATC_RAT_YAW_FLTT", name: "ATC_RAT_YAW_FLTT", type: "number", step: "0.01", value: "1.77" },
                { id: "ATC_RAT_YAW_FLTE", name: "ATC_RAT_YAW_FLTE", type: "number", step: "0.01", value: "0" },
                { id: "ATC_RAT_YAW_FLTD", name: "ATC_RAT_YAW_FLTD", type: "number", step: "0.01", value: "20" }
            ]
        }
    ],
    // QRollPitchTC Prefix Tables
    "QRollPitchTC": [
        {
            id: "QRollPitchTC",
            inputs: [
                { id: "Q_A_INPUT_TC", name: "Q_A_INPUT_TC", type: "number", step: "0.01", value: "0.15" }
            ]
        }
    ],
    // QRollPIDS Prefix Tables
    "QRollPIDS": [
        {
            id: "QRollPIDS",
            inputs: [
                { id: "Q_A_ANG_RLL_P", name: "Q_A_ANG_RLL_P", type: "number", step: "0.1", value: "4.5" },
                { id: "Q_A_RAT_RLL_FF", name: "Q_A_RAT_RLL_FF", type: "number", step: "0.01", value: "0.0" },
                { id: "Q_A_RAT_RLL_P", name: "Q_A_RAT_RLL_P", type: "number", step: "0.01", value: "0.288" },
                { id: "Q_A_RAT_RLL_I", name: "Q_A_RAT_RLL_I", type: "number", step: "0.01", value: "0.288" },
                { id: "Q_A_RAT_RLL_D", name: "Q_A_RAT_RLL_D", type: "number", step: "0.0001", value: "0.0117" },
                { id: "Q_A_RAT_RLL_D_FF", name: "Q_A_RAT_RLL_D_FF", type: "number", step: "0.0001", value: "0.0" },
                { id: "Q_A_RAT_RLL_FLTT", name: "Q_A_RAT_RLL_FLTT", type: "number", step: "0.01", value: "1.77" },
                { id: "Q_A_RAT_RLL_FLTE", name: "Q_A_RAT_RLL_FLTE", type: "number", step: "0.01", value: "0" },
                { id: "Q_A_RAT_RLL_FLTD", name: "Q_A_RAT_RLL_FLTD", type: "number", step: "0.01", value: "20" }
            ]
        }
    ],
    // QPitchPIDS Prefix Tables
    "QPitchPIDS": [
        {
            id: "QPitchPIDS",
            inputs: [
                { id: "Q_A_ANG_PIT_P", name: "Q_A_ANG_PIT_P", type: "number", step: "0.1", value: "4.5" },
                { id: "Q_A_RAT_PIT_FF", name: "Q_A_RAT_PIT_FF", type: "number", step: "0.01", value: "0.0" },
                { id: "Q_A_RAT_PIT_P", name: "Q_A_RAT_PIT_P", type: "number", step: "0.01", value: "0.288" },
                { id: "Q_A_RAT_PIT_I", name: "Q_A_RAT_PIT_I", type: "number", step: "0.01", value: "0.288" },
                { id: "Q_A_RAT_PIT_D", name: "Q_A_RAT_PIT_D", type: "number", step: "0.0001", value: "0.0117" },
                { id: "Q_A_RAT_PIT_D_FF", name: "Q_A_RAT_PIT_D_FF", type: "number", step: "0.0001", value: "0.0" },
                { id: "Q_A_RAT_PIT_FLTT", name: "Q_A_RAT_PIT_FLTT", type: "number", step: "0.01", value: "1.77" },
                { id: "Q_A_RAT_PIT_FLTE", name: "Q_A_RAT_PIT_FLTE", type: "number", step: "0.01", value: "0" },
                { id: "Q_A_RAT_PIT_FLTD", name: "Q_A_RAT_PIT_FLTD", type: "number", step: "0.01", value: "20" }
            ]
        }
    ],
    // QYawTC Prefix Tables
    "QYawTC": [
        {
            id: "QYawTC",
            inputs: [
                { id: "Q_PLT_Y_RATE_TC", name: "Q_PLT_Y_RATE_TC", type: "number", step: "0.01", value: "0.0" }
            ]
        }
    ],
    // QYawPIDS Prefix Tables
    "QYawPIDS": [
        {
            id: "QYawPIDS",
            inputs: [
                { id: "Q_A_ANG_YAW_P", name: "Q_A_ANG_YAW_P", type: "number", step: "0.1", value: "4.5" },
                { id: "Q_A_RAT_YAW_FF", name: "Q_A_RAT_YAW_FF", type: "number", step: "0.01", value: "0.0" },
                { id: "Q_A_RAT_YAW_P", name: "Q_A_RAT_YAW_P", type: "number", step: "0.01", value: "0.288" },
                { id: "Q_A_RAT_YAW_I", name: "Q_A_RAT_YAW_I", type: "number", step: "0.01", value: "0.288" },
                { id: "Q_A_RAT_YAW_D", name: "Q_A_RAT_YAW_D", type: "number", step: "0.0001", value: "0.0117" },
                { id: "Q_A_RAT_YAW_D_FF", name: "Q_A_RAT_YAW_D_FF", type: "number", step: "0.0001", value: "0.0" },
                { id: "Q_A_RAT_YAW_FLTT", name: "Q_A_RAT_YAW_FLTT", type: "number", step: "0.01", value: "1.77" },
                { id: "Q_A_RAT_YAW_FLTE", name: "Q_A_RAT_YAW_FLTE", type: "number", step: "0.01", value: "0" },
                { id: "Q_A_RAT_YAW_FLTD", name: "Q_A_RAT_YAW_FLTD", type: "number", step: "0.01", value: "20" }
            ]
        }
    ],
    // FWRoll Prefix Tables
    "FWRoll": [
        {
            id: "FWRollPIDS",
            inputs: [
                { id: "RLL2SRV_TCONST", name: "RLL2SRV_TCONST", type: "number", step: "0.01", value: "0.25" },
                { id: "RLL_RATE_FF", name: "RLL_RATE_FF", type: "number", step: "0.01", value: "0.0" },
                { id: "RLL_RATE_P", name: "RLL_RATE_P", type: "number", step: "0.01", value: "0.288" },
                { id: "RLL_RATE_I", name: "RLL_RATE_I", type: "number", step: "0.01", value: "0.288" },
                { id: "RLL_RATE_D", name: "RLL_RATE_D", type: "number", step: "0.0001", value: "0.0117" },
                { id: "RLL_RATE_D_FF", name: "RLL_RATE_D_FF", type: "number", step: "0.0001", value: "0.0" },
                { id: "RLL_RATE_FLTT", name: "RLL_RATE_FLTT", type: "number", step: "0.01", value: "1.77" },
                { id: "RLL_RATE_FLTE", name: "RLL_RATE_FLTE", type: "number", step: "0.01", value: "0" },
                { id: "RLL_RATE_FLTD", name: "RLL_RATE_FLTD", type: "number", step: "0.01", value: "20" }
            ]
        }
    ],
    // FWPitch Prefix Tables
    "FWPitch": [
        {
            id: "FWPitchPIDS",
            inputs: [
                { id: "PTCH2SRV_TCONST", name: "PTCH2SRV_TCONST", type: "number", step: "0.01", value: "0.5" },
                { id: "PTCH_RATE_FF", name: "PTCH_RATE_FF", type: "number", step: "0.01", value: "0.0" },
                { id: "PTCH_RATE_P", name: "PTCH_RATE_P", type: "number", step: "0.01", value: "0.288" },
                { id: "PTCH_RATE_I", name: "PTCH_RATE_I", type: "number", step: "0.01", value: "0.288" },
                { id: "PTCH_RATE_D", name: "PTCH_RATE_D", type: "number", step: "0.0001", value: "0.0117" },
                { id: "PTCH_RATE_D_FF", name: "PTCH_RATE_D_FF", type: "number", step: "0.0001", value: "0.0" },
                { id: "PTCH_RATE_FLTT", name: "PTCH_RATE_FLTT", type: "number", step: "0.01", value: "1.77" },
                { id: "PTCH_RATE_FLTE", name: "PTCH_RATE_FLTE", type: "number", step: "0.01", value: "0" },
                { id: "PTCH_RATE_FLTD", name: "PTCH_RATE_FLTD", type: "number", step: "0.01", value: "20" }
            ]
        }
    ]
};

// --- Configuration ---
// Set this variable to "", "Q", or "FW" to control which tables are loaded
//var activePrefix = "Roll"; 
function buildAllTables() {
    buildTables("RollPitchTC", "none");
    buildTables("YawTC", "none");
    buildTables("RollPIDS", "none");
    buildTables("PitchPIDS", "none");
    buildTables("YawPIDS", "none");
    buildTables("QRollPitchTC", "none");
    buildTables("QYawTC", "none");
    buildTables("QRollPIDS", "none");
    buildTables("QPitchPIDS", "none");
    buildTables("QYawPIDS", "none");
    buildTables("FWRoll", "none");
    buildTables("FWPitch", "none");
}

function buildTables(activePrefix, setdisplay) {
    const container = document.getElementById('tables-container');
//    container.innerHTML = ''; // Clear previous content

    // Create and append tables for the active prefix
    if (tableData[activePrefix]) {
        tableData[activePrefix].forEach(tableDef => {
            const div = document.createElement('div');
            div.id = tableDef.id;
            div.style.display = setdisplay; // Or manage visibility as needed

            tableDef.inputs.forEach(inputDef => {
                const p = document.createElement('p');
                const input = document.createElement('input');
                input.setAttribute('id', inputDef.id);
                input.setAttribute('name', inputDef.name);
                input.setAttribute('type', inputDef.type);
                input.setAttribute('step', inputDef.step);
                input.setAttribute('value', inputDef.value);
                input.setAttribute('onchange', "calculate_freq_resp(this)")
                
                p.appendChild(input);
                div.appendChild(p);
            });
            
            container.appendChild(div);
        });
    }
}
