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

export function popoverHeight(list: HTMLElement, root: ParentNode = document): number {
  const content = list.scrollHeight;
  if (!content) return 0;
  const frame = root.querySelector<HTMLElement>(".events-popover");
  const style = frame ? getComputedStyle(frame) : null;
  const padding = style
    ? parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    : 16;
  const footer = boxHeight(root.querySelector<HTMLElement>(".footer"));
  // A pixel of slack absorbs the rounding of fractional line heights.
  return Math.ceil(content + footer + padding) + 1;
}
