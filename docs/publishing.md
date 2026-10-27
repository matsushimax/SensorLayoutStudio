# Publishing Sensor Layout Studio

Repository: `matsushimax/SensorLayoutStudio`. Default branch: `main`.

## Browser demo

In repository Settings → Pages, select **GitHub Actions** as the source. The `Deploy browser demo` workflow builds and publishes `dist` on a push to `main` or manual dispatch. It obtains the base path from `configure-pages`; the desktop build keeps `/`.

Expected URL: https://matsushimax.github.io/SensorLayoutStudio/

Before announcing the URL, confirm the workflow succeeded and test the published app including STEP import. To check a production build locally:

```powershell
$env:PAGES_BASE_PATH = '/SensorLayoutStudio/'
npm.cmd run build
npm.cmd run preview -- --port 4173
# In another terminal:
node scripts/smoke-browser-build.mjs
```

Remove the environment variable before building the desktop edition: `Remove-Item Env:PAGES_BASE_PATH`.

## Windows release

Keep versions in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json` aligned. Update `docs/release-notes.md`, push `main`, then push a matching tag such as `v0.1.1`. `Build release` requires a successful **Check and build** run for the exact tagged commit (including all browser tests on Linux and the Windows build), builds the Windows app and prepares a **draft** GitHub Release. Browser tests are not duplicated on the Windows packaging runner. You can also run the workflow manually from `main`, specifying an existing tag; it checks out that tag and enforces the same commit check.

The release contains the portable ZIP, NSIS installer, dependency source archives, notices and SHA-256 checksums. Review the draft and test the downloaded ZIP/installer before publishing. Subsequent tag names must be new; do not move already published tags.

Local packaging after `npm run tauri build`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1
```

Outputs are ignored in `release-artifacts/`; staging folders are ignored in `.release-staging/`. Archive downloads need network access. See [STEP runtime sources](cad-runtime.md) for pinned upstream revisions.

## First publication checks

- Confirm only intended source, documentation and original sample assets are tracked. Exclude environment files, dependencies, binaries and temporary recordings.
- Run format, build, unit and browser tests from a fresh checkout.
- Verify the deployed browser demo and Windows release downloads.
- Replace the README's unpublished-status notice with the verified live links.
- Set the repository About description and website; use topics such as `tauri`, `threejs`, `lidar`, `robotics` and `sensor-fusion`.

GitHub sign-in, two-factor authentication and any account-level approval must be completed by the account owner. No password or access token should be committed or pasted into a chat.
