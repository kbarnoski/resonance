// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — the MOTIF-MEMORY WEAVER.
//
//   A piece with an explicit, growing LIBRARY of motifs. Most future material is
//   NOT invented — it is RECALLED from the library and TRANSFORMED (transpose,
//   invert, retrograde, augment/diminish, fragment, interval-expand/contract,
//   chromatic neighbours). Every transform is Schoenberg's "developing
//   variation" made mechanical (see README). Because transforms COMPOUND, the
//   descendants at minute 8 no longer resemble the seeds from second 0 — the
//   piece is audibly a different piece, yet a late RECAPITULATION recalls an
//   early motif near-original for resolution.
//
//   Dissonance is a first-class, controllable, RESOLVABLE axis: interval
//   expansion and chromatic neighbours push a motif microtonally/chromatically
//   against the sounding drone root; a tension arch steers which transforms are
//   chosen so the piece climbs into genuine tension and then relaxes.
//
//   Fully deterministic: a seeded mulberry32 PRNG (seed 0x2656) drives every
//   choice. No Math.random / Date / performance in here.
// ─────────────────────────────────────────────────────────────────────────────

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

/** One sounding event: pitch is a semitone offset from the tonic (fractional =
 *  microtonal), dur in seconds, dyn 0..1. */
export interface NoteAtom {
  pitch: number;
  dur: number;
  dyn: number;
}

/** A scheduled note in absolute musical seconds. */
export interface ScheduledNote {
  time: number;
  dur: number;
  pitch: number;
  dyn: number;
  motifId: number;
}

export interface Motif {
  id: number;
  parentId: number | null;
  gen: number; // ancestry depth (seed = 0)
  seedFamily: number; // which original seed this descends from
  birth: number; // musical time (s) it enters the library / is first heard
  transform: string; // human label of the transform that made it
  transformKind: TransformKind;
  atoms: NoteAtom[];
  root: number; // harmonic root (semitone offset) it was woven against
  tension: number; // 0..1 dissonance of this motif vs its root
  recur: number; // how many times it has itself been recalled
  meanPitch: number;
  span: number; // total duration in seconds
  isRecap: boolean; // a deliberate recapitulation of an early motif
}

export type TransformKind =
  | "seed"
  | "transpose"
  | "invert"
  | "retrograde"
  | "augment"
  | "diminish"
  | "fragment"
  | "expand"
  | "contract"
  | "chromatic"
  | "recap";

// Consonant interval classes (semitones) measured against the current root.
// Everything NOT near one of these — semitone/tritone/major-7th, and any
// microtonal in-between — reads as tension. We deliberately do NOT snap to a
// consonant lattice; expand/chromatic transforms can leave notes far from here.
const CONSONANT = [0, 3, 4, 5, 7, 8, 9, 12];

/** Dissonance of a pitch (semitone offset) against a root, in [0,1]. */
function dissonanceOf(pitch: number, root: number): number {
  let rel = (pitch - root) % 12;
  if (rel < 0) rel += 12;
  let nearest = 99;
  for (const c of CONSONANT) {
    const d = Math.abs(rel - c);
    if (d < nearest) nearest = d;
  }
  // microtonal beating: distance from the nearest tempered semitone adds bite.
  const micro = Math.abs(rel - Math.round(rel));
  // a semitone away from a consonance ~= 1.0 dissonance; scale + clamp.
  return Math.min(1, nearest / 1.6 + micro * 0.5);
}

function motifTension(atoms: NoteAtom[], root: number): number {
  if (atoms.length === 0) return 0;
  let s = 0;
  for (const a of atoms) s += dissonanceOf(a.pitch, root);
  return s / atoms.length;
}

function meanPitchOf(atoms: NoteAtom[]): number {
  if (atoms.length === 0) return 0;
  let s = 0;
  for (const a of atoms) s += a.pitch;
  return s / atoms.length;
}

function spanOf(atoms: NoteAtom[]): number {
  let s = 0;
  for (const a of atoms) s += a.dur;
  return s;
}

