import { eventTimeRange, type UpcomingEvent } from "../shared/events";
import { installTauriBridge } from "./host";

const api = installTauriBridge();
const list = document.getElementById("list")!;
const summary = document.getElementById("summary")!;
document.getElementById("close")?.addEventListener("click", () => void api.hideEvents());

function dayLabel(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  if (iso(date) === iso(today)) return "Today";
  if (iso(date) === iso(tomorrow)) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(date);
}

async function load(): Promise<void> {
  const now = Date.now();
  try {
    const events = await api.getCalendarEvents(now, now + 3 * 86_400_000);
    const upcoming = events.filter((event) => event.endAt > now);
    summary.textContent = upcoming.length ? `${upcoming.length} upcoming event${upcoming.length === 1 ? "" : "s"}` : "Your schedule is clear";
    if (!upcoming.length) { list.innerHTML = '<p class="empty">No upcoming events.</p>'; return; }
    let currentDay = "";
    list.replaceChildren(...upcoming.map((event: UpcomingEvent) => {
      const date = new Date(event.startAt); const key = date.toDateString(); const nodes: HTMLElement[] = [];
      if (key !== currentDay) { currentDay = key; const heading = document.createElement("p"); heading.className = "day-label"; heading.textContent = dayLabel(date); nodes.push(heading); }
      const item = document.createElement("div"); item.className = "event";
      const dot = document.createElement("span"); dot.className = "dot";
      const time = document.createElement("span"); time.className = "time"; time.textContent = eventTimeRange(event);
      const title = document.createElement("span"); title.className = "title"; title.textContent = event.title;
      item.append(dot, time, title); nodes.push(item); return nodes;
    }).flat());
  } catch { summary.textContent = "Calendar access needed"; list.innerHTML = '<p class="empty">Allow Calendar access in Settings.</p>'; }
}
void load();
