// ─────────────────────────────────────────────────────────────────────────────
// text-music.ts — deterministic SPEECH → MELODY mapping.
//
// A line of text becomes a "speech melody" in the spirit of Leoš Janáček's
// nápěvky mluvy (speech-melodies): the natural rise and fall of spoken words
// transcribed as pitched phrases. Here the mapping is heuristic but DETERMINISTIC
// — the same sentence always produces the same melody, so a visitor can type
// their words and RECOGNISE them being sung.
//
// Pipeline:  text → words → syllable-ish units → notes (vowel→pitch,
// consonant→percussion) → phrase contour (rests at punctuation).
//
// No phonemizer dependency: the grapheme→phoneme-ish step is written by hand
// against English vowel/consonant letter heuristics.
// ─────────────────────────────────────────────────────────────────────────────

// ── vowel classes ────────────────────────────────────────────────────────────
// Each vowel cluster maps to a class with a "height" (front/high → bright/high
// pitch, back/low → dark/low pitch) on a 0..1 axis. Height picks a scale degree.

export interface VowelClass {
  key: string; // canonical label shown in readouts
  height: number; // 0 (low/back) .. 1 (high/front)
  bright: number; // 0 (dark) .. 1 (bright) — drives timbre / filter
}

// Order matters: longer clusters are matched first.
const VOWEL_CLUSTERS: { pat: string; cls: VowelClass }[] = [
  { pat: "eigh", cls: { key: "AY", height: 0.92, bright: 0.95 } },
  { pat: "ough", cls: { key: "OW", height: 0.18, bright: 0.2 } },
  { pat: "augh", cls: { key: "AW", height: 0.22, bright: 0.25 } },
  { pat: "ee", cls: { key: "EE", height: 1.0, bright: 1.0 } },
  { pat: "ea", cls: { key: "EE", height: 0.95, bright: 0.95 } },
  { pat: "ie", cls: { key: "AY", height: 0.85, bright: 0.85 } },
  { pat: "ei", cls: { key: "AY", height: 0.85, bright: 0.85 } },
  { pat: "ai", cls: { key: "AY", height: 0.8, bright: 0.8 } },
  { pat: "ay", cls: { key: "AY", height: 0.8, bright: 0.8 } },
  { pat: "oo", cls: { key: "OO", height: 0.1, bright: 0.15 } },
  { pat: "ou", cls: { key: "OW", height: 0.2, bright: 0.3 } },
  { pat: "ow", cls: { key: "OW", height: 0.25, bright: 0.3 } },
  { pat: "oa", cls: { key: "OH", height: 0.35, bright: 0.4 } },
  { pat: "oi", cls: { key: "OY", height: 0.45, bright: 0.6 } },
  { pat: "oy", cls: { key: "OY", height: 0.45, bright: 0.6 } },
  { pat: "au", cls: { key: "AW", height: 0.22, bright: 0.25 } },
  { pat: "aw", cls: { key: "AW", height: 0.22, bright: 0.25 } },
  { pat: "ue", cls: { key: "OO", height: 0.12, bright: 0.2 } },
  { pat: "ui", cls: { key: "EE", height: 0.7, bright: 0.7 } },
];

const SINGLE_VOWELS: Record<string, VowelClass> = {
  i: { key: "IH", height: 0.85, bright: 0.85 },
  e: { key: "EH", height: 0.7, bright: 0.7 },
  a: { key: "AH", height: 0.5, bright: 0.55 },
  o: { key: "OH", height: 0.3, bright: 0.35 },
  u: { key: "UH", height: 0.2, bright: 0.25 },
  y: { key: "IH", height: 0.78, bright: 0.78 },
};

const VOWEL_LETTERS = "aeiouy";

function isVowel(ch: string): boolean {
  return VOWEL_LETTERS.includes(ch);
}

// ── consonant percussion classes ─────────────────────────────────────────────
// A consonant cluster maps to a percussion "voice" describing the noise burst.

export type PercVoice = "click" | "tick" | "hiss" | "thud" | "ring";

