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

`pnpm app` rebuilds the frontend and runs `tauri dev`. The process is an
accessory: look in the menu bar, not the Dock.

`pnpm dmg` produces a disk image under `src-tauri/target/release/bundle/dmg`.

`pnpm icon` regenerates `icons/icon.png`, `icons/icon.icns`, and
`icons/tray-icon.png` from `scripts/generate-icon.swift`.

## Tests

`pnpm test` runs the TypeScript suite and `cargo test` for the host. Neither
needs a signed bundle.
