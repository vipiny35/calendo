/** How the user answered the invitation; "confirmed" means no invitation. */
export type EventResponse =
  | "confirmed"
  | "accepted"
  | "tentative"
  | "declined"
  | "pending";

export type UpcomingEvent = {
  id: string;
  title: string;
  startAt: number;
  endAt: number;
  calendar: string | null;
  location: string | null;
  joinUrl: string | null;
  response: EventResponse;
};

/** Local midnight that ends the "today and tomorrow" window. */
export function endOfTomorrow(now = new Date()): number {
  const boundary = new Date(now);
  boundary.setHours(0, 0, 0, 0);
  boundary.setDate(boundary.getDate() + 2);
  return boundary.getTime();
}

export type EventTiming = "upcoming" | "ongoing";

function roundedMinutes(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 60_000));
}

/** An event that just started reads "now" rather than counting itself down. */
const NOW_WINDOW_MS = 10 * 60_000;

function relativeTime(milliseconds: number): string {
  const minutes = roundedMinutes(milliseconds);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function eventStatus(
  event: Pick<UpcomingEvent, "startAt" | "endAt">,
  now = Date.now(),
): { label: string; timing: EventTiming } {
  if (now >= event.endAt) {
    return {
      label: "No upcoming events",
      timing: "upcoming",
    };
  }
  if (now >= event.startAt && now < event.endAt) {
    if (now - event.startAt < NOW_WINDOW_MS) {
      return { label: "now", timing: "ongoing" };
    }
    return {
      label: `${relativeTime(event.endAt - now)} left`,
      timing: "ongoing",
    };
  }
  return {
    label: `in ${relativeTime(event.startAt - now)}`,
    timing: "upcoming",
  };
}

export function eventTimeRange(
  event: Pick<UpcomingEvent, "startAt" | "endAt">,
  locale?: string,
): string {
  const format = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${format.format(new Date(event.startAt))} – ${format.format(
    new Date(event.endAt),
  )}`;
}
