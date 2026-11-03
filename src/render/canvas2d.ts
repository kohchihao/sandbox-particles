import { materialById } from '../materials/registry';
import { EMPTY } from '../materials/sand';
import type { World } from '../core/world';
import type { Renderer } from './renderer';

const EMPTY_RGB = [16, 18, 26] as const;

export class Canvas2DRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;

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
    this.image.data.fill(255);
  }

  setDisplaySize(cssWidth: number, cssHeight: number): void {
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  draw(world: World): void {
    const data = this.image.data;
    const { type, shade } = world;
    const count = type.length;

    for (let i = 0; i < count; i++) {
      const offset = i * 4;
      const id = type[i]!;
      if (id === EMPTY) {
        data[offset] = EMPTY_RGB[0];
        data[offset + 1] = EMPTY_RGB[1];
        data[offset + 2] = EMPTY_RGB[2];
        continue;
      }
      const color = materialById(id)?.color;
      const jitter = (shade[i]! & 15) - 8;
      data[offset] = clamp8((color?.[0] ?? 255) + jitter);
      data[offset + 1] = clamp8((color?.[1] ?? 255) + jitter);
      data[offset + 2] = clamp8((color?.[2] ?? 255) + jitter);
    }

    this.ctx.putImageData(this.image, 0, 0);
  }
}

function clamp8(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}
