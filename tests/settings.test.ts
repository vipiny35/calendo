import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  MENU_BAR_ICONS,
  supportsDateParts,
  formatMenuBarDate,
  highlightedColumnRuns,
  menuBarLabel,
  normalizeSettings,
} from "../src/shared/settings";

describe("normalizeSettings", () => {
  it("falls back to defaults for unusable input", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps recognised values", () => {
    const result = normalizeSettings({
      menuBarIcon: "framed",
      showWeekday: false,
      showMonth: true,
      weekStartsOn: 1,
      showWeekNumbers: true,
      highlightWeekdays: [1, 5],
      launchAtLogin: true,
      beepOnTheHour: true,
      theme: "dark",
    });
    expect(result.menuBarIcon).toBe("framed");
    expect(result.showWeekday).toBe(false);
    expect(result.showMonth).toBe(true);
    expect(result.weekStartsOn).toBe(1);
    expect(result.showWeekNumbers).toBe(true);
    expect(result.highlightWeekdays).toEqual([1, 5]);
    expect(result.launchAtLogin).toBe(true);
    expect(result.beepOnTheHour).toBe(true);
    expect(result.theme).toBe("dark");
  });

  it.each([0, 1, 2, 3, 4, 5, 6])("preserves weekday %i as the first day", (day) => {
    expect(normalizeSettings({ weekStartsOn: day }).weekStartsOn).toBe(day);
  });

  it("defaults to Saturday and Sunday columns", () => {
    expect(normalizeSettings({}).highlightWeekdays).toEqual([0, 6]);
  });

  it("enables automatic update checks by default", () => {
    expect(normalizeSettings({}).autoUpdate).toBe(true);
    expect(normalizeSettings({ autoUpdate: false }).autoUpdate).toBe(false);
  });

  it("migrates dim weekends off to no highlighted columns", () => {
    expect(normalizeSettings({ dimWeekends: false }).highlightWeekdays).toEqual([]);
  });

  it("lets every column be cleared", () => {
    expect(normalizeSettings({ highlightWeekdays: [] }).highlightWeekdays).toEqual(
      [],
    );
  });

  it("migrates the retired outline glyph to the framed date", () => {
    expect(normalizeSettings({ menuBarIcon: "outline" }).menuBarIcon).toBe("framed");
  });

  it("keeps the undated calendar glyph", () => {
    expect(normalizeSettings({ menuBarIcon: "calendar" }).menuBarIcon).toBe("calendar");
  });

  it("rejects values the interface does not offer", () => {
    const result = normalizeSettings({
      menuBarIcon: "rainbow",
      weekStartsOn: 7,
      theme: "solarized",
      showWeekNumbers: "yes",
    });
    expect(result.menuBarIcon).toBe(DEFAULT_SETTINGS.menuBarIcon);
    expect(result.weekStartsOn).toBe(DEFAULT_SETTINGS.weekStartsOn);
    expect(result.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(result.showWeekNumbers).toBe(false);
  });
});

describe("menu bar label", () => {
  const date = new Date(2026, 8, 8, 12);
  const filled = { menuBarIcon: "filled" as const, showWeekday: false, showMonth: false };

  it("keeps the date in the glyph when the style is dated", () => {
    expect(menuBarLabel(filled, date, "en-US")).toEqual({
      text: null,
      day: 8,
      style: "filled",
    });
    expect(menuBarLabel({ ...filled, menuBarIcon: "framed" }, date, "en-US").day).toBe(
      null,
    );
  });

  it("ignores the weekday and month toggles for the filled glyph", () => {
    expect(
      menuBarLabel({ menuBarIcon: "filled", showWeekday: true, showMonth: true }, date, "en-US"),
    ).toEqual({ text: null, day: 8, style: "filled" });
  });

  it("keeps both calendar icons standalone and orders the picker", () => {
    expect(MENU_BAR_ICONS.map(({ id }) => id)).toEqual(["filled", "calendar", "framed", "none"]);
    for (const style of ["filled", "calendar"] as const) {
      expect(supportsDateParts(style)).toBe(false);
      for (const showWeekday of [false, true]) {
        for (const showMonth of [false, true]) {
          expect(menuBarLabel({ menuBarIcon: style, showWeekday, showMonth }, date).text).toBeNull();
        }
      }
    }
    expect(supportsDateParts("framed")).toBe(true);
    expect(supportsDateParts("none")).toBe(true);
  });

  it("spells the date out for the framed glyph", () => {
    expect(
      menuBarLabel({ menuBarIcon: "framed", showWeekday: false, showMonth: false }, date, "en-US")
        .text,
    ).toBe("8");
    expect(
      menuBarLabel({ menuBarIcon: "framed", showWeekday: true, showMonth: true }, date, "en-US")
        .text,
    ).toBe("Tue 8 Sep");
  });

  it("drops the glyph for no-icon, and keeps a date in the title", () => {
    expect(
      menuBarLabel({ menuBarIcon: "none", showWeekday: true, showMonth: false }, date, "en-US"),
    ).toEqual({
      text: "Tue 8",
      day: null,
      style: "none",
    });
  });

  it("migrates a format persisted before icon styles existed", () => {
    expect(normalizeSettings({ menuBarFormat: "weekdayDay" })).toMatchObject({
      menuBarIcon: "filled",
      showWeekday: true,
      showMonth: false,
    });
    expect(normalizeSettings({ menuBarFormat: "full" })).toMatchObject({
      menuBarIcon: "filled",
      showWeekday: true,
      showMonth: true,
    });
    expect(normalizeSettings({ menuBarFormat: "dateOnly" })).toMatchObject({
      menuBarIcon: "none",
      showWeekday: true,
      showMonth: false,
    });
  });

  it("still formats plain text for the tray title", () => {
    expect(formatMenuBarDate(filled, date, "en-US")).toBe("");
    expect(
      formatMenuBarDate(
        { menuBarIcon: "none", showWeekday: true, showMonth: false },
        date,
        "en-US",
      ),
    ).toMatch(/Tue/);
  });
});

describe("highlighted columns", () => {
  it("joins Saturday and Sunday when they sit together", () => {
    expect(highlightedColumnRuns(1, [0, 6])).toEqual([{ start: 5, count: 2 }]);
  });

  it("splits them when the week starts on Sunday", () => {
    expect(highlightedColumnRuns(0, [0, 6])).toEqual([
      { start: 0, count: 1 },
      { start: 6, count: 1 },
    ]);
  });

  it("covers the whole grid when every day is on", () => {
    expect(highlightedColumnRuns(0, [0, 1, 2, 3, 4, 5, 6])).toEqual([
      { start: 0, count: 7 },
    ]);
  });
});
