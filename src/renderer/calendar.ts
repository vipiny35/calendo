import {
  addDays,
  addMonths,
  buildMonth,
  dayName,
  fromIso,
  toIso,
  type CalendarMonth,
} from "../shared/calendar";
import {
  MONTH_OUTLINE_RADIUS,
  monthOutlinePath,
  occupancyFromWeeks,
} from "../shared/month-outline";
import { menuBarLabel, highlightedColumnRuns, type AppSettings } from "../shared/settings";
import { eventInUpcomingHorizon, eventStatus, eventTimeRange, type UpcomingEvent } from "../shared/events";
import { lucideIcon } from "./icons";
import { eventGlyphPng, framedGlyphPng } from "./tray-frame";
import { markPopoverMaterial } from "./popover-size";
import { bandBox } from "./column-bands";
import { installTauriBridge, type DesktopApi } from "./host";
import { ChevronLeft, ChevronRight, Dot, Video } from "lucide";

function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function applyTheme(theme: AppSettings["theme"]): void {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

function announce(message: string): void {
  requireElement("live").textContent = message;
}

function paintMonthOutline(
  table: HTMLTableElement,
  svg: SVGSVGElement,
  month: CalendarMonth,
  settings: AppSettings,
): void {
  const path = svg.querySelector("path");
  const firstCell = table.querySelector<HTMLElement>("tbody td");
  const firstRow = table.querySelector<HTMLElement>("tbody tr");
  if (!path || !firstCell || !firstRow) return;
  const wrap = svg.parentElement;
  if (!wrap) return;
  const wrapRect = wrap.getBoundingClientRect();
  const cellRect = firstCell.getBoundingClientRect();
  const rowRect = firstRow.getBoundingClientRect();
  if (cellRect.width === 0 || rowRect.height === 0) return;
  const rows = month.weeks.length;
  const cols = month.weeks[0]?.length ?? 0;
  svg.setAttribute("width", String(cols * cellRect.width));
  svg.setAttribute("height", String(rows * rowRect.height));
  svg.style.left = `${cellRect.left - wrapRect.left}px`;
  svg.style.top = `${cellRect.top - wrapRect.top}px`;
  path.setAttribute(
    "d",
    monthOutlinePath(
      occupancyFromWeeks(month.weeks),
      cellRect.width,
      rowRect.height,
      MONTH_OUTLINE_RADIUS,
    ),
  );
  paintColumnHighlights(table, wrap, settings);
}

function paintColumnHighlights(
  table: HTMLTableElement,
  wrap: HTMLElement,
  settings: AppSettings,
): void {
  const layer = wrap.querySelector(".column-highlights");
  const headers = Array.from(
    table.querySelectorAll<HTMLElement>("thead th.weekday"),
  );
  const firstBody = table.querySelector<HTMLElement>("tbody tr");
  const lastRow = table.querySelector<HTMLElement>("tbody tr:last-child");
  if (!layer || headers.length < 7 || !firstBody || !lastRow) return;
  const wrapRect = wrap.getBoundingClientRect();
  const rows = {
    top: firstBody.getBoundingClientRect().top,
    bottom: lastRow.getBoundingClientRect().bottom,
  };
  layer.replaceChildren(
    ...highlightedColumnRuns(settings.weekStartsOn, settings.highlightWeekdays).flatMap(
      (run) => {
        const start = headers[run.start];
        const end = headers[run.start + run.count - 1];
        if (!start || !end) return [];
        const box = bandBox(
          {
            left: start.getBoundingClientRect().left,
            right: end.getBoundingClientRect().right,
          },
          rows,
          { left: wrapRect.left, top: wrapRect.top },
        );
        const band = document.createElement("div");
        band.className = "column-highlight";
        band.style.left = `${box.left}px`;
        band.style.width = `${box.width}px`;
        band.style.top = `${box.top}px`;
        band.style.height = `${box.height}px`;
        return [band];
      },
    ),
  );
}

function startCalendar(api: DesktopApi): void {
  const monthLabel = requireElement<HTMLHeadingElement>("month-label");
  const grid = requireElement<HTMLDivElement>("grid");
  const prev = requireElement<HTMLButtonElement>("prev-month");
  const todayButton = requireElement<HTMLButtonElement>("today-month");
  const next = requireElement<HTMLButtonElement>("next-month");
  const eventCard = requireElement<HTMLElement>("event-card");
  const eventStatusLabel = requireElement<HTMLElement>("event-status");
  const eventTitle = requireElement<HTMLElement>("event-title");
  const eventMeta = requireElement<HTMLElement>("event-meta");
  const joinMeeting = requireElement<HTMLButtonElement>("join-meeting");
  const calendarAccess = requireElement<HTMLButtonElement>("calendar-access");
  const dayEvents = requireElement<HTMLElement>("day-events");
  const dayEventsTitle = requireElement<HTMLElement>("day-events-title");
  const dayEventsCount = requireElement<HTMLElement>("day-events-count");
  const dayEventsList = requireElement<HTMLElement>("day-events-list");
  prev.append(lucideIcon(ChevronLeft, 18));
  todayButton.append(lucideIcon(Dot, 20, { "stroke-width": 10 }));
  next.append(lucideIcon(ChevronRight, 18));
  joinMeeting.append(lucideIcon(Video, 15), document.createTextNode("Join Meeting"));

  let settings: AppSettings | null = null;
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let focusIso = toIso(new Date());
  // Outside-day clicks keep a selection ring without changing month. Month
  // chevrons must not reuse that ring on a spillover cell like "today, 10".
  let pinnedOutsideIso: string | null = null;
  let lastTrayLabel = "";
  let lastEventTrayLabel = "";
  let lastHour = new Date().getHours();
  let upcomingEvent: UpcomingEvent | null = null;
  let calendarEvents: UpcomingEvent[] = [];
  let eventError: string | null = null;
  let eventRequest = 0;

  const paintEvent = (): void => {
    eventCard.hidden = true;
    calendarAccess.hidden = true;
  };

  const refreshUpcoming = async (): Promise<void> => {
    const request = ++eventRequest;
    const current = settings;
    if (!current?.showUpcomingEvent) {
      upcomingEvent = null;
      calendarEvents = [];
      eventError = null;
      paintEvent();
      paintDayEvents();
      refreshTray();
      return;
    }
    try {
      const monthStart = new Date(viewYear, viewMonth, 1);
      const monthEnd = new Date(viewYear, viewMonth + 1, 1);
      const nextEvent = await api.getUpcomingEvent();
      let monthEvents: UpcomingEvent[] = [];
      try {
        monthEvents = await api.getCalendarEvents(monthStart.getTime(), monthEnd.getTime());
      } catch {
        // Calendar grid decorations belong to the events popover and are optional.
      }
      if (request !== eventRequest) return;
      const now = Date.now();
      upcomingEvent =
        nextEvent && eventInUpcomingHorizon(nextEvent, now, current.upcomingHorizonHours)
          ? nextEvent
          : null;
      calendarEvents = monthEvents;
      eventError = null;
    } catch (error) {
      if (request !== eventRequest) return;
      upcomingEvent = null;
      calendarEvents = [];
      eventError = error instanceof Error ? error.message : String(error);
    }
    paintEvent();
    paintDayEvents();
    refreshTray();
    render();
  };

  const paintDayEvents = (): void => {
    dayEvents.hidden = true;
    return;
    const selectedDate = fromIso(focusIso);
    dayEventsTitle.textContent = new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    }).format(selectedDate);
    const selectedEvents = calendarEvents.filter(
      (event) => toIso(new Date(event.startAt)) === focusIso,
    );
    dayEventsCount.textContent = selectedEvents.length
      ? `${selectedEvents.length} event${selectedEvents.length === 1 ? "" : "s"}`
      : "";
    if (!selectedEvents.length) {
      const empty = document.createElement("p");
      empty.className = "day-events-empty";
      empty.textContent = eventError ? "Allow Calendar access to see events." : "No events";
      dayEventsList.replaceChildren(empty);
      return;
    }
    dayEventsList.replaceChildren(
      ...selectedEvents.map((event) => {
        const item = document.createElement("div");
        item.className = "day-event";
        const dot = document.createElement("span");
        dot.className = "day-event-dot";
        dot.setAttribute("aria-hidden", "true");
        const title = document.createElement("span");
        title.className = "day-event-title";
        title.textContent = event.title;
        const time = document.createElement("span");
        time.className = "day-event-time";
        time.textContent = eventTimeRange(event);
        item.append(dot, title, time);
        return item;
      }),
    );
  };

  const refreshTray = (): void => {
    if (!settings) return;
    const now = new Date();
    const label = menuBarLabel(settings, now);
    const status = upcomingEvent && now.getTime() < upcomingEvent.endAt
      ? eventStatus(upcomingEvent, now.getTime()).label
      : "";
    // The status item carries the real pressed highlight now, so the title
    // stays as it reads when the popover is closed.
    const title = label.style === "none" ? label.text ?? "" : "";
    const trayStyle = label.style;
    const signature = `${title}|${label.day ?? ""}|${trayStyle}`;
    // A hair space keeps "2h 21m" from reading as one long number without
    // opening the full word space the menu bar font would otherwise give it.
    const eventTitle = status ? status.replace(/(\d+)([hm])/g, "$1\u200a$2") : null;
    const eventSignature = `${eventTitle ?? ""}|${Boolean(eventTitle)}`;
    if (eventSignature !== lastEventTrayLabel) {
      lastEventTrayLabel = eventSignature;
      // The countdown rides in the glyph, so the status item keeps no title.
      void api.setEventTrayLabel(null, eventTitle ? eventGlyphPng(eventTitle) : null, Boolean(eventTitle));
    }
    if (signature === lastTrayLabel) return;
    lastTrayLabel = signature;
    // The cutout style draws its date into the glyph instead of the title.
    const framed = label.style === "framed" ? label.text : null;
    void api.setTrayLabel(
      title || null,
      label.day,
      trayStyle,
      framed === null ? null : framedGlyphPng(framed),
    );
  };

  const render = (opts?: { announceMonth?: boolean; focusGrid?: boolean }): void => {
    if (!settings) return;
    const today = new Date();
    const month = buildMonth(viewYear, viewMonth, settings.weekStartsOn, today);
    monthLabel.textContent = month.label;

    const table = document.createElement("table");
    table.className = settings.showWeekNumbers ? "grid with-weeks" : "grid";
    table.setAttribute("role", "grid");
    table.setAttribute("aria-labelledby", "month-label");

    const caption = document.createElement("caption");
    caption.className = "visually-hidden";
    caption.textContent = month.label;
    table.append(caption);

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    if (settings.showWeekNumbers) {
      const corner = document.createElement("th");
      corner.scope = "col";
      corner.className = "weeknum";
      const weekLabel = document.createElement("span");
      weekLabel.className = "visually-hidden";
      weekLabel.textContent = "Week";
      corner.append(weekLabel);
      headRow.append(corner);
    }
    for (const label of month.weekdayLabels) {
      const header = document.createElement("th");
      header.scope = "col";
      header.className = "weekday";
      header.title = label.long;
      const hidden = document.createElement("span");
      hidden.className = "visually-hidden";
      hidden.textContent = label.long;
      const visible = document.createElement("span");
      visible.setAttribute("aria-hidden", "true");
      visible.textContent = label.narrow;
      header.append(hidden, visible);
      headRow.append(header);
    }
    head.append(headRow);
    table.append(head);

    const body = document.createElement("tbody");
    for (const week of month.weeks) {
      const row = document.createElement("tr");
      if (settings.showWeekNumbers) {
        const number = document.createElement("th");
        number.scope = "row";
        number.className = "weeknum";
        number.textContent = String(week[0]?.weekNumber ?? "");
        row.append(number);
      }
      for (const day of week) {
        const cell = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "day";
        button.dataset.iso = day.iso;
        const number = document.createElement("span");
        number.className = "day-number";
        number.textContent = String(day.day);
        button.append(number);
        button.setAttribute("aria-label", dayName(fromIso(day.iso)));
        if (day.inMonth) button.classList.add("is-in-month");
        else button.classList.add("is-outside");
        if (day.isToday && day.inMonth) {
          button.classList.add("is-today");
          button.setAttribute("aria-current", "date");
        }
        const focused =
          day.iso === focusIso && (day.inMonth || day.iso === pinnedOutsideIso);
        if (focused) button.classList.add("is-selected");
        button.tabIndex = focused ? 0 : -1;
        button.setAttribute("aria-selected", focused ? "true" : "false");
        button.addEventListener("click", () => {
          focusIso = day.iso;
          pinnedOutsideIso = day.inMonth ? null : day.iso;
          render({ focusGrid: true });
          paintDayEvents();
        });
        cell.append(button);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);

    const wrap = document.createElement("div");
    wrap.className = "month";
    const bands = document.createElement("div");
    bands.className = "column-highlights";
    bands.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "month-outline");
    svg.setAttribute("aria-hidden", "true");
    svg.append(document.createElementNS("http://www.w3.org/2000/svg", "path"));
    wrap.append(bands, table, svg);
    grid.replaceChildren(wrap);
    paintMonthOutline(table, svg, month, settings);

    if (opts?.announceMonth) announce(month.label);
    if (opts?.focusGrid) {
      const selector = pinnedOutsideIso
        ? `[data-iso="${focusIso}"]`
        : `[data-iso="${focusIso}"].is-in-month`;
      grid.querySelector<HTMLButtonElement>(selector)?.focus();
    }
  };

  const showToday = (): void => {
    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    focusIso = toIso(today);
    pinnedOutsideIso = null;
    render({ announceMonth: true, focusGrid: true });
    paintDayEvents();
    void refreshUpcoming();
  };

  const shiftMonth = (delta: number): void => {
    const next = addMonths(viewYear, viewMonth, delta);
    viewYear = next.year;
    viewMonth = next.month;
    pinnedOutsideIso = null;
    render({ announceMonth: true, focusGrid: true });
    paintDayEvents();
    void refreshUpcoming();
  };

  const moveFocus = (days: number): void => {
    const next = addDays(fromIso(focusIso), days);
    focusIso = toIso(next);
    pinnedOutsideIso = null;
    if (next.getMonth() !== viewMonth || next.getFullYear() !== viewYear) {
      viewYear = next.getFullYear();
      viewMonth = next.getMonth();
      render({ announceMonth: true, focusGrid: true });
      paintDayEvents();
      void refreshUpcoming();
      return;
    }
    render({ focusGrid: true });
  };

  prev.addEventListener("click", () => shiftMonth(-1));
  todayButton.addEventListener("click", () => showToday());
  next.addEventListener("click", () => shiftMonth(1));
  joinMeeting.addEventListener("click", () => {
    const url = upcomingEvent?.joinUrl;
    if (!url) return;
    void api.joinMeeting(url).then(() => api.hideCalendar());
  });
  calendarAccess.addEventListener("click", async () => {
    calendarAccess.disabled = true;
    try {
      await api.requestCalendarAccess();
      await refreshUpcoming();
    } catch {
      eventMeta.textContent = "Could not request Calendar access. Try again.";
    } finally {
      calendarAccess.disabled = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      void api.hideCalendar();
      return;
    }
    if (event.key === "," && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void api.openSettings();
      return;
    }
    if (event.key === "t" || event.key === "T") {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      showToday();
      return;
    }
    if (event.key === "PageUp") {
      event.preventDefault();
      shiftMonth(-1);
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      shiftMonth(1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusIso = toIso(new Date(viewYear, viewMonth, 1));
      pinnedOutsideIso = null;
      render({ focusGrid: true });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusIso = toIso(new Date(viewYear, viewMonth + 1, 0));
      pinnedOutsideIso = null;
      render({ focusGrid: true });
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(-1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-7);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(7);
    }
  });

  const applySettings = (next: AppSettings): void => {
    settings = next;
    applyTheme(next.theme);
    paintEvent();
    paintDayEvents();
    refreshTray();
    render();
    void refreshUpcoming();
  };

  void api.getSettings().then((next) => {
    applySettings(next);
  });
  void markPopoverMaterial(() => api.getPopoverMaterial());
  api.onSettingsChanged(applySettings);
  api.onClockTick(() => {
    const hour = new Date().getHours();
    if (hour !== lastHour) {
      lastHour = hour;
      if (settings?.beepOnTheHour) void api.beep();
    }
    refreshTray();
    render();
    void refreshUpcoming();
  });
  api.onCalendarShown(() => {
    refreshTray();
    render({ focusGrid: true });
    void refreshUpcoming();
  });
}

startCalendar(installTauriBridge());
