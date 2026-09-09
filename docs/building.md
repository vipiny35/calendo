# Building

Calendo is a Tauri 2 app. The web UI is TypeScript; the menu bar extra is Rust.

## Toolchain

- macOS 13 or newer
- Node 22 and [pnpm 9.4](https://pnpm.io) (the version pinned in `package.json`)
- A current stable Rust toolchain (`rustup`)
- Xcode Command Line Tools (`xcode-select --install`)

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm app
```

`pnpm app` builds and opens a debug `Calendo.app` bundle. This includes the
app identity and Calendar usage descriptions needed for macOS permission prompts.
Look for Calendo in the menu bar.

`pnpm dev` runs the unbundled executable with file watching for UI development.
Use `pnpm app` when testing Calendar permissions.

## Releases

`pnpm dmg` produces a notarized disk image under
`src-tauri/target/release/bundle/dmg`. It reads `.env.notarization`, which is
gitignored and holds `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_PASSWORD` (an
app-specific password) and `APPLE_SIGNING_IDENTITY`; exported variables win
over the file, so CI can supply them as secrets. Without them the script stops
rather than shipping an image Gatekeeper will refuse.

Tauri notarizes and staples the `.app`, then wraps it in a disk image it never
submits, so `scripts/release-dmg.mjs` submits and staples the image as well and
ends on `spctl --assess`, which has to accept it. For a quick local build that
skips all of this, run `pnpm tauri build --bundles dmg` directly.

`pnpm icon` regenerates `icons/icon.png`, `icons/icon.icns`,
`icons/tray-icon.png`, `icons/tray/calendar.png`, and
`icons/tray/filled/day-01.png` through `day-31.png` from
`scripts/generate-icon.swift`. The framed menu bar glyph holds text, so the
renderer draws it at runtime in `src/renderer/tray-frame.ts`.

## Tests

`pnpm test` runs the TypeScript suite and `cargo test` for the host. Neither
needs a signed bundle.
