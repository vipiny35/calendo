import { describe, expect, it } from "vitest";
import { BAND_BLEED, BAND_LIFT, bandBox } from "../src/renderer/column-bands";

// A 288pt popover with 12pt side padding gives seven ~37.7pt columns; the
// selection ring inside a day cell is 32pt wide.
const COLUMN = 37.7;
const RING = 32;
const origin = { left: 100, top: 50 };

describe("weekday highlight bands", () => {
  const span = { left: origin.left + COLUMN * 2, right: origin.left + COLUMN * 3 };
  const rows = { top: origin.top + 20, bottom: origin.top + 240 };

  it("clears the selection ring on both sides", () => {
    const box = bandBox(span, rows, origin);
    const ringInset = (COLUMN - RING) / 2;
    const clearance = BAND_BLEED + ringInset;
    expect(clearance).toBeGreaterThan(5);
    // The band starts left of the column, which is left of the ring.
    expect(box.left).toBeLessThan(span.left - origin.left);
    expect(box.left + box.width).toBeGreaterThan(span.right - origin.left);
  });

  it("reaches above the weekday letters", () => {
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
