import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Simulation } from '../src/core/sim';
import { CHUNK_SHIFT, World } from '../src/core/world';
import { FIRE } from '../src/materials/fire';
import { thermalProducts } from '../src/materials/heat';
import { ICE } from '../src/materials/ice';
import { LAVA } from '../src/materials/lava';
import { OIL } from '../src/materials/oil';
import { reactions } from '../src/materials/reactions';
import { materialById, materials } from '../src/materials/registry';
import { EMPTY, SAND } from '../src/materials/sand';
import { SNOW } from '../src/materials/snow';
import { WALL } from '../src/materials/wall';
import { WATER } from '../src/materials/water';
import { hashGrid } from './hashGrid';

function materialCounts(world: World): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const material of materials) counts[material.name] = 0;
  for (let i = 0; i < world.type.length; i++) {
    const id = world.type[i]!;
    if (id === EMPTY) continue;
    const name = materialById(id)?.name ?? `unknown:${id}`;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

function sprinkle(seed: number, density: number): Simulation {
  const sim = new Simulation(seed);
  const rng = new Rng(seed ^ 0x9e3779b9);
  const choices = [EMPTY, ...materials.map((material) => material.id)];
  const { width, height } = sim.world;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rng.nextU32() % density !== 0) continue;
      const id = choices[rng.nextU32() % choices.length]!;
      if (id !== EMPTY) sim.setCell(x, y, id);
    }
  }
  return sim;
}

describe('invariants', () => {
  it('conserves non-reacting materials over 1000 seeded steps', () => {
    const sim = sprinkle(12345, 2);
    const before = materialCounts(sim.world);
    for (const material of materials) {
      expect(before[material.name], material.name).toBeGreaterThan(0);
    }
    sim.step(1000);
    expectConserved(before, materialCounts(sim.world));
    assertKnownMaterials(sim.world);
  });

  it('throws on an out-of-grid read', () => {
    const world = new World();
    expect(() => world.index(-1, 0, 'read')).toThrow(/out-of-grid read/);
    expect(() => world.index(0, world.height, 'read')).toThrow(/out-of-grid read/);
  });

  it('throws on an out-of-grid write', () => {
    const world = new World();
    expect(() => world.index(world.width, 0, 'write')).toThrow(/out-of-grid write/);
    expect(() => world.index(1, -1, 'write')).toThrow(/out-of-grid write/);
  });

  it('repeats the same final hash for the same seed and starting grid', () => {
    const run = () => {
      const sim = sprinkle(99, 3);
      sim.step(100);
      return hashGrid(sim.world);
    };
    expect(run()).toBe(run());
  });

  it('survives 500 steps of a random grid without unknown ids', () => {
    const sim = sprinkle(7, 2);
    const before = materialCounts(sim.world);
    for (const material of materials) {
      expect(before[material.name], material.name).toBeGreaterThan(0);
    }
    sim.step(500);
    expectConserved(before, materialCounts(sim.world));
    assertKnownMaterials(sim.world);
  });

  it('walls never move', () => {
    const sim = sprinkle(12345, 2);
    const before = wallCoordinates(sim.world);
    expect(before.length).toBeGreaterThan(0);
    sim.step(1000);
    expect(wallCoordinates(sim.world)).toEqual(before);
  });

  it('wakes a sleeping chunk the same way as a grid that never sleeps', () => {
    for (const seed of [1, 5, 12]) {
      const sleeping = new Simulation(seed);
      const forced = new Simulation(seed);
      const pileTop = 96;
      for (let y = pileTop; y < sleeping.world.height; y++) {
        for (let x = 0; x < sleeping.world.width; x++) {
          sleeping.setCell(x, y, SAND);
          forced.setCell(x, y, SAND);
        }
      }

      let settled = 0;
      while (settled < 6 && !sandChunkAsleep(sleeping.world)) {
        stepForced(sleeping, forced);
        settled += 1;
        expectSame(sleeping, forced, `seed ${seed} settle ${settled}`);
      }
      expect(sandChunkAsleep(sleeping.world), `seed ${seed} pile never slept`).toBe(true);

      // Chunk edges (multiples of 16) on top of the pile and one cell beside them.
      // The cell above the pile is an empty sleeping chunk; y=96 is the sand chunk.
      const paints: Array<[number, number, number]> = [
        [16, 80, SAND],
        [15, 95, SAND],
        [16, 95, SAND],
        [48, 95, WATER],
        [47, 95, WATER],
        [48, 96, WATER],
        [80, 95, FIRE],
        [79, 96, FIRE],
        [80, 96, FIRE],
        [112, 95, OIL],
        [111, 95, OIL],
        [112, 96, OIL],
        // New materials on the empty row above the pile and on the sleeping sand itself.
        [128, 95, LAVA],
        [127, 95, LAVA],
        [128, 96, LAVA],
        [160, 95, ICE],
        [159, 95, ICE],
        [160, 96, ICE],
        [176, 95, SNOW],
        [175, 95, SNOW],
        [176, 96, SNOW],
      ];
      for (const [x, y] of paints) {
        expect(chunkAwake(sleeping.world, x, y), `seed ${seed} (${x},${y}) was already awake`).toBe(0);
      }
      expect(chunkAwake(sleeping.world, 144, 112), `seed ${seed} clear region was already awake`).toBe(0);

      for (const [x, y, id] of paints) {
        sleeping.setCell(x, y, id);
        forced.setCell(x, y, id);
      }
      expectSame(sleeping, forced, `seed ${seed} after paint`);

      for (let y = 112; y <= 127; y++) {
        for (let x = 144; x <= 159; x++) {
          sleeping.setCell(x, y, EMPTY);
          forced.setCell(x, y, EMPTY);
        }
      }
      expectSame(sleeping, forced, `seed ${seed} after clear`);

      const marks = [1, 20, 50];
      let done = 0;
      for (const mark of marks) {
        while (done < mark) {
          stepForced(sleeping, forced);
          done += 1;
        }
        expectSame(sleeping, forced, `seed ${seed} step ${done}`);
      }
    }
  });
});

