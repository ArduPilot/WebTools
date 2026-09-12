# SiK Radio Tools (WebTools bundle)

Static build of [SiK Radio Tools](https://github.com/JamesM9/SIK-Radio-Tools) for the ArduPilot WebTools hub.

## Rebuild from upstream

```bash
git clone https://github.com/JamesM9/SIK-Radio-Tools.git
cd SIK-Radio-Tools/sik-radio-tools
npm ci
npm run build
```

Copy **`index.html`** and the entire **`dist/`** directory into this folder (`WebTools/SiKRadioTools/`), replacing existing files.

## License

GPL-3.0 (same as [ArduPilot/WebTools](https://github.com/ArduPilot/WebTools)).
