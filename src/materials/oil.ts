import type { MaterialDef } from './registry';

export const OIL = 8;

export const oil = {
  id: OIL,
  name: 'oil',
  // `o` reads as oil and is not empty's `.`.
  symbol: 'o',
  // Dark amber, visible against the black stage and against water.
  color: [74, 54, 24],
  archetype: 'liquid',
  // Lighter than water, so a spill floats on top of it.
  density: 30,
  // Shorter run than water's 5: oil is a little more viscous.
  flow: 4,
} satisfies MaterialDef;
