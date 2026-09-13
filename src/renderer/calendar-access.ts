import type { DesktopApi } from "./host";

const GRANT_WATCH_MS = [800, 1600, 3200, 6400];

/** Always paint permission from the native result, including after Settings returns. */
export function bindCalendarAccess(
  api: Pick<
    DesktopApi,
    "getCalendarAccess" | "requestCalendarAccess" | "openCalendarPrivacy"
  >,
  elements: {
    status: Pick<HTMLElement, "hidden" | "textContent">;
    button: Pick<HTMLButtonElement, "disabled" | "addEventListener">;
    row: Pick<HTMLElement, "hidden">;
    toggle: Pick<HTMLInputElement, "checked" | "addEventListener">;
    onGrantedChange?: (granted: boolean) => void;
  },
): () => Promise<void> {
  const { status, button, row, toggle, onGrantedChange } = elements;
  let revision = 0;
  let requesting = false;

  const paint = (granted: boolean): void => {
    row.hidden = granted;
    if (granted) {
      status.hidden = true;
      status.textContent = "";
    }
    onGrantedChange?.(granted);
  };
  const showError = (error: unknown): void => {
    status.hidden = false;
    status.textContent = typeof error === "string" ? error : "Calendar access is unavailable.";
  };
  const refresh = async (): Promise<void> => {
    if (requesting) return;
    const current = ++revision;
    try {
      const granted = await api.getCalendarAccess();
      if (current === revision) paint(granted);
    } catch (error) {
      if (current === revision) showError(error);
    }
  };
  const watchForGrant = async (started: number): Promise<void> => {
    for (const delay of GRANT_WATCH_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (requesting || started !== revision) return;
      try {
        const granted = await api.getCalendarAccess();
        if (started !== revision) return;
        paint(granted);
        if (granted) return;
      } catch {
        if (started !== revision) return;
      }
    }
  };
  const request = async (): Promise<void> => {
    if (requesting) return;
    const started = ++revision;
    requesting = true;
    button.disabled = true;
    try {
      const granted = await api.requestCalendarAccess();
      if (started !== revision) return;
      paint(granted);
      if (!granted && toggle.checked) void watchForGrant(started);
    } catch (error) {
      if (started === revision) showError(error);
    } finally {
      requesting = false;
      button.disabled = false;
    }
  };
  const openPrivacy = async (): Promise<void> => {
    if (requesting) return;
    const started = ++revision;
    requesting = true;
    button.disabled = true;
    try {
      await api.openCalendarPrivacy();
      if (started !== revision) return;
      void watchForGrant(started);
    } catch (error) {
      if (started === revision) showError(error);
    } finally {
      requesting = false;
      button.disabled = false;
    }
  };
  button.addEventListener("click", () => void openPrivacy());
  toggle.addEventListener("change", () => {
    if (toggle.checked) void request();
  });
  return refresh;
}
