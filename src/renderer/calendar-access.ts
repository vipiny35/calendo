import type { DesktopApi } from "./host";

/** Always paint permission from the native result, including after Settings returns. */
export function bindCalendarAccess(
  api: Pick<DesktopApi, "getCalendarAccess" | "requestCalendarAccess">,
  elements: {
    status: Pick<HTMLElement, "hidden" | "textContent">;
    button: Pick<HTMLButtonElement, "disabled" | "addEventListener">;
    row: Pick<HTMLElement, "hidden">;
    toggle: Pick<HTMLInputElement, "checked" | "addEventListener">;
  },
): () => Promise<void> {
  const { status, button, row, toggle } = elements;
  let revision = 0;
  let requesting = false;

  const paint = (granted: boolean): void => {
    row.hidden = granted;
    status.hidden = !toggle.checked;
    status.textContent = granted
      ? "Calendar access enabled."
      : "Allow Calendar access in System Settings.";
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
  const request = async (): Promise<void> => {
    if (requesting) return;
    ++revision;
    requesting = true;
    button.disabled = true;
    status.hidden = false;
    status.textContent = "Requesting Calendar access…";
    try {
      paint(await api.requestCalendarAccess());
    } catch (error) {
      showError(error);
    } finally {
      requesting = false;
      button.disabled = false;
    }
  };
  button.addEventListener("click", () => void request());
  toggle.addEventListener("change", () => {
    if (toggle.checked) void request();
    else {
      status.hidden = true;
      status.textContent = "";
    }
  });
  return refresh;
}
