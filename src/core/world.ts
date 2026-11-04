import { cellIndex, isInBounds } from './neighbours';

export const GRID_WIDTH = 200;
export const GRID_HEIGHT = 150;

/** Awake regions are 16×16. Edge chunks are shorter when the grid is not a multiple. */
export const CHUNK_SHIFT = 4;
export const CHUNK_SIZE = 1 << CHUNK_SHIFT;

/** Sleeping chunk is entirely empty, so a step can skip it. */
export const SLEEP_EMPTY = 1;
/** Sleeping chunk can only stamp clocks and advance the RNG. */
export const SLEEP_INERT = 2;

/**
 * How far a cell change can reach sideways. Liquids flow this many cells.
 * Updated when densities are installed. One is enough for powders, gases, and reactions.
 */
let horizontalInfluence = 1;

export function setHorizontalInfluence(cells: number): void {
  horizontalInfluence = cells > 0 ? cells : 1;
}

/** Stable per-cell colour offset. Painted cells and reacted cells share one formula. */
export function shadeFor(x: number, y: number): number {
  return (Math.imul(x, 13) + Math.imul(y, 7) + 3) & 31;
}

export class World {
  readonly width: number;
  readonly height: number;
  readonly type: Uint8Array;
  readonly life: Uint8Array;
  readonly temp: Int16Array;
  readonly vx: Int8Array;
  readonly vy: Int8Array;
  readonly shade: Uint8Array;
  readonly clock: Uint8Array;
  readonly chunkCols: number;
  readonly chunkRows: number;
  /** 1 when the chunk must run a real update. */
  readonly awake: Uint8Array;
  /** 1 when something in the wake changed this step, so the chunk stays awake. */
  readonly touched: Uint8Array;
  /** 1 when a quiet awake chunk was proved unable to sleep. Cleared when the neighbourhood changes. */
  readonly keepAwake: Uint8Array;
  /** SLEEP_EMPTY or SLEEP_INERT while `awake` is 0. */
  readonly sleep: Uint8Array;
  /** RNG draws a sleeping cell consumes. Valid only while its chunk is inert. */
  readonly restCost: Uint8Array;
  /** 1 when the chunk's pixels are stale. */
  readonly dirty: Uint8Array;
  dirtyCount: number;
  private bboxOpen: boolean;
  dirtyMinX: number;
  dirtyMinY: number;
  dirtyMaxX: number;
  dirtyMaxY: number;

  constructor(width = GRID_WIDTH, height = GRID_HEIGHT) {
    this.width = width;
    this.height = height;
    const cells = width * height;
    this.type = new Uint8Array(cells);
    this.life = new Uint8Array(cells);
    this.temp = new Int16Array(cells);
    this.vx = new Int8Array(cells);
    this.vy = new Int8Array(cells);
    this.shade = new Uint8Array(cells);
    this.clock = new Uint8Array(cells);
    this.chunkCols = (width + CHUNK_SIZE - 1) >>> CHUNK_SHIFT;
    this.chunkRows = (height + CHUNK_SIZE - 1) >>> CHUNK_SHIFT;
    const chunks = this.chunkCols * this.chunkRows;
    this.awake = new Uint8Array(chunks);
    this.awake.fill(1);
    this.touched = new Uint8Array(chunks);
    this.keepAwake = new Uint8Array(chunks);
    this.sleep = new Uint8Array(chunks);
    this.restCost = new Uint8Array(cells);
    this.dirty = new Uint8Array(chunks);
    this.dirty.fill(1);
    this.dirtyCount = chunks;
    this.bboxOpen = true;
    this.dirtyMinX = 0;
    this.dirtyMinY = 0;
    this.dirtyMaxX = width - 1;
    this.dirtyMaxY = height - 1;
  }

  /** Debug builds throw when `x` or `y` is outside the grid. Production builds strip that check. */
  index(x: number, y: number, op: 'read' | 'write' = 'read'): number {
    if (__SAND_CHECK_BOUNDS__ && !this.inBounds(x, y)) {
      throw new Error(`out-of-grid ${op} (${x}, ${y})`);
    }
    return cellIndex(x, y, this.width);
  }

