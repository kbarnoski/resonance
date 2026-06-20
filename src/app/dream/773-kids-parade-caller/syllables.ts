// Syllable-rhythm analysis for the Parade Caller.
// Pure functions — no React, no hooks. (Names never start with `use`.)

// Drum voices in the parade percussion kit.
export type Drum = "kick" | "snare" | "hat" | "tom" | "cowbell" | "woodblock";

// One word turned into a looping 1-bar percussion pattern.
export interface WordLoop {
  id: number;
  word: string;
  syllables: number;
  // 16-step grid. Each step is null (rest) or a hit { drum, gain }.
  steps: ({ drum: Drum; gain: number } | null)[];
  drum: Drum; // the main voice/color this word marches as
  color: string;
  bounceStep: number[]; // step indices on which the character bounces
}

// Estimate syllable count from spelling: count vowel-groups, drop a silent
// trailing 'e', clamp to >= 1. A robust toddler-friendly heuristic.
export function countSyllables(raw: string): number {
  const word = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 1;
  const groups = word.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  // silent trailing 'e' (but not for words like "the" -> still 1)
  if (word.length > 2 && word.endsWith("e") && !/[aeiouy]e$/.test(word)) {
    // only subtract if removing it still leaves a vowel group
    if (n > 1) n -= 1;
  }
  // common "-le" ending adds a beat back (cas-tle, ta-ble)
  if (/[^aeiouy]le$/.test(word)) n += 1;
  return Math.max(1, Math.min(n, 6));
}

// Pick which syllable carries the stress. Simple, lively heuristic:
// 1 syll -> the hit; 2 -> first; 3 -> first; 4+ -> second. Good enough to
// make the groove feel intentional, not flat.
export function stressIndex(syllables: number): number {
  if (syllables <= 2) return 0;
  if (syllables === 3) return 0;
  return 1;
}

// Bright primary-leaning palette + a drum voice, chosen by syllable count so
// repeated word-shapes stay visually/aurally distinct and parade-bright.
const VOICE_BY_SYLL: { drum: Drum; color: string }[] = [
  { drum: "kick", color: "#ef4444" }, // 1 — big red BOOM
  { drum: "snare", color: "#f59e0b" }, // 2 — sunny clap
  { drum: "tom", color: "#22c55e" }, // 3 — galloping green
  { drum: "cowbell", color: "#3b82f6" }, // 4 — blue bell
  { drum: "woodblock", color: "#a855f7" }, // 5 — purple block
  { drum: "hat", color: "#ec4899" }, // 6 — pink shaker
];

let _loopId = 0;

// Turn a word into a 1-bar (16-step) percussion loop. Syllables are spaced
// evenly across the bar; the downbeat is accented, the stressed syllable is
// loudest, and a steady hi-hat keeps the parade marching underneath.
export function makeWordLoop(rawWord: string): WordLoop {
  const word = rawWord.trim();
  const syllables = countSyllables(word);
  const stress = stressIndex(syllables);
  const voice = VOICE_BY_SYLL[Math.min(syllables - 1, VOICE_BY_SYLL.length - 1)];

  const steps: ({ drum: Drum; gain: number } | null)[] = new Array(16).fill(null);
  const bounceStep: number[] = [];

  // Place the syllable hits evenly across 16 steps.
  for (let i = 0; i < syllables; i++) {
    const pos = Math.round((i / syllables) * 16) % 16;
    const isDownbeat = pos === 0;
    const isStress = i === stress;
    let gain = 0.55;
    if (isDownbeat) gain = 0.95;
    if (isStress) gain = Math.max(gain, 0.85);
    steps[pos] = { drum: voice.drum, gain };
    bounceStep.push(pos);
  }

  // Steady marching hi-hat on the off-eighths for parade drive (quieter,
  // and only if it doesn't collide with a main hit).
  for (let p = 2; p < 16; p += 4) {
    if (!steps[p]) steps[p] = { drum: "hat", gain: 0.28 };
  }

  return {
    id: _loopId++,
    word,
    syllables,
    steps,
    drum: voice.drum,
    color: voice.color,
    bounceStep,
  };
}
