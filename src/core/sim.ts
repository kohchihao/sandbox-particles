import { updateMaterial } from '../materials/registry';
import { EMPTY } from '../materials/sand';
import { Rng } from './rng';
import { World } from './world';

export class Simulation {
  readonly world = new World();
  readonly rng: Rng;
  /** Step id stamped into `clock`. Never 0, so a fresh cell stays eligible. */
  private frame = 0;

  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }

  setSeed(seed: number): void {
    this.rng.setSeed(seed);
  }

  setCell(x: number, y: number, type: number): void {
    if (!this.world.inBounds(x, y)) return;
    const i = this.world.index(x, y, 'write');
    this.world.type[i] = type;
    this.world.life[i] = 0;
    this.world.temp[i] = 0;
    this.world.vx[i] = 0;
    this.world.vy[i] = 0;
    this.world.shade[i] = type === EMPTY ? 0 : shadeFor(x, y);
    this.world.clock[i] = 0;
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
    const frame = this.frame;
    const { width, height } = this.world;
    const leftToRight = (frame & 1) === 0;

    for (let y = height - 1; y >= 0; y--) {
      if (leftToRight) {
        for (let x = 0; x < width; x++) this.visit(x, y, frame);
      } else {
        for (let x = width - 1; x >= 0; x--) this.visit(x, y, frame);
      }
    }
  }

  private visit(x: number, y: number, frame: number): void {
    const i = this.world.index(x, y);
    if (this.world.type[i] === 0) return;
    if (this.world.clock[i] === frame) return;
    updateMaterial(this.world, x, y, this.rng, frame);
  }
}

function shadeFor(x: number, y: number): number {
  return (Math.imul(x, 13) + Math.imul(y, 7) + 3) & 31;
}
