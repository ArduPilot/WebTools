## ArduPilot Web Tools

This repository contains a number of web based tools for targeted ArduPilot log review and insight. These tools are live on [ardupilot.org](https://firmware.ardupilot.org/Tools/WebTools). For general review see [UAVLogViewer](https://github.com/ArduPilot/UAVLogViewer).

## Development setup

These steps allow hosting of the tools locally for development purposes or for use without a internet connection.

Clone this repository (or your fork) and update the submodules:

```
git clone https://github.com/ArduPilot/WebTools.git
git submodule update --init
```

Host locally using python by running the following command in the root of the repo:

```
python -m http.server --bind 127.0.0.1
```

The landing page can then be found at http://127.0.0.1:8000/
