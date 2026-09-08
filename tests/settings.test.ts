import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  formatMenuBarDate,
  normalizeSettings,
} from "../src/shared/settings";

describe("normalizeSettings", () => {
  it("falls back to defaults for unusable input", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps recognised values", () => {
    const result = normalizeSettings({
      menuBarFormat: "monthDay",
      weekStartsOn: 1,
      showWeekNumbers: true,
      dimWeekends: false,
      launchAtLogin: true,
      theme: "dark",
    });
    expect(result.menuBarFormat).toBe("monthDay");
    expect(result.weekStartsOn).toBe(1);
    expect(result.showWeekNumbers).toBe(true);
    expect(result.dimWeekends).toBe(false);
    expect(result.launchAtLogin).toBe(true);
    expect(result.theme).toBe("dark");
  });

  it("rejects values the interface does not offer", () => {
    const result = normalizeSettings({
      menuBarFormat: "iso8601",
      weekStartsOn: 3,
      theme: "solarized",
      showWeekNumbers: "yes",
    });
    expect(result.menuBarFormat).toBe(DEFAULT_SETTINGS.menuBarFormat);
    expect(result.weekStartsOn).toBe(DEFAULT_SETTINGS.weekStartsOn);
    expect(result.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(result.showWeekNumbers).toBe(false);
  });
});

describe("menu bar date", () => {
  it("formats in the user's locale without a leading comma-only weekday", () => {
    const date = new Date(2026, 8, 8, 12);
    expect(formatMenuBarDate(date, "day", "en-US")).toBe("8");
    expect(formatMenuBarDate(date, "weekdayDay", "en-US")).toMatch(/Tue/);
    expect(formatMenuBarDate(date, "monthDay", "en-US")).toMatch(/Sep/);
  });
});
