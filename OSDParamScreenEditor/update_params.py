#!/usr/bin/env python3
"""
Regenerate the bundled parameter metadata used by the OSD Parameter Editor.

Downloads the published apm.pdef.json for each vehicle from autotest.ardupilot.org
and keeps only what the editor needs: writable parameters with their display name,
range and increment. Writes <Vehicle>_params.json next to this script.

Usage: python3 update_params.py
"""

import json
import os
import urllib.request

SOURCES = {
    "Plane": "https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.json",
    "Copter": "https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.json",
    "Rover": "https://autotest.ardupilot.org/Parameters/APMrover2/apm.pdef.json",
}

KEEP = ("DisplayName", "Range", "Increment")


def reduce(pdef):
    out = {}
    for group in pdef.values():
        if not isinstance(group, dict):
            continue
        for name, meta in group.items():
            # Read-only parameters cannot be adjusted from the OSD
            if not isinstance(meta, dict) or meta.get("ReadOnly"):
                continue
            out[name] = {key: meta[key] for key in KEEP if key in meta}
    return dict(sorted(out.items()))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for vehicle, url in SOURCES.items():
        with urllib.request.urlopen(url) as response:
            params = reduce(json.load(response))
        path = os.path.join(here, f"{vehicle}_params.json")
        with open(path, "w") as f:
            json.dump(params, f, separators=(",", ":"))
            f.write("\n")
        print(f"{vehicle}: {len(params)} parameters -> {os.path.basename(path)}")


if __name__ == "__main__":
    main()
