import type { AppSettings } from "../shared/settings";
import type { UpcomingEvent } from "../shared/events";

/** An empty version means the running build is current. */
export type UpdateOffer = { version: string; notes: string };

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
    style: AppSettings["menuBarIcon"] | "timer",
    image: number[] | null,
  ) => Promise<void>;
  setEventTrayLabel: (title: string | null, image: number[] | null, visible: boolean) => Promise<void>;
  beep: () => Promise<void>;
  getUpcomingEvent: () => Promise<UpcomingEvent | null>;
  getCalendarEvents: (startAt: number, endAt: number) => Promise<UpcomingEvent[]>;
  requestCalendarAccess: () => Promise<boolean>;
  getCalendarAccess: () => Promise<boolean>;
  joinMeeting: (url: string) => Promise<void>;
  openEvent: (id: string) => Promise<void>;
  checkForUpdates: () => Promise<UpdateOffer>;
  installUpdate: () => Promise<void>;
  openReleasesPage: () => Promise<void>;
  onUpdateProgress: (
    listener: (progress: { downloaded: number; total: number | null }) => void,
  ) => () => void;
  hideCalendar: () => Promise<void>;
  hideEvents: () => Promise<void>;
  setEventsHeight: (height: number) => Promise<void>;
  getPopoverMaterial: () => Promise<string>;
  setCalendarPinned: (pinned: boolean) => Promise<void>;
  openSettings: () => Promise<void>;
  quitApp: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  onSettingsChanged: (listener: (settings: AppSettings) => void) => () => void;
  onCalendarShown: (listener: () => void) => () => void;
  onEventsShown: (listener: () => void) => () => void;
  onCalendarHidden: (listener: () => void) => () => void;
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
  setEventTrayLabel: (title, image, visible) =>
    invoke<void>("set_event_tray_label", { title, image, visible }),
  beep: () => invoke<void>("beep"),
  getUpcomingEvent: () => invoke<UpcomingEvent | null>("get_upcoming_event"),
  getCalendarEvents: (startAt, endAt) =>
    invoke<UpcomingEvent[]>("get_calendar_events", { startAt, endAt }),
  requestCalendarAccess: () => invoke<boolean>("request_calendar_access"),
  getCalendarAccess: () => invoke<boolean>("get_calendar_access"),
  joinMeeting: (url) => invoke<void>("join_meeting", { url }),
  openEvent: (id) => invoke<void>("open_event", { id }),
  checkForUpdates: () => invoke<UpdateOffer>("check_for_updates"),
  installUpdate: () => invoke<void>("install_update"),
  openReleasesPage: () => invoke<void>("open_releases_page"),
  onUpdateProgress: (listener) =>
    subscribe<{ downloaded: number; total: number | null }>(
      "update-progress",
      listener,
    ),
  hideCalendar: () => invoke<void>("hide_calendar"),
  hideEvents: () => invoke<void>("hide_events"),
  setEventsHeight: (height) => invoke<void>("set_events_height", { height }),
  getPopoverMaterial: () => invoke<string>("popover_material"),
  setCalendarPinned: (pinned) => invoke<void>("set_calendar_pinned", { pinned }),
  openSettings: () => invoke<void>("open_settings"),
  quitApp: () => invoke<void>("quit_app"),
  getAppVersion: () => invoke<string>("app_version"),
  onSettingsChanged: (listener) => subscribe<AppSettings>("settings-changed", listener),
  onCalendarShown: (listener) => subscribe<void>("calendar-shown", listener),
  onEventsShown: (listener) => subscribe<void>("events-shown", listener),
  onCalendarHidden: (listener) => subscribe<void>("calendar-hidden", listener),
  onClockTick: (listener) => subscribe<void>("clock-tick", listener),
};

export function installTauriBridge(): DesktopApi {
  if (!maybeTauri()) {
    throw new Error("Tauri global is unavailable; the window cannot reach its host.");
  }
  return api;
}
