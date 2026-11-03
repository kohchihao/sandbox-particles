import { FixedStep } from './core/loop';
import { Simulation } from './core/sim';
import { attachPointer, type PointerController } from './input/pointer';
import { EMPTY, SAND } from './materials/sand';
import { Canvas2DRenderer } from './render/canvas2d';

export interface SandGridView {
  width: number;
  height: number;
  type: Uint8Array;
  life: Uint8Array;
  temp: Int16Array;
  vx: Int8Array;
  vy: Int8Array;
  shade: Uint8Array;
  clock: Uint8Array;
}

export interface SandHook {
  getGrid(): SandGridView;
  setCell(x: number, y: number, type: number): void;
  setSeed(seed: number): void;
  step(n: number): void;
  setRadius(radius: number): void;
}

const exposeHook =
  import.meta.env.DEV || import.meta.env.MODE === 'test' || import.meta.env.MODE === 'e2e';

export interface Engine {
  stop(): void;
  setMaterial(materialId: number): void;
  setRadius(radius: number): void;
  pause(): void;
  resume(): void;
  clear(): void;
  /** Advance one simulation step. No-op while the simulation is running. */
  stepOnce(): void;
}

export function startApp(canvas: HTMLCanvasElement, debugEl: HTMLElement | null): Engine {
  const sim = new Simulation(1);
  const renderer = new Canvas2DRenderer(canvas, sim.world);
  const stepper = new FixedStep();
  const stage = canvas.parentElement;
  if (!stage) throw new Error('Canvas has no parent');

  const fit = () => {
    const rect = stage.getBoundingClientRect();
    const { width, height } = sim.world;
    let cssWidth = Math.floor(rect.width);
    let cssHeight = Math.floor((cssWidth * height) / width);
    if (cssHeight > rect.height) {
      cssHeight = Math.floor(rect.height);
      cssWidth = Math.floor((cssHeight * width) / height);
    }
    renderer.setDisplaySize(Math.max(1, cssWidth), Math.max(1, cssHeight));
  };

  const observer = new ResizeObserver(fit);
  observer.observe(stage);
  fit();

  const pointer = attachPointer(
    canvas,
    sim.world.width,
    sim.world.height,
    (x, y, materialId) => {
      sim.setCell(x, y, materialId);
    },
    {
      materialId: SAND,
      readCell(x, y) {
        if (!sim.world.inBounds(x, y)) return -1;
        return sim.world.type[sim.world.index(x, y)] ?? -1;
      },
    },
  );

  if (exposeHook) installHook(sim, pointer);

  let raf = 0;
  let last = performance.now();
  let fpsFrames = 0;
  let fpsWindowMs = 0;
  let fps = 0;
  let stepMs = 0;
  let paused = false;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = now - last;
    last = now;
    const steps = stepper.take(dt);
    if (!paused && steps > 0) {
      const started = performance.now();
      sim.step(steps);
      stepMs = (performance.now() - started) / steps;
    }
    const renderStarted = performance.now();
    renderer.draw(sim.world);
    const renderMs = performance.now() - renderStarted;

    if (debugEl) {
      fpsFrames += 1;
      fpsWindowMs += dt;
      if (fpsWindowMs >= 250) {
        fps = (fpsFrames * 1000) / fpsWindowMs;
        fpsFrames = 0;
        fpsWindowMs = 0;
      }
      debugEl.textContent = `${fps.toFixed(0)} fps\nstep ${stepMs.toFixed(2)} ms\nrender ${renderMs.toFixed(2)} ms`;
    }
  };

  raf = requestAnimationFrame(frame);

  return {
    stop() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      pointer.detach();
      if (exposeHook) delete window.__sand;
    },
    setMaterial(materialId) {
      pointer.setMaterial(materialId);
    },
    setRadius(radius) {
      pointer.setRadius(radius);
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    clear() {
      const { width, height } = sim.world;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) sim.setCell(x, y, EMPTY);
      }
    },
    stepOnce() {
      if (paused) sim.step(1);
    },
  };
}

function installHook(sim: Simulation, pointer: PointerController): void {
  window.__sand = {
    getGrid() {
      const { world } = sim;
      return {
        width: world.width,
        height: world.height,
        type: world.type,
        life: world.life,
        temp: world.temp,
        vx: world.vx,
        vy: world.vy,
        shade: world.shade,
        clock: world.clock,
      };
    },
    setCell(x, y, type) {
      sim.setCell(x, y, type);
    },
    setSeed(seed) {
      sim.setSeed(seed);
    },
    step(n) {
      sim.step(n);
    },
    setRadius(radius) {
      pointer.setRadius(radius);
    },
  };
}
