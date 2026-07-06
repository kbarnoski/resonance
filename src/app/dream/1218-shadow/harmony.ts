// ════════════════════════════════════════════════════════════════════════════
// SHADOW (1218) — real-time voice-leading harmonizer
//
// The intelligence of this prototype. You play a single-note melody; for each
// note this module decides (a) WHICH diatonic/borrowed chord best fits that note
// as a chord tone, weighting toward functional root motion (circle-of-fifths,
// cadences, avoid retrogressions), and (b) HOW to voice that chord in four parts
// (SATB) so that the inner voices move the SMALLEST possible total distance from
// the previous chord — real voice-leading, with range + spacing constraints and
// a penalty for parallel perfect fifths/octaves.
//
// Lineage: Bach chorale harmonization (four-part voice-leading rules) · Fux,
// Gradus ad Parnassum (species counterpoint) · Dmitri Tymoczko, A Geometry of
// Music (voice leading as minimal motion in chord space). No neural net — a tiny
// greedy search proves the rule-based shadow works fully client-side.
// ════════════════════════════════════════════════════════════════════════════

export type Mode = "major" | "minor";
export type Style = "chorale" | "close";

export interface Voicing {
  s: number; // soprano (the player's melody note, MIDI)
  a: number; // alto
  t: number; // tenor
  b: number; // bass
}

export interface Chord {
  degree: number; // scale degree 0..6
  rootPc: number; // pitch class of the root
  pcs: number[]; // pitch classes of the chord tones (root, 3rd, 5th, [7th])
  symbol: string; // e.g. "Gmaj7"
  roman: string; // e.g. "V7"
  isSeventh: boolean;
}

export interface HarmonyResult {
  chord: Chord;
  voicing: Voicing;
  motion: number; // total voicing cost (dominated by inner-voice motion)
  nonChordSoprano: boolean; // true if the melody note is a colour tone, not a chord tone
}

// ─── Note naming ──────────────────────────────────────────────────────────────
export const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];
export const KEY_NAMES = NOTE_NAMES;

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** MIDI → scientific note name, e.g. 60 → "C4". */
export function noteName(midi: number): string {
  return NOTE_NAMES[mod(midi, 12)] + (Math.floor(midi / 12) - 1);
}

/** Equal-tempered MIDI → frequency. */
export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ─── Scales & diatonic chord qualities ────────────────────────────────────────
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor

// Triads / sevenths per scale degree. Minor uses the harmonic-minor V (major /
// dominant) so the leading tone is available for real cadences.
const MAJOR_TRIAD_Q = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const MAJOR_SEVENTH_Q = ["maj7", "m7", "m7", "maj7", "dom7", "m7", "m7b5"];
const MINOR_TRIAD_Q = ["min", "dim", "maj", "min", "maj", "maj", "maj"];
const MINOR_SEVENTH_Q = ["m7", "m7b5", "maj7", "m7", "dom7", "maj7", "dom7"];

const ROMAN_MAJOR_TRIAD = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const ROMAN_MAJOR_7 = ["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"];
const ROMAN_MINOR_TRIAD = ["i", "ii°", "III", "iv", "V", "VI", "VII"];
const ROMAN_MINOR_7 = ["i7", "iiø7", "IIImaj7", "iv7", "V7", "VImaj7", "VII7"];

function qualityIntervals(q: string): number[] {
  switch (q) {
    case "maj": return [0, 4, 7];
    case "min": return [0, 3, 7];
    case "dim": return [0, 3, 6];
    case "aug": return [0, 4, 8];
    case "maj7": return [0, 4, 7, 11];
    case "m7": return [0, 3, 7, 10];
    case "dom7": return [0, 4, 7, 10];
    case "m7b5": return [0, 3, 6, 10];
    default: return [0, 4, 7];
  }
}

function qualitySuffix(q: string): string {
  switch (q) {
    case "maj": return "";
    case "min": return "m";
    case "dim": return "dim";
    case "aug": return "aug";
    case "maj7": return "maj7";
    case "m7": return "m7";
    case "dom7": return "7";
    case "m7b5": return "m7b5";
    default: return "";
  }
}

