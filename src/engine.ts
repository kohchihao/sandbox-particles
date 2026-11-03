import { FixedStep } from './core/loop';
import { Simulation } from './core/sim';
import { attachPointer } from './input/pointer';
import { SAND } from './materials/sand';
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
}

const exposeHook =
  import.meta.env.DEV || import.meta.env.MODE === 'test' || import.meta.env.MODE === 'e2e';

export interface Engine {
  stop(): void;
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

  const detachPointer = attachPointer(canvas, sim.world.width, sim.world.height, (x, y) => {
    sim.setCell(x, y, SAND);
  });

  if (exposeHook) installHook(sim);

  let raf = 0;
  let last = performance.now();
  let fpsFrames = 0;
  let fpsWindowMs = 0;
  let fps = 0;
  let stepMs = 0;

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = now - last;
    last = now;
    const steps = stepper.take(dt);
    if (steps > 0) {
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
      detachPointer();
      if (exposeHook) delete window.__sand;
    },
  };
}

function installHook(sim: Simulation): void {
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
  };
}
