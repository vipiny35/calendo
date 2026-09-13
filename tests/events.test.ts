import { describe, expect, it } from "vitest";
import {
  endOfTomorrow,
  eventInUpcomingHorizon,
  eventStatus,
  eventTimeRange,
  upcomingHorizonEmpty,
  upcomingHorizonEnd,
  type UpcomingEvent,
} from "../src/shared/events";

const event: UpcomingEvent = {
  id: "event-1",
  title: "Design sync",
  startAt: Date.UTC(2026, 8, 9, 10, 30),
  endAt: Date.UTC(2026, 8, 9, 11, 0),
  calendar: "Work",
  location: null,
  joinUrl: null,
  response: "accepted",
  kind: "event",
  allDay: false,
};

describe("event status", () => {
  it("counts down to an upcoming event", () => {
    expect(eventStatus(event, Date.UTC(2026, 8, 9, 10, 0)).label).toBe("in 30m");
  });

  it("reads as now for the first ten minutes in progress", () => {
    expect(eventStatus(event, Date.UTC(2026, 8, 9, 10, 30)).label).toBe("now");
    expect(eventStatus(event, Date.UTC(2026, 8, 9, 10, 39, 59)).label).toBe("now");
    expect(eventStatus(event, Date.UTC(2026, 8, 9, 10, 30)).timing).toBe("ongoing");
  });

  it("counts down an event in progress", () => {
    expect(eventStatus(event, Date.UTC(2026, 8, 9, 10, 40)).label).toBe("20m left");
    expect(eventStatus(event, Date.UTC(2026, 8, 9, 10, 56)).label).toBe("4m left");
  });

  it("keeps short durations readable", () => {
    expect(eventStatus(event, Date.UTC(2026, 8, 9, 10, 29, 59)).label).toBe("in 1m");
  });

  it("uses hours for longer countdowns", () => {
    expect(eventStatus(event, Date.UTC(2026, 8, 9, 8, 7)).label).toBe("in 2h 23m");
  });
});

describe("event time range", () => {
  it("formats a compact local time range", () => {
    expect(eventTimeRange(event, "en-US")).toMatch(/\d+:\d{2}.*\d+:\d{2}/);
  });
});

describe("today and tomorrow window", () => {
  it("ends at the local midnight that closes tomorrow", () => {
    const boundary = new Date(endOfTomorrow(new Date(2026, 8, 9, 23, 30)));
    expect(boundary.getFullYear()).toBe(2026);
    expect(boundary.getMonth()).toBe(8);
    expect(boundary.getDate()).toBe(11);
    expect(boundary.getHours()).toBe(0);
    expect(boundary.getMinutes()).toBe(0);
  });

  it("covers the rest of today from early morning", () => {
    const now = new Date(2026, 8, 9, 0, 5);
    expect(endOfTomorrow(now) - now.getTime()).toBeGreaterThan(47 * 3_600_000);
  });

  it("crosses a month boundary", () => {
    const boundary = new Date(endOfTomorrow(new Date(2026, 8, 30, 18, 0)));
    expect(boundary.getMonth()).toBe(9);
    expect(boundary.getDate()).toBe(2);
  });
});

describe("upcoming look-ahead", () => {
  const now = Date.UTC(2026, 8, 9, 10, 0);

  it("keeps an event that starts inside the window", () => {
    expect(eventInUpcomingHorizon(event, now, 6)).toBe(true);
  });

  it("keeps a meeting that has already started", () => {
    expect(eventInUpcomingHorizon(event, Date.UTC(2026, 8, 9, 10, 40), 1)).toBe(true);
  });

  it("drops an event that starts after the window", () => {
    expect(eventInUpcomingHorizon(event, Date.UTC(2026, 8, 9, 3, 0), 6)).toBe(false);
  });

  it("drops an event that has already ended", () => {
    expect(eventInUpcomingHorizon(event, Date.UTC(2026, 8, 9, 12, 0), 8)).toBe(false);
  });

  it("names the empty list from the window", () => {
    expect(upcomingHorizonEmpty(1)).toBe("Nothing in the next hour.");
    expect(upcomingHorizonEmpty(6)).toBe("Nothing in the next 6 hours.");
    expect(upcomingHorizonEmpty(12)).toBe("Nothing in the next 12 hours.");
    expect(upcomingHorizonEmpty(24)).toBe("Nothing in the rest of today.");
    expect(upcomingHorizonEmpty(48)).toBe("Nothing in the next two days.");
  });

  it("treats one day as through midnight tonight", () => {
    const now = new Date(2026, 8, 9, 22, 0).getTime();
    const end = upcomingHorizonEnd(now, 24);
    const boundary = new Date(end);
    expect(boundary.getFullYear()).toBe(2026);
    expect(boundary.getMonth()).toBe(8);
    expect(boundary.getDate()).toBe(10);
    expect(boundary.getHours()).toBe(0);
  });

  it("treats two days as through the end of tomorrow, not 48 clock hours", () => {
    const now = new Date(2026, 8, 9, 22, 0).getTime();
    const end = upcomingHorizonEnd(now, 48);
    const boundary = new Date(end);
    expect(boundary.getFullYear()).toBe(2026);
    expect(boundary.getMonth()).toBe(8);
    expect(boundary.getDate()).toBe(11);
    expect(boundary.getHours()).toBe(0);
    expect(end - now).toBeLessThan(48 * 3_600_000);
  });

  it("keeps an all-day reminder on its due day", () => {
    const reminder = {
      ...event,
      kind: "reminder" as const,
      allDay: true,
      startAt: Date.UTC(2026, 8, 9, 0, 0),
      endAt: Date.UTC(2026, 8, 10, 0, 0),
    };
    expect(eventInUpcomingHorizon(reminder, Date.UTC(2026, 8, 9, 15, 0), 48)).toBe(true);
    expect(eventTimeRange(reminder, "en-US")).toBe("All day");
  });

  it("ends the fetch window after the chosen hours", () => {
    expect(upcomingHorizonEnd(now, 4) - now).toBe(4 * 3_600_000);
    expect(upcomingHorizonEnd(now, 12) - now).toBe(12 * 3_600_000);
  });
});
