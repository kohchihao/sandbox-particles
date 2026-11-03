import type { Rng } from '../core/rng';
import type { World } from '../core/world';

export const EMPTY = 0;
export const SAND = 1;

export const SAND_COLOR = [212, 176, 72] as const;

export function updateSand(world: World, x: number, y: number, rng: Rng, frame: number): void {
  const i = world.index(x, y, 'read');
  const belowY = y + 1;

  if (belowY < world.height) {
    const below = world.index(x, belowY, 'read');
    if (world.type[below] === EMPTY) {
      world.swap(i, below);
      world.clock[world.index(x, belowY, 'write')] = frame;
      return;
    }

    const first = (rng.nextU32() & 1) === 0 ? -1 : 1;
    if (slide(world, x, belowY, i, first, frame)) return;
    if (slide(world, x, belowY, i, -first, frame)) return;
  }

  world.clock[world.index(x, y, 'write')] = frame;
}

function slide(world: World, x: number, y: number, from: number, dx: number, frame: number): boolean {
  const nx = x + dx;
  if (!world.inBounds(nx, y)) return false;
  const ni = world.index(nx, y, 'read');
  if (world.type[ni] !== EMPTY) return false;
  world.swap(from, ni);
  world.clock[world.index(nx, y, 'write')] = frame;
  return true;
}
