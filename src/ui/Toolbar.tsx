import { useState } from 'react';
import { DEFAULT_BRUSH_RADIUS } from '../input/paint';
import { materials } from '../materials/registry';
import { EMPTY, SAND } from '../materials/sand';

const BRUSHES = [
  { label: 'Small', radius: DEFAULT_BRUSH_RADIUS },
  { label: 'Medium', radius: 3 },
  { label: 'Large', radius: 6 },
] as const;

function materialLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function Toolbar({
  onMaterial,
  onRadius,
  onPause,
  onResume,
  onClear,
}: {
  onMaterial: (materialId: number) => void;
  onRadius: (radius: number) => void;
  onPause: () => void;
  onResume: () => void;
  onClear: () => void;
}) {
  const [materialId, setMaterialId] = useState(SAND);
  const [radius, setRadius] = useState<number>(DEFAULT_BRUSH_RADIUS);
  const [paused, setPaused] = useState(false);

  return (
    <footer className="toolbar" role="toolbar" aria-label="Materials">
      <div className="toolbar-group" role="group" aria-label="Material">
        {materials.map((material) => {
          const selected = materialId === material.id;
          return (
            <button
              key={material.id}
              type="button"
              className="tool"
              aria-pressed={selected}
              onClick={() => {
                setMaterialId(material.id);
                onMaterial(material.id);
              }}
            >
              <span
                className="swatch"
                style={{ backgroundColor: `rgb(${material.color[0]} ${material.color[1]} ${material.color[2]})` }}
                aria-hidden="true"
              />
              {materialLabel(material.name)}
            </button>
          );
        })}
        <button
          type="button"
          className="tool"
          aria-pressed={materialId === EMPTY}
          onClick={() => {
            setMaterialId(EMPTY);
            onMaterial(EMPTY);
          }}
        >
          <span className="swatch swatch-empty" aria-hidden="true" />
          Eraser
        </button>
      </div>
      <div className="toolbar-group" role="group" aria-label="Brush size">
        {BRUSHES.map((brush) => (
          <button
            key={brush.label}
            type="button"
            className="tool"
            aria-pressed={radius === brush.radius}
            onClick={() => {
              setRadius(brush.radius);
              onRadius(brush.radius);
            }}
          >
            {brush.label}
          </button>
        ))}
      </div>
      <div className="toolbar-group" role="group" aria-label="Simulation">
        <button
          type="button"
          className="tool"
          aria-pressed={paused}
          onClick={() => {
            if (paused) {
              setPaused(false);
              onResume();
            } else {
              setPaused(true);
              onPause();
            }
          }}
        >
          {paused ? 'Play' : 'Pause'}
        </button>
        <button type="button" className="tool" onClick={onClear}>
          Clear
        </button>
      </div>
    </footer>
  );
}
