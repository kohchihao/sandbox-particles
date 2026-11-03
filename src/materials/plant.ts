import type { MaterialDef } from './registry';

export const PLANT = 4;

export const plant = {
  id: PLANT,
  name: 'plant',
  symbol: 'p',
  color: [42, 140, 52],
  archetype: 'static',
  // Heavier than sand, so grains rest on a plant instead of sinking through it.
  density: 140,
} satisfies MaterialDef;
