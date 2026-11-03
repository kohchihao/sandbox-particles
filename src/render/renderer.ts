import type { World } from '../core/world';

export interface Renderer {
  draw(world: World): void;
}
