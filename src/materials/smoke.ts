import type { MaterialDef } from './registry';
import { EMPTY } from './sand';

export const SMOKE = 6;

export const smoke = {
  id: SMOKE,
  name: 'smoke',
  symbol: 'k',
  color: [168, 170, 178],
  archetype: 'gas',
  // Just above empty air, and well under water, so it rises through both.
  density: 2,
  life: 160,
  decay: EMPTY,
} satisfies MaterialDef;