/** Build the seven diatonic chords for a key/mode/style. */
export function makeChords(keyRoot: number, mode: Mode, style: Style): Chord[] {
  const scale = mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const isSeventh = style === "close";
  const quals =
    mode === "major"
      ? isSeventh ? MAJOR_SEVENTH_Q : MAJOR_TRIAD_Q
      : isSeventh ? MINOR_SEVENTH_Q : MINOR_TRIAD_Q;
  const romans =
    mode === "major"
      ? isSeventh ? ROMAN_MAJOR_7 : ROMAN_MAJOR_TRIAD
      : isSeventh ? ROMAN_MINOR_7 : ROMAN_MINOR_TRIAD;

  const chords: Chord[] = [];
  for (let d = 0; d < 7; d++) {
    const rootPc = mod(keyRoot + scale[d], 12);
    const ivals = qualityIntervals(quals[d]);
    const pcs = ivals.map((i) => mod(rootPc + i, 12));
    chords.push({
      degree: d,
      rootPc,
      pcs,
      symbol: NOTE_NAMES[rootPc] + qualitySuffix(quals[d]),
      roman: romans[d],
      isSeventh,
    });
  }
  return chords;
}

// ─── Functional weighting ─────────────────────────────────────────────────────
// Tonal gravity per degree (tonic strongest, then dominant, subdominant …).
const TONAL_BONUS = [1.0, 0.2, 0.1, 0.5, 0.85, 0.45, 0.15];

/** Prefer strong root motion between successive chords. Descending-fifth
 *  (circle-of-fifths, i.e. degree +3 mod 7) is the strongest; same chord and
 *  step-down retrogressions are discouraged. */
function transitionScore(prevDeg: number, nextDeg: number): number {
  if (prevDeg < 0) return 0;
  const step = mod(nextDeg - prevDeg, 7);
  switch (step) {
    case 3: return 1.4; // down a fifth — the engine of tonal harmony
    case 1: return 0.8; // up a step (IV→V, iv→V, deceptive V→vi)
    case 2: return 0.6; // up a third
    case 4: return 0.6; // down a third
    case 5: return 0.3; // up a fifth
    case 6: return -0.4; // down a step — weak retrogression
    case 0: return -0.6; // same chord — avoid stasis
    default: return 0;
  }
}

// ─── Voicing (four-part) ──────────────────────────────────────────────────────
// SATB comfortable ranges (MIDI). Soprano is the player's note; the other three
// are searched within these bounds.
const RANGE_A: [number, number] = [53, 76]; // F3 – E5
const RANGE_T: [number, number] = [47, 69]; // B2 – A4
const RANGE_B: [number, number] = [40, 64]; // E2 – E4

function voiceCandidates(pcs: number[], range: [number, number]): number[] {
  const out: number[] = [];
  for (let m = range[0]; m <= range[1]; m++) {
    if (pcs.includes(mod(m, 12))) out.push(m);
  }
  return out;
}

/** Penalise parallel perfect fifths / octaves between any voice pair. */
function parallelPenalty(prev: Voicing, next: Voicing): number {
  const pairs: Array<[keyof Voicing, keyof Voicing]> = [
    ["s", "a"], ["s", "t"], ["s", "b"],
    ["a", "t"], ["a", "b"], ["t", "b"],
  ];
  let pen = 0;
  for (const [x, y] of pairs) {
    const ic1 = mod(prev[x] - prev[y], 12);
    const ic2 = mod(next[x] - next[y], 12);
    const perfect = ic1 === 0 || ic1 === 7;
    if (perfect && ic2 === ic1) {
      const dx = next[x] - prev[x];
      const dy = next[y] - prev[y];
      if (dx !== 0 && dy !== 0 && Math.sign(dx) === Math.sign(dy)) pen += 3;
    }
  }
  return pen;
}

interface VoicedInner {
  a: number;
  t: number;
  b: number;
  cost: number;
}

/** Greedy/exhaustive small search for the lowest-motion SATB voicing of one
 *  chord, given the fixed soprano and the previous voicing. */
