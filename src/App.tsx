import { useEffect, useRef } from 'react';
import { GRID_HEIGHT, GRID_WIDTH } from './core/world';
import { startApp, type Engine } from './engine';
import { Toolbar } from './ui/Toolbar';

const debug = new URLSearchParams(window.location.search).get('debug') === '1';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    engineRef.current = startApp(canvas, debug ? debugRef.current : null);
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="app">
      <div className="stage">
        <canvas ref={canvasRef} width={GRID_WIDTH} height={GRID_HEIGHT} aria-label="Falling sand" />
        {debug ? <pre ref={debugRef} className="debug" /> : null}
      </div>
      <Toolbar
        onMaterial={(materialId) => engineRef.current?.setMaterial(materialId)}
        onRadius={(radius) => engineRef.current?.setRadius(radius)}
        onPause={() => engineRef.current?.pause()}
        onResume={() => engineRef.current?.resume()}
        onClear={() => engineRef.current?.clear()}
      />
    </div>
  );
}
