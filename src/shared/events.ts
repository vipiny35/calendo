export type UpcomingEvent = {
  id: string;
  title: string;
  startAt: number;
  endAt: number;
  calendar: string | null;
  location: string | null;
  joinUrl: string | null;
};

export type EventTiming = "upcoming" | "ongoing";

function roundedMinutes(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 60_000));
}

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
    return {
      label: `ends in ${relativeTime(event.endAt - now)}`,
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
