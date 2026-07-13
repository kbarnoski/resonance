// ════════════════════════════════════════════════════════════════════════════
// 1596 — lectio-verse · the seeded pseudo-scripture generator
//
// A deterministic morpheme assembler that fills a tall vertical CODEX COLUMN
// with meaningful-FEELING pseudo-language: pronounceable pseudo-words arranged
// into short verse-lines, like a page of an illuminated manuscript whose
// letters you cannot quite read. The reading light (see page.tsx) walks this
// column one WORD per struck note, sounding each as it lands — the piece
// literally "reads" the text aloud in the cadence of the performance.
//
// Framed on *lectio divina* — the slow, meditative reading of scripture one
// phrase at a time — and on asemic writing (Henri Michaux): text that reads as
// meaning without reference.
//
// Determinism: every draw routes through a seeded mulberry32 PRNG. No wall-clock
// and no unseeded entropy anywhere — the whole codex is byte-for-byte
// reproducible from its seed.
// ════════════════════════════════════════════════════════════════════════════

/** Seeded PRNG — mulberry32. Deterministic, fast, good enough for texture. */
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

// Phonotactic inventory — chosen to feel utterable and liturgical across
// several imagined language families, never resolving to a real lexicon.
const ONSETS = [
  "th", "sh", "kr", "vl", "gn", "zh", "tl", "mn", "pr", "sk", "dr", "fl",
  "ny", "qu", "br", "st", "hl", "wr", "kh", "ts", "gl", "sv", "rh", "ln",
  "n", "m", "l", "r", "s", "k", "t", "v", "z", "h", "y", "w", "",
];
const NUCLEI = [
  "a", "e", "i", "o", "u", "aa", "ee", "ai", "au", "ou", "ei", "ia", "uo",
  "ae", "oa", "y", "ua", "io", "eo",
];
const CODAS = [
  "n", "m", "r", "l", "sh", "th", "s", "k", "ng", "kt", "lm", "rn", "st",
  "", "", "", "ph", "rk",
];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** One syllable: onset + nucleus + (sometimes) coda. */
function syllable(rng: () => number): string {
  const on = pick(rng, ONSETS);
  const nu = pick(rng, NUCLEI);
  const co = rng() < 0.42 ? pick(rng, CODAS) : "";
  return on + nu + co;
}

/** A word: 1–4 syllables, occasionally hyphenated / apostrophized. */
function makeWord(rng: () => number): string {
  const n = 1 + Math.floor(rng() * rng() * 4); // skew short
  let w = "";
  for (let i = 0; i < n; i++) {
    if (i > 0 && rng() < 0.1) w += rng() < 0.5 ? "-" : "'";
    w += syllable(rng);
  }
  return w;
}

// Occasional trailing punctuation to imply grammar / cadence without meaning.
const PUNCT = [",", ",", ".", ";", " ·", "—", ":"];

export type CodexWord = {
  /** The bare word text (no punctuation, no separators). */
  text: string;
  /** Trailing punctuation glued to the word, or "" . */
  tail: string;
  /** Character offset of the word's first glyph in the full codex string. */
  start: number;
  /** Character offset one past the word's last glyph (excludes tail). */
  end: number;
  /** Visual line index the word sits on (for scroll centring in the fallback). */
  line: number;
  /** Seeded scale-step index (see synth.ts) — the note this word sounds. */
  pitch: number;
};

export type Codex = {
  /** The full pre-formatted codex text (verse-lines joined by "\n"). */
  text: string;
  /** Every word with its offsets, tail punctuation, line and pitch. */
  words: CodexWord[];
};

/**
 * Build the whole codex: `wordCount` pseudo-words laid into short verse-lines,
 * with per-word character offsets and a seeded melodic pitch contour. Fully
 * deterministic given (seed, wordCount).
 *
 * The pitch contour is a bounded seeded random walk over `steps` scale degrees
 * so consecutive words move by small intervals — a chant-like line rather than
 * white noise.
 */
export function buildCodex(seed: number, wordCount: number, steps = 21): Codex {
  const rng = mulberry32(seed);
  const words: CodexWord[] = [];

  let text = "";
  let line = 0;
  let wordsThisLine = 0;
  let lineTarget = 3 + Math.floor(rng() * 4); // 3–6 words per verse-line
  let walk = Math.floor(steps * 0.5); // start mid-register

  for (let i = 0; i < wordCount; i++) {
    const t = makeWord(rng);
    // trailing punctuation ~1 in 5 words, forcing a small cadence
    const hasPunct = rng() < 0.2;
    const tail = hasPunct ? pick(rng, PUNCT) : "";

    const start = text.length;
    text += t;
    const end = text.length;
    if (tail) text += tail;

    // seeded melodic random walk, clamped into [0, steps)
    walk += Math.round((rng() - 0.5) * 5);
    if (walk < 0) walk = -walk;
    if (walk >= steps) walk = steps - 1 - (walk - steps);
    if (walk < 0) walk = 0;
    const pitch = Math.max(0, Math.min(steps - 1, walk));

    words.push({ text: t, tail, start, end, line, pitch });

    wordsThisLine++;
    const lastWord = i === wordCount - 1;
    if (!lastWord) {
      // break the line after enough words, or hard-break after strong punctuation
      const strong = tail === "." || tail === ":" || tail === "—";
      if (wordsThisLine >= lineTarget || (strong && wordsThisLine >= 2)) {
        text += "\n";
        line++;
        wordsThisLine = 0;
        lineTarget = 3 + Math.floor(rng() * 4);
      } else {
        text += " ";
      }
    }
  }

  return { text, words };
}
