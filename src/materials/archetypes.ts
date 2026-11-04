import type { Rng } from '../core/rng';
import {
  CHUNK_SHIFT,
  CHUNK_SIZE,
  setHorizontalInfluence,
  SLEEP_EMPTY,
  SLEEP_INERT,
  type World,
} from '../core/world';
import { applyHeat, heatBlocksRest, thermalById } from './heat';
import { afterMove, cellAftermath, hasLifetime, restingReactionCost } from './reactions';
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

const ARCH_POWDER = 1;
const ARCH_LIQUID = 2;
const ARCH_GAS = 3;
const ARCH_STATIC = 4;

const archById = new Uint8Array(256);
const flowById = new Uint8Array(256);
/** Powder with no reaction and no lifetime. The step loop inlines these. */
const simplePowder = new Uint8Array(256);

export function bindDispatch(
  materials: readonly { id: number; archetype: Archetype; flow?: number }[],
  aftermath: Uint8Array,
): void {
  archById.fill(0);
  flowById.fill(0);
  simplePowder.fill(0);
  let reach = 1;
  for (const material of materials) {
    const arch =
      material.archetype === 'liquid'
        ? ARCH_LIQUID
        : material.archetype === 'gas'
          ? ARCH_GAS
          : material.archetype === 'static'
            ? ARCH_STATIC
            : ARCH_POWDER;
    archById[material.id] = arch;
    if (material.archetype === 'liquid') {
      const flow = material.flow ?? 0;
      flowById[material.id] = flow;
      if (flow > reach) reach = flow;
    }
    if (arch === ARCH_POWDER && aftermath[material.id] === 0 && thermalById[material.id] === 0) {
      simplePowder[material.id] = 1;
    }
  }
  setHorizontalInfluence(reach);
}

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

/**
 * Where the cell updated by the latest `stepArchetype` call ended up.
 * Every path writes this. A powder or liquid with a reaction or a lifetime
 * would otherwise read whatever static or gas cell settled last.
 */
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
  settledAt = from;
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
  settledAt = to;
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
      settledAt = to;
      return true;
    }
    landing = to;
    if (belowY < world.height && densityById[world.type[world.index(nx, belowY)]!]! < density) {
      world.swap(from, to);
      world.clock[to] = frame;
      settledAt = to;
      return true;
    }
  }
  if (landing < 0) return false;
  world.swap(from, landing);
  world.clock[landing] = frame;
  settledAt = landing;
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

/**
 * One step over the grid. Awake chunks run in scan order. Asleep empty chunks are
 * skipped. Asleep inert chunks only stamp clocks and draw the RNG values the real
 * update would have drawn, so later cells stay on the same stream.
 * Powders without a reaction or a lifetime are inlined: under vite-node those calls
 * do not inline across modules, and a resting grain was most of the busy-scene cost.
 */
export function stepGrid(world: World, rng: Rng, frame: number): void {
  const width = world.width;
  const height = world.height;
  const awake = world.awake;
  const sleep = world.sleep;
  const cols = world.chunkCols;
  const leftToRight = (frame & 1) === 0;

  for (let y = height - 1; y >= 0; y--) {
    const row = (y >>> CHUNK_SHIFT) * cols;
    if (leftToRight) {
      let cx = 0;
      while (cx < cols) {
        const chunk = row + cx;
        if (awake[chunk] === 0) {
          if (sleep[chunk] === SLEEP_INERT) {
            const x0 = cx << CHUNK_SHIFT;
            restRange(world, rng, frame, y, x0, Math.min(width, x0 + CHUNK_SIZE), 1);
          }
          cx += 1;
          continue;
        }
        let end = cx + 1;
        while (end < cols && awake[row + end] !== 0) end += 1;
        const x0 = cx << CHUNK_SHIFT;
        scanRange(world, rng, frame, y, x0, Math.min(width, end << CHUNK_SHIFT), 1);
        cx = end;
      }
    } else {
      let cx = cols - 1;
      while (cx >= 0) {
        const chunk = row + cx;
        if (awake[chunk] === 0) {
          if (sleep[chunk] === SLEEP_INERT) {
            const x0 = cx << CHUNK_SHIFT;
            const xRight = Math.min(width, x0 + CHUNK_SIZE) - 1;
            restRange(world, rng, frame, y, xRight, x0 - 1, -1);
          }
          cx -= 1;
          continue;
        }
        let end = cx - 1;
        while (end >= 0 && awake[row + end] !== 0) end -= 1;
        const xLeft = (end + 1) << CHUNK_SHIFT;
        const xRight = Math.min(width, (cx + 1) << CHUNK_SHIFT) - 1;
        scanRange(world, rng, frame, y, xRight, xLeft - 1, -1);
        cx = end;
      }
    }
  }
  settleChunks(world);
}

