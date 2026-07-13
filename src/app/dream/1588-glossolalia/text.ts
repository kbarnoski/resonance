// ════════════════════════════════════════════════════════════════════════════
// 1588 — glossolalia · the syntactic flood
//
// A seeded morpheme assembler that fills the whole field with meaningful-FEELING
// pseudo-language: asemic overload that READS as meaning without reference
// (cf. Henri Michaux's asemic writing; Terence McKenna's "self-transforming
// machine elves / syntactic light" glossolalia).
//
// Framed under the C×G×D computational-neurophenomenology model
// (Frontiers in Psychology, 2026, doi 10.3389/fpsyg.2026.1819038): a
// hallucination is the brain's *Generator* replaying learned structure
// top-down — meaning-SHAPED, not noise. This module IS that generator: a
// deterministic top-down replay of phonotactic structure. The moving apertures
// (see page.tsx) are the *Classifier* momentarily finding "effective causes" —
// legible words — in the generated flood.
//
// Every random draw routes through a seeded mulberry32 PRNG — no wall-clock or
// unseeded entropy sources anywhere: the flood is byte-for-byte reproducible.
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

// Phonotactic inventory — chosen to feel utterable and "linguistic" across
// several imagined language families, never resolving to a real lexicon.
const ONSETS = [
  "th", "sh", "kr", "vl", "gn", "zh", "tl", "mn", "pr", "sk", "dr", "fl",
  "ny", "qu", "br", "st", "hl", "wr", "kh", "ts", "gl", "sv", "xh", "rh",
  "n", "m", "l", "r", "s", "k", "t", "v", "z", "h", "y", "w", "",
];
const NUCLEI = [
  "a", "e", "i", "o", "u", "aa", "ee", "ai", "au", "ou", "ei", "ia", "uo",
  "ae", "oa", "y", "ua", "io", "eo",
];
const CODAS = [
  "n", "m", "r", "l", "sh", "th", "s", "k", "ng", "kt", "lm", "rn", "st",
  "", "", "", "x", "ph", "rk",
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
function word(rng: () => number): string {
  const n = 1 + Math.floor(rng() * rng() * 4); // skew short
  let w = "";
  for (let i = 0; i < n; i++) {
    if (i > 0 && rng() < 0.12) w += rng() < 0.5 ? "-" : "'";
    w += syllable(rng);
  }
  return w;
}

// Occasional punctuation to imply grammar / cadence without meaning.
const PUNCT = [",", ".", " ·", " —", ";", " ,", ".", ".", "…"];

/**
 * Build a single dense line of pseudo-language at least `minChars` long.
 * Whitespace-`pre` rows: each line is one visual row of the flood.
 */
export function buildLine(rng: () => number, minChars: number): string {
  let s = "";
  while (s.length < minChars) {
    s += word(rng);
    const r = rng();
    if (r < 0.14) s += pick(rng, PUNCT) + " ";
    else s += " ";
  }
  return s;
}

/**
 * Build the whole flood: `rows` lines, each ≥ `cols` characters, from one seed.
 * Deterministic given (seed, rows, cols).
 */
export function buildFlood(seed: number, rows: number, cols: number): string[] {
  const rng = mulberry32(seed);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    lines.push(buildLine(rng, cols));
  }
  return lines;
}
