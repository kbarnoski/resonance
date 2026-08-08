// The local symbolic improvising agent for 8440-duetmind.
//
// No network, no model, no LLM. Pure TypeScript: the agent listens to a short
// buffer of your recent notes (a "motif"), then on its turn commits a near-term
// PLAN by transforming your material — answer/transpose, melodic inversion,
// retrograde, rhythmic augmentation/diminution, or a Markov development seeded
// by your phrase. Everything is snapped to 12-tone equal-tempered C major so the
// counter-line stays consonant. See engine.ts for how the plan becomes ghosts.

export type Voice = "human" | "agent";

/** A note placed relative to the start of a phrase (seconds). */
export interface RelNote {
  pitch: number; // MIDI
  rel: number; // seconds from phrase start
  dur: number; // seconds
}

/** A note on the shared timeline. */
export interface Note {
  id: number;
  pitch: number; // MIDI
  t: number; // absolute sound time in engine-clock seconds
  dur: number; // seconds
  voice: Voice;
  held?: boolean; // a human note still being held down
}

/** The agent's committed plan for one turn. */
export interface AgentPhrase {
  notes: RelNote[];
  label: string; // short human-readable description of the transform
}

/** Deterministic PRNG (Tommy Ettinger's mulberry32). Seeded, no Math.random. */
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

/** C-major pitch classes. */
export const SCALE_PCS = [0, 2, 4, 5, 7, 9, 11];

