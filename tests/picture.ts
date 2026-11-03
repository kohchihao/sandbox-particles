import { expect } from 'vitest';
import { Simulation } from '../src/core/sim';
import { materials } from '../src/materials/registry';
import { EMPTY } from '../src/materials/sand';

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PictureOptions {
  seed?: number;
  x?: number;
  y?: number;
  /** Place the picture so its last row sits on the bottom row of the grid. */
  onFloor?: boolean;
}

const symbols = buildSymbols();

function buildSymbols(): Map<string, number> {
  const map = new Map<string, number>();
  map.set('.', EMPTY);
  for (const material of materials) {
    if (material.symbol.length !== 1) {
      throw new Error(`material ${material.name} needs a one-character picture symbol`);
    }
    if (map.has(material.symbol)) {
      throw new Error(`picture symbol "${material.symbol}" is used more than once`);
    }
    map.set(material.symbol, material.id);
  }
  return map;
}

const glyphs = new Map<number, string>();
for (const [symbol, id] of symbols) glyphs.set(id, symbol);

/** Picture rows, dedented. `.` is empty. Every other character comes from the material registry. */
export function pictureLines(source: string): string[] {
  const text = source.replace(/^\n/, '').replace(/\s+$/, '');
  const lines = text.split('\n');
  let margin = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    margin = Math.min(margin, indent);
  }
  if (!Number.isFinite(margin)) throw new Error('empty picture');
  const rows = lines.map((line) => line.slice(margin).trimEnd());
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new Error('empty picture');
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.length !== width) {
      throw new Error(`picture row ${i + 1} is ${rows[i]!.length} chars, expected ${width}`);
    }
  }
  return rows;
}

function idsFromLines(rows: string[]): Uint8Array {
  const width = rows[0]!.length;
  const ids = new Uint8Array(width * rows.length);
  const known = [...symbols.keys()].join(' ');
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]!;
    for (let x = 0; x < width; x++) {
      const symbol = row[x]!;
      const id = symbols.get(symbol);
      if (id === undefined) {
        throw new Error(`unknown picture symbol "${symbol}". Known symbols: ${known}`);
      }
      ids[y * width + x] = id;
    }
  }
  return ids;
}

/** Paint a picture onto a fresh simulation. Symbols come from the material registry. */
export function loadPicture(source: string, options: PictureOptions = {}): { sim: Simulation; region: Region } {
  const rows = pictureLines(source);
  const width = rows[0]!.length;
  const height = rows.length;
  const ids = idsFromLines(rows);
  const sim = new Simulation(options.seed ?? 1);
  const x = options.x ?? 0;
  const y = options.onFloor ? sim.world.height - height : (options.y ?? 0);
  if (x < 0 || y < 0 || x + width > sim.world.width || y + height > sim.world.height) {
    throw new Error(`picture ${width}x${height} does not fit at (${x}, ${y})`);
  }
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      sim.setCell(x + col, y + row, ids[row * width + col]!);
    }
  }
  return { sim, region: { x, y, width, height } };
}

export function renderPicture(sim: Simulation, region: Region): string {
  const rows: string[] = [];
  for (let y = 0; y < region.height; y++) {
    let row = '';
    for (let x = 0; x < region.width; x++) {
      const id = sim.world.type[sim.world.index(region.x + x, region.y + y)]!;
      row += glyphs.get(id) ?? '?';
    }
    rows.push(row);
  }
  return rows.join('\n');
}

export function expectPicture(sim: Simulation, source: string, region: Region): void {
  const expected = pictureLines(source).join('\n');
  const actual = renderPicture(sim, region);
  expect(actual).toBe(expected);
}

/** Run `predicate` for every cell. A false result names the cell and its symbol. */
export function expectWhere(
  sim: Simulation,
  predicate: (id: number, x: number, y: number) => boolean,
  message = 'cell failed the grid condition',
): void {
  const { world } = sim;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const id = world.type[world.index(x, y)]!;
      if (predicate(id, x, y)) continue;
      const symbol = glyphs.get(id) ?? '?';
      throw new Error(`${message} at (${x}, ${y}) symbol ${symbol}`);
    }
  }
}
