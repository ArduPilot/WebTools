emcc ^
    -I .\SCurveTool\ardupilot\stubs ^
    -I .\modules\ardupilot\libraries ^
    -include .\SCurveTool\ardupilot\stubs.h ^
    .\modules\ardupilot\libraries\AC_WPNav\AC_WPNav.cpp ^
    .\modules\ardupilot\libraries\AP_Math\SCurve.cpp ^
    .\modules\ardupilot\libraries\AP_Math\vector3.cpp ^
    .\modules\ardupilot\libraries\AP_Math\vector2.cpp ^
    .\modules\ardupilot\libraries\AP_Math\control.cpp ^
    .\modules\ardupilot\libraries\AP_Math\AP_Math.cpp ^
    .\modules\ardupilot\libraries\AP_Math\SplineCurve.cpp ^
    .\modules\ardupilot\libraries\AP_Math\location.cpp ^
    .\SCurveTool\ardupilot\stubs\AC_AttitudeControl\AC_PosControl.cpp ^
    .\SCurveTool\ardupilot\stubs\AP_AHRS\AP_AHRS.cpp ^
    .\SCurveTool\ardupilot\bindings.cpp ^
    -o .\SCurveTool\ardupilot\wpnav.js ^
    -s MODULARIZE=1 ^
    -s ENVIRONMENT='web' ^
    -s EXPORT_NAME='WPNavModule' ^
    -Wno-gnu-designator ^
    --bind ^
