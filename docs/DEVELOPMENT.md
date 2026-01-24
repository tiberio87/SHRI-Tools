# Development

## Prereqs
- Node.js LTS
- npm

## Install
```bash
npm install
```

## Run
```bash
npm start
```

## Structure
- main.js: Electron main process, IPC, filesystem access (scan/rename, metadata fetch).
- preload.js: IPC bridge.
- app/index.html: UI layout.
- app/style.css: UI styling.
- app/renderer.js: UI logic, metadata, rules, rename builder.
- app/services.json: service list for the UI.

## Settings
- Stored in Chromium localStorage.
- Keys: shri-renamer-settings, shri-renamer-theme.
- Clearing app storage resets settings and API keys.

## Logs
- "Apri log" opens the in-app log viewer.

## Rules Reference
- See docs/RULES.txt for the full tracker naming rules.
