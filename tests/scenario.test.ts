import { describe, expect, it } from 'vitest';
import type { Simulation } from '../src/core/sim';
import { SAND } from '../src/materials/sand';
import { WATER } from '../src/materials/water';
import { WALL } from '../src/materials/wall';
import { hashGrid } from './hashGrid';
import { expectPicture, expectWhere, loadPicture } from './picture';

const drop = `
s
.
.
.
.
.
.
.
.
.
.
`;

const settledDrop = `
.
.
.
.
.
.
.
.
.
.
s
`;

function moundPicture(): string {
  const air = `${'.'.repeat(10)}s${'.'.repeat(10)}`;
  const ground = 's'.repeat(21);
  return `${Array.from({ length: 36 }, () => air).join('\n')}\n${ground}`;
}

function typeHash(type: Uint8Array): number {
  let hash = 2166136261;
  for (let i = 0; i < type.length; i++) {
    hash ^= type[i]!;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

describe('sand', () => {
  it('rests on the floor after 10 steps', () => {
    const { sim, region } = loadPicture(drop, { seed: 1, x: 20, onFloor: true });
    sim.step(10);
    expectPicture(sim, settledDrop, region);
  });

  it('gives the same grid hash for the same seed twice', () => {
    const scene = (seed: number) => {
      const { sim } = loadPicture(moundPicture(), { seed, x: 90, onFloor: true });
      sim.step(50);
      return hashGrid(sim.world);
    };
    expect(scene(42)).toBe(scene(42));
    expect(scene(42)).not.toBe(scene(7));
  });

  it('forms a pile no steeper than 45 degrees when dropped on one point', () => {
    const dropped = 31;
    const { sim, region } = loadPicture('s\n'.repeat(dropped), { seed: 5, x: 80, onFloor: true });
    const dropX = region.x;
    const dropTop = region.y;
    sim.step(400);
    const resting = typeHash(sim.world.type);
    sim.step(40);
    expect(typeHash(sim.world.type)).toBe(resting);

    let sandCount = 0;
    const { type } = sim.world;
    for (let i = 0; i < type.length; i++) {
      if (type[i] === SAND) sandCount += 1;
    }
    expect(sandCount).toBe(dropped);
    expectWhere(
      sim,
      (id, x, y) => id !== SAND || Math.abs(x - dropX) <= y - dropTop,
      'sand is outside the 45 degree cone of the drop',
    );

    const { width, height } = sim.world;
    const floor = height - 1;
    const columnHeight = new Array<number>(width).fill(0);
    for (let x = 0; x < width; x++) {
      let top = -1;
      let bottom = -1;
      let count = 0;
      for (let y = 0; y < height; y++) {
        if (type[y * width + x] !== SAND) continue;
        if (top < 0) top = y;
        bottom = y;
        count += 1;
      }
      if (count === 0) continue;
      expect(bottom, `column ${x} is not resting on the floor`).toBe(floor);
      expect(count, `column ${x} has a hole`).toBe(bottom - top + 1);
      columnHeight[x] = count;
    }

    let minX = width;
    let maxX = -1;
    for (let x = 0; x < width; x++) {
      if (columnHeight[x] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    expect(maxX - minX, 'sand stayed a single column').toBeGreaterThan(0);
    for (let x = minX; x < maxX; x++) {
      const slope = Math.abs(columnHeight[x]! - columnHeight[x + 1]!);
      expect(slope, `slope steeper than 45 degrees between x=${x} and x=${x + 1}`).toBeLessThanOrEqual(1);
    }
  });
});

const shaft = `
#s#
#w#
#.#
#.#
###
`;

const sunk = `
#.#
#.#
#w#
#s#
###
`;

const tank = `
###########
#ww.......#
#ww.......#
#ww.......#
#ww.......#
#wwwwwwwww#
###########
`;

function countId(sim: Simulation, id: number): number {
  let count = 0;
  const { type } = sim.world;
  for (let i = 0; i < type.length; i++) {
    if (type[i] === id) count += 1;
  }
  return count;
}

describe('materials', () => {
  it('sand on top of water ends up below the water', () => {
    const { sim, region } = loadPicture(shaft, { seed: 1, x: 20, onFloor: true });
    sim.step(10);
    expectPicture(sim, sunk, region);

    const pool = `
sss
www
www
...
...
...
`;
    const poured = loadPicture(pool, { seed: 6, x: 40, onFloor: true });
    const sandBefore = countId(poured.sim, SAND);
    const waterBefore = countId(poured.sim, WATER);
    poured.sim.step(300);
    expect(countId(poured.sim, SAND)).toBe(sandBefore);
    expect(countId(poured.sim, WATER)).toBe(waterBefore);

    const { world } = poured.sim;
    for (let x = 0; x < world.width; x++) {
      let lowestWater = -1;
      let highestSand = -1;
      for (let y = 0; y < world.height; y++) {
        const id = world.type[world.index(x, y)]!;
        if (id === WATER) lowestWater = y;
        if (id === SAND && highestSand < 0) highestSand = y;
      }
      if (lowestWater < 0 || highestSand < 0) continue;
      expect(highestSand, `sand is floating on water in column ${x}`).toBeGreaterThan(lowestWater);
    }
  });

  it('water poured in a U-shaped wall container levels to within one cell on both sides', () => {
    const { sim, region } = loadPicture(tank, { seed: 2, x: 30, y: 40 });
    const waterBefore = countId(sim, WATER);
    const wallBefore = countId(sim, WALL);
    sim.step(800);

    expect(countId(sim, WATER)).toBe(waterBefore);
    expect(countId(sim, WALL)).toBe(wallBefore);

    const leftX = region.x + 1;
    const rightX = region.x + region.width - 2;
    const top = region.y + 1;
    const bottom = region.y + region.height - 2;
    const heights: number[] = [];
    for (let x = leftX; x <= rightX; x++) {
      let height = 0;
      for (let y = top; y <= bottom; y++) {
        const id = sim.world.type[sim.world.index(x, y)]!;
        if (id === WATER) height += 1;
        else expect(id, `interior cell (${x}, ${y}) is not water or empty`).toBe(0);
      }
      heights.push(height);
    }

    const left = heights[0]!;
    const right = heights[heights.length - 1]!;
    const shortest = Math.min(...heights);
    const tallest = Math.max(...heights);
    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(Math.abs(left - right), `left ${left}, right ${right}, columns ${heights.join(',')}`).toBeLessThanOrEqual(1);
    expect(tallest - shortest, `columns ${heights.join(',')}`).toBeLessThanOrEqual(1);

    let outside = 0;
    const { type, width, height } = sim.world;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (type[y * width + x] !== WATER) continue;
        const inside = x >= leftX && x <= rightX && y >= top && y <= bottom;
        if (!inside) outside += 1;
      }
    }
    expect(outside, 'water leaked out of the container').toBe(0);
  });

  it('water spreads flat on a floor', () => {
    const blob = Array.from({ length: 8 }, () => 'wwww').join('\n');
    const { sim, region } = loadPicture(blob, { seed: 4, x: 90, onFloor: true });
    const before = countId(sim, WATER);
    sim.step(400);
    expect(countId(sim, WATER)).toBe(before);

    const floor = sim.world.height - 1;
    let minX = sim.world.width;
    let maxX = -1;
    let aboveFloor = 0;
    const { type, width, height } = sim.world;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (type[y * width + x] !== WATER) continue;
        if (y !== floor) aboveFloor += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    expect(aboveFloor, 'water is still stacked above the floor').toBe(0);
    expect(maxX - minX + 1, 'water did not spread').toBeGreaterThan(region.width);
  });
});
