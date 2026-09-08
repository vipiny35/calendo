# Calendo

A month calendar in the macOS menu bar. No Dock icon, no main window, and no
calendar account — just the date next to the clock, and a month you can move
through without opening Calendar.

Apple Silicon and Intel Macs on macOS 13 or newer.

## What it does

Click the date in the menu bar to open this month. Move between months, jump
back to today, and close it by clicking outside or pressing Escape. Right-click
the menu bar item, or the gear in the popover, for Settings.

Settings control the date format in the menu bar, which day the week starts on,
week numbers, weekend dimming, appearance, and whether Calendo opens at login.

## Install

Build from source until a release exists:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm dmg
```

Then open the disk image in `src-tauri/target/release/bundle/dmg` and drag
Calendo to Applications.

## Use

Calendo stays in the menu bar after you quit every other window.

- **Left click** opens the month.
- **Right click** offers Settings and Quit.
- **Arrow keys** move by day or week; **Page Up** / **Page Down** change month;
  **T** returns to today; **Esc** closes the popover.

Nothing leaves this Mac. There is no account, no network, and no calendar
database.

## Build from source

See [Building](docs/building.md). `pnpm app` launches a development build with
the menu bar extra.

## License

MIT. See [LICENSE](LICENSE).