// ── the transforms ──────────────────────────────────────────────────────────
// Each maps a parent atom list → a new atom list. Pure; rng only for tasteful
// variation. Grouped by whether they tend to RAISE or LOWER tension so the
// weaver can steer the arch.

function applyTranspose(atoms: NoteAtom[], n: number): NoteAtom[] {
  return atoms.map((a) => ({ ...a, pitch: a.pitch + n }));
}

function applyInvert(atoms: NoteAtom[]): NoteAtom[] {
  const axis = atoms[0].pitch;
  return atoms.map((a) => ({ ...a, pitch: axis - (a.pitch - axis) }));
}

function applyRetrograde(atoms: NoteAtom[]): NoteAtom[] {
  return atoms.slice().reverse().map((a) => ({ ...a }));
}

function applyAugment(atoms: NoteAtom[], f: number): NoteAtom[] {
  return atoms.map((a) => ({ ...a, dur: a.dur * f }));
}

function applyFragment(atoms: NoteAtom[], rng: () => number): NoteAtom[] {
  if (atoms.length <= 2) return atoms.map((a) => ({ ...a }));
  const head = rng() < 0.5;
  const k = 1 + Math.floor(rng() * (atoms.length - 1));
  const part = head ? atoms.slice(0, k) : atoms.slice(atoms.length - k);
  // repeating a fragment is a classic developing gesture — echo it once.
  const echo = part.map((a) => ({ ...a, dyn: a.dyn * 0.8 }));
  return part.concat(echo).map((a) => ({ ...a }));
}

/** Interval expansion — multiply each interval-from-first by f. f>1 pushes the
 *  contour OUTWARD, off the tempered grid → microtonal tension. */
function applyExpand(atoms: NoteAtom[], f: number): NoteAtom[] {
  const base = atoms[0].pitch;
  return atoms.map((a) => ({ ...a, pitch: base + (a.pitch - base) * f }));
}

/** Chromatic / dissonant neighbours — insert leaning tones a fraction of a
 *  semitone off, guaranteed to bite against the root. */
function applyChromatic(atoms: NoteAtom[], root: number, rng: () => number): NoteAtom[] {
  const out: NoteAtom[] = [];
  for (const a of atoms) {
    // a leaning neighbour that is deliberately dissonant vs the root
    const lean = root + (rng() < 0.5 ? 1 : 6) + (rng() - 0.5) * 0.6;
    out.push({ pitch: lean, dur: a.dur * 0.45, dyn: a.dyn * 0.85 });
    out.push({ ...a });
  }
  return out;
}

interface Candidate {
  kind: TransformKind;
  label: string;
  atoms: NoteAtom[];
}

/** Build a spread of candidate transforms of a parent so the weaver can pick the
 *  one that best steers tension toward its current target. */
function makeCandidates(parent: Motif, root: number, rng: () => number): Candidate[] {
  const a = parent.atoms;
  const c: Candidate[] = [];
  // tension-lowering / neutral
  c.push({ kind: "transpose", label: "transpose +5", atoms: applyTranspose(a, 5) });
  c.push({ kind: "transpose", label: "transpose −7", atoms: applyTranspose(a, -7) });
  c.push({ kind: "retrograde", label: "retrograde", atoms: applyRetrograde(a) });
  c.push({ kind: "augment", label: "augment ×1.5", atoms: applyAugment(a, 1.5) });
  c.push({ kind: "diminish", label: "diminish ×0.66", atoms: applyAugment(a, 0.66) });
  c.push({ kind: "fragment", label: "fragment + echo", atoms: applyFragment(a, rng) });
  c.push({ kind: "contract", label: "intervals ×0.6", atoms: applyExpand(a, 0.6) });
  // tension-raising
  c.push({ kind: "invert", label: "invert", atoms: applyInvert(a) });
  c.push({ kind: "expand", label: "intervals ×1.7", atoms: applyExpand(a, 1.7) });
  c.push({ kind: "expand", label: "intervals ×2.3", atoms: applyExpand(a, 2.3) });
  c.push({ kind: "chromatic", label: "chromatic neighbours", atoms: applyChromatic(a, root, rng) });
  return c;
}

