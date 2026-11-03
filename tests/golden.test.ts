import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { scenes, GOLDEN_STEPS } from './golden/scenes';
import { hashHex } from './hashGrid';
import { worldRgb, writeRgbPng } from './png';

const goldenPath = fileURLToPath(new URL('./golden/replays.json', import.meta.url));
const accept = process.env.UPDATE_GOLDENS === '1';

interface GoldenFile {
  steps: number;
  scenes: Record<string, { seed: number; hash: string }>;
}

function readGolden(): GoldenFile {
  try {
    return JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenFile;
  } catch {
    if (accept) return { steps: GOLDEN_STEPS, scenes: {} };
    throw new Error(`Missing golden file ${goldenPath}. Record hashes with npm run test:golden:accept`);
  }
}

const stored = readGolden();
const recorded: GoldenFile = { steps: GOLDEN_STEPS, scenes: {} };

describe('golden replays', () => {
  afterAll(() => {
    if (!accept) return;
    writeFileSync(goldenPath, `${JSON.stringify(recorded, null, 2)}\n`);
  });

  for (const scene of scenes) {
    it(`${scene.name} matches the stored hash after ${GOLDEN_STEPS} steps`, () => {
      const sim = scene.create();
      const before = worldRgb(sim.world);
      sim.step(GOLDEN_STEPS);
      const actual = hashHex(sim.world);
      recorded.scenes[scene.name] = { seed: scene.seed, hash: actual };
      if (accept) return;

      const entry = stored.scenes[scene.name];
      const stepsMatch = stored.steps === GOLDEN_STEPS;
      if (stepsMatch && entry?.seed === scene.seed && entry.hash === actual) return;

      const dir = join('test-results', 'golden');
      const beforePath = join(dir, `${scene.name}-before.png`);
      const afterPath = join(dir, `${scene.name}-after.png`);
      writeRgbPng(beforePath, sim.world.width, sim.world.height, before);
      writeRgbPng(afterPath, sim.world.width, sim.world.height, worldRgb(sim.world));
      const expected = stepsMatch && entry ? entry.hash : '(none)';
      const detail = !entry
        ? `no stored hash for "${scene.name}"`
        : !stepsMatch
          ? `golden file records ${stored.steps} steps, this replay runs ${GOLDEN_STEPS}`
          : entry.seed !== scene.seed
            ? `golden file seed is ${entry.seed}, scene seed is ${scene.seed}`
            : 'hash mismatch';
      expect(
        actual,
        [
          `Golden replay "${scene.name}" failed (${detail}) after ${GOLDEN_STEPS} steps, seed ${scene.seed}.`,
          `expected ${expected}`,
          `actual   ${actual}`,
          `Wrote ${beforePath} and ${afterPath}.`,
          'Accept the new hashes with: npm run test:golden:accept',
        ].join('\n'),
      ).toBe(expected);
    });
  }
});
