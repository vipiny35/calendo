import { expect, it, vi } from "vitest";
import { bindCalendarAccess } from "../src/renderer/calendar-access";

function setup(granted: boolean) {
  const api = {
    getCalendarAccess: vi.fn().mockResolvedValue(granted),
    requestCalendarAccess: vi.fn().mockResolvedValue(true),
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
  expect(elements.status.textContent).toContain("System Settings");
  api.getCalendarAccess.mockResolvedValue(true);
  await refresh();
  expect(elements.row.hidden).toBe(true);
  expect(elements.status.textContent).toBe("Calendar access enabled.");
  api.getCalendarAccess.mockResolvedValue(false);
  await refresh();
  expect(elements.row.hidden).toBe(false);
});

it("hides access controls when already authorized after restart", async () => {
  const { elements, refresh } = setup(true);
  await refresh();
  expect(elements.row.hidden).toBe(true);
});

it("ignores stale permission checks after a new permission request", async () => {
  const { api, elements, refresh } = setup(false);
  let resolve!: (value: boolean) => void;
  api.getCalendarAccess.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
  const pending = refresh();
  elements.button.dispatchEvent(new Event("click"));
  await vi.waitFor(() => expect(elements.row.hidden).toBe(true));
  resolve(false);
  await pending;
  expect(elements.row.hidden).toBe(true);
  expect(elements.button.disabled).toBe(false);
});
