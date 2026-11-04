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
  // The cell stays at ambient. Hearth and stove hash every temperature byte,
  // and both scenes are full of fire, so a stored flame temperature would move
  // those replays. This many degrees are pushed into a neighbour that melts.
  // Water does not melt, and fire does not conduct, so a pool beside a flame stays at 0.
  warms: 8,
} satisfies MaterialDef;
