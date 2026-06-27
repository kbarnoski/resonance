// engine.ts — the composer. Given a target tension ARC, it greedily/
// beam-searches harmony so that the music's measured Spiral-Array tension
// tracks the target curve over a 4-5 minute, stateful piece.
//
// Inspiration: Herremans & Chew, "MorpheuS" (IEEE Trans. Affective
// Computing) — tension-guided generation.

import {
  Vec3,
  computeTension,
  keyCenterOfEffect,
  TensionBreakdown,
} from "./spiral";

// ── seeded PRNG (mulberry32) so a given arc+key reproduces ───────────────
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

export const DEFAULT_SEED = 0x7e551042 >>> 0; // documented seed ("TENSI..")

// ── arc shapes — target tension(t) for normalised time t in [0,1] ────────
export type ArcId =
  | "arch"
  | "build-drop"
  | "double-wave"
  | "ritual-rise"
  | "calm-plateau";

export interface ArcDef {
  id: ArcId;
  label: string;
  hint: string;
  fn: (t: number) => number; // -> target tension 0..1
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const ARCS: ArcDef[] = [
  {
    id: "arch",
    label: "Slow Arch",
    hint: "rise to a single peak, then settle",
    fn: (t) => clamp01(0.12 + 0.8 * Math.sin(Math.PI * t)),
  },
  {
    id: "build-drop",
    label: "Build & Drop",
    hint: "long climb, sudden release",
    fn: (t) => {
      const climb = 0.15 + 0.78 * Math.pow(t / 0.82, 1.4);
      if (t < 0.82) return clamp01(climb);
      // sharp drop after the apex
      const k = (t - 0.82) / 0.18;
      return clamp01(0.93 - 0.78 * k);
    },
  },
  {
    id: "double-wave",
    label: "Double Wave",
    hint: "two swells, the second taller",
    fn: (t) => {
      // two raised-cosine swells; the envelope grows with t so the
      // second crest is taller than the first.
      const swells = 0.5 - 0.5 * Math.cos(4 * Math.PI * t);
      const envelope = 0.4 + 0.5 * t;
      return clamp01(0.16 + 0.78 * swells * envelope);
    },
  },
  {
    id: "ritual-rise",
    label: "Ritual Rise",
    hint: "stepped, terraced climb that never falls",
    fn: (t) => {
      const steps = 5;
      const s = Math.floor(t * steps) / steps;
      const within = (t * steps) % 1;
      return clamp01(0.1 + 0.82 * (s + within / steps) + 0.04 * within);
    },
  },
  {
    id: "calm-plateau",
    label: "Calm Plateau",
    hint: "gentle low rest with a soft mid lift",
    fn: (t) => clamp01(0.16 + 0.22 * (0.5 - 0.5 * Math.cos(2 * Math.PI * t))),
  },
];

export function arcById(id: ArcId): ArcDef {
  return ARCS.find((a) => a.id === id) ?? ARCS[0];
}

// ── chord vocabulary ─────────────────────────────────────────────────────
// A candidate is built relative to the *current* key. Pitch classes are
// absolute (0..11). roman = display label.
export interface ChordTemplate {
  roman: string;
  // semitone offsets from the current tonic
  offsets: number[];
  // a quality string for naming
  quality: string;
  // root offset from tonic (for naming the chord letter)
  rootOffset: number;
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

export function noteName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

// Build the candidate templates for a given mode (major/minor). Includes
// diatonic triads/7ths plus a chromatic palette: secondary dominants,
// Neapolitan 6, German aug6, dim7, tritone substitution, modal mixture.
function templatesFor(minor: boolean): ChordTemplate[] {
  const t: ChordTemplate[] = [];
  if (!minor) {
    // diatonic triads in major
    t.push({ roman: "I", offsets: [0, 4, 7], quality: "", rootOffset: 0 });
    t.push({ roman: "ii", offsets: [2, 5, 9], quality: "m", rootOffset: 2 });
    t.push({ roman: "iii", offsets: [4, 7, 11], quality: "m", rootOffset: 4 });
    t.push({ roman: "IV", offsets: [5, 9, 0], quality: "", rootOffset: 5 });
    t.push({ roman: "V", offsets: [7, 11, 2], quality: "", rootOffset: 7 });
    t.push({ roman: "V7", offsets: [7, 11, 2, 5], quality: "7", rootOffset: 7 });
    t.push({ roman: "vi", offsets: [9, 0, 4], quality: "m", rootOffset: 9 });
    t.push({
      roman: "IM7",
      offsets: [0, 4, 7, 11],
      quality: "maj7",
      rootOffset: 0,
    });
    t.push({
      roman: "ii7",
      offsets: [2, 5, 9, 0],
      quality: "m7",
      rootOffset: 2,
    });
  } else {
    // diatonic triads/7ths in (harmonic) minor
    t.push({ roman: "i", offsets: [0, 3, 7], quality: "m", rootOffset: 0 });
    t.push({
      roman: "iio",
      offsets: [2, 5, 8],
      quality: "dim",
      rootOffset: 2,
    });
    t.push({ roman: "III", offsets: [3, 7, 10], quality: "", rootOffset: 3 });
    t.push({ roman: "iv", offsets: [5, 8, 0], quality: "m", rootOffset: 5 });
    t.push({ roman: "V", offsets: [7, 11, 2], quality: "", rootOffset: 7 });
    t.push({ roman: "V7", offsets: [7, 11, 2, 5], quality: "7", rootOffset: 7 });
    t.push({ roman: "VI", offsets: [8, 0, 3], quality: "", rootOffset: 8 });
    t.push({
      roman: "i7",
      offsets: [0, 3, 7, 10],
      quality: "m7",
      rootOffset: 0,
    });
  }
  // chromatic palette (shared) — these add tension reach
  t.push({
    roman: "N6",
    offsets: [1, 5, 8],
    quality: " (Neap.)",
    rootOffset: 1,
  }); // Neapolitan
  t.push({
    roman: "Ger+6",
    offsets: [8, 0, 3, 6],
    quality: " (Ger+6)",
    rootOffset: 8,
  }); // German aug6
  t.push({
    roman: "viio7",
    offsets: [11, 2, 5, 8],
    quality: "dim7",
    rootOffset: 11,
  }); // fully dim7
  t.push({
    roman: "V7/V",
    offsets: [2, 6, 9, 0],
    quality: "7 (of V)",
    rootOffset: 2,
  }); // secondary dom of V
  t.push({
    roman: "V7/vi",
    offsets: [4, 8, 11, 2],
    quality: "7 (of vi)",
    rootOffset: 4,
  }); // secondary dom of vi
  t.push({
    roman: "subV7",
    offsets: [1, 5, 8, 11],
    quality: "7 (tritone sub)",
    rootOffset: 1,
  }); // tritone substitution
  t.push({
    roman: "bVI",
    offsets: [8, 0, 3],
    quality: " (mix)",
    rootOffset: 8,
  }); // modal mixture
  t.push({
    roman: "iv(mix)",
    offsets: [5, 8, 0],
    quality: "m (mix)",
    rootOffset: 5,
  }); // borrowed minor iv
  return t;
}

export interface PlacedChord {
  index: number; // chord position in the sequence
  tNorm: number; // normalised time 0..1 at chord onset
  pcs: number[]; // absolute pitch classes voiced
  rootPc: number;
  bassPc: number;
  name: string; // e.g. "Ab7 (Ger+6)"
  roman: string;
  keyTonic: number;
  keyMinor: boolean;
  target: number; // target tension at this step
  achieved: TensionBreakdown; // realised tension breakdown
  why: string; // "tensile strain +0.18 toward target"
  modulated: boolean;
}

export interface EngineConfig {
  arc: ArcId;
  keyTonic: number; // 0..11
  keyMinor: boolean;
  totalChords: number; // number of chord steps across the piece
  beam: number; // beam width (1 = greedy)
  seed: number;
}

interface CandidateScore {
  tpl: ChordTemplate;
  pcs: number[];
  rootPc: number;
  breakdown: TensionBreakdown;
  cost: number;
}

// voice-leading smoothness: average minimal pc distance between two
// chords' pitch-class sets (lower = smoother).
function voiceLeadingCost(prev: number[] | null, next: number[]): number {
  if (!prev) return 0;
  let sum = 0;
  for (const n of next) {
    let best = 12;
    for (const p of prev) {
      let d = Math.abs(n - p) % 12;
      if (d > 6) d = 12 - d;
      if (d < best) best = d;
    }
    sum += best;
  }
  return sum / next.length / 6; // normalise ~0..1
}

const WEIGHT_TENSION = 1.0; // primary: hit the target tension
const WEIGHT_VL = 0.22; // secondary: connect smoothly
const WEIGHT_REPEAT = 0.15; // discourage repeating the exact same chord

// The candidate vocabulary realises tension in a band of roughly
// [0.22, 0.70] on the blended 0..1 scale (a single key + this chord set
// can't reach the theoretical 1.0 — that needs piled-up chromaticism we
// avoid for musicality). So we map the arc's full [0,1] *shape* into the
// engine's reachable band before scoring; this keeps the drawn arc and
// the achieved ribbon on the same scale, so "the ribbon hugs the guide"
// is an honest claim. Documented in the README.
export const REACHABLE_LO = 0.22;
export const REACHABLE_HI = 0.7;
function mapToReachable(arcValue: number): number {
  return REACHABLE_LO + (REACHABLE_HI - REACHABLE_LO) * arcValue;
}

export class JourneyEngine {
  readonly cfg: EngineConfig;
  private rng: () => number;
  private arcFn: (t: number) => number;
  keyTonic: number;
  keyMinor: boolean;
  private keyCE: Vec3;
  private prevCE: Vec3 | null = null;
  private prevPcs: number[] | null = null;
  private prevRoman = "";
  private step = 0;
  chords: PlacedChord[] = [];

