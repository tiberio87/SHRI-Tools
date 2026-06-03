# SHRI-Tools v4.1.0

## Security and storage

- Added encrypted storage for sensitive settings such as API keys and torrent client passwords.
- Desktop Electron uses `safeStorage` when available, with an encrypted fallback when it is not.
- Docker keeps the encrypted secret store inside the persistent `/data` volume, so secrets survive restarts without being kept in plain text.

## Behavior changes

- Non-sensitive settings remain in the existing renderer storage.
- Existing clear-text secrets are migrated into the encrypted store on first load.
- The app no longer writes those secrets directly into renderer `localStorage`.

## Notes for release

- Recommended tag: `v4.1.0`
- Docker image is built automatically from `main` and tag pushes.