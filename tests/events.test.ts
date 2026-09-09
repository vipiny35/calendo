import { describe, expect, it } from "vitest";
import {
  endOfTomorrow,
  eventStatus,
  eventTimeRange,
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
