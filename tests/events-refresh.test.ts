import { afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getCalendarEvents: vi.fn(),
  getSettings: vi.fn(),
  hideEvents: vi.fn(),
  onEventsShown: vi.fn(),
  onClockTick: vi.fn(),
  onSettingsChanged: vi.fn(),
}));
vi.mock("../src/renderer/host", () => ({ installTauriBridge: () => api }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); vi.resetModules(); });

it("replaces startup permission failure when opened after granting access", async () => {
  const list = { innerHTML: "", replaceChildren: vi.fn() };
  vi.stubGlobal("document", {
    getElementById: (id: string) => id === "list" ? list : null,
    addEventListener: vi.fn(),
    createElement: () => ({ className: "", textContent: "" }),
  });
  api.getSettings.mockResolvedValue({ upcomingHorizonHours: 6 });
  api.getCalendarEvents.mockRejectedValueOnce("Calendar access is not enabled");
  await import("../src/renderer/events");
  await vi.waitFor(() => expect(list.replaceChildren).toHaveBeenCalledWith(expect.objectContaining({ textContent: "Calendar access is not enabled" })));
  api.getCalendarEvents.mockResolvedValue([]);
  api.onEventsShown.mock.calls[0]![0]();
  await vi.waitFor(() => expect(list.innerHTML).toContain("Nothing in the next 6 hours."));
  expect(list.innerHTML).toContain("Nothing in the next 6 hours.");

  // A delayed denied response must not replace a newer successful refresh.
  let reject!: (reason: string) => void;
  api.getCalendarEvents.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  api.onEventsShown.mock.calls[0]![0]();
  api.onClockTick.mock.calls[0]![0]();
  await vi.waitFor(() => expect(api.getCalendarEvents).toHaveBeenCalledTimes(4));
  reject("Calendar access is not enabled");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(list.innerHTML).toContain("Nothing in the next 6 hours.");
});
