# Calendo

A month calendar in the macOS menu bar. No account to configure, no main
window, and no data leaving this Mac — just the date next to the clock, and a
month you can move through without opening Calendar.

Apple Silicon and Intel Macs on macOS 13 or newer.

## What it does

Click the date in the menu bar to open this month. Move between months, jump
back to today, and close it by clicking outside or pressing Escape. Right-click
either menu bar item for Settings and Quit.

The menu bar item can be a filled date, a date inside a rounded outline, a
calendar, or the date alone. Every style but the filled one can add the weekday
and the month. Settings control that pairing, which day the week starts on,
week numbers, highlighted weekdays, appearance, an hourly chime, and whether
Calendo opens at login.

Optional upcoming-event awareness reads macOS Calendar and adds a second menu
bar item: a countdown to the next event, which reads `now` for the first ten
minutes of one in progress, and a popover listing what is left of today and
tomorrow. The popover grows to its content rather than scrolling. Each row
marks how you answered the invitation — solid when accepted, hatched for maybe,
dashed while unanswered, struck through when declined — and opens the event in
whichever app handles `ical://`, usually Calendar. An event carrying a web link
gets a join row bearing that service's mark: Meet, Zoom, Teams, Webex,
FaceTime, Jitsi and GoToMeeting are recognised by host.

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

Once installed, Calendo can update itself. Settings → General has **Install
updates automatically** on by default: a signed release downloads and the app
restarts. Turn it off to keep checking by hand from the About pane. An update
that cannot verify its signature is refused.

## Use

Calendo stays in the menu bar after you quit every other window.

- **Left click** opens the month.
- **Right click** on either menu bar item offers Settings and Quit.
- **The countdown item**, when upcoming events are on, opens the event list.
- **Arrow keys** move by day or week; **Page Up** / **Page Down** change month;
  **T** returns to today; **Esc** closes the popover.
- **⌘,** opens Settings.

Nothing leaves this Mac. There is no account or network connection. Optional
upcoming events come from the local macOS Calendar database through EventKit.

## Build from source

See [Building](docs/building.md). `pnpm app` launches a development build with
the menu bar extra.

## License

MIT. See [LICENSE](LICENSE).
