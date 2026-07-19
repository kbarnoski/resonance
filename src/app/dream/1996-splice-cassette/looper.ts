// ─────────────────────────────────────────────────────────────────────────────
// looper.ts — the EDITABLE-MEMORY data model for 1996-splice-cassette.
//
// Most loopers only ADD layers. This one makes the past CONSEQUENTIAL: every
// operation here is a way to UN-MAKE or RE-TIME what you already played. A note
// stores a scale DEGREE, not a frozen pitch (see harmony.ts), so the same events
// re-voice as the mode drifts. These are pure functions over immutable arrays —
// React state holds the loop; the scheduler reads a mirror ref.
//
// Grammar: record → destructive overwrite → cut → shift → fracture.
// ─────────────────────────────────────────────────────────────────────────────

export const LOOP = 6; // seconds — one lap of the tape.

export interface NoteEvent {
  id: number;
  t: number; // onset within the loop, [0, LOOP)
  dur: number; // seconds
  degree: number; // scale degree 0–6
  octave: number; // octave offset
  vel: number; // 0–1
  src: "ghost" | "user";
}

let idCounter = 1;

function wrapT(t: number): number {
  return ((t % LOOP) + LOOP) % LOOP;
}

export function makeNote(
  t: number,
  dur: number,
  degree: number,
  octave: number,
  vel: number,
  src: "ghost" | "user",
): NoteEvent {
  return { id: idCounter++, t: wrapT(t), dur, degree, octave, vel, src };
}

/** CUT — delete every event whose onset falls in [a, b). The loop audibly loses it. */
export function applyCut(notes: NoteEvent[], a: number, b: number): NoteEvent[] {
  return notes.filter((n) => !(n.t >= a && n.t < b));
}

/** SHIFT — re-time a slice: move events in [a, b) by delta (wrapping round the tape). */
export function applyShift(
  notes: NoteEvent[],
  a: number,
  b: number,
  delta: number,
): NoteEvent[] {
  return notes.map((n) =>
    n.t >= a && n.t < b ? { ...n, t: wrapT(n.t + delta) } : n,
  );
}

/** OVERWRITE — the destructive headline: clear [a, b), drop new events in its place. */
export function applyOverwrite(
  notes: NoteEvent[],
  a: number,
  b: number,
  incoming: NoteEvent[],
): NoteEvent[] {
  return applyCut(notes, a, b).concat(incoming);
}

/** Remove events within ±window of t — live destructive overwrite as you record over. */
export function applyPunch(notes: NoteEvent[], t: number, window: number): NoteEvent[] {
  return notes.filter((n) => Math.abs(n.t - t) > window);
}

/**
 * FRACTURE — chop the loop into N equal chunks and re-order them. `order[k]` is
 * the OLD chunk index now sitting at NEW slot k. A phrase you know by heart comes
 * back tumbled.
 */
export function applyFracture(notes: NoteEvent[], order: number[]): NoteEvent[] {
  const n = order.length;
  const len = LOOP / n;
  return notes.map((note) => {
    const oldChunk = Math.min(n - 1, Math.floor(note.t / len));
    const within = note.t - oldChunk * len;
    const newSlot = order.indexOf(oldChunk);
    return { ...note, t: newSlot * len + within };
  });
}

/** A shuffled permutation of [0..n) from a seeded PRNG (deterministic ghost). */
export function fractureOrder(prng: () => number, n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Chunk boundary positions (loop-time) — drawn as splice marks after a fracture. */
export function chunkBoundaries(n: number): number[] {
  const len = LOOP / n;
  return Array.from({ length: n - 1 }, (_, i) => (i + 1) * len);
}
