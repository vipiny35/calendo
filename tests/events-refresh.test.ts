import { afterEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getCalendarEvents: vi.fn(),
  hideEvents: vi.fn(),
  onEventsShown: vi.fn(),
  onClockTick: vi.fn(),
}));
vi.mock("../src/renderer/host", () => ({ installTauriBridge: () => api }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); vi.resetModules(); });

it("replaces startup permission failure when opened after granting access", async () => {
  const summary = { textContent: "" };
  const list = { innerHTML: "", replaceChildren: vi.fn() };
  vi.stubGlobal("document", {
    getElementById: (id: string) => id === "summary" ? summary : id === "list" ? list : null,
    createElement: () => ({ className: "", textContent: "" }),
  });
  api.getCalendarEvents.mockRejectedValueOnce("Calendar access is not enabled");
  await import("../src/renderer/events");
  await vi.waitFor(() => expect(summary.textContent).toBe("Calendar access needed"));
  api.getCalendarEvents.mockResolvedValue([]);
  api.onEventsShown.mock.calls[0]![0]();
  await vi.waitFor(() => expect(summary.textContent).toBe("No upcoming events"));
  expect(list.innerHTML).toContain("No upcoming events.");

  // A delayed denied response must not replace a newer successful refresh.
  let reject!: (reason: string) => void;
  api.getCalendarEvents.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  api.onEventsShown.mock.calls[0]![0]();
  api.onClockTick.mock.calls[0]![0]();
  await vi.waitFor(() => expect(api.getCalendarEvents).toHaveBeenCalledTimes(4));
  reject("Calendar access is not enabled");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(summary.textContent).toBe("No upcoming events");
});
