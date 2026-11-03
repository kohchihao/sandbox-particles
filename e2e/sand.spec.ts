import { expect, test, type Locator, type Page } from '@playwright/test';

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

async function touchSwipe(page: Page, x0: number, y: number, x1: number) {
  return page.evaluate(
    ({ x0, y, x1, sand, width, height }) => {
      const canvas = document.querySelector('canvas');
      const hook = window.__sand;
      if (!canvas || !hook) throw new Error('window.__sand or canvas is missing');
      const rect = canvas.getBoundingClientRect();
      const to = (x: number, gy: number) => ({
        x: rect.left + ((x + 0.5) / width) * rect.width,
        y: rect.top + ((gy + 0.5) / height) * rect.height,
      });
      const start = to(x0, y);
      const end = to(x1, y);
      const fire = (type: string, clientX: number, clientY: number, buttons: number) => {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX,
            clientY,
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            button: 0,
            buttons,
            pressure: buttons ? 0.5 : 0,
          }),
        );
      };
      const scrollBefore = window.scrollY;
      fire('pointerdown', start.x, start.y, 1);
      const steps = 16;
      for (let i = 1; i <= steps; i++) {
        fire(
          'pointermove',
          start.x + ((end.x - start.x) * i) / steps,
          start.y + ((end.y - start.y) * i) / steps,
          1,
        );
      }
      fire('pointerup', end.x, end.y, 0);
      let row = '';
      for (let x = x0; x <= x1; x++) row += hook.getGrid().type[y * width + x] === sand ? 's' : '.';
      return { scrollBefore, scrollAfter: window.scrollY, row };
    },
    { x0, y, x1, sand: SAND, width: GRID_W, height: GRID_H },
  );
}

test('toolbar shell renders', async ({ page }) => {
  await openApp(page);
  const toolbar = page.getByRole('toolbar', { name: 'Materials' });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByText('Sand', { exact: true })).toBeVisible();
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

test('touch swipe leaves an unbroken line of sand', async ({ page }) => {
  test.skip(test.info().project.name !== 'iphone-13', 'touch swipe runs on WebKit iPhone 13');
  await openApp(page);
  const y = GRID_H - 1;
  const x0 = 30;
  const x1 = 140;
  const result = await touchSwipe(page, x0, y, x1);
  expect(result.row, `floor row ${y}`).toBe('s'.repeat(x1 - x0 + 1));
});

test('touch swipe on the canvas leaves scrollY unchanged', async ({ page }) => {
  test.skip(test.info().project.name !== 'iphone-13', 'touch swipe runs on WebKit iPhone 13');
  await openApp(page);
  const result = await touchSwipe(page, 40, 40, 150);
  expect(result.scrollAfter).toBe(result.scrollBefore);
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
