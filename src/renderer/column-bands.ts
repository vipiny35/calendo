/**
 * Geometry for the weekday highlight bands.
 *
 * A band is drawn behind date columns only, flush with the column so a
 * selected day in the next column keeps its ring.
 */

/** How far the band reaches past the column edges. */
export const BAND_BLEED = 0;
/** Extra air above the first date row. The weekday letters stay clear. */
export const BAND_LIFT = 0;

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
