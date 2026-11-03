import type { MaterialDef } from './registry';

export const STONE = 10;

export const stone = {
  id: STONE,
  name: 'stone',
  // `n` — `s` is already sand.
  symbol: 'n',
  // Blue-grey, lighter than a wall and cooler than sand.
  color: [132, 134, 140],
  archetype: 'powder',
  // Heavier than sand, so it sinks through sand, water, and oil, and rests on plant.
  density: 120,
} satisfies MaterialDef;
