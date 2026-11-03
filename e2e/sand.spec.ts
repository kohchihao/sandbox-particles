import { expect, test, type Locator, type Page } from '@playwright/test';
import { materials } from '../src/materials/registry';

const SAND = 1;
const GRID_W = 200;
const GRID_H = 150;

async function openApp(page: Page): Promise<Locator> {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => {
    const el = document.querySelector('canvas');
    if (!window.__sand || !el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 50 && rect.height > 50;
  });
  return canvas;
}

async function cellPoints(canvas: Locator, x0: number, y0: number, x1: number, y1: number) {
  return canvas.evaluate(
    (el, coords) => {
      const rect = el.getBoundingClientRect();
      const to = (x: number, y: number) => ({
        x: rect.left + ((x + 0.5) / coords.width) * rect.width,
        y: rect.top + ((y + 0.5) / coords.height) * rect.height,
      });
      return { start: to(coords.x0, coords.y0), end: to(coords.x1, coords.y1) };
    },
    { x0, y0, x1, y1, width: GRID_W, height: GRID_H },
  );
}

async function readRow(page: Page, y: number, x0: number, x1: number): Promise<string> {
  return page.evaluate(
    ({ y, x0, x1, sand }) => {
      const grid = window.__sand?.getGrid();
      if (!grid) throw new Error('window.__sand is missing');
      let row = '';
      for (let x = x0; x <= x1; x++) row += grid.type[y * grid.width + x] === sand ? 's' : '.';
      return row;
    },
    { y, x0, x1, sand: SAND },
  );
}

interface StrokeSpec {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  steps?: number;
  pointerType?: 'mouse' | 'touch' | 'pen';
  /** Pointer moves delivered before `pointercancel`. Later moves still fire. */
  cancelAfter?: number;
  readRows?: number[];
}

async function dispatchPointerStroke(page: Page, spec: StrokeSpec) {
  return page.evaluate(
    ({ x0, y0, x1, y1, steps, pointerType, cancelAfter, readRows, sand, width, height }) => {
      const canvas = document.querySelector('canvas');
      const hook = window.__sand;
      if (!canvas || !hook) throw new Error('window.__sand or canvas is missing');
      const rect = canvas.getBoundingClientRect();
      const to = (x: number, y: number) => ({
        x: rect.left + ((x + 0.5) / width) * rect.width,
        y: rect.top + ((y + 0.5) / height) * rect.height,
      });
      const start = to(x0, y0);
      const end = to(x1, y1);
      const zoom = () => {
        const scale = window.visualViewport?.scale;
        if (scale == null) throw new Error('visualViewport.scale is missing');
        return scale;
      };
      const fire = (type: string, clientX: number, clientY: number, buttons: number) => {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX,
            clientY,
            pointerId: 1,
            pointerType,
            isPrimary: true,
            button: 0,
            buttons,
            pressure: buttons ? 0.5 : 0,
          }),
        );
      };
      const scrollBefore = window.scrollY;
      const scrollXBefore = window.scrollX;
      const scaleBefore = zoom();
      fire('pointerdown', start.x, start.y, 1);
      let cancelled = false;
      for (let i = 1; i <= steps; i++) {
        if (!cancelled && cancelAfter != null && i > cancelAfter) {
          fire(
            'pointercancel',
            start.x + ((end.x - start.x) * cancelAfter) / steps,
            start.y + ((end.y - start.y) * cancelAfter) / steps,
            0,
          );
          cancelled = true;
        }
        fire(
          'pointermove',
          start.x + ((end.x - start.x) * i) / steps,
          start.y + ((end.y - start.y) * i) / steps,
          cancelled ? 0 : 1,
        );
      }
      if (!cancelled) fire('pointerup', end.x, end.y, 0);
      const xStart = Math.min(x0, x1);
      const xEnd = Math.max(x0, x1);
      const rows = readRows.map((y) => {
        let row = '';
        for (let x = xStart; x <= xEnd; x++) row += hook.getGrid().type[y * width + x] === sand ? 's' : '.';
        return row;
      });
      return {
        scrollBefore,
        scrollAfter: window.scrollY,
        scrollXBefore,
        scrollXAfter: window.scrollX,
        scaleBefore,
        scaleAfter: zoom(),
        rows,
      };
    },
    {
      x0: spec.x0,
      y0: spec.y0,
      x1: spec.x1,
      y1: spec.y1,
      steps: spec.steps ?? 16,
      pointerType: spec.pointerType ?? 'touch',
      cancelAfter: spec.cancelAfter ?? null,
      readRows: spec.readRows ?? [spec.y0],
      sand: SAND,
      width: GRID_W,
      height: GRID_H,
    },
  );
}

