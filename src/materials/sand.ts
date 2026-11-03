import { cellIndex, isInBounds } from '../core/neighbours';
import type { Rng } from '../core/rng';
import type { World } from '../core/world';

export const EMPTY = 0;
export const SAND = 1;

export const SAND_COLOR = [212, 176, 72] as const;

export function updateSand(world: World, x: number, y: number, rng: Rng, frame: number): void {
  const width = world.width;
  const i = cellIndex(x, y, width);
  const belowY = y + 1;

  if (belowY < world.height) {
    const below = i + width;
    if (world.type[below] === EMPTY) {
      world.swap(i, below);
      world.clock[below] = frame;
      return;
    }

    const first = (rng.nextU32() & 1) === 0 ? -1 : 1;
    if (slide(world, x, belowY, i, first, frame)) return;
    if (slide(world, x, belowY, i, -first, frame)) return;
  }

  world.clock[i] = frame;
}

function slide(world: World, x: number, y: number, from: number, dx: number, frame: number): boolean {
  const nx = x + dx;
  if (!isInBounds(nx, y, world.width, world.height)) return false;
  const ni = cellIndex(nx, y, world.width);
  if (world.type[ni] !== EMPTY) return false;
  world.swap(from, ni);
  world.clock[ni] = frame;
  return true;
}