export interface LoomOpts {
  duration?: number; // total musical seconds of development
}

export class Loom {
  readonly duration: number;
  readonly motifs: Motif[] = [];
  readonly notes: ScheduledNote[] = [];
  horizon = 0; // phrases generated up to this musical time
  private rng: () => number;
  private nextId = 0;
  private seedCount = 0;
  private root = 0;
  private tensionBias = 0; // external nudge, −0.4..+0.4
  private recapQueued = false;
  private recapDone = false;

  constructor(opts: LoomOpts = {}) {
    this.duration = opts.duration ?? 480; // 8 minutes
    this.rng = mulberry32(0x2656);
  }

  /** Has the closing recapitulation already been woven? */
  get recapReached() {
    return this.recapDone;
  }

  /** Viewer nudge toward more (+) or less (−) dissonance. */
  setTensionBias(v: number) {
    this.tensionBias = Math.max(-0.45, Math.min(0.45, v));
  }
  getTensionBias() {
    return this.tensionBias;
  }

  /** Viewer asks for a recapitulation now — the next phrase recalls an early
   *  motif near-original. */
  requestRecap() {
    this.recapQueued = true;
  }

  /** The structural tension arch: a slow rise to a late-middle climax, then a
   *  release into the closing recapitulation. Range ~0..1, plus the viewer bias. */
  tensionTarget(t: number): number {
    const x = Math.min(1, Math.max(0, t / this.duration));
    // arch peaking around 0.62, falling to near-zero by the end.
    const arch = Math.sin(Math.min(1, x / 0.62) * Math.PI * 0.5);
    const release = x > 0.62 ? Math.max(0, 1 - (x - 0.62) / 0.32) : 1;
    const base = arch * release;
    return Math.max(0, Math.min(1, base * 0.9 + this.tensionBias));
  }

  /** The drone root schedule — a slow harmonic journey the motifs are woven
   *  against (so chromatic/expanded transforms have something to be tense with). */
  rootAt(t: number): number {
    const x = t / this.duration;
    // a gentle descending-then-returning bass plan, in whole steps.
    const plan = [0, -2, 3, -4, 5, -2, 0];
    const i = Math.min(plan.length - 1, Math.floor(x * plan.length));
    return plan[i];
  }

  /** Generate all phrases with start time < target. Cheap enough to fast-forward
   *  minutes in a single call. Returns nothing; read `motifs`/`notes` after. */
  advanceTo(target: number) {
    const cap = Math.min(target, this.duration);
    while (this.horizon < cap) {
      this.weavePhrase(this.horizon);
    }
  }

