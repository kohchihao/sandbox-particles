import { cellIndex, isInBounds } from './neighbours';

export const GRID_WIDTH = 200;
export const GRID_HEIGHT = 150;

export class World {
  readonly width = GRID_WIDTH;
  readonly height = GRID_HEIGHT;
  readonly type: Uint8Array;
  readonly life: Uint8Array;
  readonly temp: Int16Array;
  readonly vx: Int8Array;
  readonly vy: Int8Array;
  readonly shade: Uint8Array;
  readonly clock: Uint8Array;

  constructor() {
    const cells = GRID_WIDTH * GRID_HEIGHT;
    this.type = new Uint8Array(cells);
    this.life = new Uint8Array(cells);
    this.temp = new Int16Array(cells);
    this.vx = new Int8Array(cells);
    this.vy = new Int8Array(cells);
    this.shade = new Uint8Array(cells);
    this.clock = new Uint8Array(cells);
  }

  index(x: number, y: number): number {
    return cellIndex(x, y, this.width);
  }

  inBounds(x: number, y: number): boolean {
    return isInBounds(x, y, this.width, this.height);
  }

  /** Swaps every channel so a moved cell keeps its full state. */
  swap(a: number, b: number): void {
    swapAt(this.type, a, b);
    swapAt(this.life, a, b);
    swapAt(this.temp, a, b);
    swapAt(this.vx, a, b);
    swapAt(this.vy, a, b);
    swapAt(this.shade, a, b);
    swapAt(this.clock, a, b);
  }
}

function swapAt(channel: { [index: number]: number }, a: number, b: number): void {
  const tmp = channel[a]!;
  channel[a] = channel[b]!;
  channel[b] = tmp;
}
