import { afterEach, expect, it, vi } from "vitest";
import { bindCalendarAccess } from "../src/renderer/calendar-access";

afterEach(() => vi.useRealTimers());

function setup(granted: boolean) {
  const api = {
    getCalendarAccess: vi.fn().mockResolvedValue(granted),
    requestCalendarAccess: vi.fn().mockResolvedValue(true),
    openCalendarPrivacy: vi.fn().mockResolvedValue(undefined),
  };
  const elements = {
    status: { hidden: true, textContent: "" },
    row: { hidden: false },
    button: Object.assign(new EventTarget(), { disabled: false }),
    toggle: Object.assign(new EventTarget(), { checked: true }),
  };
  return { api, elements, refresh: bindCalendarAccess(api, elements) };
}

it("recognizes permission on startup and clears a previous denial after returning", async () => {
  const { api, elements, refresh } = setup(false);
  await refresh();
  expect(elements.row.hidden).toBe(false);
  api.getCalendarAccess.mockResolvedValue(true);
  await refresh();
  expect(elements.row.hidden).toBe(true);
  expect(elements.status.hidden).toBe(true);
  expect(elements.status.textContent).toBe("");
  api.getCalendarAccess.mockResolvedValue(false);
  await refresh();
  expect(elements.row.hidden).toBe(false);
});

it("hides access controls when already authorized after restart", async () => {
  const { elements, refresh } = setup(true);
  await refresh();
  expect(elements.row.hidden).toBe(true);
  expect(elements.status.hidden).toBe(true);
  expect(elements.status.textContent).toBe("");
});

it("tells settings when access appears so the calendar list can load", async () => {
  const onGrantedChange = vi.fn();
  const api = {
    getCalendarAccess: vi.fn().mockResolvedValue(true),
    requestCalendarAccess: vi.fn().mockResolvedValue(true),
    openCalendarPrivacy: vi.fn().mockResolvedValue(undefined),
  };
  const elements = {
    status: { hidden: true, textContent: "" },
    row: { hidden: false },
    button: Object.assign(new EventTarget(), { disabled: false }),
    toggle: Object.assign(new EventTarget(), { checked: true }),
    onGrantedChange,
  };
  const refresh = bindCalendarAccess(api, elements);
  await refresh();
  expect(onGrantedChange).toHaveBeenCalledWith(true);
});

it("opens Calendar privacy settings from the allow button", async () => {
  const { api, elements } = setup(false);
  elements.button.dispatchEvent(new Event("click"));
  await vi.waitFor(() => expect(api.openCalendarPrivacy).toHaveBeenCalled());
  expect(api.requestCalendarAccess).not.toHaveBeenCalled();
});

it("ignores stale permission checks after opening privacy settings", async () => {
  const { api, elements, refresh } = setup(false);
  let resolve!: (value: boolean) => void;
  api.getCalendarAccess.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
  const pending = refresh();
  elements.button.dispatchEvent(new Event("click"));
  await vi.waitFor(() => expect(api.openCalendarPrivacy).toHaveBeenCalled());
  resolve(false);
  await pending;
  expect(elements.row.hidden).toBe(false);
  expect(elements.button.disabled).toBe(false);
});

it("picks up a System Settings grant without waiting for another focus event", async () => {
  vi.useFakeTimers();
  const { api, elements } = setup(false);
  elements.button.dispatchEvent(new Event("click"));
  await Promise.resolve();
  await Promise.resolve();
  expect(api.openCalendarPrivacy).toHaveBeenCalled();
  expect(elements.row.hidden).toBe(false);
  api.getCalendarAccess.mockResolvedValue(true);
  await vi.advanceTimersByTimeAsync(800);
  expect(elements.row.hidden).toBe(true);
  expect(elements.status.hidden).toBe(true);
  expect(elements.status.textContent).toBe("");
});
