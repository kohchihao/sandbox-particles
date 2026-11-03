import type { Rng } from '../core/rng';
import type { World } from '../core/world';
import { EMPTY } from './sand';

export type Archetype = 'static' | 'powder' | 'liquid' | 'gas';

/**
 * Destination density. Empty stays 0, so any material denser than air can move into it.
 * A cell may enter a neighbour only when that neighbour is strictly lighter.
 */
const densityById = new Uint16Array(256);

export function installDensities(materials: readonly { id: number; density: number }[]): void {
  densityById.fill(0);
  for (const material of materials) densityById[material.id] = material.density;
}

export function stepArchetype(
  archetype: Archetype,
  world: World,
  x: number,
  y: number,
  from: number,
  density: number,
  flow: number,
  rng: Rng,
  frame: number,
): void {
  switch (archetype) {
    case 'powder':
      movePowder(world, x, y, from, density, rng, frame);
      return;
    case 'liquid':
      moveLiquid(world, x, y, from, density, flow, rng, frame);
      return;
    case 'gas':
      moveGas(world, x, y, from, density, rng, frame);
      return;
    case 'static':
      world.clock[from] = frame;
      return;
  }
}

function tryMove(world: World, x: number, y: number, from: number, density: number, frame: number): boolean {
  if (!world.inBounds(x, y)) return false;
  const to = world.index(x, y);
  if (densityById[world.type[to]!]! >= density) return false;
  world.swap(from, to);
  world.clock[to] = frame;
  return true;
}

/**
 * Down, then a random diagonal. Straight down does not draw a random number, matching
 * the old sand update so seeded sand-only replays stay on the same stream.
 */
function movePowder(world: World, x: number, y: number, from: number, density: number, rng: Rng, frame: number): void {
  const belowY = y + 1;
  if (belowY < world.height) {
    if (tryMove(world, x, belowY, from, density, frame)) return;
    const dir = (rng.nextU32() & 1) === 0 ? -1 : 1;
    if (tryMove(world, x + dir, belowY, from, density, frame)) return;
    if (tryMove(world, x - dir, belowY, from, density, frame)) return;
  }
  world.clock[from] = frame;
}

/** Down, diagonal down, then sideways by up to `flow` cells. */
function moveLiquid(
  world: World,
  x: number,
  y: number,
  from: number,
  density: number,
  flow: number,
  rng: Rng,
  frame: number,
): void {
  const belowY = y + 1;
  if (belowY < world.height && tryMove(world, x, belowY, from, density, frame)) return;

  const dir = (rng.nextU32() & 1) === 0 ? -1 : 1;
  if (belowY < world.height) {
    if (tryMove(world, x + dir, belowY, from, density, frame)) return;
    if (tryMove(world, x - dir, belowY, from, density, frame)) return;
  }
  if (flowSideways(world, x, y, from, dir, density, flow, frame)) return;
  if (flowSideways(world, x, y, from, -dir, density, flow, frame)) return;
  world.clock[from] = frame;
}

/**
 * Walk up to `flow` cells. Stop at the first cell that is not strictly lighter.
 * An empty cell with room below ends the walk early so the liquid falls into the hole.
 * Otherwise the liquid advances the full open distance.
 */
function flowSideways(
  world: World,
  x: number,
  y: number,
  from: number,
  dir: number,
  density: number,
  flow: number,
  frame: number,
): boolean {
  let landing = -1;
  const belowY = y + 1;
  for (let step = 1; step <= flow; step++) {
    const nx = x + dir * step;
    if (!world.inBounds(nx, y)) break;
    const to = world.index(nx, y);
    const id = world.type[to]!;
    if (densityById[id]! >= density) break;
    if (id !== EMPTY) {
      world.swap(from, to);
      world.clock[to] = frame;
      return true;
    }
    landing = to;
    if (belowY < world.height && densityById[world.type[world.index(nx, belowY)]!]! < density) {
      world.swap(from, to);
      world.clock[to] = frame;
      return true;
    }
  }
  if (landing < 0) return false;
  world.swap(from, landing);
  world.clock[landing] = frame;
  return true;
}

/**
 * Up, diagonal up, then sideways. One step in four tries a sideways drift first
 * so a rising column does not stay perfectly straight.
 */
function moveGas(world: World, x: number, y: number, from: number, density: number, rng: Rng, frame: number): void {
  const dir = (rng.nextU32() & 1) === 0 ? -1 : 1;
  const drift = (rng.nextU32() & 3) === 0;
  if (drift && tryMove(world, x + dir, y, from, density, frame)) return;
  if (tryMove(world, x, y - 1, from, density, frame)) return;
  if (tryMove(world, x + dir, y - 1, from, density, frame)) return;
  if (tryMove(world, x - dir, y - 1, from, density, frame)) return;
  if (tryMove(world, x + dir, y, from, density, frame)) return;
  if (tryMove(world, x - dir, y, from, density, frame)) return;
  world.clock[from] = frame;
}
