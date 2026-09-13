import {
  supportsDateParts,
  calendarsOfKind,
  groupCalendarsBySource,
  HIGHLIGHT_DAYS,
  MENU_BAR_ICONS,
  UPCOMING_HORIZON_HOURS,
  upcomingHorizonLabel,
  WEEK_STARTS,
  weekdayLetter,
  type AppSettings,
  type CalendarInfo,
  type MenuBarIconStyle,
  type Theme,
  type UpcomingHorizonHours,
  type Weekday,
  type WeekStartsOn,
} from "../shared/settings";
import { installTauriBridge, type DesktopApi } from "./host";
import { lucideIcon } from "./icons";
import { framedGlyphMask } from "./tray-frame";
import { Check, Volume2 } from "lucide";
import { bindCalendarAccess } from "./calendar-access";

function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function applyTheme(theme: Theme): void {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

function fillSelect(
  select: HTMLSelectElement,
  options: { value: string; label: string }[],
): void {
  select.replaceChildren(
    ...options.map((option) => {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      return node;
    }),
  );
}

/** Each style previewed with today's date, the way the menu bar would show it. */
function trayGlyphUrl(style: MenuBarIconStyle, date: Date): string | null {
  if (style === "none") return null;
  if (style === "framed") return framedGlyphMask(String(date.getDate()));
  if (style === "calendar") return `url("tray/calendar.png")`;
  const day = String(date.getDate()).padStart(2, "0");
  return `url("tray/filled/day-${day}.png")`;
}

function buildIconStyles(picker: HTMLElement, date = new Date()): void {
  picker.replaceChildren(
    ...MENU_BAR_ICONS.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "radio");
      button.dataset.style = item.id;
      button.setAttribute("aria-checked", "false");
      button.setAttribute("aria-label", item.label);

      const glyph = document.createElement("span");
      glyph.className = item.id === "none" ? "mb-icon none" : "mb-icon";
      glyph.setAttribute("aria-hidden", "true");
      const mask = trayGlyphUrl(item.id, date);
      if (mask) glyph.style.setProperty("--tray-glyph", mask);
      else glyph.textContent = String(date.getDate());
      button.append(glyph);
      return button;
    }),
  );
}

function paintIconStyle(picker: HTMLElement, id: MenuBarIconStyle): void {
  for (const button of Array.from(picker.querySelectorAll<HTMLButtonElement>("button"))) {
    button.setAttribute("aria-checked", button.dataset.style === id ? "true" : "false");
  }
}

function showTab(name: string): void {
  for (const button of Array.from(
    document.querySelectorAll<HTMLButtonElement>(".tabs [role='tab']"),
  )) {
    const selected = button.dataset.tab === name;
    button.setAttribute("aria-selected", selected ? "true" : "false");
  }
  for (const panel of Array.from(document.querySelectorAll<HTMLElement>("[role='tabpanel']"))) {
    panel.hidden = panel.id !== `panel-${name}`;
  }
}

