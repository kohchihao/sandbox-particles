import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Rng } from '../src/core/rng';
import { Simulation } from '../src/core/sim';
import { FIRE } from '../src/materials/fire';
import { SAND } from '../src/materials/sand';

const baselinePath = fileURLToPath(new URL('../tests/baseline.json', import.meta.url));
const accept = process.env.UPDATE_BASELINE === '1';
const TRIALS = 5;
const SLOWDOWN = 0.2;
const SEED = 1;
const NOTE =
  'Median of 5 trials. busy is half sand, seed 1. settled is a solid sand pile on the lower 55% plus a short flame. Each scene is measured at 200x150 and 300x200. Fails when more than 20% slower than the recorded median. The committed numbers are GitHub-hosted runner measurements; copy them from a CI log rather than accepting a faster machine.';

interface SceneId {
  name: 'busy' | 'settled';
  width: number;
  height: number;
}

interface SceneBaseline extends SceneId {
  stepsPerSecond: number;
}

interface BaselineFile {
  note?: string;
  scenes?: SceneBaseline[];
  width?: number;
  height?: number;
  stepsPerSecond?: number;
}

const scenes: SceneId[] = [
  { name: 'busy', width: 200, height: 150 },
  { name: 'settled', width: 200, height: 150 },
  { name: 'busy', width: 300, height: 200 },
  { name: 'settled', width: 300, height: 200 },
];

function fillBusy(sim: Simulation): void {
  const rng = new Rng(SEED);
  const { width, height } = sim.world;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((rng.nextU32() & 1) === 0) sim.setCell(x, y, SAND);
    }
  }
}

function fillSettled(sim: Simulation): void {
  const { width, height } = sim.world;
  const top = Math.floor(height * 0.45);
  for (let y = top; y < height; y++) {
    for (let x = 0; x < width; x++) sim.setCell(x, y, SAND);
  }
  const x = Math.min(8, width - 1);
  for (let y = 2; y <= 5 && y < top; y++) sim.setCell(x, y, FIRE);
}

function fresh(scene: SceneId): Simulation {
  const sim = new Simulation(SEED, scene.width, scene.height);
  if (scene.name === 'busy') fillBusy(sim);
  else fillSettled(sim);
  sim.step(10);
  return sim;
}

function timeSteps(scene: SceneId, steps: number): number {
  const sim = fresh(scene);
  const start = performance.now();
  sim.step(steps);
  return performance.now() - start;
}

function chooseSteps(scene: SceneId): number {
  const elapsed = Math.max(timeSteps(scene, 20), 0.1);
  const scaled = Math.round(20 * (200 / elapsed));
  return Math.min(4000, Math.max(10, scaled));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1]!;
}

function readBaselineFile(): BaselineFile | undefined {
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf8')) as BaselineFile;
  } catch {
    return undefined;
  }
}

function recordedScenes(file: BaselineFile | undefined): SceneBaseline[] {
  if (!file) return [];
  if (file.scenes && file.scenes.length > 0) return file.scenes;
  if (file.stepsPerSecond !== undefined && file.width !== undefined && file.height !== undefined) {
    return [{ name: 'busy', width: file.width, height: file.height, stepsPerSecond: file.stepsPerSecond }];
  }
  return [];
}

function sameScene(a: SceneId, b: SceneId): boolean {
  return a.name === b.name && a.width === b.width && a.height === b.height;
}

const results: SceneBaseline[] = [];
for (const scene of scenes) {
  const steps = chooseSteps(scene);
  timeSteps(scene, steps);
  const rates = Array.from({ length: TRIALS }, () => {
    const elapsed = timeSteps(scene, steps);
    return (steps * 1000) / elapsed;
  });
  const measured = median(rates);
  const rounded = Math.round(measured);
  results.push({ ...scene, stepsPerSecond: rounded });
  const label = `${scene.name} ${scene.width}x${scene.height}`;
  console.log(`${label} ${steps} steps x ${TRIALS} trials`);
  console.log(`${label} steps/sec: ${rates.map((rate) => Math.round(rate)).join(', ')}`);
  console.log(`${label} median ${rounded}`);
}

if (accept) {
  const baseline: BaselineFile = { note: NOTE, scenes: results };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`wrote ${baselinePath}`);
  process.exit(0);
}

const recorded = recordedScenes(readBaselineFile());
if (recorded.length === 0) {
  console.error(`Missing ${baselinePath}. Record one with npm run bench:accept`);
  process.exit(1);
}

let failed = false;
for (const result of results) {
  const baseline = recorded.find((entry) => sameScene(entry, result));
  const label = `${result.name} ${result.width}x${result.height}`;
  if (!baseline) {
    console.log(`${label} has no baseline yet`);
    continue;
  }
  const limit = baseline.stepsPerSecond * (1 - SLOWDOWN);
  const ratio = result.stepsPerSecond / baseline.stepsPerSecond;
  console.log(
    `${label} baseline ${baseline.stepsPerSecond} (${Math.round(ratio * 100)}% of baseline, fail under ${Math.round(limit)})`,
  );
  if (result.stepsPerSecond < limit) {
    console.error(
      `${label} is more than 20% slower than the baseline (${result.stepsPerSecond} vs ${baseline.stepsPerSecond} steps/sec).`,
    );
    failed = true;
  }
}
if (failed) {
  console.error(
    'On the GitHub runner, put these medians in tests/baseline.json. npm run bench:accept records the machine it runs on.',
  );
  process.exit(1);
}
