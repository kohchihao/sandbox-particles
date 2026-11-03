import type { World } from '../src/core/world';

/** FNV-1a over every channel. Same grid state always hashes the same. */
export function hashGrid(world: World): number {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash ^= value & 255;
    hash = Math.imul(hash, 16777619);
  };
  for (let i = 0; i < world.type.length; i++) {
    mix(world.type[i]!);
    mix(world.life[i]!);
    mix(world.temp[i]!);
    mix(world.temp[i]! >> 8);
    mix(world.vx[i]!);
    mix(world.vy[i]!);
    mix(world.shade[i]!);
    mix(world.clock[i]!);
  }
  return hash >>> 0;
}

export function hashHex(world: World): string {
  return hashGrid(world).toString(16).padStart(8, '0');
}
