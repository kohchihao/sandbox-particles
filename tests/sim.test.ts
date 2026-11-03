import { describe, expect, it } from 'vitest';
import { FixedStep, MAX_CATCHUP_STEPS, STEP_MS } from '../src/core/loop';
import { Simulation } from '../src/core/sim';
import { World } from '../src/core/world';
import { EMPTY, SAND } from '../src/materials/sand';

function hashGrid(world: World): number {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= value & 255;
    hash = Math.imul(hash, 16777619);
  };
  for (let i = 0; i < world.type.length; i++) {
    mix(world.type[i]!);
    mix(world.life[i]!);
    mix(world.temp[i]!);
    mix(world.temp[i]! >> 8);
    mix(world.vx[i]!);
    mix(world.vy[i]!);
    mix(world.shade[i]!);
    mix(world.clock[i]!);
  }
  return hash >>> 0;
}

function pile(seed: number): number {
  const sim = new Simulation(seed);
  const floor = sim.world.height - 1;
  for (let x = 90; x <= 110; x++) sim.setCell(x, floor, SAND);
  for (let y = floor - 36; y < floor; y++) sim.setCell(100, y, SAND);
  sim.step(50);
  return hashGrid(sim.world);
}

describe('sand', () => {
  it('rests on the floor after 10 steps', () => {
    const sim = new Simulation(1);
    const x = 20;
    const floor = sim.world.height - 1;
    sim.setCell(x, floor - 10, SAND);
    sim.step(10);

    expect(sim.world.type[sim.world.index(x, floor)]).toBe(SAND);
    for (let y = 0; y < floor; y++) {
      expect(sim.world.type[sim.world.index(x, y)]).toBe(EMPTY);
    }
  });

  it('gives the same grid hash for the same seed twice', () => {
    const first = pile(42);
    const second = pile(42);
    expect(first).toBe(second);
    expect(pile(42)).not.toBe(pile(7));
  });
});

describe('world', () => {
  it('swaps every channel together', () => {
    const world = new World();
    const a = world.index(1, 1);
    const b = world.index(2, 3);
    world.type[a] = 1;
    world.life[a] = 2;
    world.temp[a] = -4;
    world.vx[a] = -1;
    world.vy[a] = 3;
    world.shade[a] = 6;
    world.clock[a] = 8;
    world.type[b] = 0;
    world.life[b] = 3;
    world.temp[b] = 5;
    world.vx[b] = 2;
    world.vy[b] = -4;
    world.shade[b] = 7;
    world.clock[b] = 9;

    world.swap(a, b);

    expect(world.type[b]).toBe(1);
    expect(world.life[b]).toBe(2);
    expect(world.temp[b]).toBe(-4);
    expect(world.vx[b]).toBe(-1);
    expect(world.vy[b]).toBe(3);
    expect(world.shade[b]).toBe(6);
    expect(world.clock[b]).toBe(8);
    expect(world.type[a]).toBe(0);
    expect(world.life[a]).toBe(3);
    expect(world.temp[a]).toBe(5);
    expect(world.vx[a]).toBe(2);
    expect(world.vy[a]).toBe(-4);
    expect(world.shade[a]).toBe(7);
    expect(world.clock[a]).toBe(9);
  });
});

describe('loop', () => {
  it('runs at most two catch-up steps per frame', () => {
    const loop = new FixedStep();
    expect(loop.take(STEP_MS * 10)).toBe(MAX_CATCHUP_STEPS);
    expect(loop.take(STEP_MS)).toBe(1);
    expect(loop.take(STEP_MS * 0.5)).toBe(0);
    expect(loop.take(STEP_MS * 0.5)).toBe(1);
  });
});
