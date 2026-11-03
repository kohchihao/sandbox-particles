import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Rng } from '../src/core/rng';
import { Simulation } from '../src/core/sim';
import { GRID_HEIGHT, GRID_WIDTH } from '../src/core/world';
import { SAND } from '../src/materials/sand';

const baselinePath = fileURLToPath(new URL('../tests/baseline.json', import.meta.url));
const accept = process.env.UPDATE_BASELINE === '1';
const TRIALS = 5;
const SLOWDOWN = 0.2;
const SEED = 1;
const NOTE =
  'Median of 5 trials on the full 200x150 grid, half sand, seed 1. Fails when more than 20% slower. The committed baseline is a GitHub-hosted runner measurement; copy that median from a CI log rather than accepting a faster machine.';

interface Baseline {
  width: number;
  height: number;
  stepsPerSecond: number;
  note: string;
}

function fill(sim: Simulation): void {
  const rng = new Rng(SEED);
  const { width, height } = sim.world;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((rng.nextU32() & 1) === 0) sim.setCell(x, y, SAND);
    }
  }
}

function fresh(): Simulation {
  const sim = new Simulation(SEED);
  fill(sim);
  sim.step(10);
  return sim;
}

function timeSteps(steps: number): number {
  const sim = fresh();
  const start = performance.now();
  sim.step(steps);
  return performance.now() - start;
}

function chooseSteps(): number {
  const elapsed = Math.max(timeSteps(20), 0.1);
  const scaled = Math.round(20 * (200 / elapsed));
  return Math.min(400, Math.max(10, scaled));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1]!;
}

function readBaseline(): Baseline | undefined {
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
  } catch {
    return undefined;
  }
}

const steps = chooseSteps();
timeSteps(steps);
const rates = Array.from({ length: TRIALS }, () => {
  const elapsed = timeSteps(steps);
  return (steps * 1000) / elapsed;
});
const measured = median(rates);
const rounded = Math.round(measured);
const width = GRID_WIDTH;
const height = GRID_HEIGHT;

console.log(`grid ${width}x${height}, half sand, ${steps} steps x ${TRIALS} trials`);
console.log(`steps/sec: ${rates.map((rate) => Math.round(rate)).join(', ')}`);
console.log(`median ${rounded}`);

if (accept) {
  const baseline: Baseline = { width, height, stepsPerSecond: rounded, note: NOTE };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`wrote ${baselinePath}`);
  process.exit(0);
}

const baseline = readBaseline();
if (!baseline) {
  console.error(`Missing ${baselinePath}. Record one with npm run bench:accept`);
  process.exit(1);
}
if (baseline.width !== width || baseline.height !== height) {
  console.error(
    `Baseline grid is ${baseline.width}x${baseline.height}; this run is ${width}x${height}. Update it with npm run bench:accept`,
  );
  process.exit(1);
}

const limit = baseline.stepsPerSecond * (1 - SLOWDOWN);
const ratio = measured / baseline.stepsPerSecond;
console.log(`baseline ${baseline.stepsPerSecond} (${Math.round(ratio * 100)}% of baseline, fail under ${Math.round(limit)})`);
if (measured < limit) {
  console.error(
    `Benchmark is more than 20% slower than the baseline (${rounded} vs ${baseline.stepsPerSecond} steps/sec).`,
  );
  console.error(
    'On the GitHub runner, put this median in tests/baseline.json. npm run bench:accept records the machine it runs on.',
  );
  process.exit(1);
}
