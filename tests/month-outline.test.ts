import { describe, expect, it } from "vitest";
import { buildMonth, atNoon } from "../src/shared/calendar";
import {
  occupancyFromWeeks,
  outlineVertices,
  monthOutlinePath,
  roundedRectilinearPath,
} from "../src/shared/month-outline";

describe("current-month outline", () => {
  it("traces a single cell as a square", () => {
    expect(outlineVertices([[true]])).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ]);
  });

  it("steps around leading and trailing days of September 2026", () => {
    const month = buildMonth(2026, 8, 1, atNoon(2026, 8, 8));
    const vertices = outlineVertices(occupancyFromWeeks(month.weeks));
    expect(vertices).toEqual([
      { x: 1, y: 0 },
      { x: 7, y: 0 },
      { x: 7, y: 4 },
      { x: 3, y: 4 },
      { x: 3, y: 5 },
      { x: 0, y: 5 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it("keeps a Sunday-start September 2026 on that month's cells", () => {
    const month = buildMonth(2026, 8, 0, atNoon(2026, 8, 8));
    expect(outlineVertices(occupancyFromWeeks(month.weeks))).toEqual([
      { x: 2, y: 0 },
      { x: 7, y: 0 },
      { x: 7, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 5 },
      { x: 0, y: 5 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("rounds every corner of a square", () => {
    const path = roundedRectilinearPath(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      2,
    );
    expect(path).toBe(
      "M 0 2 Q 0 0 2 0 L 8 0 Q 10 0 10 2 L 10 8 Q 10 10 8 10 L 2 10 Q 0 10 0 8 Z",
    );
  });

  it("emits a closed path with a fillet at each jog", () => {
    const month = buildMonth(2026, 8, 1, atNoon(2026, 8, 8));
    const path = monthOutlinePath(occupancyFromWeeks(month.weeks), 40, 38, 8);
    expect(path.startsWith("M ")).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
    expect(path.match(/Q /g)).toHaveLength(8);
  });
});
