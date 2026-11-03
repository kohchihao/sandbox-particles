import type { MaterialDef } from './registry';

export const ASH = 11;

export const ash = {
  id: ASH,
  name: 'ash',
  // `a` — sand, stone, and smoke already use s, n, and k.
  symbol: 'a',
  // Warm light grey, so a pile does not blend into smoke.
  color: [176, 168, 156],
  archetype: 'powder',
  // Between oil and water: it sinks through oil and sits on water.
  density: 40,
} satisfies MaterialDef;
