import type { World } from '../core/world';
import { LAVA } from './lava';
import { writeMaterial } from './reactions';
import { STEAM } from './steam';
import { STONE } from './stone';
import { WATER } from './water';

/**
 * Per-material heat, indexed by id the same way `densityById` is.
 * A missing threshold stays at the Int16 edge, so a comparison never fires.
 * Conductivity 0 does not exchange heat. `warms` is added to a melting
 * neighbour and is not a substitute for that neighbour's own temperature.
 */
const NO_HOT = 32767;
const NO_COLD = -32768;
/** Shared-edge divisor. Higher moves less heat per step. */
const SHARE = 16;

const startTemp = new Int16Array(256);
const conductivity = new Uint8Array(256);
const meltsAt = new Int16Array(256);
const meltsTo = new Uint8Array(256);
const boilsAt = new Int16Array(256);
const boilsTo = new Uint8Array(256);
const freezesAt = new Int16Array(256);
const freezesTo = new Uint8Array(256);
const warmsById = new Uint8Array(256);
const coolsById = new Uint8Array(256);
/** 1 when the cell runs the heat step. Powders with this set are not inlined. */
export const thermalById = new Uint8Array(256);

export interface ThermalMaterial {
  id: number;
  name: string;
  /** Cell temperature written by paint and by a phase change into this id. */
  temp?: number;
  /** Heat moved toward a conductive neighbour each step, before `SHARE`. */
  conductivity?: number;
  /** Become `meltsTo` at or above this temperature. */
  meltsAt?: number;
  meltsTo?: number;
  /** Become `boilsTo` at or above this temperature. */
  boilsAt?: number;
  boilsTo?: number;
  /** Become `freezesTo` at or below this temperature. */
  freezesAt?: number;
  freezesTo?: number;
  /**
   * Degrees added to a melting neighbour each step.
   * Fire uses this and keeps its own cell at 0: hearth and stove hash `temp`,
   * and those scenes are full of fire. Water does not melt, so it stays cold.
   */
  warms?: number;
  /** Degrees lost each step while still above `freezesAt`. */
  cools?: number;
}

export function installHeat(materials: readonly ThermalMaterial[]): void {
  startTemp.fill(0);
  conductivity.fill(0);
  meltsAt.fill(NO_HOT);
  meltsTo.fill(0);
  boilsAt.fill(NO_HOT);
  boilsTo.fill(0);
  freezesAt.fill(NO_COLD);
  freezesTo.fill(0);
  warmsById.fill(0);
  coolsById.fill(0);
  thermalById.fill(0);
  for (const material of materials) {
    const id = material.id;
    if (material.temp) startTemp[id] = material.temp;
    if (material.conductivity) conductivity[id] = material.conductivity;
    if (material.meltsAt !== undefined) {
      if (material.meltsTo === undefined) throw new Error(`${material.name} meltsAt requires meltsTo`);
      meltsAt[id] = material.meltsAt;
      meltsTo[id] = material.meltsTo;
    }
    if (material.boilsAt !== undefined) {
      if (material.boilsTo === undefined) throw new Error(`${material.name} boilsAt requires boilsTo`);
      boilsAt[id] = material.boilsAt;
      boilsTo[id] = material.boilsTo;
    }
    if (material.freezesAt !== undefined) {
      if (material.freezesTo === undefined) throw new Error(`${material.name} freezesAt requires freezesTo`);
      freezesAt[id] = material.freezesAt;
      freezesTo[id] = material.freezesTo;
    }
    if (material.warms) warmsById[id] = material.warms;
    if (material.cools) coolsById[id] = material.cools;
    if (
      conductivity[id] !== 0 ||
      meltsAt[id] !== NO_HOT ||
      boilsAt[id] !== NO_HOT ||
      freezesAt[id] !== NO_COLD ||
      coolsById[id] !== 0
    ) {
      thermalById[id] = 1;
    }
  }
}

export function startingTemp(id: number): number {
  return startTemp[id] ?? 0;
}

/**
 * Ids whose counts a phase change can move, including the product.
 * Quench is lava plus water becoming stone plus steam.
 */
export function thermalProducts(): number[] {
  const ids: number[] = [];
  for (let id = 1; id < 256; id++) {
    if (meltsAt[id] !== NO_HOT) ids.push(id, meltsTo[id]!);
    if (boilsAt[id] !== NO_HOT) ids.push(id, boilsTo[id]!);
    if (freezesAt[id] !== NO_COLD) ids.push(id, freezesTo[id]!);
  }
  return ids;
}

