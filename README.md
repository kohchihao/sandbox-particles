# Falling Sand

A falling-sand physics toy that runs in the browser.

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — production bundle in `dist/`
- `npm run typecheck` — strict TypeScript, including a DOM-free check of the simulation
- `npm test` — Vitest

Paint sand with the mouse or a finger. Add `?debug=1` for FPS and per-step timings. Dev, test, and `vite build --mode e2e` expose `window.__sand` (`getGrid`, `setCell`, `setSeed`, `step`). The production build omits the hook and the debug bounds checks.

## Testing

`npm test` runs every Vitest file. Each layer has its own command:

- `npm run typecheck` — app project and the DOM-free simulation project
- `npm run test:unit` — channel swap and the fixed timestep
- `npm run test:scenario` — sand scenarios written as text pictures (`.` empty, other symbols from the material registry)
- `npm run test:invariants` — conservation, bounds, determinism, and a random-grid fuzz
- `npm run test:golden` — seeded scenes, 600 steps, checked against `tests/golden/replays.json`
- `npm run test:e2e` — Playwright on Chromium desktop and WebKit with the iPhone 13 device profile, against `vite preview` of the e2e build
- `npm run bench` — steps per second on the full 200×150 grid, compared with `tests/baseline.json`

`npm run test:golden:accept` rewrites `tests/golden/replays.json` after an intentional simulation change. A mismatch fails with the expected and actual hashes and writes `test-results/golden/<scene>-before.png` and `<scene>-after.png`.

`npm run bench` takes the median of five trials and fails when that median is more than 20% slower than `tests/baseline.json`. CI keeps that hard gate. The committed baseline is the GitHub-hosted runner's own median, 391 steps/sec, taken from Actions run 41674135292 (trials 391, 389, 391, 391, 390). A faster machine still passes; the VM that first recorded 557 was about 30% above the runner and failed the gate. `npm run bench:accept` rewrites the file with the machine it runs on, so replace the committed number from a CI log rather than from a laptop. The 20% band is for noise on that runner class. The five CI trials sat within 2 steps of each other, so the gate stays a failure rather than a print-only step.

## Architecture

React renders the toolbar and the canvas once. An engine held in a ref owns the world, the fixed timestep, pointer input, and the canvas renderer, so a frame never goes through React. The simulation (`src/core`, `src/materials`) uses typed arrays and a seeded RNG only, with no DOM imports, so it can move into a worker later. Each frame is one `ImageData` blit, scaled with `image-rendering: pixelated`.
