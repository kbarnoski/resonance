// ─────────────────────────────────────────────────────────────────────────────
// engine.ts — CHORUSKEEPER
// Long-form stateful generative bebop: a 32-bar AABA form, a persistent motif
// library, and the development operations that grow the player's early phrases
// across a three-chorus arc.
//
// This module is pure (no React, no Web Audio). It owns:
//   • the AABA changes + form-clock helpers          (getChord / sectionLabel)
//   • Barry-Harris bebop-scale voice-leading material (bebopScale / guideTones /
//     rootlessVoicing / walkingBass)
//   • the motif library type + banking                (bankMotif — records a
//     played phrase as CHORD-RELATIVE scale degrees so it can be transposed to
//     fit any chord in the changes)
//   • the development operations                       (renderMotif with
//     transpose / sequence / invert / augment, plus a chromatic bar-line
//     approach)
//   • the seeded RNG                                   (mulberry32)
//
// Everything the ear needs to notice "chorus 3 is built from what I played in
// chorus 1" lives here. page.tsx is the scheduler + synth + canvas that drives
// it.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic PRNG so the muted auto-demo (and any seeded run) is repeatable. */
export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Chords + the AABA form ──────────────────────────────────────────────────
export type Quality = "maj7" | "m7" | "dom7";
export interface Chord {
  root: number; // pitch class 0..11 (C = 0)
  quality: Quality;
  symbol: string;
}

function mk(root: number, quality: Quality, symbol: string): Chord {
  return { root, quality, symbol };
}

// Key of F major. One chord per bar. A section is a I–vi–ii–V–iii–VI7–ii–V
// singing loop; the bridge lifts to the sub-dominant (Bb) then walks home.
const A_SECTION: Chord[] = [
  mk(5, "maj7", "Fmaj7"),
  mk(2, "m7", "Dm7"),
  mk(7, "m7", "Gm7"),
  mk(0, "dom7", "C7"),
  mk(9, "m7", "Am7"),
  mk(2, "dom7", "D7"),
  mk(7, "m7", "Gm7"),
  mk(0, "dom7", "C7"),
];
const B_SECTION: Chord[] = [
  mk(0, "m7", "Cm7"),
  mk(5, "dom7", "F7"),
  mk(10, "maj7", "Bbmaj7"),
  mk(7, "m7", "Gm7"),
  mk(9, "m7", "Am7"),
  mk(2, "dom7", "D7"),
  mk(7, "m7", "Gm7"),
  mk(0, "dom7", "C7"),
];

/** The 32-bar AABA changes (bars 0..31). */
export const CHANGES: Chord[] = [
  ...A_SECTION,
  ...A_SECTION,
  ...B_SECTION,
  ...A_SECTION,
];

export const BARS_PER_CHORUS = 32;
export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = 8; // eighth-note grid

/** "A" for the head statements & recap, "B" for the bridge. */
export function sectionLabel(bar: number): "A" | "B" {
  const b = ((bar % BARS_PER_CHORUS) + BARS_PER_CHORUS) % BARS_PER_CHORUS;
  return b >= 16 && b < 24 ? "B" : "A";
}

/**
 * Chord for (chorus, bar). On the very last bar of the very last chorus the
 * turnaround is replaced by a home Fmaj7 so the piece CADENCES and ends rather
 * than looping.
 */
export function getChord(
  chorus: number,
  bar: number,
  totalChoruses: number,
): Chord {
  const b = ((bar % BARS_PER_CHORUS) + BARS_PER_CHORUS) % BARS_PER_CHORUS;
  if (chorus === totalChoruses - 1 && b === 31) {
    return mk(5, "maj7", "Fmaj7");
  }
  return CHANGES[b];
}

