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

/** Where the cell updated by the latest `stepArchetype` call ended up. */
let settledAt = 0;

export function cellSettledAt(): number {
  return settledAt;
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
      settledAt = from;
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

/** Same swap as `tryMove`, and records where the gas landed for a following reaction. */
function tryDrift(world: World, x: number, y: number, from: number, density: number, frame: number): boolean {
  if (!world.inBounds(x, y)) return false;
  const to = world.index(x, y);
  if (densityById[world.type[to]!]! >= density) return false;
  world.swap(from, to);
  world.clock[to] = frame;
  settledAt = to;
  return true;
}

/**
 * Straight up. Same as `tryDrift` into a lighter cell, and also a swap into a heavier
 * liquid or gas so smoke can rise through water. Powders and static cells still block.
 */
function tryRise(world: World, x: number, y: number, from: number, density: number, frame: number): boolean {
  if (tryDrift(world, x, y, from, density, frame)) return true;
  if (!world.inBounds(x, y)) return false;
  const to = world.index(x, y);
  const dest = world.type[to]!;
  if (densityById[dest]! > density && fluidById[dest] === 1) {
    world.swap(from, to);
    world.clock[to] = frame;
    settledAt = to;
    return true;
  }
  return false;
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
 * so a rising column does not stay perfectly straight. Only the straight-up step
 * may pass through a heavier fluid.
 */
function moveGas(world: World, x: number, y: number, from: number, density: number, rng: Rng, frame: number): void {
  const dir = (rng.nextU32() & 1) === 0 ? -1 : 1;
  const drift = (rng.nextU32() & 3) === 0;
  if (drift && tryDrift(world, x + dir, y, from, density, frame)) return;
  if (tryRise(world, x, y - 1, from, density, frame)) return;
  if (tryDrift(world, x + dir, y - 1, from, density, frame)) return;
  if (tryDrift(world, x - dir, y - 1, from, density, frame)) return;
  if (tryDrift(world, x + dir, y, from, density, frame)) return;
  if (tryDrift(world, x - dir, y, from, density, frame)) return;
  world.clock[from] = frame;
  settledAt = from;
}
