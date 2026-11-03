import type { MaterialDef } from './registry';

export const WATER = 2;

export const water = {
  id: WATER,
  name: 'water',
  symbol: 'w',
  color: [56, 128, 224],
  archetype: 'liquid',
  density: 50,
  flow: 5,
} satisfies MaterialDef;