/** Orthogonal neighbours. Conduction does not use diagonals. */
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/**
 * True when `applyHeat` would change this cell. A temperature gap counts only
 * when both cells conduct and the shared edge actually moves heat. A melting
 * cell also stays awake beside a neighbour that warms it. A non-conductor at a
 * different temperature, such as ice on a wall, does not.
 */
export function heatBlocksRest(world: World, x: number, y: number, id: number): boolean {
  if (wouldQuench(world, x, y, id)) return true;
  if (thermalById[id] === 0) return false;
  const index = y * world.width + x;
  const t = world.temp[index]!;
  const next = nextTemp(world, index, id, t);
  if (pendingPhase(id, next)) return true;
  return next !== t;
}

function pendingPhase(id: number, t: number): boolean {
  const melt = meltsAt[id]!;
  if (melt !== NO_HOT && t >= melt) return true;
  const boil = boilsAt[id]!;
  if (boil !== NO_HOT && t >= boil) return true;
  const freeze = freezesAt[id]!;
  return freeze !== NO_COLD && t <= freeze;
}

/**
 * Conduction, cool-down, warmth from a fire, then one phase change.
 * Lava touching water becomes stone and that water becomes steam before either
 * cell can boil or sink past the contact. A melt, freeze, or boil keeps `next`
 * so the change does not invent heat or cold. No random draws.
 */
export function applyHeat(world: World, index: number, frame: number): void {
  if (quench(world, index, frame)) return;
  const id = world.type[index]!;
  if (thermalById[id] === 0) return;
  const t = world.temp[index]!;
  const next = nextTemp(world, index, id, t);
  const boil = boilsAt[id]!;
  if (boil !== NO_HOT && next >= boil) {
    writeMaterial(world, index, boilsTo[id]!, frame, next);
    return;
  }
  const melt = meltsAt[id]!;
  if (melt !== NO_HOT && next >= melt) {
    writeMaterial(world, index, meltsTo[id]!, frame, next);
    return;
  }
  const freeze = freezesAt[id]!;
  if (freeze !== NO_COLD && next <= freeze) {
    writeMaterial(world, index, freezesTo[id]!, frame, next);
    return;
  }
  if (next !== t) storeTemp(world, index, next);
}

/** Temperature after one heat step, before a phase change. */
function nextTemp(world: World, index: number, id: number, t: number): number {
  const width = world.width;
  const x = index % width;
  const y = (index / width) | 0;
  const k = conductivity[id]!;
  let next = t - coolsById[id]!;
  const melts = meltsAt[id] !== NO_HOT;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= world.height) continue;
    const ni = ny * width + nx;
    const nid = world.type[ni]!;
    const nk = conductivity[nid]!;
    if (k !== 0 && nk !== 0) {
      const pair = k < nk ? k : nk;
      next += ((world.temp[ni]! - t) * pair) / SHARE | 0;
    }
    if (melts) next += warmsById[nid]!;
  }
  if (next > 32767) return 32767;
  if (next < -32768) return -32768;
  return next;
}

function wouldQuench(world: World, x: number, y: number, id: number): boolean {
  if (id !== LAVA && id !== WATER) return false;
  const want = id === LAVA ? WATER : LAVA;
  const width = world.width;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= world.height) continue;
    if (world.type[ny * width + nx] === want) return true;
  }
  return false;
}

/**
 * One touching pair. Fixed neighbour order, so the contact does not draw.
 * Whoever is scanned first converts both cells; the other is stamped and skipped.
 */
function quench(world: World, index: number, frame: number): boolean {
  const id = world.type[index]!;
  if (id !== LAVA && id !== WATER) return false;
  const width = world.width;
  const x = index % width;
  const y = (index / width) | 0;
  const want = id === LAVA ? WATER : LAVA;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= world.height) continue;
    const ni = ny * width + nx;
    if (world.type[ni] !== want) continue;
    const lava = id === LAVA ? index : ni;
    const water = id === LAVA ? ni : index;
    writeMaterial(world, lava, STONE, frame);
    writeMaterial(world, water, STEAM, frame);
    return true;
  }
  return false;
}

/** A temperature write wakes the same neighbourhood a material write does. */
function storeTemp(world: World, index: number, value: number): void {
  world.temp[index] = value;
  world.noteChange(index);
}