async function touchSwipe(page: Page, x0: number, y: number, x1: number, steps = 16) {
  const result = await dispatchPointerStroke(page, {
    x0,
    y0: y,
    x1,
    y1: y,
    steps,
    pointerType: 'touch',
    readRows: [y],
  });
  return { ...result, row: result.rows[0] ?? '' };
}

function materialButtonName(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}$`, 'i');
}

async function paintLine(page: Page, canvas: Locator, x0: number, y0: number, x1: number, y1: number) {
  const points = await cellPoints(canvas, x0, y0, x1, y1);
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
  await page.mouse.up();
}

async function readRowTypes(page: Page, y: number, x0: number, x1: number): Promise<number[]> {
  return page.evaluate(
    ({ y, x0, x1 }) => {
      const grid = window.__sand?.getGrid();
      if (!grid) throw new Error('window.__sand is missing');
      const row: number[] = [];
      for (let x = x0; x <= x1; x++) row.push(grid.type[y * grid.width + x] ?? 0);
      return row;
    },
    { y, x0, x1 },
  );
}

async function gridHash(page: Page): Promise<number> {
  return page.evaluate(() => {
    const type = window.__sand?.getGrid().type;
    if (!type) throw new Error('window.__sand is missing');
    let value = 2166136261;
    for (let i = 0; i < type.length; i++) {
      value ^= type[i]!;
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  });
}

async function columnCount(page: Page, x: number, materialId: number): Promise<number> {
  return page.evaluate(
    ({ x, materialId }) => {
      const grid = window.__sand?.getGrid();
      if (!grid) throw new Error('window.__sand is missing');
      let count = 0;
      for (let y = 0; y < grid.height; y++) {
        if (grid.type[y * grid.width + x] === materialId) count += 1;
      }
      return count;
    },
    { x, materialId },
  );
}

test('every registry material has a toolbar button', async ({ page }) => {
  await openApp(page);
  const toolbar = page.getByRole('toolbar', { name: 'Materials' });
  await expect(toolbar).toBeVisible();
  expect(materials.length).toBeGreaterThan(0);
  for (const material of materials) {
    const button = toolbar.getByRole('button', { name: materialButtonName(material.name), exact: true });
    await expect(button).toBeVisible();
    const swatch = button.locator('.swatch');
    await expect(swatch).toHaveCSS(
      'background-color',
      `rgb(${material.color[0]}, ${material.color[1]}, ${material.color[2]})`,
    );
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const sand = toolbar.getByRole('button', { name: 'Sand', exact: true });
  await expect(sand).toHaveAttribute('aria-pressed', 'true');
  await toolbar.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(toolbar.getByRole('button', { name: 'Water', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(sand).toHaveAttribute('aria-pressed', 'false');
});

test('picking water and painting puts water cells where painted', async ({ page }) => {
  const water = materials.find((material) => material.name === 'water');
  if (!water) throw new Error('registry includes water');
  const canvas = await openApp(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  const y = 40;
  const x0 = 30;
  const x1 = 90;
  await paintLine(page, canvas, x0, y, x1, y);
  const row = await readRowTypes(page, y, x0, x1);
  expect(row).toEqual(Array(x1 - x0 + 1).fill(water.id));
});

test('eraser removes painted cells', async ({ page }) => {
  const canvas = await openApp(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const y = 70;
  const x0 = 40;
  const x1 = 100;
  await paintLine(page, canvas, x0, y, x1, y);
  const painted = await readRowTypes(page, y, x0, x1);
  expect(painted).toEqual(Array(x1 - x0 + 1).fill(SAND));
  await page.getByRole('button', { name: 'Eraser', exact: true }).click();
  await paintLine(page, canvas, x0, y, x1, y);
  const erased = await readRowTypes(page, y, x0, x1);
  expect(erased).toEqual(Array(x1 - x0 + 1).fill(0));
});

test('pause stops the grid and play resumes it', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.evaluate((sand) => {
    const hook = window.__sand;
    if (!hook) throw new Error('window.__sand is missing');
    for (let x = 30; x <= 50; x++) hook.setCell(x, 16, sand);
  }, SAND);
  const frozen = await gridHash(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let frames = 0;
        const tick = () => {
          frames += 1;
          if (frames >= 8) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(await gridHash(page)).toBe(frozen);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => gridHash(page), { timeout: 2_000 }).not.toBe(frozen);
});

test('clear empties the grid', async ({ page }) => {
  await openApp(page);
  await page.evaluate((sand) => {
    const hook = window.__sand;
    if (!hook) throw new Error('window.__sand is missing');
    hook.setCell(12, 12, sand);
    hook.setCell(80, 40, sand);
    hook.setCell(140, 90, sand);
  }, SAND);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  const occupied = await page.evaluate(() => {
    const type = window.__sand?.getGrid().type;
    if (!type) throw new Error('window.__sand is missing');
    let count = 0;
    for (let i = 0; i < type.length; i++) if (type[i] !== 0) count += 1;
    return count;
  });
  expect(occupied).toBe(0);
});

test('a bigger brush paints a wider line', async ({ page }) => {
  const canvas = await openApp(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Small', exact: true }).click();
  const y = 80;
  const x0 = 50;
  const x1 = 110;
  const probe = 80;
  await paintLine(page, canvas, x0, y, x1, y);
  const small = await columnCount(page, probe, SAND);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Large', exact: true }).click();
  await paintLine(page, canvas, x0, y, x1, y);
  const large = await columnCount(page, probe, SAND);
  expect(small).toBeGreaterThan(0);
  expect(large).toBeGreaterThan(small);
});

test('canvas blocks touch scrolling and toolbar buttons stay tappable', async ({ page }) => {
  await openApp(page);
  const touchAction = (selector: string) =>
    page.locator(selector).evaluate((el) => getComputedStyle(el).touchAction);
  expect(await touchAction('html')).not.toBe('none');
  expect(await touchAction('body')).not.toBe('none');
  expect(await touchAction('#root')).not.toBe('none');
  expect(await touchAction('canvas')).toBe('none');
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  expect(await pause.evaluate((el) => getComputedStyle(el).touchAction)).not.toBe('none');
  const blocked = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const button = document.querySelector('.toolbar button');
    if (!canvas || !button) throw new Error('canvas or toolbar button is missing');
    const onCanvas = new Event('touchmove', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(onCanvas);
    const onButton = new Event('touchmove', { bubbles: true, cancelable: true });
    button.dispatchEvent(onButton);
    return { canvas: onCanvas.defaultPrevented, button: onButton.defaultPrevented };
  });
  expect(blocked.canvas).toBe(true);
  expect(blocked.button).toBe(false);
});

test('iPhone toolbar is fully visible and the page does not scroll', async ({ page }) => {
  test.skip(test.info().project.name !== 'iphone-13', 'toolbar fit runs on WebKit iPhone 13');
  await openApp(page);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) return;
  const toolbar = page.getByRole('toolbar', { name: 'Materials' });
  const buttons = toolbar.getByRole('button');
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(materials.length + 1);
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box, `button ${i} has a box`).not.toBeNull();
    if (!box) continue;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const metrics = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(metrics.scrollY).toBe(0);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
});

test('mouse drag leaves an unbroken line of sand', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'mouse drag runs on desktop Chromium');
  const canvas = await openApp(page);
  const y = GRID_H - 1;
  const x0 = 30;
  const x1 = 140;
  const points = await cellPoints(canvas, x0, y, x1, y);
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 24 });
  await page.mouse.up();
  const row = await readRow(page, y, x0, x1);
  expect(row, `floor row ${y}`).toBe('s'.repeat(x1 - x0 + 1));
});

test('fast mouse drag leaves a gap-free line', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'mouse drag runs on desktop Chromium');
  const canvas = await openApp(page);
  const y = GRID_H - 1;
  const x0 = 30;
  const x1 = 140;
  const points = await cellPoints(canvas, x0, y, x1, y);
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 1 });
  await page.mouse.up();
  const row = await readRow(page, y, x0, x1);
  expect(row, `floor row ${y}`).toBe('s'.repeat(x1 - x0 + 1));
});

test('touch swipe leaves an unbroken line of sand', async ({ page }) => {
  test.skip(test.info().project.name !== 'iphone-13', 'touch swipe runs on WebKit iPhone 13');
  await openApp(page);
  const y = GRID_H - 1;
  const x0 = 30;
  const x1 = 140;
  const result = await touchSwipe(page, x0, y, x1);
  expect(result.row, `floor row ${y}`).toBe('s'.repeat(x1 - x0 + 1));
});

test('fast touch swipe leaves a gap-free line', async ({ page }) => {
  test.skip(test.info().project.name !== 'iphone-13', 'touch swipe runs on WebKit iPhone 13');
  await openApp(page);
  const y = GRID_H - 1;
  const x0 = 30;
  const x1 = 140;
  const result = await touchSwipe(page, x0, y, x1, 1);
  expect(result.row, `floor row ${y}`).toBe('s'.repeat(x1 - x0 + 1));
});

test('larger brush paints a thicker line', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.__sand?.setRadius(4));
  const y = GRID_H - 1;
  const x0 = 40;
  const x1 = 120;
  const result = await dispatchPointerStroke(page, {
    x0,
    y0: y,
    x1,
    y1: y,
    steps: 1,
    pointerType: 'mouse',
    readRows: [0, 1, 2, 3, 4, 5].map((dy) => y - dy),
  });
  const span = 's'.repeat(x1 - x0 + 1);
  const empty = '.'.repeat(x1 - x0 + 1);
  for (let dy = 0; dy <= 4; dy++) expect(result.rows[dy], `row y-${dy}`).toBe(span);
  expect(result.rows[5], 'row y-5').toBe(empty);
});

test('long touch swipe leaves scroll and zoom unchanged', async ({ page }) => {
  test.skip(test.info().project.name !== 'iphone-13', 'touch swipe runs on WebKit iPhone 13');
  await openApp(page);
  const result = await dispatchPointerStroke(page, {
    x0: 5,
    y0: 8,
    x1: 190,
    y1: 140,
    steps: 48,
    pointerType: 'touch',
    readRows: [],
  });
  expect(result.scrollAfter).toBe(result.scrollBefore);
  expect(result.scrollXAfter).toBe(result.scrollXBefore);
  expect(result.scaleBefore).toBe(1);
  expect(result.scaleAfter).toBe(result.scaleBefore);
});

test('pointercancel mid-stroke stops painting', async ({ page }) => {
  await openApp(page);
  const y = GRID_H - 1;
  const x0 = 20;
  const x1 = 100;
  const steps = 8;
  const cancelAfter = 2;
  const lastCenter = x0 + ((x1 - x0) * cancelAfter) / steps;
  const result = await dispatchPointerStroke(page, {
    x0,
    y0: y,
    x1,
    y1: y,
    steps,
    cancelAfter,
    pointerType: 'touch',
    readRows: [y],
  });
  const row = result.rows[0] ?? '';
  const painted = lastCenter - x0 + 2;
  expect(row.slice(0, painted)).toBe('s'.repeat(painted));
  expect(row.slice(painted)).toBe('.'.repeat(row.length - painted));
});

test('seeded scene matches the screenshot', async ({ page }) => {
  await openApp(page);
  const stable = await page.evaluate(async () => {
    const sand = window.__sand;
    if (!sand) return false;
    const { height } = sand.getGrid();
    const floor = height - 1;
    sand.setSeed(42);
    for (let x = 70; x <= 90; x++) sand.setCell(x, floor, 1);
    for (let y = floor - 28; y < floor; y++) sand.setCell(80, y, 1);
    sand.step(600);
    const hash = () => {
      const type = sand.getGrid().type;
      let value = 2166136261;
      for (let i = 0; i < type.length; i++) {
        value ^= type[i]!;
        value = Math.imul(value, 16777619);
      }
      return value >>> 0;
    };
    const first = hash();
    await new Promise((resolve) => setTimeout(resolve, 150));
    return hash() === first;
  });
  expect(stable, 'seeded scene was still moving').toBe(true);
  await expect(page.locator('canvas')).toHaveScreenshot('seeded-scene.png', {
    scale: 'css',
    maxDiffPixelRatio: 0.01,
    threshold: 0.2,
    animations: 'disabled',
  });
});
