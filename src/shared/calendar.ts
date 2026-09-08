import type { WeekStartsOn } from "./settings";

export type CalendarDay = {
  iso: string;
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  weekNumber: number;
};

export type CalendarMonth = {
  year: number;
  month: number;
  label: string;
  weekdayLabels: { short: string; long: string; narrow: string }[];
  weeks: CalendarDay[][];
};

const WEEKDAY_COUNT = 7;
const WEEK_COUNT = 6;

/** Local calendar date at noon, so DST does not skip or duplicate a day. */
export function atNoon(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12, 0, 0, 0);
}

export function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return atNoon(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const next = atNoon(year, month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

export function addDays(date: Date, days: number): Date {
  return atNoon(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function startOfMonth(year: number, month: number): Date {
  return atNoon(year, month, 1);
}

export function endOfMonth(year: number, month: number): Date {
  return atNoon(year, month + 1, 0);
}

export function clampToMonth(date: Date, year: number, month: number): Date {
  const last = endOfMonth(year, month).getDate();
  return atNoon(year, month, Math.min(date.getDate(), last));
}

/**
 * ISO-8601 week number. Week 1 contains the year's first Thursday.
 * Independent of the displayed week start, so the number stays stable
 * when the user switches Sunday/Monday/Saturday.
 */
export function isoWeekNumber(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const day = new Date(utc).getUTCDay();
  const thursday = new Date(utc);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (day || 7));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / 86_400_000 / 7) + 1;
}

export function weekdayIndex(date: Date, weekStartsOn: WeekStartsOn): number {
  return (date.getDay() - weekStartsOn + WEEKDAY_COUNT) % WEEKDAY_COUNT;
}

export function monthTitle(year: number, month: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(atNoon(year, month, 1));
}

export function weekdayLabels(
  weekStartsOn: WeekStartsOn,
  locale?: string,
): { short: string; long: string; narrow: string }[] {
  const short = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const long = new Intl.DateTimeFormat(locale, { weekday: "long" });
  const narrow = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  // 5 Jan 2020 is a Sunday, so offsets land on a known weekday.
  return Array.from({ length: WEEKDAY_COUNT }, (_, index) => {
    const date = atNoon(2020, 0, 5 + weekStartsOn + index);
    return {
      short: short.format(date),
      long: long.format(date),
      narrow: narrow.format(date),
    };
  });
}

export function buildMonth(
  year: number,
  month: number,
  weekStartsOn: WeekStartsOn,
  today = new Date(),
  locale?: string,
): CalendarMonth {
  const first = startOfMonth(year, month);
  const gridStart = addDays(first, -weekdayIndex(first, weekStartsOn));
  const todayIso = toIso(today);
  const weeks: CalendarDay[][] = [];

  for (let week = 0; week < WEEK_COUNT; week += 1) {
    const days: CalendarDay[] = [];
    for (let weekday = 0; weekday < WEEKDAY_COUNT; weekday += 1) {
      const date = addDays(gridStart, week * WEEKDAY_COUNT + weekday);
      days.push({
        iso: toIso(date),
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: toIso(date) === todayIso,
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        weekNumber: isoWeekNumber(date),
      });
    }
    weeks.push(days);
  }

  return {
    year,
    month,
    label: monthTitle(year, month, locale),
    weekdayLabels: weekdayLabels(weekStartsOn, locale),
    weeks,
  };
}

export function dayName(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