  constructor(cfg: EngineConfig) {
    this.cfg = cfg;
    this.rng = mulberry32(cfg.seed);
    this.arcFn = arcById(cfg.arc).fn;
    this.keyTonic = cfg.keyTonic;
    this.keyMinor = cfg.keyMinor;
    this.keyCE = keyCenterOfEffect(this.keyTonic, this.keyMinor);
  }

  get done(): boolean {
    return this.step >= this.cfg.totalChords;
  }

  get progress(): number {
    return this.step / this.cfg.totalChords;
  }

  // Build absolute pitch classes for a template under the current key.
  private pcsFor(tpl: ChordTemplate): number[] {
    return tpl.offsets.map((o) => (this.keyTonic + o) % 12);
  }

  // Decide whether to modulate at this step. Long-form state: roughly
  // every ~18% of the piece we may pivot to a related key, keeping
  // minute 5 != minute 1. Deterministic via seeded rng.
  private maybeModulate(tNorm: number): boolean {
    // never modulate in the first or last ~8%
    if (tNorm < 0.08 || tNorm > 0.92) return false;
    // gate on phrase boundaries (every 8 chords) + probability
    if (this.step % 8 !== 0) return false;
    return this.rng() < 0.55;
  }

  private applyModulation(): void {
    // pivot by a fifth up or down, occasionally flip mode — all seeded.
    const r = this.rng();
    if (r < 0.45) this.keyTonic = (this.keyTonic + 7) % 12; // up a fifth
    else if (r < 0.8) this.keyTonic = (this.keyTonic + 5) % 12; // down a fifth
    else this.keyMinor = !this.keyMinor; // relative-ish mode flip
    if (this.rng() < 0.22) this.keyMinor = !this.keyMinor;
    this.keyCE = keyCenterOfEffect(this.keyTonic, this.keyMinor);
  }

