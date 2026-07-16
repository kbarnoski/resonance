/**
 * engine.ts — music-theory + generation core for 1812-sideman.
 *
 * Pure functions only (no Web Audio here). Provides:
 *  - key / scale definitions and pitch-class helpers
 *  - jazz progression construction (ii–V–I turnaround family)
 *  - rootless (Bill Evans / Bud Powell) left-hand comping voicings
 *  - a walking-bass line generator (chord tones + chromatic approach)
 *  - lightweight key inference from a pitch-class histogram
 *
 * The accompaniment logic is entirely RULE-BASED — no ML — see README.md.
 */

export type Quality = "maj7" | "7" | "min7" | "m7b5";
export type Mode = "major" | "minor";

export interface Chord {
  rootPc: number;
  quality: Quality;
  label: string;
}

export const NOTE_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

const QUALITY_LABEL: Record<Quality, string> = {
  maj7: "maj7",
  "7": "7",
  min7: "m7",
  m7b5: "m7b5",
};

/** Chord tones (semitones above root) used by the walking bass. */
const THIRD: Record<Quality, number> = { maj7: 4, "7": 4, min7: 3, m7b5: 3 };

/**
 * Rootless left-hand voicings (semitones above root). No root — the bass owns
 * it. These are the classic 3rd/7th-anchored shapes with 9ths / 13ths on top.
 */
const ROOTLESS_INTERVALS: Record<Quality, number[]> = {
  maj7: [4, 7, 11, 14], // 3 5 7 9
  "7": [4, 9, 10, 14], //  3 13 7 9
  min7: [3, 7, 10, 14], // 3 5 7 9
  m7b5: [3, 6, 10, 13], // b3 b5 b7 b9
};

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 9, 10]; // natural minor

/** 8-bar jazz turnarounds, one chord per bar, as [scaleDegreeSemitone, quality]. */
const MAJOR_PROG: [number, Quality][] = [
  [0, "maj7"],
  [9, "7"],
  [2, "min7"],
  [7, "7"],
  [4, "min7"],
  [9, "7"],
  [2, "min7"],
  [7, "7"],
];
const MINOR_PROG: [number, Quality][] = [
  [0, "min7"],
  [5, "min7"],
  [2, "m7b5"],
  [7, "7"],
  [0, "min7"],
  [8, "maj7"],
  [2, "m7b5"],
  [7, "7"],
];

const wrap = (pc: number) => ((pc % 12) + 12) % 12;

export function scalePcs(rootPc: number, mode: Mode): number[] {
  const base = mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  return base.map((d) => wrap(rootPc + d));
}

export function makeProgression(rootPc: number, mode: Mode): Chord[] {
  const src = mode === "major" ? MAJOR_PROG : MINOR_PROG;
  return src.map(([deg, q]) => {
    const pc = wrap(rootPc + deg);
    return { rootPc: pc, quality: q, label: NOTE_NAMES[pc] + QUALITY_LABEL[q] };
  });
}

export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Nearest MIDI note to `center` whose pitch-class equals `pc`. */
function pcToMidiNear(pc: number, center: number): number {
  let m = wrap(pc);
  m += 12 * Math.round((center - m) / 12);
  return m;
}

const clampBass = (m: number) => Math.max(33, Math.min(53, m));

/** Rootless voicing as absolute MIDI notes clustered around C4. */
export function rootlessVoicing(chord: Chord): number[] {
  return ROOTLESS_INTERVALS[chord.quality].map((i) => {
    let m = 60 + wrap(chord.rootPc + i);
    if (m > 72) m -= 12;
    return m;
  });
}

/** Ascending list of in-scale MIDI notes across [lo, hi]. */
export function scaleMidis(pcs: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(wrap(m))) out.push(m);
  return out;
}

/**
 * One bar (4 quarter notes) of walking bass: root → chord tones → chromatic
 * approach into the NEXT chord's root, so the line pulls toward the change.
 */
export function buildWalkingBar(
  chord: Chord,
  next: Chord,
  bar: number,
): number[] {
  const rootM = clampBass(pcToMidiNear(chord.rootPc, 45));
  const thirdM = clampBass(pcToMidiNear(wrap(chord.rootPc + THIRD[chord.quality]), rootM + 3));
  const fifthM = clampBass(pcToMidiNear(wrap(chord.rootPc + 7), rootM + 6));
  const nextRootM = clampBass(pcToMidiNear(next.rootPc, 45));
  const approach = clampBass(nextRootM + (bar % 2 === 0 ? -1 : 1));
  const [b2, b3] = bar % 2 === 0 ? [thirdM, fifthM] : [fifthM, thirdM];
  return [rootM, b2, b3, approach];
}

/** Krumhansl-lite key fit: weights tonic/3rd/5th of the candidate scale. */
export function scoreKey(hist: number[], rootPc: number, mode: Mode): number {
  const pcs = scalePcs(rootPc, mode);
  let s = 0;
  for (let i = 0; i < pcs.length; i++) {
    const w = i === 0 ? 3 : i === 2 || i === 4 ? 2 : 1;
    s += hist[pcs[i]] * w;
  }
  return s;
}

export function inferKey(hist: number[]): { rootPc: number; mode: Mode; score: number } {
  let best = { rootPc: 0, mode: "major" as Mode, score: -1 };
  for (let r = 0; r < 12; r++) {
    for (const mode of ["major", "minor"] as Mode[]) {
      const s = scoreKey(hist, r, mode);
      if (s > best.score) best = { rootPc: r, mode, score: s };
    }
  }
  return best;
}
