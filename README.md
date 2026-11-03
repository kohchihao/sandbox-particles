# Falling Sand

A falling-sand physics toy that runs in the browser.

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — production bundle in `dist/`
- `npm run typecheck` — strict TypeScript, including a DOM-free check of the simulation
- `npm test` — Vitest

Paint sand with the mouse or a finger. Add `?debug=1` for FPS and per-step timings. In dev and test builds, `window.__sand` can read the grid, set cells, set the seed, and step.

## Architecture

React renders the toolbar and the canvas once. An engine held in a ref owns the world, the fixed timestep, pointer input, and the canvas renderer, so a frame never goes through React. The simulation (`src/core`, `src/materials`) uses typed arrays and a seeded RNG only, with no DOM imports, so it can move into a worker later. Each frame is one `ImageData` blit, scaled with `image-rendering: pixelated`.
