/**
 * The events window is sized from its content, so every margin and padding
 * around the list has to be counted or the list scrolls by exactly what was
 * missed. offsetHeight covers padding and border but never margins.
 */
function boxHeight(element: HTMLElement | null): number {
  if (!element) return 0;
  const style = getComputedStyle(element);
  return (
    element.offsetHeight +
    parseFloat(style.marginTop) +
    parseFloat(style.marginBottom)
  );
}

/**
 * Rows only. The list itself flexes to fill the window, so its scrollHeight
 * grows with every resize and would feed the next one if we measured it.
 */
function listContentHeight(list: HTMLElement): number {
  let height = 0;
  for (const row of Array.from(list.children ?? [])) {
    height += boxHeight(row as HTMLElement);
  }
  return height;
}

export function popoverHeight(list: HTMLElement, root: ParentNode = document): number {
  const content = listContentHeight(list);
  if (!content) return 0;
  const frame = root.querySelector<HTMLElement>(".events-popover");
  const style = frame ? getComputedStyle(frame) : null;
  const padding = style
    ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    : 16;
  // A pixel of slack absorbs the rounding of fractional line heights.
  return Math.ceil(content + padding) + 1;
}

/**
 * Records which native material the window ended up with, so the page can
 * tint vibrancy but leave Liquid Glass to its own shading.
 */
export async function markPopoverMaterial(
  read: () => Promise<string>,
): Promise<void> {
  const root = document.documentElement;
  if (!root) return;
  try {
    root.dataset.material = await read();
  } catch {
    root.dataset.material = "vibrancy";
  }
}
