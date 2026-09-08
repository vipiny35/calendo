import {
  supportsDateParts,
  HIGHLIGHT_DAYS,
  MENU_BAR_ICONS,
  WEEK_STARTS,
  weekdayLetter,
  type AppSettings,
  type MenuBarIconStyle,
  type Theme,
  type Weekday,
  type WeekStartsOn,
} from "../shared/settings";
import { installTauriBridge, type DesktopApi } from "./host";
import { lucideIcon } from "./icons";
import { framedGlyphMask } from "./tray-frame";
import { Check, Volume2 } from "lucide";

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
  const beepPreview = requireElement<HTMLButtonElement>("beep-preview");
  const theme = requireElement<HTMLSelectElement>("theme");
  const version = requireElement<HTMLParagraphElement>("version");
  const quit = requireElement<HTMLButtonElement>("quit");
  const checkUpdates = requireElement<HTMLButtonElement>("check-updates");
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
    void api.updateSettings(patch);
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

  quit.addEventListener("click", () => {
    void api.quitApp();
  });

  const checkForUpdates = async (): Promise<void> => {
    updateStatus.textContent = "Checking…";
    try {
      const latest = await api.checkForUpdates();
      const current = await api.getAppVersion();
      updateStatus.textContent = latest === current || latest === `v${current}`
        ? "Calendo is up to date."
        : `Update available: ${latest}`;
    } catch {
      updateStatus.textContent = "Could not check for updates.";
    }
  };
  checkUpdates.addEventListener("click", () => void checkForUpdates());

  void api.getSettings().then((settings) => {
    paint(settings);
    if (settings.autoUpdate) void checkForUpdates();
  });
  void api.getAppVersion().then((value) => {
    version.textContent = value;
  });
  api.onSettingsChanged(paint);
}

startSettings(installTauriBridge());
