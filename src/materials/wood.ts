import type { MaterialDef } from './registry';

export const WOOD = 9;

export const wood = {
  id: WOOD,
  name: 'wood',
  // `d` — `w` is already water.
  symbol: 'd',
  // Warm brown, darker than sand so a beam reads as solid.
  color: [128, 84, 46],
  archetype: 'static',
  // Heavier than stone, so stone and sand rest on a beam.
  density: 200,
} satisfies MaterialDef;
