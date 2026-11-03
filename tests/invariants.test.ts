import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Simulation } from '../src/core/sim';
import { World } from '../src/core/world';
import { reactions } from '../src/materials/reactions';
import { materialById, materials } from '../src/materials/registry';
import { EMPTY } from '../src/materials/sand';
import { WALL } from '../src/materials/wall';
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

function wallCoordinates(world: World): string[] {
  const found: string[] = [];
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (world.type[world.index(x, y)] === WALL) found.push(`${x},${y}`);
    }
  }
  return found;
}
