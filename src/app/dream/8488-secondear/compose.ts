// 8488-secondear — phrase genome + seeded candidate generator.
//
// A "phrase" is a short 12-TET melody laid on an eighth-note grid (16 steps =
// 2 bars of 4/4; the bold passage uses 32 = 4 bars). Every phrase is realized
// from a small LATENT of style knobs, then the taste model reads FEATURES off
// the realized notes (see taste.ts). Because candidates span a wide range of
// latents, scoring + top-selection lets proposals drift toward a player's ear.
//
// Determinism only: all randomness flows through a seeded mulberry32 — never
// Math.random — so the self-demo replays identically and Vercel's build is safe.

/** A single scheduled note on the eighth-note grid. */
export interface Note {
  step: number; // grid index [0, steps)
  midi: number; // 12-TET MIDI pitch
}

/** Style knobs a phrase is grown from — deliberately spread by makeLatent. */
export interface Latent {
  register: number; // MIDI of the scale tonic (~48..82)
  density: number; // onset probability 0..1
  sync: number; // 0 = on the beat, 1 = off the beat
  stepSize: number; // mean melodic step magnitude (scale degrees)
  contour: number; // -1 falling .. +1 rising
  diss: number; // 0..1 chance of a chromatic (dissonant) alteration
}

/** A realized, audible phrase. */
export interface Phrase {
  notes: Note[];
  steps: number;
  latent: Latent;
  bold: boolean;
}

/** Seeded PRNG (Tommy Ettinger's mulberry32) — the ONLY source of randomness. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Diatonic ladder (major). Chromatic color is added on top via the diss knob,
// so the language stays tonal-but-flexible without leaving 12-TET.
const SCALE = [0, 2, 4, 5, 7, 9, 11];

function midiOfDegree(tonic: number, degree: number): number {
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return tonic + oct * 12 + SCALE[idx];
}

/** Metric "offbeat-ness" of a grid step: 0 = strong downbeat, 1 = weakest. */
export function metricWeight(step: number): number {
  if (step % 8 === 0) return 0;
  if (step % 4 === 0) return 0.35;
  if (step % 2 === 0) return 0.65;
  return 1;
}

/** Draw a broadly-spread latent so candidate batches cover the taste plane. */
export function makeLatent(rng: () => number): Latent {
  return {
    register: 50 + Math.floor(rng() * 30), // 50..79
    density: 0.28 + rng() * 0.64, // 0.28..0.92
    sync: rng(),
    stepSize: 1 + rng() * 3.4, // 1..4.4
    contour: rng() * 2 - 1, // -1..1
    diss: rng() * 0.6, // 0..0.6
  };
}

/** Grow an audible phrase from a latent. Guarantees at least two notes. */
export function makePhrase(rng: () => number, latent: Latent, steps: number, bold: boolean): Phrase {
  const notes: Note[] = [];
  let degree = 0;
  const span = 9; // clamp the walk so register stays legible

  for (let s = 0; s < steps; s++) {
    const w = metricWeight(s);
    // High sync pushes onsets onto weak steps; low sync onto strong ones.
    const metric = latent.sync * w + (1 - latent.sync) * (1 - w);
    const onset = latent.density * (0.45 + 0.9 * metric);
    if (rng() < onset) {
      const dir = rng() < 0.5 + 0.5 * latent.contour ? 1 : -1;
      const mag = 1 + Math.floor(rng() * latent.stepSize);
      degree += dir * mag;
      if (degree > span) degree = span - Math.floor(rng() * 3);
      if (degree < -span) degree = -span + Math.floor(rng() * 3);
      let midi = midiOfDegree(Math.round(latent.register), degree);
      if (rng() < latent.diss) midi += rng() < 0.5 ? 1 : -1; // chromatic bite
      notes.push({ step: s, midi });
    }
  }

  if (notes.length < 2) {
    const tonic = Math.round(latent.register);
    notes.length = 0;
    notes.push({ step: 0, midi: midiOfDegree(tonic, 0) });
    notes.push({ step: Math.floor(steps / 2), midi: midiOfDegree(tonic, 2) });
  }
  return { notes, steps, latent, bold };
}

/** A seeded batch of diverse candidate phrases for the model to rank. */
export function makeCandidates(rng: () => number, n: number, steps: number, bold: boolean): Phrase[] {
  const out: Phrase[] = [];
  for (let i = 0; i < n; i++) out.push(makePhrase(rng, makeLatent(rng), steps, bold));
  return out;
}
