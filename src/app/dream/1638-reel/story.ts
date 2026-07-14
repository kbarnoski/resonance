// 1638-reel — story.ts
//
// The dramatic-beat-sheet STATE MACHINE that drives everything. This is the
// alternate journey-engine arc requested by the design director (directive #4:
// "cinematic narrative as an alternate arc" vs. Resonance's fixed 6-phase
// psychedelic engine). Instead of a psychedelic curve we walk Freytag's
// Pyramid / the Save-the-Cat beat sheet: a sequence of ACTS, each with a
// target dramatic TENSION (0..1), a KEY + MODE, a tempo/density, and a
// cinematic COLOR GRADE. One smooth tension curve is interpolated between the
// acts and is the SINGLE shared signal read by BOTH the score and the shader,
// so image and music always obey the same dramatic structure.
//
// Fully deterministic: no Math.random / Date. A seeded mulberry32 PRNG powers
// every generative choice; all timing is a seconds clock derived from the
// AudioContext (or a frame counter before audio starts).

export const SEED = 0x1638;

/** Deterministic PRNG (Tommy Ettinger's mulberry32). Seed is a constant. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Scale / mode as semitone offsets across one octave (7- or 8-note). */
export const MODES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  octatonic: [0, 1, 3, 4, 6, 7, 9, 10],
};

/** How the recurring motif is re-voiced per act — this is the MEMORY of the
 *  piece: the shape you hear in Setup returns transformed at the Climax and
 *  finally resolves in the Resolution. */
export type MotifTransform =
  | "plain" // stated cleanly, home register
  | "lift" // up a register, a hopeful pickup
  | "drive" // faster, insistent
  | "stretch" // augmented, brightened
  | "invert" // contour inverted, high + tense (the climax)
  | "descend" // falling register, slowing
  | "resolve"; // very slow, low, lands on the tonic

