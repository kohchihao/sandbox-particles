import { describe, expect, it } from 'vitest';
import { FixedStep, MAX_CATCHUP_STEPS, STEP_MS } from '../src/core/loop';
import { World } from '../src/core/world';

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
