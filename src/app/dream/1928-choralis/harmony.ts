// Rule-based SATB functional-harmony engine.
//
// Given the singer's snapped melody note (the soprano) it (1) picks a
// functional chord in the current key that CONTAINS that note, weighted by
// classic root-motion / cadence preference, then (2) voice-leads alto, tenor
// and bass underneath by an exhaustive small search minimizing motion while
// penalizing parallel 5ths/8ves, spacing/overlap faults, incomplete chords and
// unresolved leading-tones / chordal 7ths.
//
// This deliberately implements the "bare vocal melody -> coherent multi-part
// harmony" idea of the AI Harmonizer (NIME 2025, arXiv:2506.18143) with a small
// symbolic rule set instead of a learned model. No ML, no network.

export type Mode = "major" | "minor";

export interface ChordDef {
  roman: string;
  /** Absolute root pitch class 0..11. */
  rootPc: number;
  /** Absolute pitch classes in the chord. */
  pcs: number[];
  /** True for V7 / V7-of-V — its 4th degree (the chordal 7th) wants to fall. */
  isSeventh: boolean;
  /** Functional category, drives the progression table. */
  fn: Fn;
}

type Fn = "T" | "SUPER" | "MED" | "SUB" | "DOM" | "SUBMED" | "LEAD" | "SECV";

export interface Voicing {
  s: number;
  a: number;
  t: number;
  b: number;
}

export interface HarmonyEvent {
  chord: ChordDef;
  voicing: Voicing;
  /** Tonic pitch class of the key this event was written in. */
  tonicPc: number;
  mode: Mode;
  time: number;
}

const mod12 = (n: number) => ((n % 12) + 12) % 12;

// Voice comfort ranges (MIDI). Bass floor is generous so low singers still fit.
const RANGE = {
  a: [52, 74],
  t: [45, 67],
  b: [36, 62],
} as const;

const MAJOR_CHORDS: Array<Omit<ChordDef, "rootPc" | "pcs"> & { off: number[]; root: number }> = [
  { roman: "I", root: 0, off: [0, 4, 7], isSeventh: false, fn: "T" },
  { roman: "ii", root: 2, off: [2, 5, 9], isSeventh: false, fn: "SUPER" },
  { roman: "iii", root: 4, off: [4, 7, 11], isSeventh: false, fn: "MED" },
  { roman: "IV", root: 5, off: [5, 9, 0], isSeventh: false, fn: "SUB" },
  { roman: "V", root: 7, off: [7, 11, 2], isSeventh: false, fn: "DOM" },
  { roman: "V7", root: 7, off: [7, 11, 2, 5], isSeventh: true, fn: "DOM" },
  { roman: "vi", root: 9, off: [9, 0, 4], isSeventh: false, fn: "SUBMED" },
  { roman: "viio", root: 11, off: [11, 2, 5], isSeventh: false, fn: "LEAD" },
  { roman: "V/V", root: 2, off: [2, 6, 9], isSeventh: false, fn: "SECV" },
  { roman: "V7/V", root: 2, off: [2, 6, 9, 0], isSeventh: true, fn: "SECV" },
];

// Natural minor with a raised 7th (harmonic minor) so the dominant is major.
const MINOR_CHORDS: Array<Omit<ChordDef, "rootPc" | "pcs"> & { off: number[]; root: number }> = [
  { roman: "i", root: 0, off: [0, 3, 7], isSeventh: false, fn: "T" },
  { roman: "iio", root: 2, off: [2, 5, 8], isSeventh: false, fn: "SUPER" },
  { roman: "III", root: 3, off: [3, 7, 10], isSeventh: false, fn: "MED" },
  { roman: "iv", root: 5, off: [5, 8, 0], isSeventh: false, fn: "SUB" },
  { roman: "V", root: 7, off: [7, 11, 2], isSeventh: false, fn: "DOM" },
  { roman: "V7", root: 7, off: [7, 11, 2, 5], isSeventh: true, fn: "DOM" },
  { roman: "VI", root: 8, off: [8, 0, 3], isSeventh: false, fn: "SUBMED" },
  { roman: "viio", root: 11, off: [11, 2, 5], isSeventh: false, fn: "LEAD" },
  { roman: "V/V", root: 2, off: [2, 6, 9], isSeventh: false, fn: "SECV" },
];