  // Plan the next chord. Returns the PlacedChord (also appended to
  // this.chords). Returns null when the piece is complete.
  next(): PlacedChord | null {
    if (this.done) return null;
    const tNorm = this.step / Math.max(1, this.cfg.totalChords - 1);
    const target = mapToReachable(this.arcFn(tNorm));

    let modulated = false;
    if (this.maybeModulate(tNorm)) {
      this.applyModulation();
      modulated = true;
    }

    const templates = templatesFor(this.keyMinor);
    // beam: we evaluate all candidates and keep the best (beam>1 keeps a
    // shortlist and breaks ties with a tiny seeded jitter for variety).
    const scored: CandidateScore[] = templates.map((tpl) => {
      const pcs = this.pcsFor(tpl);
      const breakdown = computeTension(pcs, this.keyCE, this.prevCE);
      const tensionErr = Math.abs(breakdown.tension - target);
      const vl = voiceLeadingCost(this.prevPcs, pcs);
      const repeat = tpl.roman === this.prevRoman ? WEIGHT_REPEAT : 0;
      const cost =
        tensionErr * WEIGHT_TENSION + vl * WEIGHT_VL + repeat;
      return { tpl, pcs, rootPc: pcs[0], breakdown, cost };
    });
    scored.sort((a, b) => a.cost - b.cost);

    // beam: pick among the top-`beam` with a small seeded preference for
    // the very best — gives variety without abandoning the target.
    const beam = Math.max(1, Math.min(this.cfg.beam, scored.length));
    let pick = scored[0];
    if (beam > 1) {
      const r = this.rng();
      // 70% best, else sample the shortlist
      if (r > 0.7) {
        const idx = 1 + Math.floor(this.rng() * (beam - 1));
        pick = scored[Math.min(idx, scored.length - 1)];
      }
    }

    // Build the "why" tag: which measure moved most toward target.
    const why = this.explain(pick.breakdown, target);

    const bassPc = pick.rootPc; // root in the bass
    const placed: PlacedChord = {
      index: this.step,
      tNorm,
      pcs: pick.pcs,
      rootPc: pick.rootPc,
      bassPc,
      name: `${noteName(pick.rootPc)}${pick.tpl.quality}`,
      roman: pick.tpl.roman,
      keyTonic: this.keyTonic,
      keyMinor: this.keyMinor,
      target,
      achieved: pick.breakdown,
      why,
      modulated,
    };
    this.chords.push(placed);

    this.prevCE = pick.breakdown.ce;
    this.prevPcs = pick.pcs;
    this.prevRoman = pick.tpl.roman;
    this.step++;
    return placed;
  }

