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
  // Conducts. Freezes beside enough ice, and boils when a hot neighbour pushes it up.
  // Lava contact becomes stone and steam before that boil. Targets are numeric:
  // steam.ts and ice.ts already import this file.
  conductivity: 4,
  boilsAt: 80,
  boilsTo: 7,
  freezesAt: -24,
  freezesTo: 13,
} satisfies MaterialDef;