export interface PercClass {
  voice: PercVoice;
  tone: number; // centre frequency hint (Hz) for the noise band
  decay: number; // seconds
}

function classifyConsonants(cluster: string): PercClass | null {
  if (!cluster) return null;
  const c = cluster[0];
  // plosives → short clicks
  if ("ptk".includes(c)) return { voice: "click", tone: 2600, decay: 0.05 };
  if ("bdg".includes(c)) return { voice: "thud", tone: 900, decay: 0.08 };
  // sibilants / fricatives → hiss
  if (
    "sfh".includes(c) ||
    cluster.startsWith("sh") ||
    cluster.startsWith("th") ||
    cluster.startsWith("ch")
  )
    return { voice: "hiss", tone: 5200, decay: 0.11 };
  if ("zvj".includes(c)) return { voice: "hiss", tone: 3600, decay: 0.1 };
  // liquids / nasals → soft ring
  if ("lrmn".includes(c)) return { voice: "ring", tone: 1400, decay: 0.13 };
  // default tick
  return { voice: "tick", tone: 1900, decay: 0.06 };
}

// ── note model ───────────────────────────────────────────────────────────────

export interface SyllableNote {
  wordIndex: number; // which word this belongs to
  vowelKey: string; // vowel class label (e.g. "EE")
  degree: number; // scale degree index (0-based into MODE)
  freq: number; // Hz of the sung pitch
  height: number; // 0..1 pitch-height (for the visual ribbon)
  bright: number; // 0..1 timbre brightness
  onset: number; // seconds from phrase start
  dur: number; // seconds (sounding length)
  accent: number; // 0..1 stress accent (loudness / brightness boost)
  onsetPerc: PercClass | null; // leading consonant percussion
  codaPerc: PercClass | null; // trailing consonant percussion
}

export interface WordSpan {
  text: string; // original word text
  index: number;
  onset: number; // seconds — first note onset
  end: number; // seconds — last note end
}

export interface SpeechMelody {
  notes: SyllableNote[];
  words: WordSpan[];
  duration: number; // total seconds
  modeName: string;
  keyName: string;
}

// ── mode / tuning ─────────────────────────────────────────────────────────────
// D-Dorian over two octaves. Degree 0 = D3. We pick degrees from vowel height.

const MODE_NAME = "D Dorian";
const KEY_NAME = "D";

// semitone offsets of D-Dorian degrees: Dorian = W H W W W H W → 0 2 3 5 7 9 10
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const D3 = 146.832; // Hz

// Build a sorted ladder of frequencies for ~2 octaves of the mode.
function buildLadder(): number[] {
  const out: number[] = [];
  for (let oct = 0; oct < 2; oct++) {
    for (const st of DORIAN) {
      out.push(D3 * Math.pow(2, (st + oct * 12) / 12));
    }
  }
  out.push(D3 * Math.pow(2, 24 / 12)); // top D
  return out;
}
const LADDER = buildLadder();

function heightToLadderIndex(height: number): number {
  const i = Math.round(height * (LADDER.length - 1));
  return Math.max(0, Math.min(LADDER.length - 1, i));
}

// ── splitting a word into syllable-ish units ──────────────────────────────────
// We walk the letters and emit one unit per vowel-cluster, capturing the
// consonant run before it (onset) and the trailing consonants (coda) at word end.

interface RawUnit {
  onsetCons: string;
  vowelKey: string;
  height: number;
  bright: number;
}

function matchVowelCluster(
  s: string,
  i: number,
): { cls: VowelClass; len: number } | null {
  for (const { pat, cls } of VOWEL_CLUSTERS) {
    if (pat.length > 1 && s.startsWith(pat, i)) return { cls, len: pat.length };
  }
  const single = SINGLE_VOWELS[s[i]];
  if (single) {
    // greedily absorb following vowel letters into one nucleus
    let len = 1;
    while (i + len < s.length && isVowel(s[i + len])) len++;
    return { cls: single, len };
  }
  return null;
}