/** Ids whose counts reactions or lifetimes are allowed to change. */
function reactingIds(): Set<number> {
  const ids = new Set<number>();
  for (const rule of reactions) {
    ids.add(rule.a);
    ids.add(rule.b);
    if (rule.aBecomes !== EMPTY) ids.add(rule.aBecomes);
    if (rule.bBecomes !== EMPTY) ids.add(rule.bBecomes);
  }
  for (const material of materials) {
    if (material.life) ids.add(material.id);
    if (material.decay) ids.add(material.decay);
  }
  for (const id of thermalProducts()) ids.add(id);
  return ids;
}

function expectConserved(before: Record<string, number>, after: Record<string, number>): void {
  const changing = reactingIds();
  for (const material of materials) {
    if (changing.has(material.id)) continue;
    expect(after[material.name], material.name).toBe(before[material.name]);
  }
}

function assertKnownMaterials(world: World): void {
  const known = new Set<number>([EMPTY, ...materials.map((material) => material.id)]);
  const { type } = world;
  for (let i = 0; i < type.length; i++) {
    if (!known.has(type[i]!)) throw new Error(`unknown material id ${type[i]} at cell ${i}`);
  }
}

function stepForced(sleeping: Simulation, forced: Simulation): void {
  // Waking every chunk first keeps trySleep from skipping cells on this step.
  forced.world.awake.fill(1);
  forced.step(1);
  sleeping.step(1);
}

function expectSame(sleeping: Simulation, forced: Simulation, label: string): void {
  expect(hashGrid(sleeping.world), label).toBe(hashGrid(forced.world));
}

function chunkAwake(world: World, x: number, y: number): number {
  const cx = x >>> CHUNK_SHIFT;
  const cy = y >>> CHUNK_SHIFT;
  return world.awake[cy * world.chunkCols + cx] ?? 1;
}

function sandChunkAsleep(world: World): boolean {
  const { awake, type, width, height, chunkCols } = world;
  const size = 1 << CHUNK_SHIFT;
  for (let chunk = 0; chunk < awake.length; chunk++) {
    if (awake[chunk] !== 0) continue;
    const cx = chunk % chunkCols;
    const cy = (chunk / chunkCols) | 0;
    const x0 = cx * size;
    const y0 = cy * size;
    const x1 = Math.min(width, x0 + size);
    const y1 = Math.min(height, y0 + size);
    for (let y = y0; y < y1; y++) {
      const row = y * width;
      for (let x = x0; x < x1; x++) {
        if (type[row + x] === SAND) return true;
      }
    }
  }
  return false;
}

function wallCoordinates(world: World): string[] {
  const found: string[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.type[world.index(x, y)] === WALL) found.push(`${x},${y}`);
    }
  }
  return found;
}
