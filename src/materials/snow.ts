import type { MaterialDef } from './registry';
import { WATER } from './water';

export const SNOW = 14;

export const snow = {
  id: SNOW,
  name: 'snow',
  // `c` — sand, steam, and stone already use s, t, and n.
  symbol: 'c',
  color: [232, 238, 244],
  archetype: 'powder',
  // Lighter than oil, so a drift sits on oil and on water. Sand falls through it.
  density: 22,
  temp: -16,
  conductivity: 4,
  meltsAt: 0,
  meltsTo: WATER,
} satisfies MaterialDef;
