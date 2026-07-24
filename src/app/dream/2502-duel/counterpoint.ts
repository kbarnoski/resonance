// ════════════════════════════════════════════════════════════════════════════
// Counterpoint Duel (2502) — rule engine
//
// First-species counterpoint scoring, straight out of Fux's *Gradus ad
// Parnassum* (1725): a single upper note is judged against the cantus-firmus
// note directly below it, plus the melodic and harmonic relationship to the
// beat before. Every rule returns a signed reason string so the UI can show
// WHY a move scored what it did.
// ════════════════════════════════════════════════════════════════════════════

export type Voice = "cf" | "cp";

export interface ScoreResult {
  points: number;
  reasons: string[];
  interval: string;
  consonant: boolean;
  perfect: boolean;
}

/** Deterministic PRNG (required by the lab — no Math.random / Date.now). */
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

// ── Cantus firmi ────────────────────────────────────────────────────────────
// Fixed lower voices, all diatonic in C major, 8 notes, opening and closing on
// the tonic so a perfect-consonance frame is always reachable above them.
const C = 60; // MIDI middle C
export const CANTUS_FIRMI: readonly (readonly number[])[] = [
  [C, C + 2, C + 4, C + 5, C + 4, C + 2, C + 7, C], //  C D E F E D G C
  [C, C + 4, C + 5, C + 4, C + 7, C + 5, C + 2, C], //  C E F E G F D C
  [C, C + 2, C + 5, C + 4, C + 5, C + 7, C + 2, C], //  C D F E F G D C
  [C, C + 7, C + 5, C + 4, C + 2, C + 4, C + 5, C], //  C G F E D E F C
];

/** Pick a cantus firmus deterministically from a seed. */
export function pickCantusFirmus(seed: number): number[] {
  const rng = mulberry32(seed);
  const idx = Math.floor(rng() * CANTUS_FIRMI.length) % CANTUS_FIRMI.length;
  return [...CANTUS_FIRMI[idx]];
}

// ── Candidate upper pitches ─────────────────────────────────────────────────
// Diatonic C-major scale from G4 up to C6 — the cells the counterpoint voice
// can occupy. Descending so the staff draws high notes at the top.
export const CANDIDATES: readonly number[] = [
  84, 83, 81, 79, 77, 76, 74, 72, 71, 69, 67,
];

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export function noteName(midi: number): string {
  const n = NOTE_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${n}${oct}`;
}

/** Human name for a vertical interval given its signed semitone span. */
function intervalName(diff: number): string {
  const m = ((diff % 12) + 12) % 12;
  if (m === 0) return diff >= 12 ? "octave" : "unison";
  if (m === 1 || m === 2) return "2nd";
  if (m === 3 || m === 4) return "3rd";
  if (m === 5) return "4th";
  if (m === 6) return "tritone";
  if (m === 7) return "5th";
  if (m === 8 || m === 9) return "6th";
  return "7th";
}

const CONSONANT = new Set([0, 3, 4, 7, 8, 9]);
const PERFECT = new Set([0, 7]);

/**
 * Score one counterpoint note at `beat` against the cantus firmus, considering
 * the previous upper note for motion and parallel-perfect checks.
 * `prevUpper` is null on the first placed beat.
 */
export function scoreMove(
  beat: number,
  upper: number,
  prevUpper: number | null,
  cf: readonly number[],
): ScoreResult {
  const n = cf.length;
  const cfNote = cf[beat];
  const diff = upper - cfNote;
  const m = ((diff % 12) + 12) % 12;
  const consonant = CONSONANT.has(m);
  const perfect = PERFECT.has(m);
  const name = intervalName(diff);
  const reasons: string[] = [];
  let points = 0;

  // Vertical consonance vs the cantus firmus.
  if (consonant) {
    if (perfect) {
      points += 2;
      reasons.push(`+2 perfect ${name}`);
    } else {
      points += 3;
      reasons.push(`+3 consonant ${name}`);
    }
  } else {
    points -= 5;
    reasons.push(`−5 dissonant ${name}`);
  }

  // Opening and closing must be a perfect consonance.
  const isFirst = beat === 0;
  const isLast = beat === n - 1;
  if (isFirst || isLast) {
    const edge = isFirst ? "open" : "close";
    if (perfect) {
      points += 4;
      reasons.push(`+4 perfect ${edge}`);
    } else {
      points -= 6;
      reasons.push(`−6 weak ${edge}`);
    }
  }

  // Motion + melodic rules relative to the previous beat.
  if (beat > 0 && prevUpper !== null) {
    const cpMove = upper - prevUpper;
    const cfMove = cfNote - cf[beat - 1];
    const prevDiff = prevUpper - cf[beat - 1];
    const pm = ((prevDiff % 12) + 12) % 12;
    const dirCp = Math.sign(cpMove);
    const dirCf = Math.sign(cfMove);

    // No parallel perfect fifths / octaves.
    if (perfect && pm === m && dirCp !== 0 && dirCp === dirCf) {
      points -= 8;
      reasons.push(`−8 parallel ${m === 7 ? "fifths" : "octaves"}`);
    }

    // Prefer contrary / oblique motion over similar.
    if (dirCp === 0 || dirCf === 0) {
      points += 1;
      reasons.push("+1 oblique motion");
    } else if (dirCp !== dirCf) {
      points += 2;
      reasons.push("+2 contrary motion");
    } else if (perfect) {
      points -= 2;
      reasons.push("−2 direct into perfect");
    } else {
      reasons.push("+0 similar motion");
    }

    // Prefer stepwise counterpoint; penalise leaps larger than a sixth.
    const leap = Math.abs(cpMove);
    if (leap === 0) {
      points -= 1;
      reasons.push("−1 repeated note");
    } else if (leap <= 2) {
      points += 1;
      reasons.push("+1 stepwise");
    } else if (leap > 9) {
      points -= 4;
      reasons.push("−4 large leap");
    }
  }

  return { points, reasons, interval: name, consonant, perfect };
}
