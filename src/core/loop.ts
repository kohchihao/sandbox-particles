export const SIM_HZ = 60;
export const STEP_MS = 1000 / SIM_HZ;
export const MAX_CATCHUP_STEPS = 2;

/**
 * Fixed timestep. The caller supplies elapsed milliseconds (rAF stays
 * outside the simulation) and gets back how many steps to run, capped
 * so one rendered frame never tries to catch up more than two steps.
 */
export class FixedStep {
  private accumulator = 0;

  take(dtMs: number): number {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
    this.accumulator += Math.min(dtMs, 250);
    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_CATCHUP_STEPS) {
      this.accumulator -= STEP_MS;
      steps += 1;
    }
    if (steps === MAX_CATCHUP_STEPS && this.accumulator >= STEP_MS) {
      this.accumulator %= STEP_MS;
    }
    return steps;
  }
}