/** Snap any MIDI value to the nearest C-major pitch. */
export function snapToScale(midi: number): number {
  const r = Math.round(midi);
  for (let d = 0; d <= 6; d++) {
    for (const cand of d === 0 ? [r] : [r - d, r + d]) {
      const pc = ((cand % 12) + 12) % 12;
      if (SCALE_PCS.includes(pc)) return cand;
    }
  }
  return r;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export function noteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${oct}`;
}

/** Computer keyboard → MIDI. Home row is a C-major octave; the QWERTY row above
 *  is the octave above it, so the physical layout reads like two keyboard rows. */
export const KEY_MAP: Record<string, number> = {
  a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72,
  q: 72, w: 74, e: 76, r: 77, t: 79, y: 81, u: 83, i: 84,
};

/** On-screen / overlay rows, upper (higher octave) first to match the screen. */
export const KEY_ROWS: { key: string; pitch: number }[][] = [
  ["q", "w", "e", "r", "t", "y", "u", "i"].map((k) => ({ key: k, pitch: KEY_MAP[k] })),
  ["a", "s", "d", "f", "g", "h", "j", "k"].map((k) => ({ key: k, pitch: KEY_MAP[k] })),
];

// A diatonic ladder of MIDI values used for in-scale random walks.
const DIA: number[] = [];
for (let m = 55; m <= 86; m++) {
  if (SCALE_PCS.includes(((m % 12) + 12) % 12)) DIA.push(m);
}

const DUR_MENU = (beat: number) => [beat * 0.5, beat * 0.75, beat, beat * 1.25];

/** Build a fresh diatonic motif by random walk — used for the seeded "human"
 *  self-demo line and for when the agent decides to initiate on its own. */
export function generateHumanPhrase(
  rand: () => number,
  turnLen: number,
  beat: number,
): RelNote[] {
  const n = 3 + Math.floor(rand() * 4); // 3..6 notes
  let idx = 4 + Math.floor(rand() * 6); // start mid-ladder
  const durs = DUR_MENU(beat);
  const steps = [-2, -1, 1, 1, 2, 3, -3];
  const out: RelNote[] = [];
  let rel = 0;
  for (let i = 0; i < n && rel < turnLen; i++) {
    const dur = Math.min(durs[Math.floor(rand() * durs.length)], turnLen - rel);
    out.push({ pitch: DIA[clamp(idx, 0, DIA.length - 1)], rel, dur });
    idx = clamp(idx + steps[Math.floor(rand() * steps.length)], 0, DIA.length - 1);
    rel += dur + (rand() < 0.25 ? beat * 0.4 : 0);
  }
  return out;
}

function developMarkov(
  motif: RelNote[],
  rand: () => number,
  turnLen: number,
  beat: number,
): RelNote[] {
  const ps = motif.map((m) => m.pitch);
  const intervals: number[] = [];
  for (let i = 1; i < ps.length; i++) intervals.push(ps[i] - ps[i - 1]);
  const durs = motif.map((m) => m.dur);
  let pitch = ps[ps.length - 1];
  const out: RelNote[] = [];
  let rel = 0;
  let i = 0;
  while (rel < turnLen && i < 16) {
    const dur = Math.min(
      durs[i % durs.length] * (rand() < 0.3 ? 0.5 : 1),
      turnLen - rel,
    );
    out.push({ pitch: snapToScale(pitch), rel, dur });
    const iv = intervals.length
      ? intervals[Math.floor(rand() * intervals.length)]
      : rand() < 0.5
        ? 2
        : -2;
    const grace = rand() < 0.25 ? (rand() < 0.5 ? 1 : -1) : 0;
    pitch = clamp(pitch + iv + grace, 55, 84);
    rel += dur + (rand() < 0.25 ? beat * 0.5 : 0);
    i++;
  }
  return out;
}

/** The heart of the agent: transform the caller's motif into a committed plan. */
export function generateAgentPhrase(
  motif: RelNote[],
  rand: () => number,
  turnLen: number,
  beat: number,
): AgentPhrase {
  if (motif.length === 0) {
    return { notes: generateHumanPhrase(rand, turnLen, beat), label: "initiates ✳" };
  }

  const total = Math.max(...motif.map((m) => m.rel + m.dur));
  const pick = rand();
  let notes: RelNote[];
  let label: string;

  if (pick < 0.2) {
    // Answer: transpose to a consonant interval, keep the rhythm.
    const shifts = [3, 4, 5, 7, -5, -4];
    const sh = shifts[Math.floor(rand() * shifts.length)];
    notes = motif.map((m) => ({ pitch: snapToScale(m.pitch + sh), rel: m.rel, dur: m.dur }));
    label = `answers ${sh > 0 ? "↑" : "↓"}${Math.abs(sh)}`;
  } else if (pick < 0.4) {
    // Melodic inversion around the first pitch.
    const axis = motif[0].pitch;
    notes = motif.map((m) => ({ pitch: snapToScale(2 * axis - m.pitch), rel: m.rel, dur: m.dur }));
    label = "inverts ⊤";
  } else if (pick < 0.58) {
    // Retrograde: reverse in time.
    notes = motif
      .map((m) => ({ pitch: m.pitch, rel: total - (m.rel + m.dur), dur: m.dur }))
      .sort((a, b) => a.rel - b.rel);
    label = "retrograde ↔";
  } else if (pick < 0.72) {
    // Augmentation: stretch time.
    const f = 1.5;
    notes = motif
      .map((m) => ({ pitch: m.pitch, rel: m.rel * f, dur: m.dur * f }))
      .filter((m) => m.rel < turnLen)
      .map((m) => ({ ...m, dur: Math.min(m.dur, turnLen - m.rel) }));
    label = "augments ⤢";
  } else if (pick < 0.85) {
    // Diminution + a transposed echo.
    const f = 0.55;
    const base = motif.map((m) => ({ pitch: m.pitch, rel: m.rel * f, dur: m.dur * f }));
    const len = Math.max(...base.map((m) => m.rel + m.dur));
    const up = rand() < 0.5 ? 12 : 7;
    const echo = base.map((m) => ({
      pitch: snapToScale(m.pitch + up),
      rel: m.rel + len + beat * 0.2,
      dur: m.dur,
    }));
    notes = [...base, ...echo]
      .filter((m) => m.rel < turnLen)
      .map((m) => ({ ...m, dur: Math.min(m.dur, turnLen - m.rel) }));
    label = "diminishes ⤡";
  } else {
    // Weighted Markov continuation seeded by the phrase's own intervals.
    notes = developMarkov(motif, rand, turnLen, beat);
    label = "develops ~";
  }

  notes = notes.filter((m) => m.dur > 0.03 && m.rel >= 0 && m.rel < turnLen);
  if (notes.length === 0) {
    notes = developMarkov(motif, rand, turnLen, beat);
    label = "develops ~";
  }
  return { notes, label };
}
