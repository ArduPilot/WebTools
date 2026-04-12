## Kinematic Tool

Visualizes the kinematic limits of the vehicle. So far attitude control. Could add position control in the future.

## WASM

Rather than re-writing the AP function into JS they are compiled into WASM and used directly.

To do this emscipten is used, https://emscripten.org/index.html

EMSDK is installed one level above this repo.

Setup emcc to be used:
```
..\emsdk\emsdk activate latest
..\emsdk\emsdk_env.sh
```

Test setup with:
```
emcc -v 
```

Some helper bindings and defines are needed, these are in `/ardupilot` the code can then be built with:

```
emcc -I .\KinematicTool\ardupilot\stubs -I .\modules\ardupilot\libraries -include .\KinematicTool\ardupilot\stubs.h .\modules\ardupilot\libraries\AP_Math\AP_Math.cpp .\modules\ardupilot\libraries\AP_Math\control.cpp KinematicTool\ardupilot\bindings.cpp -o .\KinematicTool\ardupilot\control.js -s MODULARIZE=1 -s ENVIRONMENT='web' -s EXPORT_NAME='ControlModule' -s EXPORTED_FUNCTIONS='["_shape_angle_vel_accel_wrapper", "_sqrt_controller_wrapper"]'
```

This then builds `control.js` and `control.wasm` which are included in `/ardupilot`.

