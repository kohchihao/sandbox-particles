import type { MaterialDef } from './registry';
import { WATER } from './water';

export const STEAM = 7;

export const steam = {
  id: STEAM,
  name: 'steam',
  // `t` — `k` is already smoke.
  symbol: 't',
  // Pale blue-white, so a wisp does not read as smoke's grey.
  color: [198, 220, 230],
  archetype: 'gas',
  // Lighter than water, so it rises through it, and a step heavier than smoke.
  density: 4,
  // Long enough to leave a pool, then condenses back to water.
  life: 100,
  decay: WATER,
} satisfies MaterialDef;