export interface Beat {
  name: string;
  tStart: number; // seconds from Start
  tension: number; // dramatic tension at the beat's OPENING (0..1)
  root: number; // MIDI root of the act's key
  mode: keyof typeof MODES;
  /** motif notes per second baseline (density scales further with tension). */
  rate: number;
  transform: MotifTransform;
  // cinematic color grade (art layer only): shadow / mid / highlight in 0..1
  shadow: [number, number, number];
  mid: [number, number, number];
  hi: [number, number, number];
  turb: number; // atmospheric turbulence 0..1
  fog: number; // fog density 0..1
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// The beat sheet. Home key is A: it opens the film (Setup) and returns, warm
// and major, to close it (Resolution) — the harmony literally comes home.
export const BEATS: Beat[] = [
  {
    name: "Setup",
    tStart: 0,
    tension: 0.1,
    root: 57, // A3
    mode: "lydian",
    rate: 0.5,
    transform: "plain",
    shadow: hex("#0b1220"),
    mid: hex("#1e3a44"),
    hi: hex("#c7a86a"),
    turb: 0.15,
    fog: 0.55,
  },
  {
    name: "Inciting Incident",
    tStart: 46,
    tension: 0.32,
    root: 54, // F#3
    mode: "dorian",
    rate: 0.7,
    transform: "lift",
    shadow: hex("#10131f"),
    mid: hex("#274050"),
    hi: hex("#d6b477"),
    turb: 0.3,
    fog: 0.5,
  },
  {
    name: "Rising Action",
    tStart: 96,
    tension: 0.55,
    root: 50, // D3
    mode: "aeolian",
    rate: 1.0,
    transform: "drive",
    shadow: hex("#141021"),
    mid: hex("#2a3346"),
    hi: hex("#c99a5a"),
    turb: 0.5,
    fog: 0.42,
  },
  {
    name: "Midpoint",
    tStart: 168,
    tension: 0.62,
    root: 58, // A#3 (a false brightening)
    mode: "lydian",
    rate: 0.85,
    transform: "stretch",
    shadow: hex("#1a1424"),
    mid: hex("#3a2f4a"),
    hi: hex("#e0c07a"),
    turb: 0.42,
    fog: 0.36,
  },
  {
    name: "Climax",
    tStart: 214,
    tension: 0.95,
    root: 48, // C3, darkest
    mode: "phrygian",
    rate: 1.5,
    transform: "invert",
    shadow: hex("#1c0f14"),
    mid: hex("#48222e"),
    hi: hex("#ffd27a"),
    turb: 1.0,
    fog: 0.3,
  },
  {
    name: "Falling Action",
    tStart: 276,
    tension: 0.4,
    root: 55, // G3
    mode: "dorian",
    rate: 0.7,
    transform: "descend",
    shadow: hex("#0f1420"),
    mid: hex("#243a44"),
    hi: hex("#cbb079"),
    turb: 0.4,
    fog: 0.48,
  },
  {
    name: "Resolution",
    tStart: 318,
    tension: 0.08,
    root: 57, // A3 — home again
    mode: "major",
    rate: 0.42,
    transform: "resolve",
    shadow: hex("#0c1a1c"),
    mid: hex("#2c4a4a"),
    hi: hex("#f0d79a"),
    turb: 0.12,
    fog: 0.58,
  },
];

/** Total runtime of the reel in seconds (~5.7 min). */
export const TOTAL = 358;

/** The recurring melodic motif, as scale degrees (0 = tonic, 7 = octave).
 *  A rising gesture that reaches up and settles — memorable enough to be
 *  recognised when it returns transformed. */
export const MOTIF = [0, 4, 3, 5, 7, 4, 2];

export interface StoryState {
  index: number; // active beat index
  beat: Beat;
  progress: number; // 0..1 within the active beat
  overall: number; // 0..1 across the whole reel
  tension: number; // the shared dramatic-tension signal
  shadow: [number, number, number];
  mid: [number, number, number];
  hi: [number, number, number];
  turb: number;
  fog: number;
}

/** Index of the beat active at time t. */
function beatIndexAt(t: number): number {
  let i = 0;
  for (let k = 0; k < BEATS.length; k++) {
    if (t >= BEATS[k].tStart) i = k;
  }
  return i;
}

/** The full evolving state at time t — this is what both engines read. */
export function stateAt(t: number): StoryState {
  const clamped = Math.max(0, Math.min(TOTAL, t));
  const i = beatIndexAt(clamped);
  const cur = BEATS[i];
  const next = BEATS[i + 1];
  const segEnd = next ? next.tStart : TOTAL;
  const segDur = Math.max(0.001, segEnd - cur.tStart);
  const u = (clamped - cur.tStart) / segDur;
  const s = smoothstep(u);

  // Tension eases from this act's opening level toward the next act's opening
  // level, so each act begins at its labelled emotional height. The last act
  // eases gently toward stillness.
  const curT = cur.tension;
  const nextT = next ? next.tension : 0.05;
  let tension = lerp(curT, nextT, s);

  // A slow deterministic undulation — the piece "breathes" without ever
  // touching a wall clock. Amplitude shrinks as the reel resolves.
  const breatheAmp = 0.035 * (0.4 + 0.6 * tension);
  tension += breatheAmp * Math.sin(clamped * 0.7 + Math.sin(clamped * 0.13) * 2.0);
  tension = Math.max(0, Math.min(1, tension));

  // Color grade + atmosphere interpolate act-to-act over the same curve.
  const grade = (a: [number, number, number], b: [number, number, number]) =>
    [lerp(a[0], b[0], s), lerp(a[1], b[1], s), lerp(a[2], b[2], s)] as [
      number,
      number,
      number,
    ];
  const nb = next ?? cur;

  return {
    index: i,
    beat: cur,
    progress: Math.max(0, Math.min(1, u)),
    overall: clamped / TOTAL,
    tension,
    shadow: grade(cur.shadow, nb.shadow),
    mid: grade(cur.mid, nb.mid),
    hi: grade(cur.hi, nb.hi),
    turb: lerp(cur.turb, nb.turb, s),
    fog: lerp(cur.fog, nb.fog, s),
  };
}

export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Map a scale degree (can exceed the octave) to a MIDI note in the given
 *  mode + root. Degrees wrap by octave; negative degrees descend. */
export function degreeToMidi(root: number, mode: number[], degree: number): number {
  const len = mode.length;
  const oct = Math.floor(degree / len);
  let idx = degree % len;
  if (idx < 0) idx += len;
  return root + oct * 12 + mode[idx];
}
