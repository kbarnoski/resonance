/**
 * model.ts — the symbolic edit-op engine for "Redlines".
 *
 * Inspired by *BeatEdit: Symbolic Music Generation as Explicit Editing*
 * (arXiv:2607.11124, July 2026), which recasts music generation as producing
 * new content by EDITING a draft rather than synthesizing from scratch. Here we
 * embody/invert that: a human and a rule-based agent take turns applying
 * discrete edit operations (transpose, delete, insert, invert, nudge, stretch)
 * to a single shared symbolic loop. The audible piece is the current draft; the
 * score shows the running DIFF between the two composers' rewrites.
 *
 * This module is pure logic — no audio, no DOM. Deterministic: a seeded
 * mulberry32 PRNG only (no Math.random, no Date, no clock).
 */

export type Owner = "seed" | "you" | "agent";

export interface Note {
  id: number;
  step: number; // onset, 0 .. STEPS-1
  deg: number; // diatonic degree, 0 .. DEG_MAX
  dur: number; // length in steps, >= 1
  by: Owner; // who last authored this note
  addedAt: number; // performance.now() when created/edited (drives diff glow)
}

/** A recently-removed note, kept briefly so the score can strike it through. */
export interface Ghost {
  id: number;
  step: number;
  deg: number;
  dur: number;
  by: Owner;
  removedAt: number;
}

export interface EditResult {
  notes: Note[];
  removed: Ghost[]; // pre-images to render as struck-through ghosts
  added: Note[]; // post-images to render with the violet "added" glow
  op: string; // short human label for the ledger
  by: Owner;
}

export interface EditCtx {
  by: Owner;
  now: number; // performance.now()
  alloc: () => number; // fresh unique note id
}

// ---- musical grid ---------------------------------------------------------

export const STEPS = 16; // one loop = two bars of eighth notes
export const BAR = STEPS / 2; // bar A = 0..7, bar B = 8..15
export const DEG_MIN = 0;
export const DEG_MAX = 14; // two diatonic octaves (15 rows)

const MAJOR = [0, 2, 4, 5, 7, 9, 11]; // C-major step pattern
const BASE_MIDI = 55; // degree 0 -> G3

/** Diatonic degree (0..DEG_MAX) -> MIDI note number. */
export function degreeToMidi(deg: number): number {
  const oct = Math.floor(deg / 7);
  const within = ((deg % 7) + 7) % 7;
  return BASE_MIDI + oct * 12 + MAJOR[within];
}

/** MIDI note number -> frequency in Hz. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- seeded PRNG ----------------------------------------------------------

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the seed draft -------------------------------------------------------

/** A simple diatonic phrase — the shared draft both composers rewrite. */
export function makeSeed(alloc: () => number, now: number): Note[] {
  // A small rising-then-settling motif across bar A, echoed lower in bar B.
  const phrase: Array<[number, number, number]> = [
    // [step, degree, duration]
    [0, 4, 2],
    [2, 6, 2],
    [4, 7, 2],
    [6, 9, 2],
    [8, 7, 2],
    [10, 6, 1],
    [11, 5, 1],
    [12, 4, 2],
    [14, 2, 2],
  ];
  return phrase.map(([step, deg, dur]) => ({
    id: alloc(),
    step,
    deg,
    dur,
    by: "seed" as Owner,
    addedAt: now,
  }));
}

// ---- edit operations ------------------------------------------------------
// Each returns an EditResult. "removed" are ghost pre-images (struck through in
// the diff); "added" are the post-images that glow. Note identity (id) persists
// across a move so the ear/eye can follow a single voice being rewritten.

function ghostOf(n: Note, now: number): Ghost {
  return { id: n.id, step: n.step, deg: n.deg, dur: n.dur, by: n.by, removedAt: now };
}

/** Transpose every note whose onset falls in [lo,hi] by `delta` scale steps. */
export function transposeRange(
  notes: Note[],
  lo: number,
  hi: number,
  delta: number,
  ctx: EditCtx,
): EditResult {
  const removed: Ghost[] = [];
  const added: Note[] = [];
  const next = notes.map((n) => {
    if (n.step < lo || n.step > hi) return n;
    const nd = clamp(n.deg + delta, DEG_MIN, DEG_MAX);
    if (nd === n.deg) return n; // hit the ceiling/floor — no visible change
    removed.push(ghostOf(n, ctx.now));
    const nn: Note = { ...n, deg: nd, by: ctx.by, addedAt: ctx.now };
    added.push(nn);
    return nn;
  });
  return { notes: next, removed, added, by: ctx.by, op: opLabel(delta, lo, hi) };
}

function opLabel(delta: number, lo: number, hi: number): string {
  const where = lo === 0 && hi >= STEPS - 1 ? "loop" : lo < BAR ? "bar A" : "bar B";
  const sign = delta > 0 ? `+${delta}` : `${delta}`;
  return `transpose ${where} ${sign}`;
}

/** Transpose a whole bar ("A" | "B") by ±1 (or more) scale steps. */
export function transposeBar(
  notes: Note[],
  bar: "A" | "B",
  delta: number,
  ctx: EditCtx,
): EditResult {
  const [lo, hi] = bar === "A" ? [0, BAR - 1] : [BAR, STEPS - 1];
  return transposeRange(notes, lo, hi, delta, ctx);
}

