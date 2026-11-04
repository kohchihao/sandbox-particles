import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/sim';
import { CHUNK_SHIFT } from '../src/core/world';
import { ICE } from '../src/materials/ice';
import { LAVA } from '../src/materials/lava';
import { materialById } from '../src/materials/registry';
import { SNOW } from '../src/materials/snow';
import { STEAM } from '../src/materials/steam';
import { STONE } from '../src/materials/stone';
import { WALL } from '../src/materials/wall';
import { WATER } from '../src/materials/water';
import { scenes, GOLDEN_STEPS } from './golden/scenes';
import { loadPicture } from './picture';

function countId(sim: Simulation, id: number): number {
  let count = 0;
  const { type } = sim.world;
  for (let i = 0; i < type.length; i++) if (type[i] === id) count += 1;
  return count;
}

const originalScenes = ['drip', 'mound', 'scatter', 'basin', 'hearth', 'stove'] as const;

describe('heat', () => {
  it('paints lava, ice, and snow at their starting temperatures', () => {
    const sim = new Simulation(1);
    sim.setCell(4, 4, LAVA);
    sim.setCell(5, 4, ICE);
    sim.setCell(6, 4, SNOW);
    expect(sim.world.temp[sim.world.index(4, 4)]).toBe(720);
    expect(sim.world.temp[sim.world.index(5, 4)]).toBe(-40);
    expect(sim.world.temp[sim.world.index(6, 4)]).toBe(-16);
    expect(materialById(WATER)?.boilsTo).toBe(STEAM);
    expect(materialById(WATER)?.freezesTo).toBe(ICE);
  });

  it('turns lava that touches water into stone and steam', () => {
    const { sim } = loadPicture(
      `
      ###
      #w#
      #l#
      ###
      `,
      { seed: 1, x: 20, y: 20 },
    );
    expect(countId(sim, LAVA)).toBe(1);
    expect(countId(sim, WATER)).toBe(1);
    sim.step(8);
    expect(countId(sim, STONE)).toBeGreaterThan(0);
    expect(countId(sim, STEAM)).toBeGreaterThan(0);
    expect(countId(sim, LAVA)).toBe(0);
  });

  it('melts ice that sits on lava', () => {
    const { sim } = loadPicture(
      `
      ###
      #i#
      #l#
      ###
      `,
      { seed: 2, x: 20, y: 20 },
    );
    const iceBefore = countId(sim, ICE);
    expect(iceBefore).toBeGreaterThan(0);
    sim.step(10);
    expect(countId(sim, ICE)).toBeLessThan(iceBefore);
  });

  it('melts snow beside a flame and leaves water', () => {
    const { sim } = loadPicture(
      `
      #####
      #ccc#
      #cfc#
      #ccc#
      #####
      `,
      { seed: 3, x: 30, y: 30 },
    );
    const snowBefore = countId(sim, SNOW);
    expect(snowBefore).toBeGreaterThan(0);
    sim.step(20);
    expect(countId(sim, SNOW)).toBeLessThan(snowBefore);
    expect(countId(sim, WATER)).toBeGreaterThan(0);
  });

  it('cools an insulated lava cell into stone', () => {
    const { sim, region } = loadPicture(
      `
      ###
      #l#
      ###
      `,
      { seed: 4, x: 40, y: 40 },
    );
    const index = sim.world.index(region.x + 1, region.y + 1);
    sim.step(100);
    expect(sim.world.type[index]).toBe(LAVA);
    expect(sim.world.temp[index]).toBe(520);
    sim.step(180);
    expect(sim.world.type[index]).toBe(STONE);
  });

  it('freezes water next to enough ice and leaves a single neighbour liquid', () => {
    const crowded = loadPicture(
      `
      #####
      #iii#
      #iwi#
      #iii#
      #####
      `,
      { seed: 5, x: 10, y: 10 },
    );
    const alone = loadPicture(
      `
      ###
      #.#
      #i#
      #w#
      ###
      `,
      { seed: 5, x: 10, y: 10 },
    );
    crowded.sim.step(40);
    alone.sim.step(80);
    const crowdedWater = crowded.sim.world.index(crowded.region.x + 2, crowded.region.y + 2);
    const aloneWater = alone.sim.world.index(alone.region.x + 1, alone.region.y + 3);
    expect(crowded.sim.world.type[crowdedWater]).toBe(ICE);
    expect(alone.sim.world.type[aloneWater]).toBe(WATER);
    const cooled = alone.sim.world.temp[aloneWater]!;
    expect(cooled).toBeLessThan(0);
    expect(cooled).toBeGreaterThan(-24);
  });

  it('does not grow a small ice cube sitting in a large pool', () => {
    const sim = new Simulation(1);
    const x0 = 20;
    const y0 = 80;
    const width = 62;
    const height = 32;
    for (let y = y0; y < y0 + height; y++) {
      for (let x = x0; x < x0 + width; x++) {
        const edge = x === x0 || y === y0 || x === x0 + width - 1 || y === y0 + height - 1;
        sim.setCell(x, y, edge ? WALL : WATER);
      }
    }
    // 4×4 cube in the middle of the 60×30 water, not touching the wall.
    for (let y = y0 + 14; y < y0 + 18; y++) {
      for (let x = x0 + 29; x < x0 + 33; x++) sim.setCell(x, y, ICE);
    }
    expect(countId(sim, ICE)).toBe(16);
    sim.step(2000);
    expect(countId(sim, ICE)).toBeLessThanOrEqual(16);
  });

  it('freezes water tucked into a large ice mass', () => {
    const sim = new Simulation(2);
    const x0 = 40;
    const y0 = 40;
    for (let y = y0; y < y0 + 12; y++) {
      for (let x = x0; x < x0 + 16; x++) sim.setCell(x, y, ICE);
    }
    // A one-cell pocket. The water touches ice on the left, right, and below.
    const pocketX = x0 + 8;
    const pocketY = y0 + 1;
    sim.setCell(pocketX, y0, WATER);
    sim.setCell(pocketX, pocketY, WATER);
    const before = countId(sim, ICE);
    sim.step(40);
    expect(sim.world.type[sim.world.index(pocketX, pocketY)]).toBe(ICE);
    expect(countId(sim, ICE)).toBeGreaterThan(before);
  });

  it('lets an ice block sitting on a wall sleep', () => {
    const { sim, region } = loadPicture(
      `
      ####
      #ii#
      ####
      `,
      { seed: 1, x: 32, y: 32 },
    );
    const iceX = region.x + 1;
    const iceY = region.y + 1;
    expect(sim.world.type[sim.world.index(iceX, iceY)]).toBe(ICE);
    expect(sim.world.type[sim.world.index(iceX, iceY + 1)]).toBe(WALL);
    sim.step(6);
    const cx = iceX >>> CHUNK_SHIFT;
    const cy = iceY >>> CHUNK_SHIFT;
    expect(sim.world.awake[cy * sim.world.chunkCols + cx]).toBe(0);
    expect(countId(sim, ICE)).toBe(2);
  });

  it('leaves every temperature byte at 0 in the six original scenes', () => {
    for (const name of originalScenes) {
      const scene = scenes.find((entry) => entry.name === name);
      if (!scene) throw new Error(`missing scene ${name}`);
      const replay = scene.create();
      replay.step(GOLDEN_STEPS);
      const temp = replay.world.temp;
      for (let i = 0; i < temp.length; i++) {
        if (temp[i] !== 0) {
          throw new Error(`${name} temperature ${temp[i]} at cell ${i}`);
        }
      }
    }
  });
});
