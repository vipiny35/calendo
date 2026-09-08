import {
  MENU_BAR_FORMATS,
  WEEK_STARTS,
  formatMenuBarPreview,
  type AppSettings,
  type MenuBarFormatId,
  type Theme,
  type WeekStartsOn,
} from "../shared/settings";
import { installTauriBridge, type DesktopApi } from "./host";

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

function startSettings(api: DesktopApi): void {
  const form = requireElement<HTMLFormElement>("form");
  const format = requireElement<HTMLSelectElement>("format");
  const preview = requireElement<HTMLParagraphElement>("format-preview");
  const weekStart = requireElement<HTMLSelectElement>("week-start");
  const weekNumbers = requireElement<HTMLInputElement>("week-numbers");
  const dimWeekends = requireElement<HTMLInputElement>("dim-weekends");
  const login = requireElement<HTMLInputElement>("login");
  const theme = requireElement<HTMLSelectElement>("theme");
  const version = requireElement<HTMLParagraphElement>("version");
  const quit = requireElement<HTMLButtonElement>("quit");

  fillSelect(
    format,
    MENU_BAR_FORMATS.map((item) => ({
      value: item.id,
      label: formatMenuBarPreview(item.id),
    })),
  );
  fillSelect(
    weekStart,
    WEEK_STARTS.map((item) => ({
      value: String(item.id),
      label: item.label,
    })),
  );

  const paint = (settings: AppSettings): void => {
    applyTheme(settings.theme);
    format.value = settings.menuBarFormat;
    preview.textContent = `Menu bar preview: ${formatMenuBarPreview(settings.menuBarFormat)}`;
    weekStart.value = String(settings.weekStartsOn);
    weekNumbers.checked = settings.showWeekNumbers;
    dimWeekends.checked = settings.dimWeekends;
    login.checked = settings.launchAtLogin;
    theme.value = settings.theme;
  };

  const patchFromForm = (): Partial<AppSettings> => ({
    menuBarFormat: format.value as MenuBarFormatId,
    weekStartsOn: Number(weekStart.value) as WeekStartsOn,
    showWeekNumbers: weekNumbers.checked,
    dimWeekends: dimWeekends.checked,
    launchAtLogin: login.checked,
    theme: theme.value as Theme,
  });

  form.addEventListener("change", () => {
    const patch = patchFromForm();
    applyTheme(patch.theme ?? "system");
    preview.textContent = `Menu bar preview: ${formatMenuBarPreview(
      patch.menuBarFormat ?? "weekdayDay",
    )}`;
    void api.updateSettings(patch);
  });

  quit.addEventListener("click", () => {
    void api.quitApp();
  });

  void api.getSettings().then(paint);
  void api.getAppVersion().then((value) => {
    version.textContent = `Calendo ${value}`;
  });
  api.onSettingsChanged(paint);
}

startSettings(installTauriBridge());
