# Calendo

A month calendar in the macOS menu bar. No account to configure, no main
window, and no data leaving this Mac — just the date next to the clock, and a
month you can move through without opening Calendar.

Apple Silicon and Intel Macs on macOS 13 or newer.

## What it does

Click the date in the menu bar to open this month. Move between months, jump
back to today, and close it by clicking outside or pressing Escape. Right-click
the menu bar item, or the cog in the popover, for Settings.

The menu bar item can be a filled date, a date inside a rounded outline, a
calendar, or the date alone. Every style but the filled one can add the weekday
and the month. Settings control that pairing, which day the week starts on,
week numbers, highlighted weekdays, appearance, an hourly chime, and whether
Calendo opens at login. Optional upcoming-event awareness reads macOS Calendar,
adds a compact countdown beside the menu-bar date, and puts a Join Meeting
action in the popover when an event contains a web link.

Calendar access is requested only after the upcoming-event option is enabled.
Calendo reads events locally through EventKit and does not upload calendar data.

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
- The cog, or **⌘,**, opens Settings.

Nothing leaves this Mac. There is no account or network connection. Optional
upcoming events come from the local macOS Calendar database through EventKit.

## Build from source

See [Building](docs/building.md). `pnpm app` launches a development build with
the menu bar extra.

## License

MIT. See [LICENSE](LICENSE).
