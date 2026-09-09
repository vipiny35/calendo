import { endOfTomorrow, eventStatus, type EventResponse, type UpcomingEvent } from "../shared/events";
import { installTauriBridge } from "./host";
import { lucideIcon } from "./icons";
import { ChevronRight, MapPin, Video } from "lucide";

const api = installTauriBridge();
const list = document.getElementById("list")!;
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") void api.hideEvents();
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function dayLabel(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const iso = (value: Date) => value.toDateString();
  if (iso(date) === iso(today)) return "Today";
  if (iso(date) === iso(tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(date);
}

function meetingLabel(url: string): string {
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  if (host.endsWith("meet.google.com")) return "Join Google Meet meeting";
  if (host.endsWith("zoom.us")) return "Join Zoom meeting";
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "Join Microsoft Teams meeting";
  if (host.endsWith("webex.com")) return "Join Webex meeting";
  return "Join meeting";
}

const RESPONSE_LABEL: Record<EventResponse, string> = {
  confirmed: "",
  accepted: "Accepted",
  tentative: "Maybe",
  declined: "Declined",
  pending: "Not responded",
};

function sectionLabel(text: string): HTMLElement {
  const heading = document.createElement("p");
  heading.className = "section-label";
  heading.textContent = text;
  return heading;
}

function eventRow(event: UpcomingEvent, withCalendar = false): HTMLElement {
  const row = document.createElement("div");
  row.className = "event interactive";
  const dot = document.createElement("span");
  dot.className = `dot ${event.response}`;
  if (event.response === "declined") row.classList.add("declined");
  const title = document.createElement("span");
  title.className = "title";
  const parts = [`${timeFormat.format(new Date(event.startAt))} · ${event.title}`];
  if (withCalendar && event.calendar) parts.push(event.calendar);
  title.textContent = parts.join(" · ");
  const response = RESPONSE_LABEL[event.response];
  row.title = response ? `${title.textContent} — ${response}` : title.textContent;
  row.append(dot, title);
  return row;
}

function detailRow(icon: SVGElement | null, text: string, onClick?: () => void): HTMLElement {
  const row = document.createElement(onClick ? "button" : "div") as HTMLElement;
  row.className = onClick ? "detail-row interactive" : "detail-row muted";
  const glyph = document.createElement("span");
  glyph.className = "glyph";
  if (icon) glyph.append(icon);
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = text;
  row.title = text;
  row.append(glyph, label);
  if (onClick) row.addEventListener("click", onClick);
  return row;
}

function featuredEvent(event: UpcomingEvent, now: number): HTMLElement[] {
  const nodes: HTMLElement[] = [];
  const status = eventStatus(event, now);
  nodes.push(sectionLabel(status.timing === "ongoing" ? `Happening now, ${status.label}` : `Upcoming ${status.label}`));

  const details = document.createElement("div");
  details.className = "detail";
  if (event.joinUrl) {
    const url = event.joinUrl;
    details.append(detailRow(lucideIcon(Video, 15), meetingLabel(url), () => void api.joinMeeting(url)));
  }
  if (event.location && !event.location.startsWith("http")) {
    details.append(detailRow(lucideIcon(MapPin, 15), event.location));
  }

  const row = eventRow(event, true);
  row.classList.add("featured");
  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.append(lucideIcon(ChevronRight, 16));
  row.append(chevron);
  if (details.childElementCount) {
    row.setAttribute("role", "button");
    row.setAttribute("aria-expanded", "true");
    row.addEventListener("click", () => {
      const expanded = row.getAttribute("aria-expanded") === "true";
      row.setAttribute("aria-expanded", expanded ? "false" : "true");
      details.hidden = expanded;
      syncHeight();
    });
  } else {
    chevron.hidden = true;
  }
  nodes.push(row);
  if (details.childElementCount) nodes.push(details);
  return nodes;
}

function syncHeight(): void {
  const height = list.scrollHeight;
  if (!height) return;
  void api.setEventsHeight(height + 16);
}

let loadRevision = 0;

async function load(): Promise<void> {
  const revision = ++loadRevision;
  const now = Date.now();
  try {
    const events = await api.getCalendarEvents(now, endOfTomorrow(new Date(now)));
    if (revision !== loadRevision) return;
    const upcoming = events.filter((event) => event.endAt > now);
    if (!upcoming.length) { list.innerHTML = '<p class="empty">Nothing left today or tomorrow.</p>'; syncHeight(); return; }
    const [next, ...rest] = upcoming as [UpcomingEvent, ...UpcomingEvent[]];
    const nodes: HTMLElement[] = featuredEvent(next, now);
    let currentDay = "";
    for (const event of rest) {
      const date = new Date(event.startAt);
      const key = date.toDateString();
      if (key !== currentDay) { currentDay = key; nodes.push(sectionLabel(dayLabel(date))); }
      nodes.push(eventRow(event));
    }
    list.replaceChildren(...nodes);
    syncHeight();
  } catch (error) {
    if (revision !== loadRevision) return;
    const detail = error instanceof Error ? error.message : String(error);
    const message = document.createElement("p");
    message.className = "empty";
    message.textContent = detail || "Try again shortly.";
    list.replaceChildren(message);
    syncHeight();
  }
}
api.onEventsShown(() => void load());
api.onClockTick(() => void load());
void load();
