import type { Simulation } from '../../src/core/sim';
import { loadPicture } from '../picture';

export const GOLDEN_STEPS = 600;

export interface Scene {
  name: string;
  seed: number;
  create: () => Simulation;
}

function column(height: number): string {
  return Array.from({ length: height }, () => 's').join('\n');
}

function mound(): string {
  const air = `${'.'.repeat(10)}s${'.'.repeat(10)}`;
  return `${Array.from({ length: 36 }, () => air).join('\n')}\n${'s'.repeat(21)}`;
}

const scatter = `
s..s..s
.......
..s..s.
`;

export const scenes: readonly Scene[] = [
  {
    name: 'drip',
    seed: 1,
    create: () => loadPicture(column(40), { seed: 1, x: 50, onFloor: true }).sim,
  },
  {
    name: 'mound',
    seed: 42,
    create: () => loadPicture(mound(), { seed: 42, x: 70, onFloor: true }).sim,
  },
  {
    name: 'scatter',
    seed: 3,
    create: () => loadPicture(scatter, { seed: 3, x: 20, y: 12 }).sim,
  },
];
