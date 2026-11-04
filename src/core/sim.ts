import { stepGrid } from '../materials/archetypes';
import { startingLife } from '../materials/reactions';
import { EMPTY } from '../materials/sand';
import { Rng } from './rng';
import { shadeFor, World, GRID_HEIGHT, GRID_WIDTH } from './world';

export class Simulation {
  readonly world: World;
  readonly rng: Rng;
  /** Step id stamped into `clock`. Never 0, so a fresh cell stays eligible. */
  private frame = 0;

  constructor(seed = 1, width = GRID_WIDTH, height = GRID_HEIGHT) {
    this.world = new World(width, height);
    this.rng = new Rng(seed);
  }

  setSeed(seed: number): void {
    this.rng.setSeed(seed);
  }

  setCell(x: number, y: number, type: number): void {
    if (!this.world.inBounds(x, y)) return;
    const i = this.world.index(x, y, 'write');
    this.world.type[i] = type;
    this.world.life[i] = startingLife(type);
    this.world.temp[i] = 0;
    this.world.vx[i] = 0;
    this.world.vy[i] = 0;
    this.world.shade[i] = type === EMPTY ? 0 : shadeFor(x, y);
    this.world.clock[i] = 0;
    this.world.noteChange(i);
  }

  step(n = 1): void {
    for (let i = 0; i < n; i++) this.stepOnce();
  }

  private stepOnce(): void {
    this.frame = (this.frame + 1) & 255;
    if (this.frame === 0) {
      this.world.clock.fill(0);
      this.frame = 1;
    }
    stepGrid(this.world, this.rng, this.frame);
  }
}
