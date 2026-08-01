/**
 * 4616 · Pressing — groove geometry + seeded take.
 *
 * The groove is an inward Archimedean spiral sampled into a fixed-length
 * array. Each committed note deposits a permanent "etch" bump into an
 * `etchDepth` field indexed by the spiral parameter t ∈ [0,1]; the groove's
 * local radius and high-frequency wiggle are displaced by that field, exactly
 * like a lathe-cut master where the cut IS the signal. Nothing here can be
 * un-etched — the field only ever accumulates.
 */

export const SIZE = 560;
export const CENTER = SIZE / 2;
export const R_OUTER = 250;
export const R_INNER = 42;
export const TURNS = 9;
export const SAMPLES = 960;

// A single committed note. Once pushed it is never mutated or removed.
export interface EtchedNote {
  t: number; // spiral parameter where the cut head was when it sounded
  midi: number; // snapped pitch
  freq: number;
  vel: number; // 0..1 — etch depth / amplitude
  pressure: number; // 0..1 — MPE/channel-pressure wiggle deepening (0 if absent)
}

/** Deterministic PRNG (mulberry32). No Math.random anywhere in dream code. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED = 0x9e3779b9;

// Consonant scale: C-major pentatonic pitch classes, so any input snaps warm.
const PENTA = [0, 2, 4, 7, 9];

/** MIDI note number → frequency (equal temperament, A4 = 440). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Snap an arbitrary MIDI note to the nearest pentatonic pitch class. */
export function snapToScale(midi: number): number {
  const oct = Math.floor(midi / 12);
  const pc = midi - oct * 12;
  let best = PENTA[0];
  let bestD = 99;
  for (const p of PENTA) {
    const d = Math.abs(p - pc);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return oct * 12 + best;
}

/** The eight fallback keyboard keys → an ascending pentatonic run from C4. */
export const KEY_ROW = ["a", "s", "d", "f", "g", "h", "j", "k"] as const;
const KEY_STEPS = [0, 2, 4, 7, 9, 12, 14, 16];
export function keyToMidi(key: string): number | null {
  const i = KEY_ROW.indexOf(key as (typeof KEY_ROW)[number]);
  if (i === -1) return null;
  return 60 + KEY_STEPS[i]; // C4 base
}

/**
 * A deterministic one-take melody used by the self-demo. Notes are spread
 * across the groove so the whole spiral fills at once, then loops forever.
 */
export function makeSeededTake(): EtchedNote[] {
  const rng = makeRng(SEED);
  const notes: EtchedNote[] = [];
  const COUNT = 22;
  const steps = [0, 2, 4, 7, 9, 12, 7, 4]; // pentatonic contour
  for (let i = 0; i < COUNT; i++) {
    // Notes march inward with a little seeded rubato so it feels performed.
    const base = (i + 0.5) / COUNT;
    const jitter = (rng() - 0.5) * (0.6 / COUNT);
    const t = Math.min(0.995, Math.max(0.005, base + jitter));
    const step = steps[i % steps.length] + (rng() < 0.3 ? 12 : 0);
    const midi = snapToScale(48 + step);
    const vel = 0.4 + rng() * 0.55;
    const pressure = rng() < 0.5 ? rng() * 0.7 : 0;
    notes.push({ t, midi, freq: midiToFreq(midi), vel, pressure });
  }
  notes.sort((a, b) => a.t - b.t);
  return notes;
}

/** Position on the bare spiral at parameter t (no displacement). */
function spiralPoint(t: number): [number, number, number] {
  const angle = t * TURNS * Math.PI * 2;
  const radius = R_OUTER - (R_OUTER - R_INNER) * t;
  return [angle, radius, t];
}

/**
 * Build the accumulated etch-depth field from the committed notes. Each note
 * adds a Gaussian bump (width in t) whose height is its velocity; the field is
 * soft-clamped so dense passages bulge without blowing out.
 */
export function buildEtchField(notes: EtchedNote[]): Float32Array {
  const field = new Float32Array(SAMPLES);
  const sigma = 0.006;
  for (const n of notes) {
    const center = n.t * (SAMPLES - 1);
    const spread = sigma * (SAMPLES - 1);
    const lo = Math.max(0, Math.floor(center - spread * 3));
    const hi = Math.min(SAMPLES - 1, Math.ceil(center + spread * 3));
    for (let i = lo; i <= hi; i++) {
      const d = (i - center) / spread;
      field[i] += n.vel * Math.exp(-d * d);
    }
  }
  // Soft clamp toward 1.
  for (let i = 0; i < SAMPLES; i++) {
    field[i] = 1 - Math.exp(-field[i]);
  }
  return field;
}

/** Global wiggle-depth multiplier when MPE / channel pressure has been seen. */
export function pressureBoost(notes: EtchedNote[]): number {
  let sum = 0;
  for (const n of notes) sum += n.pressure;
  const avg = notes.length ? sum / notes.length : 0;
  return 1 + avg * 1.6;
}

/**
 * Render the groove path up to `progress` (0..1). The displaced radius = bare
 * radius + a DC bulge at etches + a high-frequency wiggle whose amplitude
 * grows where the signal was etched (and deepens under MPE pressure).
 */
export function drawGroovePath(
  field: Float32Array,
  progress: number,
  boost: number,
): string {
  const DC = 7; // outward bulge per unit etch
  const BASE_WIG = 0.9; // quiet groove floor
  const SIG_WIG = 5.5; // signal-driven wiggle
  const WIG_CYCLES = 24; // wiggle frequency along the spiral
  const end = Math.max(0.001, progress);
  const stop = Math.floor(end * (SAMPLES - 1));
  let d = "";
  for (let i = 0; i <= stop; i++) {
    const t = i / (SAMPLES - 1);
    const [angle, radius] = spiralPoint(t);
    const e = field[i];
    const wig = Math.sin(t * TURNS * Math.PI * 2 * WIG_CYCLES);
    const disp = e * DC + wig * (BASE_WIG + e * SIG_WIG * boost);
    const r = radius + disp;
    const x = CENTER + Math.cos(angle) * r;
    const y = CENTER + Math.sin(angle) * r;
    d += (i === 0 ? "M" : "L") + x.toFixed(2) + " " + y.toFixed(2);
  }
  return d;
}

/** Cartesian position of a t on the bare spiral — for placing the playhead. */
export function headPosition(t: number): { x: number; y: number; deg: number } {
  const [angle, radius] = spiralPoint(t);
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
    deg: (angle * 180) / Math.PI,
  };
}
