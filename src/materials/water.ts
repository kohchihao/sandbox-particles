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
  // Ice pulls this below freezesAt when enough of it is touching. Lava contact
  // becomes stone and steam before this can boil; a hot neighbour that is not
  // lava can still cross boilsAt. Fire does not conduct, so hearth water stays at 0.
  // Targets are numeric: steam.ts and ice.ts already import this file.
  conductivity: 4,
  boilsAt: 80,
  boilsTo: 7,
  freezesAt: -24,
  freezesTo: 13,
} satisfies MaterialDef;
