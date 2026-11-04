import type { MaterialDef } from './registry';
import { SMOKE } from './smoke';

export const FIRE = 5;

export const fire = {
  id: FIRE,
  name: 'fire',
  symbol: 'f',
  color: [255, 112, 28],
  archetype: 'gas',
  // Slightly heavier than smoke, still light enough to rise through water.
  density: 6,
  life: 64,
  decay: SMOKE,
  // Warms a melting neighbour each step. The flame holds no temperature and does not conduct.
  warms: 8,
} satisfies MaterialDef;
