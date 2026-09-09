import { endOfTomorrow, eventStatus, type EventResponse, type UpcomingEvent } from "../shared/events";
import { installTauriBridge } from "./host";
import { lucideIcon } from "./icons";
import { meetingBrand } from "../shared/meetings";
import { meetingIcon } from "./brand-icons";
import { markPopoverMaterial, popoverHeight } from "./popover-size";
import { MapPin } from "lucide";

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

function openEvent(event: UpcomingEvent): void {
  void api.openEvent(event.id);
  void api.hideEvents();
}

function eventRow(event: UpcomingEvent): HTMLElement {
  const row = document.createElement("div");
  row.className = "event interactive";
  row.setAttribute("role", "button");
  row.addEventListener("click", () => openEvent(event));
  const dot = document.createElement("span");
  dot.className = `dot ${event.response}`;
  if (event.response === "declined") row.classList.add("declined");
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = `${timeFormat.format(new Date(event.startAt))} · ${event.title}`;
  const response = RESPONSE_LABEL[event.response];
  row.title = response ? `${title.textContent} — ${response}` : title.textContent;
  row.append(dot, title);
  return row;
}

function detailRow(icon: Element | null, text: string, onClick?: () => void): HTMLElement {
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
  const heading = status.timing !== "ongoing"
    ? `Upcoming ${status.label}`
    : status.label === "now"
      ? "Happening now"
      : `Happening now, ${status.label}`;
  nodes.push(sectionLabel(heading));

  const details = document.createElement("div");
  details.className = "detail";
  if (event.joinUrl) {
    const url = event.joinUrl;
    const { brand, label } = meetingBrand(url);
    details.append(detailRow(meetingIcon(brand, 13), label, () => {
      void api.joinMeeting(url);
      void api.hideEvents();
    }));
  }
  if (event.location && !event.location.startsWith("http")) {
    details.append(detailRow(lucideIcon(MapPin, 15), event.location));
  }

  const row = eventRow(event);
  row.classList.add("featured");
  nodes.push(row);
  if (details.childElementCount) nodes.push(details);
  return nodes;
}

function syncHeight(): void {
  const height = popoverHeight(list);
  if (height) void api.setEventsHeight(height);
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
document.getElementById("settings")?.addEventListener("click", () => {
  // Presenting Settings closes the popover on the Rust side.
  void api.openSettings();
});
document.getElementById("quit")?.addEventListener("click", () => void api.quitApp());

void markPopoverMaterial(() => api.getPopoverMaterial());
api.onEventsShown(() => void load());
api.onClockTick(() => void load());
void load();
