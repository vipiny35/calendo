import {
  addDays,
  addMonths,
  buildMonth,
  clampToMonth,
  dayName,
  fromIso,
  toIso,
} from "../shared/calendar";
import { formatMenuBarDate, type AppSettings } from "../shared/settings";
import { installTauriBridge, type DesktopApi } from "./host";

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

function startCalendar(api: DesktopApi): void {
  const monthLabel = requireElement<HTMLHeadingElement>("month-label");
  const grid = requireElement<HTMLDivElement>("grid");
  const prev = requireElement<HTMLButtonElement>("prev-month");
  const next = requireElement<HTMLButtonElement>("next-month");
  const todayButton = requireElement<HTMLButtonElement>("today");
  const settingsButton = requireElement<HTMLButtonElement>("settings");

  let settings: AppSettings | null = null;
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let focusIso = toIso(new Date());
  let lastTrayTitle = "";

  const refreshTray = (): void => {
    if (!settings) return;
    const title = formatMenuBarDate(new Date(), settings.menuBarFormat);
    if (title === lastTrayTitle) return;
    lastTrayTitle = title;
    void api.setTrayTitle(title);
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
        button.textContent = String(day.day);
        button.setAttribute("aria-label", dayName(fromIso(day.iso)));
        if (day.inMonth) button.classList.add("is-in-month");
        else button.classList.add("is-outside");
        if (day.isWeekend && settings.dimWeekends) button.classList.add("is-weekend");
        if (day.isToday) {
          button.classList.add("is-today");
          button.setAttribute("aria-current", "date");
        }
        const focused = day.iso === focusIso;
        button.tabIndex = focused ? 0 : -1;
        button.setAttribute("aria-selected", focused ? "true" : "false");
        button.addEventListener("click", () => {
          focusIso = day.iso;
          if (!day.inMonth) {
            viewYear = day.year;
            viewMonth = day.month;
          }
          render({ focusGrid: true });
        });
        cell.append(button);
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    grid.replaceChildren(table);

    if (opts?.announceMonth) announce(month.label);
    if (opts?.focusGrid) {
      const current = grid.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`);
      current?.focus();
    }
  };

  const showToday = (): void => {
    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    focusIso = toIso(today);
    render({ announceMonth: true, focusGrid: true });
  };

  const shiftMonth = (delta: number): void => {
    const next = addMonths(viewYear, viewMonth, delta);
    const keep = clampToMonth(fromIso(focusIso), next.year, next.month);
    viewYear = next.year;
    viewMonth = next.month;
    focusIso = toIso(keep);
    render({ announceMonth: true, focusGrid: true });
  };

  const moveFocus = (days: number): void => {
    const next = addDays(fromIso(focusIso), days);
    focusIso = toIso(next);
    if (next.getMonth() !== viewMonth || next.getFullYear() !== viewYear) {
      viewYear = next.getFullYear();
      viewMonth = next.getMonth();
      render({ announceMonth: true, focusGrid: true });
      return;
    }
    render({ focusGrid: true });
  };

  prev.addEventListener("click", () => shiftMonth(-1));
  next.addEventListener("click", () => shiftMonth(1));
  todayButton.addEventListener("click", () => showToday());
  settingsButton.addEventListener("click", () => {
    void api.openSettings();
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
      render({ focusGrid: true });
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusIso = toIso(new Date(viewYear, viewMonth + 1, 0));
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
    refreshTray();
    render();
  };

  void api.getSettings().then((next) => {
    applySettings(next);
    refreshTray();
  });
  api.onSettingsChanged(applySettings);
  api.onClockTick(() => {
    refreshTray();
    render();
  });
  api.onCalendarShown(() => {
    render({ focusGrid: true });
  });
}

startCalendar(installTauriBridge());
