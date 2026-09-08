import { describe, expect, it } from "vitest";
import {
  addMonths,
  atNoon,
  buildMonth,
  isoWeekNumber,
  toIso,
  weekdayIndex,
} from "../src/shared/calendar";

describe("month grid", () => {
  it("always returns six weeks so the popover does not change height", () => {
    const month = buildMonth(2026, 8, 0, atNoon(2026, 8, 8));
    expect(month.weeks).toHaveLength(6);
    expect(month.weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("places 1 September 2026 on Tuesday when the week starts on Sunday", () => {
    const month = buildMonth(2026, 8, 0, atNoon(2026, 8, 8));
    expect(month.weeks[0]?.map((day) => day.day)).toEqual([
      30, 31, 1, 2, 3, 4, 5,
    ]);
    expect(month.weeks[0]?.[2]).toMatchObject({
      iso: "2026-09-01",
      inMonth: true,
    });
  });

  it("starts the week on Monday when asked", () => {
    const month = buildMonth(2026, 8, 1, atNoon(2026, 8, 8));
    expect(month.weeks[0]?.map((day) => `${day.day}:${day.inMonth}`)).toEqual([
      "31:false",
      "1:true",
      "2:true",
      "3:true",
      "4:true",
      "5:true",
      "6:true",
    ]);
  });

  it("marks today and weekends", () => {
    const month = buildMonth(2026, 8, 0, atNoon(2026, 8, 8));
    const today = month.weeks.flat().find((day) => day.iso === "2026-09-08");
    expect(today?.isToday).toBe(true);
    const sunday = month.weeks.flat().find((day) => day.iso === "2026-09-06");
    expect(sunday?.isWeekend).toBe(true);
  });

  it("keeps weekday headers aligned with the chosen start day", () => {
    expect(weekdayIndex(atNoon(2026, 8, 1), 0)).toBe(2);
    expect(weekdayIndex(atNoon(2026, 8, 1), 1)).toBe(1);
    const sunday = buildMonth(2026, 8, 0, atNoon(2026, 8, 8), "en-US");
    expect(sunday.weekdayLabels[0]?.long).toMatch(/sunday/i);
    const monday = buildMonth(2026, 8, 1, atNoon(2026, 8, 8), "en-US");
    expect(monday.weekdayLabels[0]?.long).toMatch(/monday/i);
  });
});

describe("date helpers", () => {
  it("walks months across a year boundary", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("formats local dates without UTC drift", () => {
    expect(toIso(atNoon(2026, 0, 1))).toBe("2026-01-01");
  });

  it("uses ISO week numbers", () => {
    expect(isoWeekNumber(atNoon(2026, 0, 1))).toBe(1);
    expect(isoWeekNumber(atNoon(2026, 8, 8))).toBe(37);
  });
});
