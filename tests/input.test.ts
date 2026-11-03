import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRUSH_RADIUS,
  brushCells,
  clientToCell,
  lineCells,
  stampStroke,
  type Cell,
} from '../src/input/paint';

describe('clientToCell', () => {
  const box = { left: 64, top: 48, width: 800, height: 600 };
  const gridWidth = 200;
  const gridHeight = 150;

  it('maps CSS pixels through a letterboxed canvas', () => {
    expect(clientToCell(64 + 41, 48 + 102, box, gridWidth, gridHeight)).toEqual({ x: 10, y: 25 });
  });

  it('misses the letterbox outside the canvas', () => {
    expect(clientToCell(10, 80, box, gridWidth, gridHeight)).toBeNull();
    expect(clientToCell(100, 10, box, gridWidth, gridHeight)).toBeNull();
    expect(clientToCell(64 + 800, 48 + 10, box, gridWidth, gridHeight)).toBeNull();
    expect(clientToCell(64 + 10, 48 + 600, box, gridWidth, gridHeight)).toBeNull();
  });

  it('includes the last cell and rejects a zero-sized box', () => {
    expect(clientToCell(64 + 799.9, 48 + 599.9, box, gridWidth, gridHeight)).toEqual({
      x: 199,
      y: 149,
    });
    expect(clientToCell(0, 0, { left: 0, top: 0, width: 0, height: 10 }, 10, 10)).toBeNull();
  });

  it('uses each axis when the canvas CSS box is stretched', () => {
    expect(clientToCell(5.2, 7, { left: 0, top: 0, width: 200, height: 300 }, 200, 150)).toEqual({
      x: 5,
      y: 3,
    });
  });
});

describe('brush', () => {
  it('defaults to the current 3×3 stamp', () => {
    const cells = brushCells(4, 5, DEFAULT_BRUSH_RADIUS).map(({ x, y }) => `${x},${y}`);
    const expected: string[] = [];
    for (let y = 4; y <= 6; y++) {
      for (let x = 3; x <= 5; x++) expected.push(`${x},${y}`);
    }
    expect(cells.sort()).toEqual(expected.sort());
  });

  it('is round once the radius grows', () => {
    const cells = new Set(brushCells(0, 0, 4).map(({ x, y }) => `${x},${y}`));
    expect(cells.has('4,0')).toBe(true);
    expect(cells.has('0,4')).toBe(true);
    expect(cells.has('4,4')).toBe(false);
    expect(cells.has('3,2')).toBe(true);
    expect(cells.has('3,3')).toBe(false);
  });
});

describe('line stamping', () => {
  it('fills a fast horizontal swipe with no gaps', () => {
    const centers = lineCells(0, 12, 180, 12);
    expect(centers[0]).toEqual({ x: 0, y: 12 });
    expect(centers.at(-1)).toEqual({ x: 180, y: 12 });
    expect(centers).toHaveLength(181);
    assertKingConnected(centers);
  });

  it('fills a fast diagonal swipe with no gaps', () => {
    const centers = lineCells(2, 3, 70, 40);
    expect(centers[0]).toEqual({ x: 2, y: 3 });
    expect(centers.at(-1)).toEqual({ x: 70, y: 40 });
    assertKingConnected(centers);
  });

  it('keeps a single-cell brush gap-free along the segment', () => {
    const width = 30;
    const grid = new Uint8Array(width);
    stampStroke(
      0,
      0,
      width - 1,
      0,
      0,
      1,
      (x) => grid[x] ?? 0,
      (x, y, id) => {
        if (y === 0) grid[x] = id;
      },
      width,
      1,
    );
    expect([...grid].every((cell) => cell === 1)).toBe(true);
  });

  it('paints every center, skips the same material, and erases through the same path', () => {
    const width = 200;
    const height = 80;
    const grid = new Uint8Array(width * height);
    let writes = 0;
    const read = (x: number, y: number) => grid[y * width + x] ?? -1;
    const write = (x: number, y: number, materialId: number) => {
      grid[y * width + x] = materialId;
      writes += 1;
    };
    stampStroke(0, 10, 40, 10, DEFAULT_BRUSH_RADIUS, 1, read, write, width, height);
    const first = writes;
    for (const center of lineCells(0, 10, 40, 10)) {
      expect(grid[10 * width + center.x]).toBe(1);
    }
    stampStroke(0, 10, 40, 10, DEFAULT_BRUSH_RADIUS, 1, read, write, width, height);
    expect(writes).toBe(first);

    stampStroke(10, 10, 10, 10, DEFAULT_BRUSH_RADIUS, 0, read, write, width, height);
    expect(grid[10 * width + 10]).toBe(0);
    expect(grid[10 * width + 9]).toBe(0);
    expect(grid[10 * width + 12]).toBe(1);
    expect(writes).toBeGreaterThan(first);
  });

  it('joins a diagonal stroke by edges', () => {
    const width = 80;
    const height = 80;
    const grid = new Uint8Array(width * height);
    stampStroke(
      0,
      0,
      60,
      35,
      DEFAULT_BRUSH_RADIUS,
      1,
      (x, y) => grid[y * width + x] ?? 0,
      (x, y, id) => {
        grid[y * width + x] = id;
      },
      width,
      height,
    );
    const seen = new Set<string>();
    const stack: Cell[] = [{ x: 0, y: 0 }];
    while (stack.length > 0) {
      const cell = stack.pop();
      if (!cell) break;
      if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
      const key = `${cell.x},${cell.y}`;
      if (seen.has(key)) continue;
      if (grid[cell.y * width + cell.x] !== 1) continue;
      seen.add(key);
      stack.push(
        { x: cell.x + 1, y: cell.y },
        { x: cell.x - 1, y: cell.y },
        { x: cell.x, y: cell.y + 1 },
        { x: cell.x, y: cell.y - 1 },
      );
    }
    expect(seen.has('60,35')).toBe(true);
  });

  it('does not write outside the grid', () => {
    const writes: Cell[] = [];
    stampStroke(0, 0, 3, 0, 4, 1, () => 0, (x, y) => writes.push({ x, y }), 5, 5);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < 5 && cell.y < 5)).toBe(true);
  });
});

function assertKingConnected(cells: Cell[]): void {
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const next = cells[i];
    if (!prev || !next) throw new Error('missing cell');
    const dx = Math.abs(next.x - prev.x);
    const dy = Math.abs(next.y - prev.y);
    expect(dx).toBeLessThanOrEqual(1);
    expect(dy).toBeLessThanOrEqual(1);
    expect(dx + dy).toBeGreaterThan(0);
  }
}
