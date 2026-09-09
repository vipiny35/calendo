export type WeekStartsOn = Weekday;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Theme = "system" | "light" | "dark";
export type MenuBarIconStyle = "filled" | "framed" | "calendar" | "none";

export type AppSettings = {
  menuBarIcon: MenuBarIconStyle;
  showWeekday: boolean;
  showMonth: boolean;
  weekStartsOn: WeekStartsOn;
  showWeekNumbers: boolean;
  highlightWeekdays: Weekday[];
  launchAtLogin: boolean;
  beepOnTheHour: boolean;
  showUpcomingEvent: boolean;
  autoUpdate: boolean;
  theme: Theme;
};

export type MenuBarPart = "weekday" | "day" | "month";

export const MENU_BAR_ICONS: { id: MenuBarIconStyle; label: string }[] = [
  { id: "filled", label: "Calendar with date" },
  { id: "calendar", label: "Dotted calendar" },
  { id: "framed", label: "Cutout date" },
  { id: "none", label: "Date only" },
];

const PART_OPTIONS: Record<MenuBarPart, Intl.DateTimeFormatOptions> = {
  weekday: { weekday: "short" },
  day: { day: "numeric" },
  month: { month: "short" },
};

/** Styles that no longer exist, mapped to the nearest one that does. */
const RETIRED_ICONS: Record<string, MenuBarIconStyle> = {
  outline: "framed",
};

/**
 * Formats persisted before icon style and weekday/month toggles. Mapped to the
 * nearest equivalent so an existing settings file is not silently reset.
 */
const LEGACY_FORMATS: Record<
  string,
  Pick<AppSettings, "menuBarIcon" | "showWeekday" | "showMonth">
> = {
  iconOnly: { menuBarIcon: "filled", showWeekday: false, showMonth: false },
  iconDay: { menuBarIcon: "filled", showWeekday: false, showMonth: false },
  iconWeekdayDay: { menuBarIcon: "filled", showWeekday: true, showMonth: false },
  iconWeekdayDayMonth: { menuBarIcon: "filled", showWeekday: true, showMonth: true },
  dateOnly: { menuBarIcon: "none", showWeekday: true, showMonth: false },
  weekdayDay: { menuBarIcon: "filled", showWeekday: true, showMonth: false },
  monthDay: { menuBarIcon: "filled", showWeekday: false, showMonth: true },
  weekdayMonthDay: { menuBarIcon: "filled", showWeekday: true, showMonth: true },
  day: { menuBarIcon: "filled", showWeekday: false, showMonth: false },
  weekday: { menuBarIcon: "filled", showWeekday: true, showMonth: false },
  full: { menuBarIcon: "filled", showWeekday: true, showMonth: true },
};

export const WEEK_STARTS: { id: WeekStartsOn; label: string }[] = [
  { id: 0, label: "Sunday" },
  { id: 1, label: "Monday" },
  { id: 2, label: "Tuesday" },
  { id: 3, label: "Wednesday" },
  { id: 4, label: "Thursday" },
  { id: 5, label: "Friday" },
  { id: 6, label: "Saturday" },
];

/** Monday → Sunday, matching the Highlight picker. */
export const HIGHLIGHT_DAYS: { id: Weekday; name: string }[] = [
  { id: 1, name: "Monday" },
  { id: 2, name: "Tuesday" },
  { id: 3, name: "Wednesday" },
  { id: 4, name: "Thursday" },
  { id: 5, name: "Friday" },
  { id: 6, name: "Saturday" },
  { id: 0, name: "Sunday" },
];

export const DEFAULT_HIGHLIGHT_WEEKDAYS: Weekday[] = [0, 6];

export const DEFAULT_SETTINGS: AppSettings = {
  menuBarIcon: "filled",
  showWeekday: true,
  showMonth: false,
  weekStartsOn: 0,
  showWeekNumbers: false,
  highlightWeekdays: [...DEFAULT_HIGHLIGHT_WEEKDAYS],
  launchAtLogin: false,
  beepOnTheHour: false,
  showUpcomingEvent: false,
  autoUpdate: true,
  theme: "system",
};

const ICON_IDS = new Set(MENU_BAR_ICONS.map((item) => item.id));
const WEEK_START_IDS = new Set(WEEK_STARTS.map((item) => item.id));
const THEMES = new Set<Theme>(["system", "light", "dark"]);

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

export function weekdayLetter(id: Weekday, locale?: string): string {
  // 5 January 2020 is a Sunday, so adding `id` lands on that weekday.
  return new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(
    new Date(2020, 0, 5 + id, 12),
  );
}
export function normalizeHighlightWeekdays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [...DEFAULT_HIGHLIGHT_WEEKDAYS];
  return [...new Set(value.filter(isWeekday))].sort((a, b) => a - b);
}

/**
 * Adjacent highlighted columns, in the displayed week order. Saturday and
 * Sunday become one band when they sit next to each other.
 */
