// text-music.ts — deterministic linguistic→music mapping for Spoken Spell
// Same words always produce the same pitches/durations/accents.

// ─── D Pentatonic scale across ~2 octaves ─────────────────────────────────────
// D E F# A B  (D4=294Hz as base)
// We encode as MIDI note numbers for easy Hz conversion.
// Two octaves: D4 E4 F#4 A4 B4 D5 E5 F#5 A5 B5
export const PENTATONIC_MIDI = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ─── Stable string hash (djb2) ────────────────────────────────────────────────
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ─── Vowel / consonant analysis ───────────────────────────────────────────────
const VOWELS = new Set("aeiouAEIOU");

export function countVowels(word: string): number {
  let n = 0;
  for (const c of word) if (VOWELS.has(c)) n++;
  return n;
}

function countConsonants(word: string): number {
  let n = 0;
  for (const c of word) if (/[a-zA-Z]/.test(c) && !VOWELS.has(c)) n++;
  return n;
}

// ─── Pitch mapping ────────────────────────────────────────────────────────────
// Hash the lowercased letters to a pentatonic index.
export function wordToPitchMidi(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return PENTATONIC_MIDI[0];
  const idx = hashStr(clean) % PENTATONIC_MIDI.length;
  return PENTATONIC_MIDI[idx];
}

// ─── Duration mapping ─────────────────────────────────────────────────────────
// Vowel-heavy words get longer sustained tones, short consonant words get plucks.
// Returns duration in beats (at ~100 BPM → 1 beat = 0.6s).
export function wordToDurationBeats(word: string): number {
  const vowels = countVowels(word);
  const len = word.replace(/[^a-zA-Z]/g, "").length;
  if (len === 0) return 0.5;
  const ratio = vowels / len;
  if (ratio >= 0.5) return 1.5; // sustained (vowel-rich: "beautiful", "aura")
  if (ratio >= 0.35) return 1.0; // standard beat
  return 0.5; // pluck (consonant-heavy: "strength", "rhythms")
}

// ─── Accent (velocity/gain) ───────────────────────────────────────────────────
// Stressed syllable heuristic: longer words (≥3 syllables) get moderate accent;
// short emphatic words like "yes","now" get the strongest accent.
export function wordToAccent(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  const len = clean.length;
  if (len <= 2) return 0.85;           // short emphatic
  if (len <= 4) return 0.72;
  if (len <= 7) return 0.65;
  return 0.58;                          // long words = softer body
}

// ─── Timbre flag ──────────────────────────────────────────────────────────────
// Consonant-heavy → "pluck"; vowel-heavy → "sustain"
export type Timbre = "pluck" | "sustain";

export function wordToTimbre(word: string): Timbre {
  const clean = word.replace(/[^a-zA-Z]/g, "");
  if (!clean) return "sustain";
  const vowels = countVowels(clean);
  const consonants = countConsonants(clean);
  return consonants > vowels ? "pluck" : "sustain";
}

// ─── Sentence-level analysis ─────────────────────────────────────────────────
export interface WordNote {
  word: string;         // original word token
  pitchMidi: number;
  durationBeats: number;
  accent: number;       // 0–1 gain multiplier
  timbre: Timbre;
}

export interface PhraseScore {
  notes: WordNote[];
}

// Tokenise text into words, respecting sentence boundaries.
// Returns phrases separated by punctuation or empty strings.
export function tokeniseToPhrases(text: string): string[][] {
  // Split on sentence-ending punctuation as phrase boundaries
  const sentenceRe = /[.!?]+/g;
  const sentences = text.split(sentenceRe).map(s => s.trim()).filter(s => s.length > 0);
  return sentences.map(s =>
    s.split(/\s+/).map(w => w.trim()).filter(w => w.length > 0)
  );
}

export function buildPhraseScore(words: string[]): PhraseScore {
  const notes: WordNote[] = words.map(w => ({
    word: w,
    pitchMidi: wordToPitchMidi(w),
    durationBeats: wordToDurationBeats(w),
    accent: wordToAccent(w),
    timbre: wordToTimbre(w),
  }));
  return { notes };
}
