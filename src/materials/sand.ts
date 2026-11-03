import type { MaterialDef } from './registry';

export const EMPTY = 0;
export const SAND = 1;

export const sand = {
  id: SAND,
  name: 'sand',
  symbol: 's',
  color: [212, 176, 72],
  archetype: 'powder',
  density: 100,
} satisfies MaterialDef;
