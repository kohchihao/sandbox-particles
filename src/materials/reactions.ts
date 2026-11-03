import type { Rng } from '../core/rng';
import { shadeFor, type World } from '../core/world';
import { FIRE } from './fire';
import { PLANT } from './plant';
import { EMPTY } from './sand';
import { WATER } from './water';

/**
 * A touching B: A becomes `aBecomes`, B becomes `bBecomes`, with probability `p`.
 * A cell checks one random orthogonal neighbour after it moves. Rules are indexed
 * by A's id, then by B's id, so a step does not walk this list.
 */
export interface Reaction {
  a: number;
  b: number;
  aBecomes: number;
  bBecomes: number;
  /** In (0, 1]. `1` always happens and does not draw a random number. */
  p: number;
}

export const reactions: readonly Reaction[] = [
  // Plant grows into adjacent water about 2% of the time that water is the neighbour checked.
  { a: PLANT, b: WATER, aBecomes: PLANT, bBecomes: PLANT, p: 0.02 },
  // Fire spreads into plant. The plant cell becomes fire.
  { a: FIRE, b: PLANT, aBecomes: FIRE, bBecomes: FIRE, p: 1 },
  // Water puts fire out. The water stays; the flame is gone.
  { a: FIRE, b: WATER, aBecomes: EMPTY, bBecomes: WATER, p: 1 },
];

interface Outcome {
  aBecomes: number;
  bBecomes: number;
  /** 0 means certain. Otherwise succeed when `nextU32() < chance`. */
  chance: number;
}

const rowByA: Array<Array<Outcome | undefined> | undefined> = new Array(256);
const lifeSpan = new Uint8Array(256);
const decayTo = new Uint8Array(256);
/** 1 when this id has a reaction row or a lifetime, so inert cells skip the extra work. */
export const cellAftermath = new Uint8Array(256);

const CHANCE_SCALE = 0x100000000;

export function installReactions(table: readonly Reaction[]): void {
  rowByA.fill(undefined);
  for (const rule of table) {
    let row = rowByA[rule.a];
    if (!row) {
      row = new Array(256);
      rowByA[rule.a] = row;
    }
    row[rule.b] = {
      aBecomes: rule.aBecomes,
      bBecomes: rule.bBecomes,
      chance: chanceOf(rule.p),
    };
  }
  markAftermath();
}

export function installLifetimes(materials: readonly { id: number; life?: number; decay?: number }[]): void {
  lifeSpan.fill(0);
  decayTo.fill(0);
  for (const material of materials) {
    if (!material.life) continue;
    if (material.life > 255) {
      throw new Error(`material ${material.id} life ${material.life} does not fit in a byte`);
    }
    lifeSpan[material.id] = material.life;
    decayTo[material.id] = material.decay ?? EMPTY;
  }
  markAftermath();
}

export function startingLife(id: number): number {
  return lifeSpan[id] ?? 0;
}

function markAftermath(): void {
  cellAftermath.fill(0);
  for (let id = 0; id < 256; id++) {
    if (lifeSpan[id] !== 0 || rowByA[id]) cellAftermath[id] = 1;
  }
}

function chanceOf(p: number): number {
  if (p >= 1) return 0;
  const threshold = Math.floor(p * CHANCE_SCALE);
  return threshold > 0 ? threshold : 1;
}

/** Reactions, then lifetime. Inert ids never get here, so they do not touch the RNG. */
export function afterMove(world: World, index: number, rng: Rng, frame: number): void {
  const id = world.type[index]!;
  const width = world.width;
  const x = index % width;
  const y = (index / width) | 0;
  const row = rowByA[id];
  if (row) {
    const n = rng.nextU32() & 3;
    const nx = x + (n === 1 ? 1 : n === 3 ? -1 : 0);
    const ny = y + (n === 2 ? 1 : n === 0 ? -1 : 0);
    if (world.inBounds(nx, ny)) {
      const ni = world.index(nx, ny);
      const other = world.type[ni]!;
      const outcome = row[other];
      if (outcome && (outcome.chance === 0 || rng.nextU32() < outcome.chance)) {
        if (outcome.aBecomes !== id) writeCell(world, index, outcome.aBecomes, x, y, frame);
        if (outcome.bBecomes !== other) writeCell(world, ni, outcome.bBecomes, nx, ny, frame);
      }
    }
  }
  tickLife(world, index, x, y, frame);
}

function tickLife(world: World, index: number, x: number, y: number, frame: number): void {
  const id = world.type[index]!;
  if (lifeSpan[id] === 0) return;
  const left = world.life[index]! - 1;
  if (left > 0) {
    world.life[index] = left;
    return;
  }
  writeCell(world, index, decayTo[id]!, x, y, frame);
}

function writeCell(world: World, index: number, id: number, x: number, y: number, frame: number): void {
  world.type[index] = id;
  world.life[index] = lifeSpan[id] ?? 0;
  world.temp[index] = 0;
  world.vx[index] = 0;
  world.vy[index] = 0;
  world.shade[index] = id === EMPTY ? 0 : shadeFor(x, y);
  // A cell born from a reaction has already had its turn. Leaving the clock clear lets
  // the scan run the new fire or plant again in this same step, chaining along the sweep.
  world.clock[index] = frame;
}