  /** Inject a viewer-sketched contour into the library as a fresh seed. */
  plantSeed(contour: number[], atTime: number) {
    if (contour.length === 0) return;
    const root = this.rootAt(atTime);
    const atoms: NoteAtom[] = contour.map((p) => ({
      pitch: p,
      dur: 0.34 + this.rng() * 0.28,
      dyn: 0.6 + this.rng() * 0.3,
    }));
    this.commit(atoms, null, 0, this.seedCount, root, "planted seed", "seed", atTime, false);
    this.seedCount++;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private weavePhrase(t: number) {
    this.root = this.rootAt(t);

    let picked: Motif | null = null;

    const wantRecap =
      (this.recapQueued || (t > this.duration * 0.82 && !this.recapDone)) &&
      this.motifs.length > 3;

    if (wantRecap) {
      // recall the earliest, lowest-generation motif near-original: resolution.
      const early = this.motifs
        .slice()
        .sort((a, b) => a.gen - b.gen || a.birth - b.birth)[0];
      const atoms = applyTranspose(early.atoms, this.root - early.root);
      this.commit(atoms, early.id, early.gen + 1, early.seedFamily, this.root, "recapitulation", "recap", t, true);
      early.recur++;
      this.recapQueued = false;
      if (t > this.duration * 0.82) this.recapDone = true;
      return;
    }

    const seedRoll = this.rng();
    const needSeed = this.motifs.length < 3 || (this.seedCount < 6 && seedRoll < 0.12);

    if (needSeed) {
      const atoms = this.makeSeedAtoms();
      this.commit(atoms, null, 0, this.seedCount, this.root, "new seed", "seed", t, false);
      this.seedCount++;
      return;
    }

    // recall an existing motif — bias toward recent + often-recalled, but keep a
    // long tail so deep-old material can resurface.
    picked = this.recallMotif();
    const target = this.tensionTarget(t);
    const cands = makeCandidates(picked, this.root, this.rng);
    // choose the candidate whose resulting tension is closest to the arch target.
    let best = cands[0];
    let bestErr = Infinity;
    for (const cand of cands) {
      const ten = motifTension(cand.atoms, this.root);
      const err = Math.abs(ten - target) + this.rng() * 0.08; // rng tie-break
      if (err < bestErr) {
        bestErr = err;
        best = cand;
      }
    }
    this.commit(best.atoms, picked.id, picked.gen + 1, picked.seedFamily, this.root, best.label, best.kind, t, false);
    picked.recur++;
  }

  private recallMotif(): Motif {
    // weight = recency + recurrence, with a floor so old motifs never vanish.
    const now = this.horizon;
    let total = 0;
    const weights = this.motifs.map((m) => {
      const age = now - m.birth;
      const recency = 1 / (1 + age * 0.02);
      const w = 0.15 + recency + m.recur * 0.25;
      total += w;
      return w;
    });
    let r = this.rng() * total;
    for (let i = 0; i < this.motifs.length; i++) {
      r -= weights[i];
      if (r <= 0) return this.motifs[i];
    }
    return this.motifs[this.motifs.length - 1];
  }

  private makeSeedAtoms(): NoteAtom[] {
    // short, singable, mostly-consonant germ cells (3–5 notes).
    const scale = [0, 2, 3, 5, 7, 9, 10];
    const n = 3 + Math.floor(this.rng() * 3);
    const atoms: NoteAtom[] = [];
    let idx = 2 + Math.floor(this.rng() * 3);
    for (let i = 0; i < n; i++) {
      idx += Math.floor(this.rng() * 3) - 1;
      idx = Math.max(0, Math.min(scale.length - 1, idx));
      atoms.push({
        pitch: scale[idx],
        dur: 0.3 + this.rng() * 0.35,
        dyn: 0.55 + this.rng() * 0.3,
      });
    }
    return atoms;
  }

  private commit(
    atomsIn: NoteAtom[],
    parentId: number | null,
    gen: number,
    seedFamily: number,
    root: number,
    label: string,
    kind: TransformKind,
    birth: number,
    isRecap: boolean,
  ) {
    // clamp register so nothing runs off the ends of the loom / synth.
    const atoms = atomsIn.map((a) => ({
      pitch: Math.max(-16, Math.min(28, a.pitch)),
      dur: Math.max(0.14, Math.min(1.6, a.dur)),
      dyn: Math.max(0.15, Math.min(1, a.dyn)),
    }));
    const tension = motifTension(atoms, root);
    const span = spanOf(atoms);
    const m: Motif = {
      id: this.nextId++,
      parentId,
      gen,
      seedFamily,
      birth,
      transform: label,
      transformKind: kind,
      atoms,
      root,
      tension,
      recur: 0,
      meanPitch: meanPitchOf(atoms),
      span,
      isRecap,
    };
    this.motifs.push(m);

    // schedule the notes in absolute musical seconds.
    let cursor = birth;
    for (const a of atoms) {
      this.notes.push({ time: cursor, dur: a.dur, pitch: a.pitch, dyn: a.dyn, motifId: m.id });
      cursor += a.dur;
    }
    // phrase = motif span + a breathing rest, so it reads as chamber phrasing.
    const rest = 0.5 + this.rng() * 1.4;
    this.horizon = birth + span + rest;
  }
}
