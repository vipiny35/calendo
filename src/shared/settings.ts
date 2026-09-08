export type WeekStartsOn = 0 | 1 | 6;
export type Theme = "system" | "light" | "dark";
export type MenuBarFormatId =
  | "weekdayDay"
  | "monthDay"
  | "weekdayMonthDay"
  | "day"
  | "weekday"
  | "full";

export type AppSettings = {
  menuBarFormat: MenuBarFormatId;
  weekStartsOn: WeekStartsOn;
  showWeekNumbers: boolean;
  dimWeekends: boolean;
  launchAtLogin: boolean;
  theme: Theme;
};

export const MENU_BAR_FORMATS: {
  id: MenuBarFormatId;
  sample: string;
  options: Intl.DateTimeFormatOptions;
}[] = [
  {
    id: "weekdayDay",
    sample: "Tue 8",
    options: { weekday: "short", day: "numeric" },
  },
  {
    id: "monthDay",
    sample: "Sep 8",
    options: { month: "short", day: "numeric" },
  },
  {
    id: "weekdayMonthDay",
    sample: "Tue, Sep 8",
    options: { weekday: "short", month: "short", day: "numeric" },
  },
  {
    id: "day",
    sample: "8",
    options: { day: "numeric" },
  },
  {
    id: "weekday",
    sample: "Tuesday",
    options: { weekday: "long" },
  },
  {
    id: "full",
    sample: "Tuesday, 8 September",
    options: { weekday: "long", day: "numeric", month: "long" },
  },
];

export const WEEK_STARTS: { id: WeekStartsOn; label: string }[] = [
  { id: 0, label: "Sunday" },
  { id: 1, label: "Monday" },
  { id: 6, label: "Saturday" },
];

export const DEFAULT_SETTINGS: AppSettings = {
  menuBarFormat: "weekdayDay",
  weekStartsOn: 0,
  showWeekNumbers: false,
  dimWeekends: true,
  launchAtLogin: false,
  theme: "system",
};

const FORMAT_IDS = new Set(MENU_BAR_FORMATS.map((item) => item.id));
const WEEK_START_IDS = new Set(WEEK_STARTS.map((item) => item.id));
const THEMES = new Set<Theme>(["system", "light", "dark"]);

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function formatMenuBarDate(
  date: Date,
  formatId: MenuBarFormatId,
  locale?: string,
): string {
  const format =
    MENU_BAR_FORMATS.find((item) => item.id === formatId) ?? MENU_BAR_FORMATS[0];
  if (!format) return String(date.getDate());
  return new Intl.DateTimeFormat(locale, format.options).format(date);
}

export function formatMenuBarPreview(
  formatId: MenuBarFormatId,
  locale?: string,
  date = new Date(),
): string {
  return formatMenuBarDate(date, formatId, locale);
}

export function normalizeSettings(raw: unknown): AppSettings {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const weekStartsOn = input.weekStartsOn;
  const menuBarFormat = input.menuBarFormat;
  const theme = input.theme;

  return {
    menuBarFormat: FORMAT_IDS.has(menuBarFormat as MenuBarFormatId)
      ? (menuBarFormat as MenuBarFormatId)
      : DEFAULT_SETTINGS.menuBarFormat,
    weekStartsOn: WEEK_START_IDS.has(weekStartsOn as WeekStartsOn)
      ? (weekStartsOn as WeekStartsOn)
      : DEFAULT_SETTINGS.weekStartsOn,
    showWeekNumbers: asBoolean(
      input.showWeekNumbers,
      DEFAULT_SETTINGS.showWeekNumbers,
    ),
    dimWeekends: asBoolean(input.dimWeekends, DEFAULT_SETTINGS.dimWeekends),
    launchAtLogin: asBoolean(
      input.launchAtLogin,
      DEFAULT_SETTINGS.launchAtLogin,
    ),
    theme: THEMES.has(theme as Theme) ? (theme as Theme) : DEFAULT_SETTINGS.theme,
  };
}
