import { describe, expect, it } from 'vitest';
import { hashGrid } from './hashGrid';
import { expectPicture, expectWhere, loadPicture } from './picture';
import { SAND } from '../src/materials/sand';

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