  inBounds(x: number, y: number): boolean {
    return isInBounds(x, y, this.width, this.height);
  }

  /** Swaps every channel so a moved cell keeps its full state. */
  swap(a: number, b: number): void {
    const type = this.type;
    const life = this.life;
    const temp = this.temp;
    const vx = this.vx;
    const vy = this.vy;
    const shade = this.shade;
    const clock = this.clock;
    let tmp = type[a]!;
    type[a] = type[b]!;
    type[b] = tmp;
    tmp = life[a]!;
    life[a] = life[b]!;
    life[b] = tmp;
    tmp = temp[a]!;
    temp[a] = temp[b]!;
    temp[b] = tmp;
    tmp = vx[a]!;
    vx[a] = vx[b]!;
    vx[b] = tmp;
    tmp = vy[a]!;
    vy[a] = vy[b]!;
    vy[b] = tmp;
    tmp = shade[a]!;
    shade[a] = shade[b]!;
    shade[b] = tmp;
    tmp = clock[a]!;
    clock[a] = clock[b]!;
    clock[b] = tmp;
    this.noteChange(a);
    this.noteChange(b);
  }

  /**
   * A cell's material changed. Wake every chunk that might read it next step,
   * and mark the chunk's pixels dirty.
   */
  noteChange(index: number): void {
    const width = this.width;
    const x = index % width;
    const y = (index / width) | 0;
    const reach = horizontalInfluence;
    let x0 = x - reach;
    let x1 = x + reach;
    let y0 = y - 1;
    let y1 = y + 1;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x1 >= width) x1 = width - 1;
    if (y1 >= this.height) y1 = this.height - 1;
    const cx0 = x0 >>> CHUNK_SHIFT;
    const cx1 = x1 >>> CHUNK_SHIFT;
    const cy0 = y0 >>> CHUNK_SHIFT;
    const cy1 = y1 >>> CHUNK_SHIFT;
    const cols = this.chunkCols;
    const awake = this.awake;
    const touched = this.touched;
    const keepAwake = this.keepAwake;
    for (let cy = cy0; cy <= cy1; cy++) {
      let chunk = cy * cols + cx0;
      for (let cx = cx0; cx <= cx1; cx++, chunk++) {
        awake[chunk] = 1;
        touched[chunk] = 1;
        keepAwake[chunk] = 0;
      }
    }
    this.markDirty(x, y);
  }

  /** Lifetime tick. The chunk must stay awake, and neighbours do not read `life`. */
  poke(index: number): void {
    const width = this.width;
    const x = index % width;
    const y = (index / width) | 0;
    this.touched[(y >>> CHUNK_SHIFT) * this.chunkCols + (x >>> CHUNK_SHIFT)] = 1;
  }

  markDirty(x: number, y: number): void {
    const cx = x >>> CHUNK_SHIFT;
    const cy = y >>> CHUNK_SHIFT;
    const chunk = cy * this.chunkCols + cx;
    if (this.dirty[chunk] === 1) return;
    this.dirty[chunk] = 1;
    this.dirtyCount += 1;
    const x0 = cx << CHUNK_SHIFT;
    const y0 = cy << CHUNK_SHIFT;
    let x1 = x0 + CHUNK_SIZE - 1;
    let y1 = y0 + CHUNK_SIZE - 1;
    if (x1 >= this.width) x1 = this.width - 1;
    if (y1 >= this.height) y1 = this.height - 1;
    if (!this.bboxOpen) {
      this.dirtyMinX = x0;
      this.dirtyMinY = y0;
      this.dirtyMaxX = x1;
      this.dirtyMaxY = y1;
      this.bboxOpen = true;
      return;
    }
    if (x0 < this.dirtyMinX) this.dirtyMinX = x0;
    if (y0 < this.dirtyMinY) this.dirtyMinY = y0;
    if (x1 > this.dirtyMaxX) this.dirtyMaxX = x1;
    if (y1 > this.dirtyMaxY) this.dirtyMaxY = y1;
  }

  clearDirty(): void {
    if (this.dirtyCount === 0) return;
    this.dirty.fill(0);
    this.dirtyCount = 0;
    this.bboxOpen = false;
  }
}
