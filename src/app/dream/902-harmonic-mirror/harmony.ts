// 902-harmonic-mirror — harmony.ts
// Chord-template inference (a tiny slice of Riemann functional harmony) and
// just-intonation ratio derivation (Partch / Ben Johnston lineage).
//
// The pipeline:
//   held MIDI notes  ->  pitch-class set (mod 12)
//   pitch-class set  ->  best-matching chord template (maj/min/sus4/fifth/dom7/cluster)
//   template + root  ->  1–2 "completion" voices that finish a consonant chord
//   completion voice ->  frequency in JUST INTONATION relative to the inferred root
//
// Equal-tempered "played" voices use 2^(n/12); mirror "completion" voices use
// small-integer ratios so they lock beat-lessly against the root.

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

// A4 = 440 Hz, MIDI 69. Equal temperament.
export function midiToFreqET(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Just-intonation ratios for the consonant chord degrees we synthesize, keyed by
// the interval (in semitones, 0..11) above the root. Small-integer ratios from the
// 5-limit lattice — the Partch / Ben Johnston ratio table.
//   0  -> 1/1   unison
//   2  -> 9/8   major second
//   4  -> 5/4   major third       (pure, vs the wide ET third)
//   3  -> 6/5   minor third
//   5  -> 4/3   perfect fourth
//   7  -> 3/2   perfect fifth
//   9  -> 5/3   major sixth
//  10  -> 9/5   minor seventh (or 16/9; we use 9/5 for the dom7 7th's brightness)
//  11  -> 15/8  major seventh
export const JI_RATIOS: Record<number, number> = {
  0: 1 / 1,
  2: 9 / 8,
  3: 6 / 5,
  4: 5 / 4,
  5: 4 / 3,
  7: 3 / 2,
  9: 5 / 3,
  10: 9 / 5,
  11: 15 / 8,
};

// Human-readable ratio labels for the viz.
export const JI_LABELS: Record<number, string> = {
  0: "1/1",
  2: "9/8",
  3: "6/5",
  4: "5/4",
  5: "4/3",
  7: "3/2",
  9: "5/3",
  10: "9/5",
  11: "15/8",
};

// Given a root MIDI note and a target interval (semitones above root), return the
// JUST-INTONATION frequency. We place the JI voice in the same octave neighborhood
// as the equal-tempered version of that pitch so the registers line up, then tune it
// purely by ratio relative to the root's fundamental.
export function jiFreq(rootMidi: number, interval: number): number {
  const ratio = JI_RATIOS[interval] ?? Math.pow(2, interval / 12);
  const rootFreq = midiToFreqET(rootMidi);
  return rootFreq * ratio;
}

export interface ChordTemplate {
  // Intervals (semitones above root) that DEFINE the chord quality.
  intervals: number[];
  // Short quality label, e.g. "maj", "min", "sus4", "5", "7".
  quality: string;
}

// Riemann-flavored template bank, ordered roughly by specificity. Each is matched
// against the held pitch-class set; the best match (most overlap, fewest extras)
// wins. "fifth" = bare power-chord (ambiguous third); "cluster" = the catch-all.
const TEMPLATES: ChordTemplate[] = [
  { intervals: [0, 4, 7, 10], quality: "7" }, // dominant 7
  { intervals: [0, 4, 7], quality: "maj" }, // major triad
  { intervals: [0, 3, 7], quality: "min" }, // minor triad
  { intervals: [0, 5, 7], quality: "sus4" }, // suspended 4
  { intervals: [0, 7], quality: "5" }, // bare fifth
];

export interface InferredChord {
  rootPc: number; // pitch class 0..11
  rootMidi: number; // an actual sounding root (lowest held note matching root pc)
  quality: string; // "maj", "min", "sus4", "5", "7", "cluster"
  name: string; // e.g. "C maj", "A min", "G 7"
  // The completion voices the mirror should ADD, as { interval, ratioLabel }.
  // interval is semitones above rootMidi; mirror freq = jiFreq(rootMidi, interval).
  completions: { interval: number; ratioLabel: string }[];
  templateIntervals: number[]; // the full intended chord, for viz
}

// Score how well a template, rooted at candidateRoot, explains the held set.
// Returns { covered, extras } where covered = held PCs the template explains,
// extras = held PCs NOT in the template (penalized).
function scoreTemplate(
  heldPcs: Set<number>,
  template: ChordTemplate,
  rootPc: number
): { covered: number; extras: number } {
  const templatePcs = new Set(
    template.intervals.map((iv) => (rootPc + iv) % 12)
  );
  let covered = 0;
  for (const pc of heldPcs) {
    if (templatePcs.has(pc)) covered += 1;
  }
  const extras = heldPcs.size - covered;
  return { covered, extras };
}

// Main inference. Given the sorted list of held MIDI notes, infer the chord and
// the 1–2 just-intonation completion voices that finish it.
export function inferChord(heldMidi: number[]): InferredChord | null {
  if (heldMidi.length === 0) return null;
  const sorted = [...heldMidi].sort((a, b) => a - b);
  const heldPcs = new Set(sorted.map((m) => ((m % 12) + 12) % 12));

  // Single note: imply a major triad rooted on it (a common default in solo lines).
  if (heldPcs.size === 1) {
    const rootMidi = sorted[0];
    const rootPc = ((rootMidi % 12) + 12) % 12;
    return {
      rootPc,
      rootMidi,
      quality: "maj",
      name: `${NOTE_NAMES[rootPc]} (maj)`,
      completions: [
        { interval: 4, ratioLabel: JI_LABELS[4] }, // major third 5/4
        { interval: 7, ratioLabel: JI_LABELS[7] }, // fifth 3/2
      ],
      templateIntervals: [0, 4, 7],
    };
  }

  // Try every template at every candidate root (each held PC). Best score wins:
  // maximize covered, then minimize extras, then prefer more-specific (longer) and
  // a root that is actually the lowest held note (bass bias).
  let best: {
    template: ChordTemplate;
    rootPc: number;
    covered: number;
    extras: number;
  } | null = null;

  const bassPc = ((sorted[0] % 12) + 12) % 12;

  for (const template of TEMPLATES) {
    for (const rootPc of heldPcs) {
      const { covered, extras } = scoreTemplate(heldPcs, template, rootPc);
      // Require the root itself to be held (no phantom roots) and at least a
      // 2-note overlap so we don't fit a fifth to noise.
      if (!heldPcs.has(rootPc)) continue;
      if (covered < 2) continue;
      if (best === null) {
        best = { template, rootPc, covered, extras };
        continue;
      }
      const better =
        covered > best.covered ||
        (covered === best.covered && extras < best.extras) ||
        (covered === best.covered &&
          extras === best.extras &&
          template.intervals.length > best.template.intervals.length) ||
        (covered === best.covered &&
          extras === best.extras &&
          template.intervals.length === best.template.intervals.length &&
          rootPc === bassPc &&
          best.rootPc !== bassPc);
      if (better) best = { template, rootPc, covered, extras };
    }
  }

  // Nothing consonant fit — fall to the cluster heuristic: name it after the bass,
  // and complete only with a pure fifth (the safest consonance over any bass).
  if (best === null || best.extras > 1) {
    const rootMidi = sorted[0];
    const rootPc = bassPc;
    const hasFifth = heldPcs.has((rootPc + 7) % 12);
    const completions = hasFifth
      ? []
      : [{ interval: 7, ratioLabel: JI_LABELS[7] }];
    return {
      rootPc,
      rootMidi,
      quality: "cluster",
      name: `${NOTE_NAMES[rootPc]} cluster`,
      completions,
      templateIntervals: [0, 7],
    };
  }

  // Resolve an actual sounding root MIDI: the lowest held note whose PC == rootPc,
  // else transpose the bass down to the root PC.
  const rootPc = best.rootPc;
  let rootMidi = sorted.find((m) => ((m % 12) + 12) % 12 === rootPc);
  if (rootMidi === undefined) rootMidi = sorted[0];

  // Determine which template intervals are MISSING from the held set -> completions.
  const heldIntervals = new Set(
    sorted.map((m) => ((((m % 12) + 12) % 12 - rootPc) + 12) % 12)
  );
  const missing = best.template.intervals.filter((iv) => !heldIntervals.has(iv));

  // Keep at most 2 completion voices (the brief: add the 1–2 notes you didn't play).
  const completions = missing.slice(0, 2).map((iv) => ({
    interval: iv,
    ratioLabel: JI_LABELS[iv] ?? `${iv}st`,
  }));

  return {
    rootPc,
    rootMidi,
    quality: best.template.quality,
    name: `${NOTE_NAMES[rootPc]} ${best.template.quality}`,
    completions,
    templateIntervals: best.template.intervals,
  };
}

// Circle-of-fifths ordering for the constellation: each pitch class placed at the
// angle of its position around the circle of fifths (C, G, D, A, E, B, F#, ...).
export const CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

export function pcAngle(pc: number): number {
  const idx = CIRCLE_OF_FIFTHS.indexOf(pc);
  // -90deg so C sits at the top; clockwise.
  return (idx / 12) * Math.PI * 2 - Math.PI / 2;
}
