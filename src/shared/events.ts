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
      label: `ends in ${roundedMinutes(event.endAt - now)}m`,
      timing: "ongoing",
    };
  }
  return {
    label: `in ${roundedMinutes(event.startAt - now)}m`,
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