function splitWord(raw: string): { units: RawUnit[]; coda: string } {
  const s = raw.toLowerCase().replace(/[^a-z]/g, "");
  const units: RawUnit[] = [];
  let i = 0;
  let pendingCons = "";
  while (i < s.length) {
    if (isVowel(s[i])) {
      const m = matchVowelCluster(s, i);
      if (m) {
        units.push({
          onsetCons: pendingCons,
          vowelKey: m.cls.key,
          height: m.cls.height,
          bright: m.cls.bright,
        });
        pendingCons = "";
        i += m.len;
        continue;
      }
    }
    pendingCons += s[i];
    i++;
  }
  // any trailing consonants are the coda of the last unit
  return { units, coda: pendingCons };
}

// ── prosody helpers ──────────────────────────────────────────────────────────

function isSentenceEnd(tok: string): boolean {
  return /[.!?]$/.test(tok);
}
function isPhraseBreak(tok: string): boolean {
  return /[,;:—–-]$/.test(tok);
}

// ── main compiler ─────────────────────────────────────────────────────────────

const BEAT = 0.34; // base seconds per syllable
const REST_PHRASE = 0.32; // rest after a comma
const REST_SENTENCE = 0.55; // rest after a full stop

export function compileMelody(input: string): SpeechMelody {
  const text = input.trim();
  const tokens = text.length ? text.split(/\s+/) : [];

  const notes: SyllableNote[] = [];
  const words: WordSpan[] = [];
  let t = 0;
  const nTokens = tokens.length || 1;

  tokens.forEach((tok, wi) => {
    const { units, coda } = splitWord(tok);
    const codaPerc = classifyConsonants(coda);

    // Word with no vowels (e.g. punctuation-only) → just advance the rest clock.
    if (units.length === 0) {
      if (isSentenceEnd(tok)) t += REST_SENTENCE;
      else if (isPhraseBreak(tok)) t += REST_PHRASE;
      return;
    }

    const capitalized = /^[A-Z]/.test(tok);
    // Sentence position: words later in the line carry a gentle downward drift
    // (Janáček noted spoken phrases tend to fall); add a small contour bias.
    const posBias = (wi / nTokens) * -0.12;

    const wordStart = t;
    units.forEach((u, ui) => {
      // stress: first syllable of a word, or a capitalized word, is accented.
      const firstSyll = ui === 0;
      let accent = 0.25;
      if (firstSyll) accent += 0.25;
      if (capitalized) accent += 0.2;
      if (wi === 0) accent += 0.15; // opening word
      accent = Math.min(1, accent);

      const height = Math.max(0, Math.min(1, u.height + posBias));
      const idx = heightToLadderIndex(height);
      const freq = LADDER[idx];
      const degree = idx % DORIAN.length;

      // duration: accented & word-final syllables held longer.
      const wordFinal = ui === units.length - 1;
      let dur = BEAT * (0.85 + accent * 0.5);
      if (wordFinal) dur *= 1.25;

      notes.push({
        wordIndex: wi,
        vowelKey: u.vowelKey,
        degree,
        freq,
        height,
        bright: u.bright,
        onset: t,
        dur,
        accent,
        onsetPerc: classifyConsonants(u.onsetCons),
        codaPerc: wordFinal ? codaPerc : null,
      });
      t += dur;
    });

    words.push({ text: tok, index: wi, onset: wordStart, end: t });

    // punctuation → rests / phrase breaks
    if (isSentenceEnd(tok)) t += REST_SENTENCE;
    else if (isPhraseBreak(tok)) t += REST_PHRASE;
    else t += BEAT * 0.18; // tiny gap between words
  });

  const duration = Math.max(t, 0.5);
  return { notes, words, duration, modeName: MODE_NAME, keyName: KEY_NAME };
}

// Built-in lines the visitor can tap, plus the auto-played welcome line.
export const WELCOME_LINE = "Welcome home, the lamp is warm.";

export const EXAMPLE_LINES: string[] = [
  "Welcome home, the lamp is warm.",
  "I am sitting in a room.",
  "The sea remembers every name.",
  "Tell me again how the light fell.",
];
