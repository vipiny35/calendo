import type { AppSettings } from "../shared/settings";
import type { UpcomingEvent } from "../shared/events";

interface TauriGlobal {
  core: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> };
  event: {
    listen<T>(
      event: string,
      handler: (message: { payload: T }) => void,
    ): Promise<() => void>;
  };
}

export type DesktopApi = {
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  setTrayLabel: (
    title: string | null,
    iconDay: number | null,
    style: AppSettings["menuBarIcon"],
    image: number[] | null,
  ) => Promise<void>;
  beep: () => Promise<void>;
  getUpcomingEvent: () => Promise<UpcomingEvent | null>;
  getCalendarEvents: (startAt: number, endAt: number) => Promise<UpcomingEvent[]>;
  requestCalendarAccess: () => Promise<boolean>;
  joinMeeting: (url: string) => Promise<void>;
  checkForUpdates: () => Promise<string>;
  hideCalendar: () => Promise<void>;
  setCalendarPinned: (pinned: boolean) => Promise<void>;
  openSettings: () => Promise<void>;
  quitApp: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  onSettingsChanged: (listener: (settings: AppSettings) => void) => () => void;
  onCalendarShown: (listener: () => void) => () => void;
  onClockTick: (listener: () => void) => () => void;
};

function maybeTauri(): TauriGlobal | null {
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

function tauri(): TauriGlobal {
  const global = maybeTauri();
  if (!global) {
    throw new Error("Tauri bridge is unavailable.");
  }
  return global;
}

function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return tauri().core.invoke<T>(command, args);
}

function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  let unlisten: (() => void) | null = null;
  let cancelled = false;

  void tauri()
    .event.listen<T>(event, (message) => handler(message.payload))
    .then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}

export const api: DesktopApi = {
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (patch) => invoke<AppSettings>("update_settings", { patch }),
  setTrayLabel: (title, iconDay, style, image) =>
    invoke<void>("set_tray_label", { title, iconDay, style, image }),
  beep: () => invoke<void>("beep"),
  getUpcomingEvent: () => invoke<UpcomingEvent | null>("get_upcoming_event"),
  getCalendarEvents: (startAt, endAt) =>
    invoke<UpcomingEvent[]>("get_calendar_events", { start_at: startAt, end_at: endAt }),
  requestCalendarAccess: () => invoke<boolean>("request_calendar_access"),
  joinMeeting: (url) => invoke<void>("join_meeting", { url }),
  checkForUpdates: () => invoke<string>("check_for_updates"),
  hideCalendar: () => invoke<void>("hide_calendar"),
  setCalendarPinned: (pinned) => invoke<void>("set_calendar_pinned", { pinned }),
  openSettings: () => invoke<void>("open_settings"),
  quitApp: () => invoke<void>("quit_app"),
  getAppVersion: () => invoke<string>("app_version"),
  onSettingsChanged: (listener) => subscribe<AppSettings>("settings-changed", listener),
  onCalendarShown: (listener) => subscribe<void>("calendar-shown", listener),
  onClockTick: (listener) => subscribe<void>("clock-tick", listener),
};

export function installTauriBridge(): DesktopApi {
  if (!maybeTauri()) {
    throw new Error("Tauri global is unavailable; the window cannot reach its host.");
  }
  return api;
}
