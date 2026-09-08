/** Pixel radius of each jog in the current-month outline. Matches `.day`. */
export const MONTH_OUTLINE_RADIUS = 9;

export type GridPoint = { x: number; y: number };

const RIGHT = 0;
const DOWN = 1;
const LEFT = 2;
const UP = 3;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

function occupiedAt(grid: boolean[][], row: number, col: number): boolean {
  return grid[row]?.[col] === true;
}

/** Cell to the right of a directed edge that starts at vertex `(vr, vc)`. */
function cellOnRight(
  vr: number,
  vc: number,
  dir: number,
): [number, number] {
  switch (dir) {
    case RIGHT:
      return [vr, vc];
    case DOWN:
      return [vr, vc - 1];
    case LEFT:
      return [vr - 1, vc - 1];
    default:
      return [vr - 1, vc];
  }
}

/** Cell to the left of a directed edge that starts at vertex `(vr, vc)`. */
function cellOnLeft(vr: number, vc: number, dir: number): [number, number] {
  switch (dir) {
    case RIGHT:
      return [vr - 1, vc];
    case DOWN:
      return [vr, vc];
    case LEFT:
      return [vr, vc - 1];
    default:
      return [vr - 1, vc - 1];
  }
}

function isBoundaryEdge(
  grid: boolean[][],
  vr: number,
  vc: number,
  dir: number,
): boolean {
  const [rightRow, rightCol] = cellOnRight(vr, vc, dir);
  const [leftRow, leftCol] = cellOnLeft(vr, vc, dir);
  return occupiedAt(grid, rightRow, rightCol) && !occupiedAt(grid, leftRow, leftCol);
}

function firstOccupied(grid: boolean[][]): [number, number] | null {
  for (let row = 0; row < grid.length; row += 1) {
    const line = grid[row];
    if (!line) continue;
    for (let col = 0; col < line.length; col += 1) {
      if (line[col]) return [row, col];
    }
  }
  return null;
}

function collapseCollinear(points: GridPoint[]): GridPoint[] {
  if (points.length < 3) return points;
  const n = points.length;
  const out: GridPoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    if (!prev || !curr || !next) continue;
    const cross =
      (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
    if (cross === 0) continue;
    out.push(curr);
  }
  return out;
}

/**
 * Clockwise vertices of the union of occupied cells, in grid units
 * (column, row) at cell corners. Empty input yields an empty ring.
 */
export function outlineVertices(grid: boolean[][]): GridPoint[] {
  const start = firstOccupied(grid);
  if (!start) return [];
  const [startRow, startCol] = start;
  let vr = startRow;
  let vc = startCol;
  let dir = RIGHT;
  const points: GridPoint[] = [];
  const limit = (grid.length + 2) * ((grid[0]?.length ?? 0) + 2) * 4;

  do {
    points.push({ x: vc, y: vr });
    const nextRow = vr + (DY[dir] ?? 0);
    const nextCol = vc + (DX[dir] ?? 0);
    let nextDir = dir;
    for (const turn of [1, 0, 3, 2]) {
      const candidate = (dir + turn) % 4;
      if (isBoundaryEdge(grid, nextRow, nextCol, candidate)) {
        nextDir = candidate;
        break;
      }
    }
    vr = nextRow;
    vc = nextCol;
    dir = nextDir;
  } while (
    (vr !== startRow || vc !== startCol || dir !== RIGHT) &&
    points.length < limit
  );

  return collapseCollinear(points);
}

export function occupancyFromWeeks(
  weeks: ReadonlyArray<ReadonlyArray<{ inMonth: boolean }>>,
): boolean[][] {
  return weeks.map((week) => week.map((day) => day.inMonth));
}

function formatCoord(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

/** Closed SVG path with quadratic fillets at every 90° corner. */
export function roundedRectilinearPath(
  points: GridPoint[],
  radius: number,
): string {
  const n = points.length;
  if (n < 3) return "";
  const parts: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    if (!prev || !curr || !next) continue;
    const inX = curr.x - prev.x;
    const inY = curr.y - prev.y;
    const outX = next.x - curr.x;
    const outY = next.y - curr.y;
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);
    if (inLen === 0 || outLen === 0) continue;
    const fillet = Math.min(radius, inLen / 2, outLen / 2);
    const p1x = curr.x - (inX / inLen) * fillet;
    const p1y = curr.y - (inY / inLen) * fillet;
    const p2x = curr.x + (outX / outLen) * fillet;
    const p2y = curr.y + (outY / outLen) * fillet;
    if (parts.length === 0) parts.push(`M ${formatCoord(p1x)} ${formatCoord(p1y)}`);
    else parts.push(`L ${formatCoord(p1x)} ${formatCoord(p1y)}`);
    parts.push(
      `Q ${formatCoord(curr.x)} ${formatCoord(curr.y)} ${formatCoord(p2x)} ${formatCoord(p2y)}`,
    );
  }
  parts.push("Z");
  return parts.join(" ");
}

export function monthOutlinePath(
  grid: boolean[][],
  cellWidth: number,
  cellHeight: number,
  radius = MONTH_OUTLINE_RADIUS,
): string {
  const vertices = outlineVertices(grid).map((point) => ({
    x: point.x * cellWidth,
    y: point.y * cellHeight,
  }));
  return roundedRectilinearPath(vertices, radius);
}