/** Remove a note by id. */
export function deleteNote(notes: Note[], id: number, ctx: EditCtx): EditResult {
  const target = notes.find((n) => n.id === id);
  if (!target)
    return { notes, removed: [], added: [], by: ctx.by, op: "delete (none)" };
  return {
    notes: notes.filter((n) => n.id !== id),
    removed: [ghostOf(target, ctx.now)],
    added: [],
    by: ctx.by,
    op: "delete note",
  };
}

/** Insert a fresh note at a given step/degree. */
export function insertNote(
  notes: Note[],
  step: number,
  deg: number,
  ctx: EditCtx,
  dur = 2,
): EditResult {
  const s = clamp(step, 0, STEPS - 1);
  const d = clamp(deg, DEG_MIN, DEG_MAX);
  const nn: Note = { id: ctx.alloc(), step: s, deg: d, dur, by: ctx.by, addedAt: ctx.now };
  return { notes: [...notes, nn], removed: [], added: [nn], by: ctx.by, op: "insert note" };
}

/** Slide a note's onset by ±steps. */
export function nudgeNote(
  notes: Note[],
  id: number,
  delta: number,
  ctx: EditCtx,
): EditResult {
  const target = notes.find((n) => n.id === id);
  if (!target)
    return { notes, removed: [], added: [], by: ctx.by, op: "nudge (none)" };
  const ns = clamp(target.step + delta, 0, STEPS - 1);
  if (ns === target.step)
    return { notes, removed: [], added: [], by: ctx.by, op: "nudge (edge)" };
  const nn: Note = { ...target, step: ns, by: ctx.by, addedAt: ctx.now };
  return {
    notes: notes.map((n) => (n.id === id ? nn : n)),
    removed: [ghostOf(target, ctx.now)],
    added: [nn],
    by: ctx.by,
    op: `nudge ${delta > 0 ? "→" : "←"}`,
  };
}

/** Invert the whole phrase about its own pitch centroid (mirror the contour). */
export function invertPhrase(notes: Note[], ctx: EditCtx): EditResult {
  if (notes.length === 0)
    return { notes, removed: [], added: [], by: ctx.by, op: "invert (empty)" };
  const axis = Math.round(notes.reduce((s, n) => s + n.deg, 0) / notes.length);
  const removed: Ghost[] = [];
  const added: Note[] = [];
  const next = notes.map((n) => {
    const nd = clamp(2 * axis - n.deg, DEG_MIN, DEG_MAX);
    if (nd === n.deg) return n;
    removed.push(ghostOf(n, ctx.now));
    const nn: Note = { ...n, deg: nd, by: ctx.by, addedAt: ctx.now };
    added.push(nn);
    return nn;
  });
  return { notes: next, removed, added, by: ctx.by, op: "invert phrase" };
}

/** Augment (or diminish) note lengths within a bar — a stretch in time. */
export function stretchBar(
  notes: Note[],
  bar: "A" | "B",
  factor: number,
  ctx: EditCtx,
): EditResult {
  const [lo, hi] = bar === "A" ? [0, BAR - 1] : [BAR, STEPS - 1];
  const added: Note[] = [];
  const next = notes.map((n) => {
    if (n.step < lo || n.step > hi) return n;
    const nd = clamp(Math.round(n.dur * factor), 1, STEPS - n.step);
    if (nd === n.dur) return n;
    const nn: Note = { ...n, dur: nd, by: ctx.by, addedAt: ctx.now };
    added.push(nn);
    return nn;
  });
  return {
    notes: next,
    removed: [],
    added,
    by: ctx.by,
    op: `stretch bar ${bar} ×${factor}`,
  };
}

// ---- the rule-based counter-editing agent ---------------------------------
// Its competing INTENTION: pull the phrase DOWNWARD toward a lower home,
// thin out dense passages, and reshape upward leaps into descents. It rewrites
// the same object you do — sometimes undoing your climb, sometimes building on
// it. Deterministic given the same PRNG stream.

export function agentEdit(notes: Note[], rng: Rng, ctx: EditCtx): EditResult {
  if (notes.length === 0) {
    // Seed its own low home tone rather than leave silence.
    return insertNote(notes, 0, 2, ctx, 2);
  }
  const mean = notes.reduce((s, n) => s + n.deg, 0) / notes.length;
  const highest = notes.reduce((a, b) => (b.deg > a.deg ? b : a));

  // 1. Too dense -> thin it out by removing its most off-goal (highest) note.
  if (notes.length > 8) {
    return deleteNote(notes, highest.id, ctx);
  }
  // 2. Sitting too high -> pull the whole loop down toward its home.
  if (mean > 7.2) {
    return transposeRange(notes, 0, STEPS - 1, -1, ctx);
  }
  // 3. Occasionally reshape the contour by inverting.
  if (rng() < 0.32) {
    return invertPhrase(notes, ctx);
  }
  // 4. Otherwise pull the single most prominent high note down a step.
  if (highest.deg > Math.round(mean)) {
    return transposeRange(notes, highest.step, highest.step, -1, ctx);
  }
  // 5. Fallback: plant a low anchor tone toward the tonic.
  const gap = findGap(notes, rng);
  return insertNote(notes, gap, 2, ctx, 2);
}

/** Find an unoccupied onset step (falls back to a rng-chosen step). */
export function findGap(notes: Note[], rng: Rng): number {
  const taken = new Set(notes.map((n) => n.step));
  const start = Math.floor(rng() * STEPS);
  for (let i = 0; i < STEPS; i++) {
    const s = (start + i) % STEPS;
    if (!taken.has(s)) return s;
  }
  return start;
}