export function buildChords(tonicPc: number, mode: Mode): ChordDef[] {
  const src = mode === "major" ? MAJOR_CHORDS : MINOR_CHORDS;
  return src.map((c) => ({
    roman: c.roman,
    isSeventh: c.isSeventh,
    fn: c.fn,
    rootPc: mod12(tonicPc + c.root),
    pcs: c.off.map((o) => mod12(tonicPc + o)),
  }));
}

// Scale used to snap the sung pitch. Minor accepts both 6ths/7ths so the melody
// can borrow the natural or raised form without fighting the singer.
export function scalePcs(tonicPc: number, mode: Mode): number[] {
  const off =
    mode === "major"
      ? [0, 2, 4, 5, 7, 9, 11]
      : [0, 2, 3, 5, 7, 8, 10, 11];
  return off.map((o) => mod12(tonicPc + o));
}

/** Snap a (fractional) MIDI value to the nearest in-key pitch, same octave feel. */
export function snapToScale(midi: number, tonicPc: number, mode: Mode): number {
  const scale = scalePcs(tonicPc, mode);
  let best = midi;
  let bestDist = Infinity;
  // Check the nearest chromatic candidates in a +/- 2 semitone window.
  for (let cand = Math.round(midi) - 2; cand <= Math.round(midi) + 2; cand++) {
    if (scale.includes(mod12(cand))) {
      const dist = Math.abs(cand - midi);
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
  }
  return best;
}

// ---- progression preference ----------------------------------------------

const PROG: Record<Fn, Partial<Record<Fn, number>>> = {
  T: { SUB: 2, DOM: 2, SUPER: 2, SUBMED: 1, SECV: 1.5, MED: 1 },
  SUPER: { DOM: 3, LEAD: 1 },
  MED: { SUBMED: 2, SUB: 1 },
  SUB: { DOM: 3, T: 2, SUPER: 1 },
  DOM: { T: 4, SUBMED: 2 },
  SUBMED: { SUPER: 2, SUB: 2, DOM: 1 },
  LEAD: { T: 3 },
  SECV: { DOM: 4 },
};

function progressionBonus(prev: Fn | null, next: Fn): number {
  if (prev === null) return 0;
  return PROG[prev]?.[next] ?? -0.5;
}

// ---- voicing search --------------------------------------------------------

interface VoiceContext {
  tonicPc: number;
  prevDominant: boolean;
  /** Voice that held the leading tone last event, if the chord was dominant. */
  ltVoice: keyof Voicing | null;
  /** Voice that held the chordal 7th last event (V7). */
  seventhVoice: keyof Voicing | null;
}

function pc(m: number) {
  return mod12(m);
}

// Detect a parallel perfect 5th / octave between two voices across two chords.
function isParallelPerfect(
  p1: number,
  p2: number,
  n1: number,
  n2: number
): boolean {
  const prevInt = mod12(p1 - p2);
  const nextInt = mod12(n1 - n2);
  const isPerfect = (i: number) => i === 0 || i === 7;
  if (!isPerfect(prevInt) || !isPerfect(nextInt)) return false;
  if (prevInt !== nextInt) return false;
  // Genuine parallel motion only: both voices actually move, same direction.
  const d1 = n1 - p1;
  const d2 = n2 - p2;
  if (d1 === 0 || d2 === 0) return false;
  return Math.sign(d1) === Math.sign(d2);
}

function scoreVoicing(
  v: Voicing,
  chord: ChordDef,
  prev: Voicing | null,
  ctx: VoiceContext,
  bassIsRoot: boolean
): number {
  let cost = 0;

  // Motion from the previous voicing (soprano is the singer's, not costed).
  if (prev) {
    cost += Math.abs(v.a - prev.a) + Math.abs(v.t - prev.t) + Math.abs(v.b - prev.b);
  }

  // Inversion: root position preferred.
  if (!bassIsRoot) cost += 3.5;

  // Ordering / overlap must hold: s >= a >= t >= b.
  if (!(v.s >= v.a && v.a >= v.t && v.t >= v.b)) cost += 60;

  // Spacing: adjacent upper voices within an octave.
  const sa = v.s - v.a;
  const at = v.a - v.t;
  if (sa > 12) cost += (sa - 12) * 1.5;
  if (at > 12) cost += (at - 12) * 1.5;
  if (sa < 0) cost += 40;
  if (at < 0) cost += 40;

  // Ranges.
  if (v.a < RANGE.a[0] || v.a > RANGE.a[1]) cost += 5;
  if (v.t < RANGE.t[0] || v.t > RANGE.t[1]) cost += 5;
  if (v.b < RANGE.b[0] || v.b > RANGE.b[1]) cost += 5;

  // Completeness. Triads need root/3rd/5th; 7ths need root/3rd/7th (5th may drop).
  const present = new Set([pc(v.s), pc(v.a), pc(v.t), pc(v.b)]);
  const required = chord.isSeventh ? chord.pcs.filter((_, i) => i !== 2) : chord.pcs;
  for (const need of required) if (!present.has(need)) cost += 22;

  // Doubling: prefer doubling the root; never double the leading tone; avoid
  // doubling the chordal 7th.
  const counts = new Map<number, number>();
  for (const m of [v.s, v.a, v.t, v.b]) counts.set(pc(m), (counts.get(pc(m)) ?? 0) + 1);
  const ltPc = mod12(ctx.tonicPc + 11);
  const seventhPc = chord.isSeventh ? chord.pcs[3] : -1;
  const thirdPc = chord.pcs[1];
  for (const [p, c] of counts) {
    if (c >= 2) {
      if (p === chord.rootPc) cost += 0; // ideal
      else if (p === ltPc) cost += 8;
      else if (p === seventhPc) cost += 8;
      else if (p === thirdPc) cost += 3;
      else cost += 1;
    }
  }

  // Parallel perfect 5ths / octaves against the previous chord.
  if (prev) {
    const voices: Array<keyof Voicing> = ["s", "a", "t", "b"];
    for (let i = 0; i < voices.length; i++) {
      for (let j = i + 1; j < voices.length; j++) {
        if (
          isParallelPerfect(prev[voices[i]], prev[voices[j]], v[voices[i]], v[voices[j]])
        ) {
          cost += 6;
        }
      }
    }
  }

  // Resolution of tendency tones from a preceding dominant.
  if (prev && ctx.prevDominant) {
    if (ctx.ltVoice && ctx.ltVoice !== "s") {
      // Leading tone should rise a step to the tonic (esp. in an outer voice).
      const from = prev[ctx.ltVoice];
      const to = v[ctx.ltVoice];
      const tonicUp = to - from === 1;
      if (!tonicUp) cost += ctx.ltVoice === "b" ? 5 : 3;
    }
    if (ctx.seventhVoice && ctx.seventhVoice !== "s") {
      const from = prev[ctx.seventhVoice];
      const to = v[ctx.seventhVoice];
      const fell = from - to === 1 || from - to === 2;
      if (!fell) cost += 4;
    }
  }

  return cost;
}

function bestVoicing(
  chord: ChordDef,
  soprano: number,
  prev: Voicing | null,
  ctx: VoiceContext
): Voicing {
  // Bass pitch-class candidates: root (root position) and 3rd (first inversion).
  const bassPcs: Array<{ p: number; isRoot: boolean }> = [
    { p: chord.rootPc, isRoot: true },
    { p: chord.pcs[1], isRoot: false },
  ];

  const chordSet = new Set(chord.pcs);
  // Pool of chord-tone MIDI values available for the inner voices.
  const pool: number[] = [];
  for (let m = RANGE.t[0] - 2; m <= soprano; m++) {
    if (chordSet.has(pc(m))) pool.push(m);
  }

  let best: Voicing | null = null;
  let bestCost = Infinity;

  for (const bp of bassPcs) {
    // Bass octave: closest to previous bass (or a default) within range & below.
    for (let m = RANGE.b[0]; m <= Math.min(RANGE.b[1], soprano - 5); m++) {
      if (pc(m) !== bp.p) continue;
      const b = m;
      for (let ti = 0; ti < pool.length; ti++) {
        const t = pool[ti];
        if (t < b) continue;
        for (let ai = 0; ai < pool.length; ai++) {
          const a = pool[ai];
          if (a < t || a > soprano) continue;
          const v: Voicing = { s: soprano, a, t, b };
          const cost = scoreVoicing(v, chord, prev, ctx, bp.isRoot);
          if (cost < bestCost) {
            bestCost = cost;
            best = v;
          }
        }
      }
    }
  }

  // Guaranteed fallback if the search found nothing usable (extreme soprano).
  if (!best) {
    const b = Math.max(RANGE.b[0], soprano - 19);
    const t = Math.max(b, soprano - 12);
    const a = Math.max(t, soprano - 5);
    best = { s: soprano, a, t, b };
  }
  return best;
}

// ---- top-level harmonizer --------------------------------------------------

export interface HarmonizeInput {
  /** Soprano MIDI (already snapped to the key). */
  soprano: number;
  tonicPc: number;
  mode: Mode;
  prev: HarmonyEvent | null;
  /** Position in the current 8-chord phrase, drives cadence bias. */
  phrasePos: number;
}

export interface HarmonizeResult {
  chord: ChordDef;
  voicing: Voicing;
  /** True when this event is a cadential goal (used for optional modulation). */
  isCadence: boolean;
}

export function harmonize(input: HarmonizeInput): HarmonizeResult {
  const { soprano, tonicPc, mode, prev, phrasePos } = input;
  const chords = buildChords(tonicPc, mode);
  const sopPc = pc(soprano);

  // Candidate chords must contain the sung note.
  const candidates = chords.filter((c) => c.pcs.includes(sopPc));
  const prevFn = prev ? prev.chord.fn : null;

  // Cadence shaping across an 8-chord phrase: lean to the dominant just before
  // the barline, then home to tonic on it.
  const wantDominant = phrasePos === 6;
  const wantTonic = phrasePos === 7;

  let bestChord = candidates[0] ?? chords[0];
  let bestChordScore = -Infinity;
  for (const c of candidates) {
    let s = progressionBonus(prevFn, c.fn);
    // Open on a stable tonic when there is no prior context.
    if (prev === null && c.fn === "T") s += 1.2;
    // Prefer sung note as chord root or fifth (stable) slightly.
    if (sopPc === c.rootPc) s += 0.6;
    // Discourage immediately repeating the same chord unless nothing else fits.
    if (prev && c.roman === prev.chord.roman) s -= 0.6;
    // Seventh chords add color but shouldn't dominate.
    if (c.isSeventh) s -= 0.3;
    if (wantDominant && (c.fn === "DOM" || c.fn === "SECV")) s += 3;
    if (wantTonic && c.fn === "T") s += 4;
    // Deceptive resolution allowed but the true cadence is stronger.
    if (wantTonic && c.fn === "SUBMED" && prevFn === "DOM") s += 1;
    if (s > bestChordScore) {
      bestChordScore = s;
      bestChord = c;
    }
  }

  const ltPc = mod12(tonicPc + 11);
  const ctx: VoiceContext = {
    tonicPc,
    prevDominant: prev ? prev.chord.fn === "DOM" : false,
    ltVoice: null,
    seventhVoice: null,
  };
  if (prev && prev.chord.fn === "DOM") {
    const voices: Array<keyof Voicing> = ["s", "a", "t", "b"];
    for (const vk of voices) {
      if (pc(prev.voicing[vk]) === ltPc) ctx.ltVoice = vk;
      if (prev.chord.isSeventh && pc(prev.voicing[vk]) === prev.chord.pcs[3])
        ctx.seventhVoice = vk;
    }
  }

  const voicing = bestVoicing(bestChord, soprano, prev ? prev.voicing : null, ctx);
  const isCadence = wantTonic && bestChord.fn === "T" && prevFn === "DOM";
  return { chord: bestChord, voicing, isCadence };
}

/** Human-readable key name, e.g. "G major". */
export function keyName(tonicPc: number, mode: Mode): string {
  const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  return `${names[mod12(tonicPc)]} ${mode}`;
}