function startSettings(api: DesktopApi): void {
  const form = requireElement<HTMLFormElement>("form");
  const tabs = requireElement<HTMLDivElement>("tabs");
  const iconStyles = requireElement<HTMLDivElement>("icon-styles");
  const showWeekday = requireElement<HTMLInputElement>("show-weekday");
  const showMonth = requireElement<HTMLInputElement>("show-month");
  const weekStart = requireElement<HTMLSelectElement>("week-start");
  const weekNumbers = requireElement<HTMLInputElement>("week-numbers");
  const highlightDays = requireElement<HTMLDivElement>("highlight-days");
  const login = requireElement<HTMLInputElement>("login");
  const beep = requireElement<HTMLInputElement>("beep");
  const autoUpdate = requireElement<HTMLInputElement>("auto-update");
  const showUpcoming = requireElement<HTMLInputElement>("show-upcoming");
  const upcomingHorizon = requireElement<HTMLSelectElement>("upcoming-horizon");
  const calendarAccessStatus = requireElement<HTMLParagraphElement>("calendar-access-status");
  const calendarAccess = requireElement<HTMLButtonElement>("calendar-access");
  const calendarAccessRow = requireElement<HTMLElement>("calendar-access-row");
  const calendarSources = requireElement<HTMLElement>("calendar-sources");
  const reminderSources = requireElement<HTMLElement>("reminder-sources");
  const remindersAccess = requireElement<HTMLButtonElement>("reminders-access");
  const remindersAccessRow = requireElement<HTMLElement>("reminders-access-row");
  const beepPreview = requireElement<HTMLButtonElement>("beep-preview");
  const theme = requireElement<HTMLSelectElement>("theme");
  const version = requireElement<HTMLParagraphElement>("version");
  const checkUpdates = requireElement<HTMLButtonElement>("check-updates");
  const installUpdate = requireElement<HTMLButtonElement>("install-update");
  const openRepository = requireElement<HTMLButtonElement>("open-repository");
  const openProfile = requireElement<HTMLButtonElement>("open-profile");
  const openDonate = requireElement<HTMLButtonElement>("open-donate");
  const openSite = requireElement<HTMLButtonElement>("open-site");
  const updateStatus = requireElement<HTMLParagraphElement>("update-status");

  buildIconStyles(iconStyles);
  beepPreview.append(lucideIcon(Volume2, 16));
  fillSelect(
    weekStart,
    WEEK_STARTS.map((item) => ({
      value: String(item.id),
      label: item.label,
    })),
  );
  fillSelect(
    upcomingHorizon,
    UPCOMING_HORIZON_HOURS.map((hours) => ({
      value: String(hours),
      label: upcomingHorizonLabel(hours),
    })),
  );

  highlightDays.replaceChildren(
    ...HIGHLIGHT_DAYS.map((day) => {
      const wrap = document.createElement("label");
      wrap.className = "weekday-toggle";
      const caption = document.createElement("span");
      caption.textContent = weekdayLetter(day.id);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.weekday = String(day.id);
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", day.name);
      button.append(lucideIcon(Check, 12));
      wrap.append(caption, button);
      return wrap;
    }),
  );

  const selectedWeekdays = (): Weekday[] =>
    Array.from(
      highlightDays.querySelectorAll<HTMLButtonElement>("button[aria-pressed='true']"),
    )
      .map((button) => Number(button.dataset.weekday))
      .filter((value): value is Weekday => value >= 0 && value <= 6);

  const paintHighlights = (days: readonly number[]): void => {
    const selected = new Set(days);
    for (const button of Array.from(
      highlightDays.querySelectorAll<HTMLButtonElement>("button"),
    )) {
      const weekday = Number(button.dataset.weekday);
      button.setAttribute("aria-pressed", selected.has(weekday) ? "true" : "false");
    }
  };

  // Calendar glyphs stand alone; date parts apply to cutout and text styles.
  const paintDateParts = (style: MenuBarIconStyle): void => {
    const off = !supportsDateParts(style);
    for (const input of [showWeekday, showMonth]) {
      input.disabled = off;
      input.closest(".row")?.classList.toggle("is-off", off);
    }
  };

  const paintHorizon = (enabled: boolean): void => {
    upcomingHorizon.disabled = !enabled;
    upcomingHorizon.closest(".row")?.classList.toggle("is-off", !enabled);
  };

  let hiddenCalendarIds: string[] = [];

  const sourceInputs = (): HTMLInputElement[] =>
    Array.from(
      document.querySelectorAll<HTMLInputElement>(
        "#calendar-sources input[data-calendar-id], #reminder-sources input[data-calendar-id]",
      ),
    );

  const paintCalendarSelection = (hidden: readonly string[]): void => {
    const skipped = new Set(hidden);
    for (const input of sourceInputs()) {
      input.checked = !skipped.has(input.dataset.calendarId ?? "");
    }
  };

  const paintSourceList = (
    container: HTMLElement,
    calendars: CalendarInfo[],
    options: { empty: string; heading: string; headingId: string; idPrefix: string },
  ): void => {
    if (!calendars.length) {
      const empty = document.createElement("p");
      empty.className = "calendar-sources-empty";
      empty.id = options.headingId;
      empty.textContent = options.empty;
      container.replaceChildren(empty);
      return;
    }
    const groups = groupCalendarsBySource(calendars);
    const nodes: HTMLElement[] = [];
    const heading = document.createElement("p");
    heading.className = "visually-hidden";
    heading.id = options.headingId;
    heading.textContent = options.heading;
    nodes.push(heading);
    let index = 0;
    for (const group of groups) {
      if (groups.length > 1) {
        const label = document.createElement("p");
        label.className = "calendar-source-label";
        label.textContent = group.source;
        nodes.push(label);
      }
      for (const calendar of group.calendars) {
        const row = document.createElement("div");
        row.className = "row";
        const copy = document.createElement("div");
        copy.className = "copy";
        const name = document.createElement("label");
        name.className = "calendar-name";
        name.htmlFor = `${options.idPrefix}-${index}`;
        const swatch = document.createElement("span");
        swatch.className = "calendar-swatch";
        swatch.setAttribute("aria-hidden", "true");
        if (calendar.color) swatch.style.setProperty("--calendar-color", calendar.color);
        name.append(swatch, document.createTextNode(calendar.title));
        copy.append(name);
        const input = document.createElement("input");
        input.type = "checkbox";
        input.setAttribute("switch", "");
        input.id = `${options.idPrefix}-${index}`;
        input.dataset.calendarId = calendar.id;
        input.checked = !hiddenCalendarIds.includes(calendar.id);
        row.append(copy, input);
        nodes.push(row);
        index += 1;
      }
    }
    container.replaceChildren(...nodes);
  };

  const hideSourceList = (container: HTMLElement): void => {
    container.hidden = true;
    container.replaceChildren();
  };

  const loadCalendarSources = async (granted: boolean): Promise<void> => {
    if (!granted) {
      hideSourceList(calendarSources);
      return;
    }
    try {
      const calendars = calendarsOfKind(await api.listCalendars(), "event");
      paintSourceList(calendarSources, calendars, {
        empty: "No calendars available.",
        heading: "Calendars",
        headingId: "calendar-sources-label",
        idPrefix: "calendar-source",
      });
      calendarSources.hidden = false;
    } catch {
      hideSourceList(calendarSources);
    }
  };

  const loadReminderSources = async (granted: boolean): Promise<void> => {
    remindersAccessRow.hidden = granted;
    if (!granted) {
      hideSourceList(reminderSources);
      return;
    }
    try {
      const calendars = calendarsOfKind(await api.listCalendars(), "reminder");
      paintSourceList(reminderSources, calendars, {
        empty: "No reminder lists available.",
        heading: "Reminders",
        headingId: "reminder-sources-label",
        idPrefix: "reminder-source",
      });
      reminderSources.hidden = false;
    } catch {
      hideSourceList(reminderSources);
    }
  };

  const paint = (settings: AppSettings): void => {
    applyTheme(settings.theme);
    paintIconStyle(iconStyles, settings.menuBarIcon);
    paintDateParts(settings.menuBarIcon);
    showWeekday.checked = settings.showWeekday;
    showMonth.checked = settings.showMonth;
    weekStart.value = String(settings.weekStartsOn);
    weekNumbers.checked = settings.showWeekNumbers;
    paintHighlights(settings.highlightWeekdays);
    login.checked = settings.launchAtLogin;
    beep.checked = settings.beepOnTheHour;
    autoUpdate.checked = settings.autoUpdate;
    showUpcoming.checked = settings.showUpcomingEvent;
    upcomingHorizon.value = String(settings.upcomingHorizonHours);
    paintHorizon(settings.showUpcomingEvent);
    hiddenCalendarIds = settings.hiddenCalendarIds;
    paintCalendarSelection(settings.hiddenCalendarIds);
    theme.value = settings.theme;
  };

  const patchFromForm = (): Partial<AppSettings> => ({
    showWeekday: showWeekday.checked,
    showMonth: showMonth.checked,
    weekStartsOn: Number(weekStart.value) as WeekStartsOn,
    showWeekNumbers: weekNumbers.checked,
    highlightWeekdays: selectedWeekdays(),
    launchAtLogin: login.checked,
    beepOnTheHour: beep.checked,
    autoUpdate: autoUpdate.checked,
    showUpcomingEvent: showUpcoming.checked,
    upcomingHorizonHours: Number(upcomingHorizon.value) as UpcomingHorizonHours,
    theme: theme.value as Theme,
  });

  tabs.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button?.dataset.tab || !tabs.contains(button)) return;
    showTab(button.dataset.tab);
  });

  tabs.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const buttons = Array.from(tabs.querySelectorAll<HTMLButtonElement>("button"));
    const current = buttons.findIndex((button) => button.getAttribute("aria-selected") === "true");
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = buttons[(Math.max(current, 0) + delta + buttons.length) % buttons.length];
    if (!next?.dataset.tab) return;
    event.preventDefault();
    showTab(next.dataset.tab);
    next.focus();
  });

  form.addEventListener("change", () => {
    const patch = patchFromForm();
    applyTheme(patch.theme ?? "system");
    paintHorizon(patch.showUpcomingEvent ?? false);
    void api.updateSettings(patch);
  });

  const syncHiddenSources = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.calendarId) return;
    event.stopPropagation();
    const hidden = new Set(hiddenCalendarIds);
    for (const source of sourceInputs()) {
      const id = source.dataset.calendarId;
      if (!id) continue;
      if (source.checked) hidden.delete(id);
      else hidden.add(id);
    }
    hiddenCalendarIds = [...hidden].sort();
    void api.updateSettings({ hiddenCalendarIds });
  };
  calendarSources.addEventListener("change", syncHiddenSources);
  reminderSources.addEventListener("change", syncHiddenSources);

  const refreshRemindersAccess = async (): Promise<void> => {
    try {
      await loadReminderSources(await api.getRemindersAccess());
    } catch {
      await loadReminderSources(false);
    }
  };

  const refreshCalendarAccess = bindCalendarAccess(api, {
    status: calendarAccessStatus,
    button: calendarAccess,
    row: calendarAccessRow,
    toggle: showUpcoming,
    onGrantedChange: (granted) => {
      void loadCalendarSources(granted);
      void refreshRemindersAccess();
    },
  });
  remindersAccess.addEventListener("click", async () => {
    remindersAccess.disabled = true;
    try {
      await api.openRemindersPrivacy();
      await refreshRemindersAccess();
    } finally {
      remindersAccess.disabled = false;
    }
  });
  window.addEventListener("focus", () => {
    void refreshCalendarAccess();
    void refreshRemindersAccess();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    void refreshCalendarAccess();
    void refreshRemindersAccess();
  });

  iconStyles.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button || !iconStyles.contains(button) || !button.dataset.style) return;
    const id = button.dataset.style as MenuBarIconStyle;
    paintIconStyle(iconStyles, id);
    paintDateParts(id);
    void api.updateSettings({ menuBarIcon: id });
  });

  highlightDays.addEventListener("click", (event) => {
    const toggle = (event.target as HTMLElement).closest(".weekday-toggle");
    const button = toggle?.querySelector("button");
    if (!button || !highlightDays.contains(button)) return;
    const pressed = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", pressed ? "false" : "true");
    void api.updateSettings({ highlightWeekdays: selectedWeekdays() });
  });

  beepPreview.addEventListener("click", (event) => {
    event.preventDefault();
    void api.beep();
  });

  const checkForUpdates = async (installIfFound = false): Promise<void> => {
    updateStatus.textContent = "Checking…";
    installUpdate.hidden = true;
    try {
      const offer = await api.checkForUpdates();
      if (!offer.version) {
        updateStatus.textContent = "Calendo is up to date.";
        return;
      }
      if (installIfFound) {
        updateStatus.textContent = `Installing ${offer.version}…`;
        void api.installUpdate().catch((error: unknown) => {
          const detail = typeof error === "string" ? error : "Update failed";
          updateStatus.textContent = detail;
        });
        return;
      }
      updateStatus.textContent = `Version ${offer.version} is available.`;
      installUpdate.textContent = `Update to ${offer.version} and Restart`;
      installUpdate.hidden = false;
    } catch (error) {
      const detail = typeof error === "string" ? error : "Could not reach update server";
      updateStatus.textContent = `Update check failed: ${detail}`;
    }
  };
  checkUpdates.addEventListener("click", () => void checkForUpdates(autoUpdate.checked));

  // The app relaunches itself when this finishes, so success needs no message.
  installUpdate.addEventListener("click", () => {
    installUpdate.disabled = true;
    checkUpdates.disabled = true;
    updateStatus.textContent = "Downloading…";
    void api.installUpdate().catch((error: unknown) => {
      const detail = typeof error === "string" ? error : "Update failed";
      // An update that cannot be verified is a dead end here; the repository
      // link below stands ready for the disk image.
      updateStatus.textContent = detail;
      installUpdate.disabled = false;
      checkUpdates.disabled = false;
    });
  });
  openRepository.addEventListener("click", () => void api.openRepository());
  openProfile.addEventListener("click", () => void api.openUrl("https://x.com/vip_iny"));
  openDonate.addEventListener("click", () =>
    void api.openUrl("https://buymeacoffee.com/vip_iny"),
  );
  openSite.addEventListener("click", () => void api.openUrl("https://vipinyadav.com"));
  api.onUpdateProgress(({ downloaded, total }) => {
    updateStatus.textContent = total
      ? `Downloading… ${Math.min(100, Math.round((downloaded / total) * 100))}%`
      : "Downloading…";
  });

  void api.getSettings().then((settings) => {
    paint(settings);
    void refreshCalendarAccess();
  });
  void api.getAppVersion().then((value) => {
    version.textContent = value;
  });
  api.onSettingsChanged(paint);
}

startSettings(installTauriBridge());
