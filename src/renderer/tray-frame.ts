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

/**
 * The tray scales every status image to 18pt tall, so a 36px box is exactly
 * 2x and lands on retina pixels 1:1. Every measure below is in those pixels
 * and reads at half its value in points.
 */
const EVENT_BOX = 36;
/** Slim rounded mark that leads the countdown. */
const PILL_WIDTH = 8;
const PILL_HEIGHT = 32;
/** Transparent run between the mark and the countdown. */
const PILL_GAP = 13;
/** 13pt once scaled, matching a native title, a shade heavier than regular. */
const EVENT_FONT = '500 26px -apple-system, "SF Pro Text", system-ui, sans-serif';

function measure(font: string, text: string): number {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * Mark plus countdown in one template image. Drawing the text ourselves buys
 * the gap and the weight that a native status item title cannot express, and
 * the template alpha still tints and inverts with the menu bar.
 */
export function eventGlyphPng(text: string): number[] {
  const canvas = document.createElement("canvas");
  canvas.height = EVENT_BOX;
  canvas.width = text
    ? Math.ceil(PILL_WIDTH + PILL_GAP + measure(EVENT_FONT, text) + 2)
    : PILL_WIDTH;

  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(
    0,
    (EVENT_BOX - PILL_HEIGHT) / 2,
    PILL_WIDTH,
    PILL_HEIGHT,
    PILL_WIDTH / 2,
  );
  ctx.fill();
  if (text) {
    ctx.font = EVENT_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, PILL_WIDTH + PILL_GAP, EVENT_BOX / 2);
  }
  const encoded = canvas.toDataURL("image/png").split(",")[1] ?? "";
  const binary = atob(encoded);
  return Array.from(binary, (character) => character.charCodeAt(0));
}
