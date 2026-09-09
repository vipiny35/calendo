/**
 * Rounded date badge with transparent text cutouts. macOS tints the template
 * image white on a dark menu bar and dark on a light menu bar.
 * The same drawing supplies the tray image and Appearance preview.
 */

const BOX = 32;
/** Clear pixels around the badge. */
const MARGIN = 1;
const RADIUS = 7.4;
// Keep the original font metrics for the badge width; enlarge only the text.
const FONT = '590 19px -apple-system, "SF Pro Text", system-ui, sans-serif';
const TEXT_FONT = '590 21px -apple-system, "SF Pro Text", system-ui, sans-serif';
/** Space between the text and the badge edge. */
const PAD_X = 8;

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The 2D canvas context is unavailable.");
  ctx.font = FONT;
  return ctx;
}

function badge(ctx: CanvasRenderingContext2D, width: number): void {
  const left = MARGIN;
  const top = MARGIN;
  const right = width - left;
  const bottom = BOX - top;
  const radius = RADIUS;

  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.arcTo(right, top, right, bottom, radius);
  ctx.arcTo(right, bottom, left, bottom, radius);
  ctx.arcTo(left, bottom, left, top, radius);
  ctx.arcTo(left, top, right, top, radius);
  ctx.closePath();
  ctx.fill();
}

/**
 * Black on transparent. The tray marks the image as a template, so only the
 * alpha reaches the menu bar and the system tints it for light and dark.
 */
function draw(text: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.height = BOX;
  canvas.width = Math.max(
    Math.ceil(context(canvas).measureText(text).width + (PAD_X + MARGIN) * 2),
    BOX,
  );

  const ctx = context(canvas);
  ctx.fillStyle = "#000";
  badge(ctx, canvas.width);
  ctx.globalCompositeOperation = "destination-out";
  ctx.font = TEXT_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, BOX / 2, canvas.width - (MARGIN + 2) * 2);
  return canvas;
}

/** PNG bytes for the tray. */
export function framedGlyphPng(text: string): number[] {
  const encoded = draw(text).toDataURL("image/png").split(",")[1] ?? "";
  const binary = atob(encoded);
  return Array.from(binary, (character) => character.charCodeAt(0));
}

/** A CSS mask for the Appearance picker. */
export function framedGlyphMask(text: string): string {
  return `url("${draw(text).toDataURL("image/png")}")`;
}

/** Slim rounded timer mark shown while an upcoming meeting countdown is active. */
export function timerGlyphPng(): number[] {
  const canvas = document.createElement("canvas");
  canvas.width = 10;
  canvas.height = BOX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(3, 4, 4, 24, 2);
  ctx.fill();
  const encoded = canvas.toDataURL("image/png").split(",")[1] ?? "";
  const binary = atob(encoded);
  return Array.from(binary, (character) => character.charCodeAt(0));
}