function voiceChord(
  chord: Chord,
  sMidi: number,
  prev: Voicing,
  requireCoverage: boolean,
): VoicedInner | null {
  const aCand = voiceCandidates(chord.pcs, RANGE_A);
  const tCand = voiceCandidates(chord.pcs, RANGE_T);
  const bCand = voiceCandidates(chord.pcs, RANGE_B);
  if (!aCand.length || !tCand.length || !bCand.length) return null;

  const rootPc = chord.rootPc;
  const thirdPc = chord.pcs[1];
  const seventhPc = chord.isSeventh ? chord.pcs[3] : -1;

  let best: VoicedInner | null = null;
  let bestCost = Infinity;

  for (const b of bCand) {
    if (b > sMidi) continue;
    for (const t of tCand) {
      if (t < b || t > sMidi) continue;
      for (const a of aCand) {
        if (a < t || a > sMidi) continue;

        if (requireCoverage) {
          const present = new Set([mod(sMidi, 12), mod(a, 12), mod(t, 12), mod(b, 12)]);
          if (!present.has(rootPc) || !present.has(thirdPc)) continue;
          if (seventhPc >= 0 && !present.has(seventhPc)) continue;
        }

        let cost = 0;
        // 1. total inner-voice motion — the thing we minimise
        cost += Math.abs(a - prev.a) + Math.abs(t - prev.t) + Math.abs(b - prev.b);
        // 2. spacing: adjacent upper voices within an octave; bass looser
        const gsa = sMidi - a;
        const gat = a - t;
        const gtb = t - b;
        if (gsa > 12) cost += (gsa - 12) * 1.5;
        if (gat > 12) cost += (gat - 12) * 1.5;
        if (gtb > 19) cost += (gtb - 19) * 1.0;
        // 3. functional bass: prefer root in the bass (root position)
        if (mod(b, 12) !== rootPc) cost += 2.5;
        // 4. avoid a doubled third (esp. the leading tone)
        let thirds = 0;
        for (const n of [sMidi, a, t, b]) if (mod(n, 12) === thirdPc) thirds++;
        if (thirds > 1) cost += 2;
        // 5. no parallel perfect fifths / octaves
        cost += parallelPenalty(prev, { s: sMidi, a, t, b });

        if (cost < bestCost) {
          bestCost = cost;
          best = { a, t, b, cost };
        }
      }
    }
  }
  return best;
}

/**
 * The core call. Given the player's melody note and the harmonic context,
 * pick the best-fitting chord and voice it with minimal motion.
 */
export function harmonize(
  sMidi: number,
  keyRoot: number,
  mode: Mode,
  style: Style,
  prev: HarmonyResult | null,
): HarmonyResult {
  const chords = makeChords(keyRoot, mode, style);
  const mpc = mod(sMidi, 12);
  const prevDeg = prev ? prev.chord.degree : -1;
  // Seed the "previous" voicing so the first chord lands compact & centred.
  const prevVoicing: Voicing = prev
    ? prev.voicing
    : { s: sMidi, a: Math.min(74, sMidi - 3), t: sMidi - 9, b: Math.max(40, sMidi - 17) };

  let candidates = chords.filter((c) => c.pcs.includes(mpc));
  let nonChord = false;
  if (candidates.length === 0) {
    candidates = chords; // chromatic note: treat as a colour tone over any chord
    nonChord = true;
  }

  let bestRes: HarmonyResult | null = null;
  let bestScore = -Infinity;

  for (const c of candidates) {
    let v = voiceChord(c, sMidi, prevVoicing, true);
    if (!v) v = voiceChord(c, sMidi, prevVoicing, false);
    if (!v) continue;
    const func = TONAL_BONUS[c.degree] + transitionScore(prevDeg, c.degree);
    const score = func * 1.6 - v.cost * 0.15 - (nonChord ? 0.8 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestRes = {
        chord: c,
        voicing: { s: sMidi, a: v.a, t: v.t, b: v.b },
        motion: v.cost,
        nonChordSoprano: nonChord,
      };
    }
  }

  if (!bestRes) {
    const c = candidates[0];
    bestRes = {
      chord: c,
      voicing: {
        s: sMidi,
        a: Math.min(RANGE_A[1], sMidi - 3),
        t: Math.min(RANGE_T[1], sMidi - 9),
        b: Math.max(RANGE_B[0], sMidi - 17),
      },
      motion: 0,
      nonChordSoprano: nonChord,
    };
  }
  return bestRes;
}