export function highlightedColumnRuns(
  weekStartsOn: WeekStartsOn,
  highlighted: readonly number[],
): { start: number; count: number }[] {
  const selected = new Set(highlighted);
  const active = Array.from({ length: 7 }, (_, index) =>
    selected.has((weekStartsOn + index) % 7),
  );
  const runs: { start: number; count: number }[] = [];
  for (let index = 0; index < 7; ) {
    if (!active[index]) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < 7 && active[end]) end += 1;
    runs.push({ start: index, count: end - index });
    index = end;
  }
  return runs;
}

export function datedMenuBarIcon(style: MenuBarIconStyle): boolean {
  return style === "filled";
}

export function supportsDateParts(style: MenuBarIconStyle): boolean {
  return style === "framed" || style === "none";
}

export type MenuBarLabel = {
  /**
   * The date beside the clock. Null for the filled glyph, which carries the
   * date on its own. The dotted calendar also has no text. The framed style
   * cuts this text out of a filled background; the
   * date-only style shows it as plain text.
   */
  text: string | null;
  /** Day of the month when the glyph itself shows the date. */
  day: number | null;
  style: MenuBarIconStyle;
};

function formatPart(part: MenuBarPart, date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, PART_OPTIONS[part]).format(date);
}

/**
 * Calendar glyphs stand alone. Cutout and plain-text styles spell the date out.
 */
export function menuBarLabel(
  settings: Pick<AppSettings, "menuBarIcon" | "showWeekday" | "showMonth">,
  date: Date,
  locale?: string,
): MenuBarLabel {
  if (datedMenuBarIcon(settings.menuBarIcon)) {
    return { text: null, day: date.getDate(), style: settings.menuBarIcon };
  }
  if (!supportsDateParts(settings.menuBarIcon)) {
    return { text: null, day: null, style: settings.menuBarIcon };
  }
  const parts: string[] = [];
  if (settings.showWeekday) parts.push(formatPart("weekday", date, locale));
  parts.push(formatPart("day", date, locale));
  if (settings.showMonth) parts.push(formatPart("month", date, locale));
  return {
    text: parts.join(" "),
    day: null,
    style: settings.menuBarIcon,
  };
}

export function formatMenuBarDate(
  settings: Pick<AppSettings, "menuBarIcon" | "showWeekday" | "showMonth">,
  date: Date,
  locale?: string,
): string {
  return menuBarLabel(settings, date, locale).text ?? "";
}

function migrateMenuBar(
  input: Record<string, unknown>,
): Pick<AppSettings, "menuBarIcon" | "showWeekday" | "showMonth"> {
  const storedIcon =
    typeof input.menuBarIcon === "string"
      ? RETIRED_ICONS[input.menuBarIcon] ?? input.menuBarIcon
      : input.menuBarIcon;
  if (ICON_IDS.has(storedIcon as MenuBarIconStyle)) {
    return {
      menuBarIcon: storedIcon as MenuBarIconStyle,
      showWeekday: asBoolean(input.showWeekday, DEFAULT_SETTINGS.showWeekday),
      showMonth: asBoolean(input.showMonth, DEFAULT_SETTINGS.showMonth),
    };
  }
  const storedFormat =
    typeof input.menuBarFormat === "string" ? input.menuBarFormat : "";
  return LEGACY_FORMATS[storedFormat] ?? {
    menuBarIcon: DEFAULT_SETTINGS.menuBarIcon,
    showWeekday: DEFAULT_SETTINGS.showWeekday,
    showMonth: DEFAULT_SETTINGS.showMonth,
  };
}

export function normalizeSettings(raw: unknown): AppSettings {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const weekStartsOn = input.weekStartsOn;
  const theme = input.theme;
  const menuBar = migrateMenuBar(input);

  return {
    ...menuBar,
    weekStartsOn: WEEK_START_IDS.has(weekStartsOn as WeekStartsOn)
      ? (weekStartsOn as WeekStartsOn)
      : DEFAULT_SETTINGS.weekStartsOn,
    showWeekNumbers: asBoolean(
      input.showWeekNumbers,
      DEFAULT_SETTINGS.showWeekNumbers,
    ),
    highlightWeekdays:
      "highlightWeekdays" in input
        ? normalizeHighlightWeekdays(input.highlightWeekdays)
        : input.dimWeekends === false
          ? []
          : [...DEFAULT_HIGHLIGHT_WEEKDAYS],
    launchAtLogin: asBoolean(
      input.launchAtLogin,
      DEFAULT_SETTINGS.launchAtLogin,
    ),
    beepOnTheHour: asBoolean(input.beepOnTheHour, DEFAULT_SETTINGS.beepOnTheHour),
    showUpcomingEvent: asBoolean(
      input.showUpcomingEvent,
      DEFAULT_SETTINGS.showUpcomingEvent,
    ),
    autoUpdate: asBoolean(input.autoUpdate, DEFAULT_SETTINGS.autoUpdate),
    theme: THEMES.has(theme as Theme) ? (theme as Theme) : DEFAULT_SETTINGS.theme,
  };
}
