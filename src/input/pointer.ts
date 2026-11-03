const BRUSH = 1;

export function attachPointer(
  canvas: HTMLCanvasElement,
  gridWidth: number,
  gridHeight: number,
  paint: (x: number, y: number) => void,
): () => void {
  let drawing = false;
  let lastX = -1;
  let lastY = -1;

  const toCell = (event: PointerEvent): { x: number; y: number } | null => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * gridWidth);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * gridHeight);
    if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return null;
    return { x, y };
  };

  const stamp = (x: number, y: number) => {
    for (let dy = -BRUSH; dy <= BRUSH; dy++) {
      for (let dx = -BRUSH; dx <= BRUSH; dx++) {
        paint(x + dx, y + dy);
      }
    }
  };

  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      stamp(x, y);
      if (x === x1 && y === y1) break;
      const doubled = err * 2;
      if (doubled > -dy) {
        err -= dy;
        x += sx;
      }
      if (doubled < dx) {
        err += dx;
        y += sy;
      }
    }
  };

  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawing = true;
    const cell = toCell(event);
    if (!cell) return;
    stamp(cell.x, cell.y);
    lastX = cell.x;
    lastY = cell.y;
  };

  const onMove = (event: PointerEvent) => {
    if (!drawing) return;
    const cell = toCell(event);
    if (!cell) return;
    if (lastX >= 0) stroke(lastX, lastY, cell.x, cell.y);
    else stamp(cell.x, cell.y);
    lastX = cell.x;
    lastY = cell.y;
  };

  const onUp = (event: PointerEvent) => {
    drawing = false;
    lastX = -1;
    lastY = -1;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onContext = (event: Event) => event.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', onContext);

  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('contextmenu', onContext);
  };
}
