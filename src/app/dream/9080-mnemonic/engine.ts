// Mnemonic — pure engine for the "memory ribbon".
//
// Determinism rule for this dream: the ONLY randomness is mulberry32.
// Never Math.random, never Date.now / argless new Date(). Timing comes from
// performance.now() / AudioContext.currentTime in the page; this file is pure.

/** mulberry32 — tiny deterministic PRNG. Returns a function in [0, 1). */
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

export type Mode = "major" | "minor";
export type Transform = "transpose" | "invert" | "augment" | "retrograde";

/** A single sounded note inside a phrase. `t` is seconds from phrase start. */
export interface NoteEvent {
  midi: number;
  t: number;
  dur: number;
}

/** A captured phrase — the unit of musical memory. */
export interface Motif {
  id: number;
  events: NoteEvent[];
  key: number; // tonic pitch-class 0..11 (C=0) at capture time
  mode: Mode;
  salience: number;
  /** transform → the development we quoted back, if any. `seq` bumps on each
   *  re-development so the view can restart its draw animation. */
  development?: { transform: Transform; events: NoteEvent[]; seq: number };
}

export const NOTE_NAMES = [
  "C", "C♯", "D", "D♯", "E", "F",
  "F♯", "G", "G♯", "A", "A♯", "B",
] as const;

export function pcName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

// Krumhansl–Kessler tonal-hierarchy profiles (Krumhansl 1990, ch. 2).
// Correlating a chroma vector against the 24 rotations estimates key + mode.
const KS_MAJOR = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KS_MINOR = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

export interface KeyEstimate {
  tonic: number;
  mode: Mode;
  strength: number;
}

/** Krumhansl–Schmuckler key-finding over a 12-bin chroma accumulator. */
export function estimateKey(chroma: number[]): KeyEstimate {
  let best: KeyEstimate = { tonic: 0, mode: "major", strength: -2 };
  const total = chroma.reduce((s, v) => s + v, 0);
  if (total <= 0) return { tonic: 9, mode: "minor", strength: 0 }; // A minor default
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = chroma.map((_, i) => chroma[(i + tonic) % 12]);
    const rMaj = pearson(rotated, KS_MAJOR);
    const rMin = pearson(rotated, KS_MINOR);
    if (rMaj > best.strength) best = { tonic, mode: "major", strength: rMaj };
    if (rMin > best.strength) best = { tonic, mode: "minor", strength: rMin };
  }
  return best;
}

const SCALE: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // natural minor
};

/** Snap a midi note onto the nearest scale degree of (tonic, mode). */
export function quantizeToKey(midi: number, tonic: number, mode: Mode): number {
  const scale = SCALE[mode];
  const rel = midi - tonic;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  let bestPc = scale[0];
  let bestD = 99;
  for (const s of scale) {
    const d = Math.min(Math.abs(s - pc), 12 - Math.abs(s - pc));
    if (d < bestD) {
      bestD = d;
      bestPc = s;
    }
  }
  return tonic + oct * 12 + bestPc;
}

/** Dominant pitch-class of a phrase (its rough tonal centre). */
function phraseCentre(events: NoteEvent[]): number {
  const w = new Array(12).fill(0);
  for (const e of events) w[((e.midi % 12) + 12) % 12] += e.dur;
  let bi = 0;
  for (let i = 1; i < 12; i++) if (w[i] > w[bi]) bi = i;
  return bi;
}

/**
 * The development engine — the answer to the one question.
 * Quote a remembered motif back, transformed, quantized into the live key.
 */
export function developMotif(
  motif: Motif,
  key: number,
  mode: Mode,
  transform: Transform,
): NoteEvent[] {
  const src = motif.events;
  if (src.length === 0) return [];
  const q = (m: number) => quantizeToKey(m, key, mode);

  if (transform === "transpose") {
    // Move the whole phrase so its centre lands on the current tonic.
    const centre = phraseCentre(src);
    let shift = key - centre;
    while (shift > 6) shift -= 12;
    while (shift < -6) shift += 12;
    return src.map((e) => ({ midi: q(e.midi + shift), t: e.t, dur: e.dur }));
  }

  if (transform === "invert") {
    // Mirror every interval around the phrase's first note, then re-key.
    const axis = src[0].midi;
    return src.map((e) => ({ midi: q(2 * axis - e.midi), t: e.t, dur: e.dur }));
  }

  if (transform === "augment") {
    // Stretch time 2× — the idea slowed and made monumental.
    return src.map((e) => ({ midi: q(e.midi), t: e.t * 2, dur: e.dur * 2 }));
  }

  // retrograde — reverse the order in time, keep the durations.
  const rev = [...src].reverse();
  const out: NoteEvent[] = [];
  let t = 0;
  for (const e of rev) {
    out.push({ midi: q(e.midi), t, dur: e.dur });
    t += e.dur;
  }
  return out;
}

/** Salience: how memorable a phrase is. Length + pitch variety + span. */
export function scoreSalience(events: NoteEvent[]): number {
  if (events.length === 0) return 0;
  const pcs = new Set(events.map((e) => ((e.midi % 12) + 12) % 12));
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of events) {
    lo = Math.min(lo, e.midi);
    hi = Math.max(hi, e.midi);
  }
  return events.length + pcs.size * 0.5 + Math.min(hi - lo, 24) / 12;
}

export function transformLabel(t: Transform): string {
  switch (t) {
    case "transpose":
      return "transposed to key";
    case "invert":
      return "inverted";
    case "augment":
      return "augmented ×2";
    case "retrograde":
      return "retrograde";
  }
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
