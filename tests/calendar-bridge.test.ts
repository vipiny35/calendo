import { afterEach, expect, it, vi } from "vitest";
import { api } from "../src/renderer/host";

afterEach(() => vi.unstubAllGlobals());

it("passes calendar range arguments using Tauri's camelCase command convention", async () => {
  const invoke = vi.fn().mockResolvedValue([]);
  vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
  await expect(api.getCalendarEvents(1000, 2000)).resolves.toEqual([]);
  expect(invoke).toHaveBeenCalledWith("get_calendar_events", {
    startAt: 1000,
    endAt: 2000,
  });
});

it("lists calendars through the same command bridge", async () => {
  const invoke = vi.fn().mockResolvedValue([]);
  vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
  await expect(api.listCalendars()).resolves.toEqual([]);
  expect(invoke).toHaveBeenCalledWith("list_calendars", undefined);
});

it("waits for the native calendar permission result", async () => {
  const invoke = vi.fn().mockResolvedValue(true);
  vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
  await expect(api.requestCalendarAccess()).resolves.toBe(true);
  expect(invoke).toHaveBeenCalledWith("request_calendar_access", undefined);
});

it("opens an https address in the system browser", async () => {
  const invoke = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
  await expect(api.openUrl("https://vipinyadav.com")).resolves.toBeUndefined();
  expect(invoke).toHaveBeenCalledWith("join_meeting", { url: "https://vipinyadav.com" });
});

it("opens the Calendar and Reminders privacy panes", async () => {
  const invoke = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
  await expect(api.openCalendarPrivacy()).resolves.toBeUndefined();
  await expect(api.openRemindersPrivacy()).resolves.toBeUndefined();
  expect(invoke).toHaveBeenCalledWith("open_calendar_privacy", undefined);
  expect(invoke).toHaveBeenCalledWith("open_reminders_privacy", undefined);
});
