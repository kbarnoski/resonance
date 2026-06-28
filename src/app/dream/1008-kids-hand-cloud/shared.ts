// shared.ts — types and a small uniform packer shared by the GPU and CPU paths.

export type Attractor = {
  x: number; // clip space [-1,1]
  y: number; // clip space [-1,1], y up
  strength: number; // pull toward this point
  swirl: number; // tangential swirl around this point
};

export const MAX_ATTRACTORS = 12;

export type FieldUniforms = {
  dt: number;
  time: number;
  attractors: Attractor[]; // up to MAX_ATTRACTORS
};

// Aurora palette stops (bright cloud on dark). Used by both render paths.
export const AURORA = [
  [0.25, 0.95, 0.85], // teal
  [0.45, 0.7, 1.0], // sky
  [0.75, 0.55, 1.0], // violet
  [1.0, 0.55, 0.85], // pink
  [0.65, 1.0, 0.7], // mint
];
