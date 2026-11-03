import type { MaterialDef } from './registry';

export const WALL = 3;

export const wall = {
  id: WALL,
  name: 'wall',
  symbol: '#',
  color: [92, 94, 102],
  archetype: 'static',
  // Heavier than sand and water, so nothing can swap into a wall.
  density: 255,
} satisfies MaterialDef;
