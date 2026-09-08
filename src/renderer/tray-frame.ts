/**
 * The framed menu bar glyph: the date inside a rounded outline.
 *
 * The dated glyphs are PNGs baked by `pnpm icon`, but this one holds text that
 * changes with the locale and the weekday and month toggles, so it is drawn
 * here instead. The tray scales any image to 18pt tall and keeps its aspect
 * ratio, so a 32px-tall canvas puts this glyph at the same height as the baked
 * ones, and the box metrics below mirror `trayMetrics()` in
 * `scripts/generate-icon.swift`.
 */

const BOX = 32;
/** Clear pixels around the outline, so the stroke is not clipped. */
const MARGIN = 1;
const STROKE = 3.3;
const RADIUS = 7.4;
const FONT = '590 19px -apple-system, "SF Pro Text", system-ui, sans-serif';
/** Space between the text and the stroke. */
const PAD_X = 5;

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The 2D canvas context is unavailable.");
  ctx.font = FONT;
  return ctx;
}

function outline(ctx: CanvasRenderingContext2D, width: number): void {
  const left = MARGIN + STROKE / 2;
  const top = MARGIN + STROKE / 2;
  const right = width - left;
  const bottom = BOX - top;
  const radius = RADIUS - STROKE / 2;

  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.arcTo(right, top, right, bottom, radius);
  ctx.arcTo(right, bottom, left, bottom, radius);
  ctx.arcTo(left, bottom, left, top, radius);
  ctx.arcTo(left, top, right, top, radius);
  ctx.closePath();
  ctx.lineWidth = STROKE;
  ctx.stroke();
}

/**
 * Black on transparent. The tray marks the image as a template, so only the
 * alpha reaches the menu bar and the system tints it for light and dark.
 */
function draw(text: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.height = BOX;
  canvas.width = Math.max(
    Math.ceil(context(canvas).measureText(text).width + (PAD_X + STROKE + MARGIN) * 2),
    BOX,
  );

  const ctx = context(canvas);
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  outline(ctx, canvas.width);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, BOX / 2);
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
