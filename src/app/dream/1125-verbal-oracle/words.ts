// words.ts — four one-syllable preset recipes for the Verbal Oracle.
//
// Formant targets use canonical adult-male values from Peterson & Barney (1952).
// Diphthongs (life, say, flow) are written as a formant *glide* between two
// vowel targets — the internal movement gives the auditory system more raw
// material to reorganize into illusory alternates.
//
//   /ɛ/ 530 / 1840 / 2480     /i/ 270 / 2290 / 3010
//   /ɑ/ 730 / 1090 / 2440     /o/ 570 /  840 / 2410
//   /u/ 300 /  870 / 2240
//
// The `alternates` lists are curated placard hints — the words listeners often
// report hearing once the transformation kicks in — NOT measurements.

import type { WordRecipe } from "./voice";

export const WORDS: WordRecipe[] = [
  {
    // Warren's canonical VTE stimulus. /r ɛ s t/.
    label: "rest",
    f0: 120,
    duration: 0.5,
    voicedEnd: 0.32,
    vowelScript: [
      // /r/ onset colour: low F3, then settle onto /ɛ/.
      { t: 0.0, f1: 480, f2: 1350, f3: 1600 },
      { t: 0.09, f1: 530, f2: 1840, f3: 2480 },
      { t: 0.28, f1: 530, f2: 1840, f3: 2480 },
    ],
    consonants: [
      { t: 0.31, dur: 0.13, center: 6200, q: 3, gain: 0.45 }, // /s/ hiss
      { t: 0.45, dur: 0.035, center: 3400, q: 1.4, gain: 0.6 }, // /t/ burst
    ],
    alternates: ["stress", "dress", "arrest", "less", "west", "wrist"],
  },
  {
    // /l aɪ f/ — a diphthong glide /ɑ/→/i/ with a labiodental /f/ release.
    label: "life",
    f0: 116,
    duration: 0.52,
    voicedEnd: 0.4,
    vowelScript: [
      { t: 0.0, f1: 380, f2: 1100, f3: 2500 }, // /l/ onset
      { t: 0.1, f1: 730, f2: 1090, f3: 2440 }, // /ɑ/
      { t: 0.34, f1: 300, f2: 2200, f3: 2960 }, // →/i/
    ],
    consonants: [
      { t: 0.4, dur: 0.11, center: 4200, q: 1.6, gain: 0.34 }, // /f/ hiss
    ],
    alternates: ["like", "lie", "fly", "life-like", "line", "alive"],
  },
  {
    // /s eɪ/ — sibilant onset into a diphthong glide /ɛ/→/i/.
    label: "say",
    f0: 125,
    duration: 0.5,
    voicedEnd: 0.5,
    vowelScript: [
      { t: 0.14, f1: 530, f2: 1840, f3: 2480 }, // /ɛ/
      { t: 0.48, f1: 300, f2: 2250, f3: 2980 }, // →/i/
    ],
    consonants: [
      { t: 0.0, dur: 0.13, center: 6400, q: 3, gain: 0.4 }, // /s/ onset
    ],
    alternates: ["stay", "see", "sway", "essay", "hey", "safe"],
  },
  {
    // /f l oʊ/ — fricative onset, approximant, diphthong glide /o/→/u/.
    label: "flow",
    f0: 110,
    duration: 0.54,
    voicedEnd: 0.54,
    vowelScript: [
      { t: 0.13, f1: 360, f2: 1000, f3: 2450 }, // /l/ into rounding
      { t: 0.24, f1: 570, f2: 840, f3: 2410 }, // /o/
      { t: 0.5, f1: 320, f2: 870, f3: 2260 }, // →/u/
    ],
    consonants: [
      { t: 0.0, dur: 0.12, center: 3800, q: 1.6, gain: 0.3 }, // /f/ onset
    ],
    alternates: ["flow", "grow", "for", "float", "no", "below"],
  },
];
