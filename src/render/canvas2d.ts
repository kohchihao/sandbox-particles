import type { World } from '../core/world';
import { CHUNK_SHIFT, CHUNK_SIZE } from '../core/world';
import { LAVA } from '../materials/lava';
import { materialById } from '../materials/registry';
import type { Renderer } from './renderer';

const EMPTY_RGB = [16, 18, 26] as const;

export class Canvas2DRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  /** Packed RGBA, indexed by `(id << 4) | (shade & 15)`. */
  private readonly palette: Uint32Array;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    world: World,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    canvas.width = world.width;
    canvas.height = world.height;
    this.image = ctx.createImageData(world.width, world.height);
    this.pixels = new Uint32Array(this.image.data.buffer, this.image.data.byteOffset, world.width * world.height);
    this.palette = buildPalette();
  }

  setDisplaySize(cssWidth: number, cssHeight: number): void {
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  draw(world: World): void {
    if (world.dirtyCount === 0) return;
    const { type, shade, temp, width, height, dirty, chunkCols } = world;
    const pixels = this.pixels;
    const palette = this.palette;
    const size = CHUNK_SIZE;

    for (let chunk = 0; chunk < dirty.length; chunk++) {
      if (dirty[chunk] === 0) continue;
      const cx = chunk % chunkCols;
      const cy = (chunk / chunkCols) | 0;
      const x0 = cx << CHUNK_SHIFT;
      const y0 = cy << CHUNK_SHIFT;
      const x1 = Math.min(width, x0 + size);
      const y1 = Math.min(height, y0 + size);
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          const i = row + x;
          const id = type[i]!;
          const tint = shade[i]! & 15;
          pixels[i] = id === LAVA ? lavaGlow(temp[i]!, tint) : palette[(id << 4) | tint]!;
        }
      }
    }

    this.ctx.putImageData(
      this.image,
      0,
      0,
      world.dirtyMinX,
      world.dirtyMinY,
      world.dirtyMaxX - world.dirtyMinX + 1,
      world.dirtyMaxY - world.dirtyMinY + 1,
    );
    world.clearDirty();
  }
}

const littleEndian = (() => {
  const probe = new Uint32Array(1);
  new Uint8Array(probe.buffer)[0] = 1;
  return probe[0] === 1;
})();

function pack(r: number, g: number, b: number): number {
  return littleEndian ? (255 << 24) | (b << 16) | (g << 8) | r : (r << 24) | (g << 16) | (b << 8) | 255;
}

/** Fresh lava is yellow-white. It dulls toward the swatch orange as it cools to stone. */
function lavaGlow(temp: number, shade: number): number {
  let heat = temp - 160;
  if (heat < 0) heat = 0;
  if (heat > 560) heat = 560;
  const g = 64 + ((heat * 150) / 560) | 0;
  const b = 8 + ((heat * 48) / 560) | 0;
  const jitter = shade - 8;
  return pack(clamp8(255 + jitter), clamp8(g + jitter), clamp8(b + jitter));
}

function buildPalette(): Uint32Array {
  const palette = new Uint32Array(256 * 16);
  for (let id = 0; id < 256; id++) {
    const color = id === 0 ? EMPTY_RGB : (materialById(id)?.color ?? [255, 255, 255]);
    for (let shade = 0; shade < 16; shade++) {
      const jitter = id === 0 ? 0 : shade - 8;
      palette[(id << 4) | shade] = pack(
        clamp8(color[0] + jitter),
        clamp8(color[1] + jitter),
        clamp8(color[2] + jitter),
      );
    }
  }
  return palette;
}

function clamp8(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}
