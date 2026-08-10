// field.ts — shared constants and helpers for the Morphochoir.
//
// A Gray-Scott reaction-diffusion field is a CHOIR: eight fixed "listening
// probes" sit in a ring and sample local field activity; each probe gates one
// warm voice, quantized to a fixed pentatonic scale. The morphology you grow
// (spots -> worms -> labyrinth -> solitons) IS the chord you hear.
//
// Everything here is deterministic — no Math.random / Date.now anywhere in the
// piece. All "randomness" comes from mulberry32 seeded with 0x9320.

/** Deterministic PRNG. Seed once, reuse — never Math.random(). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed used everywhere in this prototype. */
export const SEED = 0x9320;

// ── Gray-Scott feed/kill regimes ────────────────────────────────────────────
// The four labelled points on John Pearson's 1993 map of the (F,k) plane. Each
// grows a visibly + audibly distinct morphology. du/dv are the diffusion rates
// for the two chemicals U and V under a 9-point Laplacian, dt fixed at 1.0.
export interface Regime {
  key: string; // number-key that selects it
  name: string;
  feed: number;
  kill: number;
  blurb: string;
}

export const REGIMES: Regime[] = [
  { key: "1", name: "Mitosis", feed: 0.0367, kill: 0.0649, blurb: "spots that divide" },
  { key: "2", name: "Coral", feed: 0.0545, kill: 0.062, blurb: "branching worms" },
  { key: "3", name: "Labyrinth", feed: 0.029, kill: 0.057, blurb: "winding maze" },
  { key: "4", name: "Solitons", feed: 0.014, kill: 0.045, blurb: "drifting cells" },
];

export const DU = 0.16;
export const DV = 0.08;

// ── the listening probes ────────────────────────────────────────────────────
// Eight probes on a ring around the field centre. Each drives one voice.
export const PROBE_COUNT = 8;

/** Ring positions in normalized [0,1] field space. */
export const PROBE_POS: Array<[number, number]> = Array.from(
  { length: PROBE_COUNT },
  (_, i) => {
    const a = (i / PROBE_COUNT) * Math.PI * 2 - Math.PI / 2;
    const r = 0.31;
    return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r] as [number, number];
  },
);

// ── the scale (fixed 12-TET, NOT just-intonation) ───────────────────────────
// One warm note per probe: a major-pentatonic spread across ~two octaves so the
// gated set of probes sounds as an evolving, consonant chord.
const PENT = [0, 2, 4, 7, 9]; // major pentatonic degrees, semitones
export const PROBE_MIDI: number[] = Array.from({ length: PROBE_COUNT }, (_, i) => {
  return 48 + PENT[i % PENT.length] + 12 * Math.floor(i / PENT.length);
});

export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Deterministic key -> injection position, spread across the field. */
export function keyToPos(charCode: number): [number, number] {
  // hash the char code into two well-distributed coordinates
  const r = mulberry32(0x9320 ^ (charCode * 2654435761));
  const x = 0.16 + r() * 0.68;
  const y = 0.16 + r() * 0.68;
  return [x, y];
}

export interface Seed {
  x: number;
  y: number;
  strength: number;
  radius: number;
  life: number; // seconds remaining
}

/** Shared field interface — GPU and CPU backends both satisfy it. */
export interface Field {
  readonly backend: "GPU" | "CPU";
  /** Advance the simulation and draw one frame. */
  step(dtSec: number, timeSec: number, reduce: boolean): void;
  /** Inject reactant at a normalized position (a "seeded" note). */
  addSeed(x: number, y: number, strength: number): void;
  setRegime(index: number): void;
  /** Latest probe readings: length PROBE_COUNT*4 → [V, gradMag, Vavg, _]. */
  probes(): Float32Array;
  resize(w: number, h: number): void;
  destroy(): void;
}
