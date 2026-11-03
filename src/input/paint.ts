export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** Canvas border box in CSS pixels (`getBoundingClientRect`). */
export interface ClientBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Disk radius in cells. √2 is the skeleton brush: on the integer grid it is
 * exactly the 3×3 square and nothing past it.
 */
export const DEFAULT_BRUSH_RADIUS = Math.SQRT2;

/**
 * Map a pointer position to a grid cell.
 *
 * `box` is the canvas border box, so a letterboxed stage misses outside it.
 * Client coordinates and that box are both CSS pixels. Multiplying through by
 * `devicePixelRatio` keeps the cell stable when the backing store is sized in
 * device pixels (`css * dpr`) or one pixel per cell — the ratio cancels.
 */
export function clientToCell(
  clientX: number,
  clientY: number,
  box: ClientBox,
  gridWidth: number,
  gridHeight: number,
  devicePixelRatio = 1,
): Cell | null {
  if (!(box.width > 0) || !(box.height > 0) || !(gridWidth > 0) || !(gridHeight > 0)) return null;
  const dpr = devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const deviceWidth = box.width * dpr;
  const deviceHeight = box.height * dpr;
  if (!(deviceWidth > 0) || !(deviceHeight > 0)) return null;
  const x = Math.floor(((clientX - box.left) * dpr * gridWidth) / deviceWidth);
  const y = Math.floor(((clientY - box.top) * dpr * gridHeight) / deviceHeight);
  if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return null;
  return { x, y };
}

export function lineCells(x0: number, y0: number, x1: number, y1: number): Cell[] {
  const cells: Cell[] = [];
  forEachLineCell(x0, y0, x1, y1, (x, y) => cells.push({ x, y }));
  return cells;
}

export function brushCells(cx: number, cy: number, radius: number): Cell[] {
  const cells: Cell[] = [];
  forEachBrushCell(cx, cy, radius, (x, y) => cells.push({ x, y }));
  return cells;
}

/** Stamp a round brush along the segment. Cells that already hold `materialId` are left alone. */
export function stampStroke(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  materialId: number,
  readCell: (x: number, y: number) => number,
  writeCell: (x: number, y: number, materialId: number) => void,
  gridWidth: number,
  gridHeight: number,
): void {
  forEachLineCell(x0, y0, x1, y1, (cx, cy) => {
    forEachBrushCell(cx, cy, radius, (x, y) => {
      if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return;
      if (readCell(x, y) === materialId) return;
      writeCell(x, y, materialId);
    });
  });
}

function forEachLineCell(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  visit: (x: number, y: number) => void,
): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    visit(x, y);
    if (x === x1 && y === y1) break;
    const doubled = err * 2;
    if (doubled > -dy) {
      err -= dy;
      x += sx;
    }
    if (doubled < dx) {
      err += dx;
      y += sy;
    }
  }
}

function forEachBrushCell(
  cx: number,
  cy: number,
  radius: number,
  visit: (x: number, y: number) => void,
): void {
  const reach = radius > 0 && Number.isFinite(radius) ? radius : 0;
  const limit = Math.floor(reach);
  const radiusSq = reach * reach;
  for (let dy = -limit; dy <= limit; dy++) {
    const dySq = dy * dy;
    for (let dx = -limit; dx <= limit; dx++) {
      if (dx * dx + dySq <= radiusSq) visit(cx + dx, cy + dy);
    }
  }
}
