import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/core/sim';
import { ICE } from '../src/materials/ice';
import { LAVA } from '../src/materials/lava';
import { materialById } from '../src/materials/registry';
import { SNOW } from '../src/materials/snow';
import { STEAM } from '../src/materials/steam';
import { STONE } from '../src/materials/stone';
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
