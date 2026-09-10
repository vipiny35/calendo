import { describe, expect, it } from "vitest";
import { BAND_BLEED, BAND_LIFT, bandBox } from "../src/renderer/column-bands";

// A 288pt popover with 10pt side padding gives seven ~38.3pt columns; the
// selection ring inside a day cell is 34pt wide.
const COLUMN = 38.3;
const RING = 34;
const origin = { left: 100, top: 50 };

describe("weekday highlight bands", () => {
  const span = { left: origin.left + COLUMN * 2, right: origin.left + COLUMN * 3 };
  const rows = { top: origin.top + 20, bottom: origin.top + 240 };

  it("stays out of a selected ring in the next column", () => {
    const box = bandBox(span, rows, origin);
    const ringInset = (COLUMN - RING) / 2;
    const columnLeft = span.left - origin.left;
    const columnRight = span.right - origin.left;
    expect(box.left).toBeGreaterThanOrEqual(columnLeft - ringInset);
    expect(box.left + box.width).toBeLessThanOrEqual(columnRight + ringInset);
    expect(BAND_BLEED).toBeLessThan(ringInset);
  });

  it("starts at the first date row", () => {
    const box = bandBox(span, rows, origin);
    expect(box.top).toBe(rows.top - origin.top - BAND_LIFT);
    expect(box.top + box.height).toBe(rows.bottom - origin.top);
  });

  it("spans a run of columns as one band", () => {
    const one = bandBox(span, rows, origin);
    const two = bandBox({ left: span.left, right: span.right + COLUMN }, rows, origin);
    expect(two.width - one.width).toBeCloseTo(COLUMN, 5);
  });

  it("never returns a negative box", () => {
    const box = bandBox({ left: 10, right: 0 }, { top: 10, bottom: 0 }, origin, 0, 0);
    expect(box.width).toBe(0);
    expect(box.height).toBe(0);
  });
});
