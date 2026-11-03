import type { Rng } from '../core/rng';
import type { World } from '../core/world';
import { installDensities, stepArchetype, type Archetype } from './archetypes';
import { fire } from './fire';
import { plant } from './plant';
import { afterMove, cellAftermath, installLifetimes, installReactions, reactions } from './reactions';
import { EMPTY, sand } from './sand';
import { smoke } from './smoke';
import { water } from './water';
import { wall } from './wall';

interface MaterialBase {
  id: number;
  name: string;
  /** One character used by scenario pictures. `.` is reserved for empty. */
  symbol: string;
  /** Base RGB. The renderer offsets it by the cell's `shade` byte. */
  color: readonly [number, number, number];
  density: number;
  /** Steps before `decay`. Counted down in the world's `life` channel. */
  life?: number;
  /** Material id written when `life` reaches 0. `0` clears the cell. */
  decay?: number;
  /** Odd materials that do not follow an archetype. Responsible for the clock stamp. */
  update?(world: World, x: number, y: number, rng: Rng, frame: number): void;
}

export type MaterialDef = MaterialBase &
  (
    | { archetype: 'liquid'; flow: number }
    | { archetype: Exclude<Archetype, 'liquid'> }
  );

export const materials: readonly MaterialDef[] = [sand, water, wall, plant, fire, smoke];

const byId: Array<MaterialDef | undefined> = [];
for (const material of materials) {
  if (material.id <= 0 || material.id > 255) {
    throw new Error(`material ${material.name} id ${material.id} is outside 1..255`);
  }
  if (byId[material.id]) throw new Error(`duplicate material id ${material.id}`);
  byId[material.id] = material;
}
installDensities(materials);
installLifetimes(materials);
installReactions(reactions);

export function materialById(id: number): MaterialDef | undefined {
  return byId[id];
}

export function updateMaterial(world: World, x: number, y: number, rng: Rng, frame: number): void {
  const from = world.index(x, y);
  const id = world.type[from]!;
  if (id === EMPTY) return;
  const material = byId[id];
  if (!material) return;
  if (material.update) {
    material.update(world, x, y, rng, frame);
    return;
  }
  const landed = stepArchetype(
    material.archetype,
    world,
    x,
    y,
    from,
    material.density,
    material.archetype === 'liquid' ? material.flow : 0,
    rng,
    frame,
  );
  if (cellAftermath[id] !== 0) afterMove(world, landed, rng);
}
