import type { MaterialDef } from './registry';
import { WATER } from './water';

export const ICE = 13;

export const ice = {
  id: ICE,
  name: 'ice',
  symbol: 'i',
  // Pale blue, cooler than steam's grey-white.
  color: [176, 214, 232],
  archetype: 'static',
  // Denser than lava, so a melt sits on the ice instead of swapping through it.
  density: 210,
  temp: -40,
  conductivity: 4,
  meltsAt: 0,
  meltsTo: WATER,
} satisfies MaterialDef;
