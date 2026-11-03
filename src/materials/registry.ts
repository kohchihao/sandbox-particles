import type { Rng } from '../core/rng';
import type { World } from '../core/world';
import { EMPTY, SAND, SAND_COLOR, updateSand } from './sand';

export interface MaterialDef {
  id: number;
  name: string;
  /** One character used by scenario pictures. `.` is reserved for empty. */
  symbol: string;
  color: readonly [number, number, number];
  update(world: World, x: number, y: number, rng: Rng, frame: number): void;
}

/** Stub registry. Sand is the only material in this skeleton. */
export const materials: readonly MaterialDef[] = [
  {
    id: SAND,
    name: 'sand',
    symbol: 's',
    color: SAND_COLOR,
    update: updateSand,
  },
];

const byId: Array<MaterialDef | undefined> = [];
for (const material of materials) byId[material.id] = material;

export function materialById(id: number): MaterialDef | undefined {
  return byId[id];
}

export function updateMaterial(world: World, x: number, y: number, rng: Rng, frame: number): void {
  const id = world.type[world.index(x, y)];
  if (id === undefined || id === EMPTY) return;
  byId[id]?.update(world, x, y, rng, frame);
}
