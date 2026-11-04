import type { MaterialDef } from './registry';
import { STONE } from './stone';

export const LAVA = 12;

export const lava = {
  id: LAVA,
  name: 'lava',
  symbol: 'l',
  // Hot orange. The canvas pushes it toward yellow while the cell is still far above freezing.
  color: [255, 106, 18],
  archetype: 'liquid',
  // Heavier than stone, lighter than wood, so it sinks through a rubble pile and sits on a beam.
  density: 170,
  // One cell of sideways creep. Water runs five.
  flow: 1,
  temp: 720,
  conductivity: 6,
  // An insulated pool loses `cools` each step and becomes stone at this line.
  // A cold neighbour can pull it under the line sooner.
  freezesAt: 160,
  freezesTo: STONE,
  cools: 2,
} satisfies MaterialDef;