function scanRange(
  world: World,
  rng: Rng,
  frame: number,
  y: number,
  x: number,
  limit: number,
  step: number,
): void {
  const width = world.width;
  const height = world.height;
  const type = world.type;
  const clock = world.clock;
  for (; x !== limit; x += step) {
    const i = y * width + x;
    const id = type[i]!;
    if (id === 0 || clock[i] === frame) continue;
    if (simplePowder[id] === 1) {
      const density = densityById[id]!;
      const belowY = y + 1;
      if (belowY < height) {
        const below = i + width;
        if (densityById[type[below]!]! < density) {
          world.swap(i, below);
          clock[below] = frame;
          continue;
        }
        const dir = (rng.nextU32() & 1) === 0 ? -1 : 1;
        const x1 = x + dir;
        if ((x1 >>> 0) < width) {
          const d1 = below + dir;
          if (densityById[type[d1]!]! < density) {
            world.swap(i, d1);
            clock[d1] = frame;
            continue;
          }
        }
        const x2 = x - dir;
        if ((x2 >>> 0) < width) {
          const d2 = below - dir;
          if (densityById[type[d2]!]! < density) {
            world.swap(i, d2);
            clock[d2] = frame;
            continue;
          }
        }
      }
      clock[i] = frame;
      continue;
    }
    const arch = archById[id]!;
    if (arch === 0) continue;
    stepArchetype(
      arch === ARCH_LIQUID ? 'liquid' : arch === ARCH_GAS ? 'gas' : arch === ARCH_STATIC ? 'static' : 'powder',
      world,
      x,
      y,
      i,
      densityById[id]!,
      flowById[id]!,
      rng,
      frame,
    );
    if (cellAftermath[id] !== 0) afterMove(world, cellSettledAt(), rng, frame);
    const settled = cellSettledAt();
    if (thermalById[type[settled]!] !== 0) applyHeat(world, settled, frame);
  }
}

function restRange(
  world: World,
  rng: Rng,
  frame: number,
  y: number,
  x: number,
  limit: number,
  step: number,
): void {
  const width = world.width;
  const type = world.type;
  const clock = world.clock;
  const restCost = world.restCost;
  let calls = 0;
  for (; x !== limit; x += step) {
    const i = y * width + x;
    if (type[i] === 0 || clock[i] === frame) continue;
    calls += restCost[i]!;
    clock[i] = frame;
  }
  for (let n = 0; n < calls; n++) rng.nextU32();
}

function settleChunks(world: World): void {
  const awake = world.awake;
  const touched = world.touched;
  const keepAwake = world.keepAwake;
  for (let chunk = 0; chunk < awake.length; chunk++) {
    if (awake[chunk] === 0) continue;
    if (touched[chunk] !== 0) {
      touched[chunk] = 0;
      continue;
    }
    if (keepAwake[chunk] !== 0) continue;
    if (trySleep(world, chunk)) awake[chunk] = 0;
    else keepAwake[chunk] = 1;
  }
}

function trySleep(world: World, chunk: number): boolean {
  const cols = world.chunkCols;
  const cx = chunk % cols;
  const cy = (chunk / cols) | 0;
  const x0 = cx << CHUNK_SHIFT;
  const y0 = cy << CHUNK_SHIFT;
  const x1 = Math.min(world.width, x0 + CHUNK_SIZE);
  const y1 = Math.min(world.height, y0 + CHUNK_SIZE);
  const width = world.width;
  const type = world.type;
  const restCost = world.restCost;
  let any = false;
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    for (let x = x0; x < x1; x++) {
      const cost = cellRestCost(world, x, y);
      if (cost === null) return false;
      const i = row + x;
      restCost[i] = cost;
      if (type[i] !== 0) any = true;
    }
  }
  world.sleep[chunk] = any ? SLEEP_INERT : SLEEP_EMPTY;
  return true;
}