  private explain(b: TensionBreakdown, target: number): string {
    // Report the dominant contributor and the signed move toward target.
    const parts: Array<[string, number]> = [
      ["cloud diameter", b.diameter],
      ["cloud momentum", b.momentum],
      ["tensile strain", b.strain],
    ];
    parts.sort((a, c) => c[1] - a[1]);
    const [name, val] = parts[0];
    const delta = b.tension - target;
    const sign = delta >= 0 ? "+" : "";
    const dir =
      Math.abs(delta) < 0.05
        ? "on target"
        : delta > 0
          ? "slightly over"
          : "slightly under";
    return `${name} ${val.toFixed(2)} · tension ${sign}${delta.toFixed(2)} (${dir})`;
  }

  // Plan the entire piece up front (used to draw the achieved ribbon and
  // to feed the scheduler). Deterministic.
  planAll(): PlacedChord[] {
    while (!this.done) this.next();
    return this.chords;
  }
}

// Sample the target arc densely for drawing the guide curve. Mapped into
// the same reachable tension band the engine scores against, so the drawn
// guide and the achieved ribbon share one scale.
export function sampleArc(id: ArcId, samples: number): number[] {
  const fn = arcById(id).fn;
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    out.push(mapToReachable(fn(i / (samples - 1))));
  }
  return out;
}
