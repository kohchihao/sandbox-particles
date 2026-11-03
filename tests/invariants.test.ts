import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Simulation } from '../src/core/sim';
import { World } from '../src/core/world';
import { materialById, materials } from '../src/materials/registry';
import { EMPTY } from '../src/materials/sand';
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
  it('conserves per-material counts over 1000 seeded steps', () => {
    const sim = sprinkle(12345, 2);
    const before = materialCounts(sim.world);
    expect(before.sand).toBeGreaterThan(0);
    sim.step(1000);
    expect(materialCounts(sim.world)).toEqual(before);
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
    sim.step(500);
    const known = new Set<number>([EMPTY, ...materials.map((material) => material.id)]);
    const { type } = sim.world;
    for (let i = 0; i < type.length; i++) {
      if (!known.has(type[i]!)) throw new Error(`unknown material id ${type[i]} at cell ${i}`);
    }
  });

  it.skip('walls never move', () => {
    // Wall is not in the registry yet. When it is, a wall cell must keep its coordinate.
  });
});