/** `null` when the cell might move or change. Otherwise the RNG draws its update consumes. */
function cellRestCost(world: World, x: number, y: number): number | null {
  const id = world.type[y * world.width + x]!;
  if (id === 0) return 0;
  if (hasLifetime(id)) return null;
  // A temperature that can still change has to run the real update. The rest
  // path only replays RNG draws, so it cannot conduct or cross a threshold.
  if (heatBlocksRest(world, x, y, id)) return null;
  const reaction = restingReactionCost(world, x, y, id);
  if (reaction === null) return null;
  const move = restingMoveCost(world, x, y, id);
  if (move === null) return null;
  return move + reaction;
}

function restingMoveCost(world: World, x: number, y: number, id: number): number | null {
  const arch = archById[id]!;
  const density = densityById[id]!;
  if (arch === ARCH_STATIC) return 0;
  if (arch === ARCH_POWDER) {
    if (powderCouldMove(world, x, y, density)) return null;
    return y + 1 < world.height ? 1 : 0;
  }
  if (arch === ARCH_LIQUID) {
    if (liquidCouldMove(world, x, y, density, flowById[id]!)) return null;
    return 1;
  }
  if (arch === ARCH_GAS) {
    if (gasCouldMove(world, x, y, density)) return null;
    return 2;
  }
  return null;
}

function powderCouldMove(world: World, x: number, y: number, density: number): boolean {
  const belowY = y + 1;
  if (belowY >= world.height) return false;
  const below = belowY * world.width + x;
  const type = world.type;
  if (densityById[type[below]!]! < density) return true;
  if (x > 0 && densityById[type[below - 1]!]! < density) return true;
  if (x + 1 < world.width && densityById[type[below + 1]!]! < density) return true;
  return false;
}

function liquidCouldMove(world: World, x: number, y: number, density: number, flow: number): boolean {
  const belowY = y + 1;
  if (belowY < world.height) {
    const below = belowY * world.width + x;
    const type = world.type;
    if (densityById[type[below]!]! < density) return true;
    if (x > 0 && densityById[type[below - 1]!]! < density) return true;
    if (x + 1 < world.width && densityById[type[below + 1]!]! < density) return true;
  }
  if (wouldFlow(world, x, y, 1, density, flow)) return true;
  if (wouldFlow(world, x, y, -1, density, flow)) return true;
  return false;
}

/** Same decisions as `flowSideways`, without swapping. */
function wouldFlow(world: World, x: number, y: number, dir: number, density: number, flow: number): boolean {
  let landing = false;
  const belowY = y + 1;
  const type = world.type;
  for (let step = 1; step <= flow; step++) {
    const nx = x + dir * step;
    if (!world.inBounds(nx, y)) break;
    const id = type[world.index(nx, y)]!;
    if (densityById[id]! >= density) break;
    if (id !== EMPTY) return true;
    landing = true;
    if (belowY < world.height && densityById[type[world.index(nx, belowY)]!]! < density) return true;
  }
  return landing;
}

function gasCouldMove(world: World, x: number, y: number, density: number): boolean {
  if (canDrift(world, x + 1, y, density) || canDrift(world, x - 1, y, density)) return true;
  if (canRise(world, x, y - 1, density)) return true;
  if (canDrift(world, x + 1, y - 1, density) || canDrift(world, x - 1, y - 1, density)) return true;
  return false;
}

function canDrift(world: World, x: number, y: number, density: number): boolean {
  if (!world.inBounds(x, y)) return false;
  return densityById[world.type[world.index(x, y)]!]! < density;
}

function canRise(world: World, x: number, y: number, density: number): boolean {
  if (canDrift(world, x, y, density)) return true;
  if (!world.inBounds(x, y)) return false;
  const dest = world.type[world.index(x, y)]!;
  return densityById[dest]! > density && fluidById[dest] === 1;
}