// ── Barry-Harris bebop material ─────────────────────────────────────────────
// Eight-note bebop scales (pitch classes RELATIVE to the chord root). The extra
// chromatic passing tone is what makes the chord tones fall on the downbeats
// when you run the scale in eighth notes.
export function bebopScale(q: Quality): number[] {
  switch (q) {
    case "maj7":
      // major bebop: 1 2 3 4 5 #5 6 7
      return [0, 2, 4, 5, 7, 8, 9, 11];
    case "m7":
      // dorian bebop: 1 2 b3 4 5 6 b7 7
      return [0, 2, 3, 5, 7, 9, 10, 11];
    case "dom7":
      // dominant bebop: 1 2 3 4 5 6 b7 7
      return [0, 2, 4, 5, 7, 9, 10, 11];
  }
}

/** Guide tones (3rd, 7th) as pitch classes — the notes resolved at bar lines. */
export function guideTones(c: Chord): [number, number] {
  const third = c.quality === "m7" ? 3 : 4;
  const seventh = c.quality === "maj7" ? 11 : 10;
  return [(c.root + third) % 12, (c.root + seventh) % 12];
}

/** Snap a midi note to the nearest of a set of pitch classes. */
export function nearestPc(midi: number, pcs: number[]): number {
  let best = midi;
  let bestD = 99;
  for (const pc of pcs) {
    // candidate midis with this pc around `midi`
    const base = midi - (((midi % 12) - pc + 12) % 12);
    for (const cand of [base, base + 12, base - 12]) {
      const d = Math.abs(cand - midi);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
  }
  return best;
}

/**
 * A four-note rootless left-hand comp voicing (3–5–7–9), Bill-Evans / Barry
 * Harris shape, placed in the mid register. Guide tones on the bottom keep the
 * voice-leading smooth from bar to bar.
 */
export function rootlessVoicing(c: Chord): number[] {
  // 3rd, 5th, 7th, 9th of the chord (Barry-Harris sixth-diminished colour)
  const third = c.quality === "m7" ? 3 : 4;
  const fifth = 7;
  const seventh = c.quality === "maj7" ? 11 : 10;
  const ninth = 2;
  const pcs = [third, fifth, seventh, ninth].map((iv) => (c.root + iv) % 12);
  // place ascending starting just above middle register
  const out: number[] = [];
  let floorMidi = 55;
  for (const pc of pcs) {
    let m = pc + 48;
    while (m < floorMidi) m += 12;
    out.push(m);
    floorMidi = m + 1;
  }
  return out;
}

/** One walking-bass note for a beat: root · 5th · 3rd · chromatic-approach. */
export function walkingBass(
  c: Chord,
  next: Chord,
  beat: number,
  rng: () => number,
): number {
  let pc: number;
  if (beat === 0) pc = c.root;
  else if (beat === 1) pc = (c.root + 7) % 12;
  else if (beat === 2) pc = (c.root + (c.quality === "m7" ? 3 : 4)) % 12;
  else pc = (next.root + (rng() < 0.5 ? 1 : 11)) % 12; // approach next root
  let m = pc + 36;
  while (m < 33) m += 12;
  while (m > 47) m -= 12;
  return m;
}

// ── The motif library ───────────────────────────────────────────────────────
export interface NoteEv {
  step: number; // eighth-note offset within the bar (0..7)
  midi: number;
  dur: number; // eighths
  src: "you" | "ghost";
}

export interface Motif {
  id: number;
  /** Chord-relative scale degrees: octave*8 + indexIntoBebopScale. */
  g: number[];
  /** Per-note durations in eighths. */
  dur: number[];
  rootPc: number;
  quality: Quality;
  bornChorus: number;
}

export type DevOp = "state" | "transpose" | "sequence" | "invert" | "augment";

/**
 * Bank a played phrase as a motif: convert each absolute midi note into a
 * chord-relative scale degree over the chord it was played on. Because the
 * motif is stored as degrees (not pitches), it can later be transposed to fit
 * ANY chord in the changes — that is what lets the ghost sequence your idea
 * through the whole form.
 */
export function bankMotif(
  id: number,
  midis: number[],
  durs: number[],
  chord: Chord,
  chorus: number,
): Motif {
  const scale = bebopScale(chord.quality);
  const L = scale.length;
  const g = midis.map((midi) => {
    const pc = (((midi - chord.root) % 12) + 12) % 12;
    // nearest scale index to this pitch class
    let bi = 0;
    let bd = 99;
    for (let i = 0; i < L; i++) {
      const d = Math.min(
        (((pc - scale[i]) % 12) + 12) % 12,
        (((scale[i] - pc) % 12) + 12) % 12,
      );
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    const oct = Math.round((midi - chord.root - scale[bi]) / 12);
    return oct * L + bi;
  });
  // normalise so the first note sits near octave 0 (keeps rendering in range)
  const shift = Math.floor(g[0] / L) * L;
  const gn = g.map((x) => x - shift);
  return {
    id,
    g: gn,
    dur: durs.slice(),
    rootPc: chord.root,
    quality: chord.quality,
    bornChorus: chorus,
  };
}

/** A 0..1 contour for the little library glyphs. */
export function contourPoints(m: Motif): number[] {
  if (m.g.length === 0) return [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of m.g) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  return m.g.map((v) => (v - lo) / span);
}

/**
 * Render a motif over a target chord — this is the development engine.
 *   • transpose / sequence : same degrees, mapped through the target chord's
 *     bebop scale (diatonic-to-the-changes transposition)
 *   • invert               : mirror the contour around its first degree
 *   • augment              : stretch the rhythm (×1.5)
 * The downbeat is snapped to a guide tone (3rd/7th) so chord tones land on the
 * bar line, per the sixth-diminished voice-leading idea.
 */
export function renderMotif(
  m: Motif,
  chord: Chord,
  centerMidi: number,
  op: DevOp,
  startStep = 0,
  snapDownbeat = true,
): NoteEv[] {
  const scale = bebopScale(chord.quality);
  const L = scale.length;
  let base = chord.root;
  while (base < centerMidi - 6) base += 12;
  while (base > centerMidi + 6) base -= 12;

  let degs = m.g;
  if (op === "invert") {
    const g0 = degs[0];
    degs = degs.map((x) => 2 * g0 - x);
  }
  let durs = m.dur;
  if (op === "augment") {
    durs = durs.map((d) => Math.max(1, Math.round(d * 1.5)));
  }

  const evs: NoteEv[] = [];
  let step = startStep;
  for (let i = 0; i < degs.length; i++) {
    if (step >= STEPS_PER_BAR) break;
    const g = degs[i];
    const oct = Math.floor(g / L);
    const idx = ((g % L) + L) % L;
    const midi = base + oct * 12 + scale[idx];
    let dur = durs[i % durs.length];
    if (step + dur > STEPS_PER_BAR) dur = STEPS_PER_BAR - step;
    evs.push({ step, midi, dur, src: "ghost" });
    step += durs[i % durs.length];
  }

  if (snapDownbeat && evs.length && evs[0].step === 0) {
    const [t3, t7] = guideTones(chord);
    evs[0].midi = nearestPc(evs[0].midi, [t3, t7]);
  }
  return evs;
}

/**
 * Append a chromatic approach note on the "and of 4" that leads by a half-step
 * into the next bar's guide tone — the bebop enclosure at the bar line.
 */
export function addApproach(
  evs: NoteEv[],
  next: Chord,
  centerMidi: number,
): NoteEv[] {
  const end = evs.length
    ? evs[evs.length - 1].step + evs[evs.length - 1].dur
    : 0;
  if (end <= 7) {
    const [t3] = guideTones(next);
    let tg = t3;
    while (tg < centerMidi - 6) tg += 12;
    while (tg > centerMidi + 6) tg -= 12;
    evs.push({ step: 7, midi: tg - 1, dur: 1, src: "ghost" });
  }
  return evs;
}
