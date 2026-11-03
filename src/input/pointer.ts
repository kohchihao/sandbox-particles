import { DEFAULT_BRUSH_RADIUS, clientToCell, stampStroke } from './paint';

export interface PointerController {
  setRadius(radius: number): void;
  setMaterial(materialId: number): void;
  detach(): void;
}

const listenerOptions: AddEventListenerOptions = { passive: false };

export function attachPointer(
  canvas: HTMLCanvasElement,
  gridWidth: number,
  gridHeight: number,
  paint: (x: number, y: number, materialId: number) => void,
  options: {
    materialId: number;
    readCell: (x: number, y: number) => number;
  },
): PointerController {
  let radius = DEFAULT_BRUSH_RADIUS;
  let materialId = options.materialId;
  let activePointerId: number | null = null;
  let lastX = -1;
  let lastY = -1;
  let watchingWindow = false;

  const toCell = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return clientToCell(event.clientX, event.clientY, rect, gridWidth, gridHeight);
  };

  const paintEvent = (event: PointerEvent) => {
    for (const sample of samplesOf(event)) {
      const cell = toCell(sample);
      if (!cell) continue;
      if (lastX < 0) stampStroke(cell.x, cell.y, cell.x, cell.y, radius, materialId, options.readCell, paint, gridWidth, gridHeight);
      else if (cell.x !== lastX || cell.y !== lastY) {
        stampStroke(lastX, lastY, cell.x, cell.y, radius, materialId, options.readCell, paint, gridWidth, gridHeight);
      }
      lastX = cell.x;
      lastY = cell.y;
    }
  };

  const endStroke = (pointerId: number) => {
    if (activePointerId !== pointerId) return;
    activePointerId = null;
    lastX = -1;
    lastY = -1;
    unwatchWindow();
    try {
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    } catch {
      // The pointer is already gone.
    }
  };

  const onDown = (event: PointerEvent) => {
    if (activePointerId !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.cancelable) event.preventDefault();
    activePointerId = event.pointerId;
    lastX = -1;
    lastY = -1;
    let captured = false;
    if (event.isTrusted) {
      try {
        canvas.setPointerCapture(event.pointerId);
        captured = canvas.hasPointerCapture(event.pointerId);
      } catch {
        captured = false;
      }
    }
    if (!captured) watchWindow();
    paintEvent(event);
  };

  const onMove = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return;
    if (event.cancelable) event.preventDefault();
    paintEvent(event);
  };

  const onUp = (event: PointerEvent) => {
    if (activePointerId !== event.pointerId) return;
    if (event.cancelable) event.preventDefault();
    paintEvent(event);
    endStroke(event.pointerId);
  };

  const onCancel = (event: PointerEvent) => {
    if (event.cancelable) event.preventDefault();
    endStroke(event.pointerId);
  };

  const onLostCapture = (event: PointerEvent) => {
    endStroke(event.pointerId);
  };

  const blockGesture = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };

  const onContext = (event: Event) => {
    event.preventDefault();
  };

  function watchWindow(): void {
    if (watchingWindow) return;
    watchingWindow = true;
    window.addEventListener('pointermove', onMove, listenerOptions);
    window.addEventListener('pointerup', onUp, listenerOptions);
    window.addEventListener('pointercancel', onCancel, listenerOptions);
  }

  function unwatchWindow(): void {
    if (!watchingWindow) return;
    watchingWindow = false;
    window.removeEventListener('pointermove', onMove, listenerOptions);
    window.removeEventListener('pointerup', onUp, listenerOptions);
    window.removeEventListener('pointercancel', onCancel, listenerOptions);
  }

  canvas.addEventListener('pointerdown', onDown, listenerOptions);
  canvas.addEventListener('pointermove', onMove, listenerOptions);
  canvas.addEventListener('pointerup', onUp, listenerOptions);
  canvas.addEventListener('pointercancel', onCancel, listenerOptions);
  canvas.addEventListener('lostpointercapture', onLostCapture);
  canvas.addEventListener('contextmenu', onContext);
  // Scroll and zoom stay blocked on the canvas only. A document-level
  // touchmove preventDefault would cancel taps on the toolbar.
  canvas.addEventListener('touchstart', blockGesture, listenerOptions);
  canvas.addEventListener('touchmove', blockGesture, listenerOptions);
  canvas.addEventListener('gesturestart', blockGesture, listenerOptions);
  canvas.addEventListener('gesturechange', blockGesture, listenerOptions);

  return {
    setRadius(next: number) {
      if (!Number.isFinite(next)) return;
      radius = Math.max(0, next);
    },
    setMaterial(next: number) {
      if (!Number.isInteger(next) || next < 0 || next > 255) return;
      materialId = next;
    },
    detach() {
      if (activePointerId !== null) endStroke(activePointerId);
      canvas.removeEventListener('pointerdown', onDown, listenerOptions);
      canvas.removeEventListener('pointermove', onMove, listenerOptions);
      canvas.removeEventListener('pointerup', onUp, listenerOptions);
      canvas.removeEventListener('pointercancel', onCancel, listenerOptions);
      canvas.removeEventListener('lostpointercapture', onLostCapture);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('touchstart', blockGesture, listenerOptions);
      canvas.removeEventListener('touchmove', blockGesture, listenerOptions);
      canvas.removeEventListener('gesturestart', blockGesture, listenerOptions);
      canvas.removeEventListener('gesturechange', blockGesture, listenerOptions);
      unwatchWindow();
    },
  };
}

function samplesOf(event: PointerEvent): PointerEvent[] {
  // Synthetic events used by tests report an empty or useless coalesced list.
  if (!event.isTrusted) return [event];
  const read = event.getCoalescedEvents;
  if (typeof read !== 'function') return [event];
  try {
    const samples = read.call(event);
    if (samples.length === 0) return [event];
    const last = samples[samples.length - 1];
    if (last && (last.clientX !== event.clientX || last.clientY !== event.clientY)) return [...samples, event];
    return samples;
  } catch {
    return [event];
  }
}
