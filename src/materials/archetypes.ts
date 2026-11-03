import type { Rng } from '../core/rng';
import type { World } from '../core/world';
import { EMPTY } from './sand';

export type Archetype = 'static' | 'powder' | 'liquid' | 'gas';

/**
 * Destination density. Empty stays 0, so any material denser than air can move into it.
 * Powders and liquids enter a neighbour only when it is strictly lighter.
 * A gas may also swap straight up through a heavier liquid or gas.
 */
const densityById = new Uint16Array(256);
/** 1 when a rising gas may displace this id upward. Powders and static cells stay 0. */
const fluidById = new Uint8Array(256);

export function installDensities(
  materials: readonly { id: number; density: number; archetype: Archetype }[],
): void {
  densityById.fill(0);
  fluidById.fill(0);
  for (const material of materials) {
    densityById[material.id] = material.density;
    if (material.archetype === 'liquid' || material.archetype === 'gas') fluidById[material.id] = 1;
  }
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
): number {
  switch (archetype) {
    case 'powder':
      return movePowder(world, x, y, from, density, rng, frame);
    case 'liquid':
      return moveLiquid(world, x, y, from, density, flow, rng, frame);
    case 'gas':
      return moveGas(world, x, y, from, density, rng, frame);
    case 'static':
      world.clock[from] = frame;
      return from;
  }
}

/** Index the cell moved to, or -1 when it stayed put. Index 0 is a real cell, so callers must not test truthiness. */
function tryMove(world: World, x: number, y: number, from: number, density: number, frame: number): number {
  if (!world.inBounds(x, y)) return -1;
  const to = world.index(x, y);
  if (densityById[world.type[to]!]! >= density) return -1;
  world.swap(from, to);
  world.clock[to] = frame;
  return to;
}

/**
 * Straight up. Same as `tryMove` into a lighter cell, and also a swap into a heavier
 * liquid or gas so smoke can rise through water. Powders and static cells still block.
 */
function tryRise(world: World, x: number, y: number, from: number, density: number, frame: number): number {
  const landed = tryMove(world, x, y, from, density, frame);
  if (landed >= 0) return landed;
  if (!world.inBounds(x, y)) return -1;
  const to = world.index(x, y);
  const dest = world.type[to]!;
  if (densityById[dest]! > density && fluidById[dest] === 1) {
    world.swap(from, to);
    world.clock[to] = frame;
    return to;
  }
  return -1;
}

/**
 * Down, then a random diagonal. Straight down does not draw a random number, matching
 * the old sand update so seeded sand-only replays stay on the same stream.
 */
function movePowder(world: World, x: number, y: number, from: number, density: number, rng: Rng, frame: number): number {
  const belowY = y + 1;
  if (belowY < world.height) {
    const down = tryMove(world, x, belowY, from, density, frame);
    if (down >= 0) return down;
    const dir = (rng.nextU32() & 1) === 0 ? -1 : 1;
    const first = tryMove(world, x + dir, belowY, from, density, frame);
    if (first >= 0) return first;
    const second = tryMove(world, x - dir, belowY, from, density, frame);
    if (second >= 0) return second;
  }
  world.clock[from] = frame;
  return from;
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
): number {
  const belowY = y + 1;
  if (belowY < world.height) {
    const down = tryMove(world, x, belowY, from, density, frame);
    if (down >= 0) return down;
  }

  const dir = (rng.nextU32() & 1) === 0 ? -1 : 1;
  if (belowY < world.height) {
    const first = tryMove(world, x + dir, belowY, from, density, frame);
    if (first >= 0) return first;
    const second = tryMove(world, x - dir, belowY, from, density, frame);
    if (second >= 0) return second;
  }
  const side = flowSideways(world, x, y, from, dir, density, flow, frame);
  if (side >= 0) return side;
  const other = flowSideways(world, x, y, from, -dir, density, flow, frame);
  if (other >= 0) return other;
  world.clock[from] = frame;
  return from;
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
): number {
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
      return to;
    }
    landing = to;
    if (belowY < world.height && densityById[world.type[world.index(nx, belowY)]!]! < density) {
      world.swap(from, to);
      world.clock[to] = frame;
      return to;
    }
  }
  if (landing < 0) return -1;
  world.swap(from, landing);
  world.clock[landing] = frame;
  return landing;
}

/**
 * Up, diagonal up, then sideways. One step in four tries a sideways drift first
 * so a rising column does not stay perfectly straight. Only the straight-up step
 * may pass through a heavier fluid.
 */
function moveGas(world: World, x: number, y: number, from: number, density: number, rng: Rng, frame: number): number {
  const dir = (rng.nextU32() & 1) === 0 ? -1 : 1;
  const drift = (rng.nextU32() & 3) === 0;
  if (drift) {
    const drifted = tryMove(world, x + dir, y, from, density, frame);
    if (drifted >= 0) return drifted;
  }
  const up = tryRise(world, x, y - 1, from, density, frame);
  if (up >= 0) return up;
  const upFirst = tryMove(world, x + dir, y - 1, from, density, frame);
  if (upFirst >= 0) return upFirst;
  const upSecond = tryMove(world, x - dir, y - 1, from, density, frame);
  if (upSecond >= 0) return upSecond;
  const side = tryMove(world, x + dir, y, from, density, frame);
  if (side >= 0) return side;
  const other = tryMove(world, x - dir, y, from, density, frame);
  if (other >= 0) return other;
  world.clock[from] = frame;
  return from;
}
