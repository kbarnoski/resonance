// ─────────────────────────────────────────────────────────────────────────────
// prosody.ts — the CROSS-MODAL bridge. Pure, audio-agnostic text → sound plan.
//
// A committed line of writing is read as *rhythm*, not meaning. Each word becomes
// a timed slice-plan keyed on its shape: length → slice duration, char-code sum →
// which take + a golden-ratio offset into it, vowel ratio → brightness + a subtle
// transpose, terminal punctuation → accents and rests. The line's own vowel
// density biases its whole register so different lines settle into different
// bands and their loops drift against each other (Reich-style phasing).
//
// Nothing here touches the Web Audio API — engine.ts resolves the abstract plan
// (charSum, offsetFrac) against the actually-loaded buffers. Keeping it pure
// makes the mapping legible and testable.
// ─────────────────────────────────────────────────────────────────────────────

/** φ − 1 — irrational step so successive words land on non-repeating offsets. */
const GOLDEN = 0.6180339887498949;

const VOWELS = new Set("aeiouyAEIOUY".split(""));

/** One word (or a rest) of a line's loop, positioned on the loop timeline. */
export interface WordProsody {
  /** The word as typed (with its punctuation) — for display. */
  text: string;
  /** Seconds from the start of the loop cycle to this word's onset. */
  onset: number;
  /** Slice length in seconds. */
  dur: number;
  /** A pure-punctuation token: a silent rest, still shown on the manuscript. */
  isRest: boolean;
  /** Sum of char codes of the word's letters — picks the take (mod n takes). */
  charSum: number;
  /** Golden-ratio fraction 0..1 — where in the take the slice is cut from. */
  offsetFrac: number;
  /** Playback rate (transpose), ~0.9..1.12 before the line's register bias. */
  rate: number;
  /** Lowpass cutoff in Hz — vowel-bright words open, consonant clusters close. */
  cutoff: number;
  /** Dynamic accent multiplier — terminal '!'/'?' hit harder. */
  gainMul: number;
}

/** A whole committed line, parsed into a looping plan. */
export interface LineProsody {
  words: WordProsody[];
  /** Total loop length in seconds (line length → loop duration). */
  loopDur: number;
}

function vowelRatio(core: string): number {
  if (core.length === 0) return 0;
  let v = 0;
  for (const ch of core) if (VOWELS.has(ch)) v += 1;
  return v / core.length;
}

function charSumOf(core: string): number {
  let s = 0;
  for (let i = 0; i < core.length; i += 1) s += core.charCodeAt(i);
  return s;
}

const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x));

/**
 * Parse one line of text into a looping sound plan. Deterministic: the same
 * text always yields the same voice, so a restored manuscript sounds identical.
 */
export function parseLine(text: string): LineProsody {
  const tokens = text.trim().split(/\s+/).filter(Boolean);

  // Line-level register bias: vowel-dense lines sit a touch higher; long lines
  // settle lower. Keeps different lines in different bands.
  let lineVowels = 0;
  let lineLetters = 0;
  for (const t of tokens) {
    for (const ch of t) {
      if (/[\p{L}]/u.test(ch)) {
        lineLetters += 1;
        if (VOWELS.has(ch)) lineVowels += 1;
      }
    }
  }
  const lineVowelDensity = lineLetters > 0 ? lineVowels / lineLetters : 0.4;
  const registerBias = clamp(0.82 + lineVowelDensity * 0.42, 0.78, 1.24);

  const words: WordProsody[] = [];
  let onset = 0;
  const WORD_GAP = 0.03;

  for (const raw of tokens) {
    // Core letters/digits only (strip punctuation) for the rhythmic reading.
    const core = raw.replace(/[^\p{L}\p{N}]/gu, "");

    if (core.length === 0) {
      // A pure-punctuation token — a rest / breath, still drawn as a glyph.
      const dur = 0.2;
      words.push({
        text: raw,
        onset,
        dur,
        isRest: true,
        charSum: 0,
        offsetFrac: 0,
        rate: 1,
        cutoff: 1200,
        gainMul: 0,
      });
      onset += dur + WORD_GAP;
      continue;
    }

    const len = clamp(core.length, 1, 14);
    const dur = 0.16 + len * 0.045; // 1 char ≈ 0.2s … 14 chars ≈ 0.79s
    const charSum = charSumOf(core);
    const offsetFrac = (charSum * GOLDEN) % 1;
    const vr = vowelRatio(core);
    const rate = clamp((0.9 + vr * 0.22) * registerBias, 0.72, 1.28);
    const cutoff = 600 + vr * 3600; // 600 … 4200 Hz

    // Terminal punctuation → accent + trailing rest (the line breathes).
    let gainMul = 1;
    let trailRest = 0;
    if (/[!?]$/.test(raw)) {
      gainMul = 1.35;
      trailRest = 0.24;
    } else if (/[.]$/.test(raw)) {
      gainMul = 1.16;
      trailRest = 0.22;
    } else if (/[,;:—-]$/.test(raw)) {
      gainMul = 1.0;
      trailRest = 0.13;
    }

    words.push({
      text: raw,
      onset,
      dur,
      isRest: false,
      charSum,
      offsetFrac,
      rate,
      cutoff,
      gainMul,
    });
    onset += dur + WORD_GAP + trailRest;
  }

  // A short breath before the loop repeats.
  const loopDur = Math.max(0.6, onset + 0.3);
  return { words, loopDur };
}
