/**
 * Geometry for the weekday highlight bands.
 *
 * A band is drawn behind whole weekday columns, so it has to clear the
 * selection ring that a day cell draws inside its own column. The columns are
 * about 38px wide and the ring is 32px, which leaves under 3px of slack: a
 * band flush with the column edge lands within a pixel of the ring and reads
 * as though the two are touching. The band therefore bleeds outward past the
 * column, and starts at the weekday letters rather than the first date row,
 * so a highlighted column reads as one piece.
 */

/** How far the band reaches past the column edges. */
export const BAND_BLEED = 4;
/** Air above the weekday letters. */
export const BAND_LIFT = 2;

export type Box = { left: number; width: number; top: number; height: number };

export function bandBox(
  span: { left: number; right: number },
  rows: { top: number; bottom: number },
  origin: { left: number; top: number },
  bleed = BAND_BLEED,
  lift = BAND_LIFT,
): Box {
  return {
    left: span.left - origin.left - bleed,
    width: Math.max(0, span.right - span.left + bleed * 2),
    top: rows.top - origin.top - lift,
    height: Math.max(0, rows.bottom - rows.top + lift),
  };
}
