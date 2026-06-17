// harmony.ts — the reharmonizer (the heart).
//
// CORE TECHNIQUE: real-time chord-chasing / reharmonization via a decomposed
// RETRIEVE → EDIT → RERANK pipeline, directly inspired by
//   He, Li, Sun, Huang, "A Decomposed Retrieval-Edit-Rerank Framework for
//   Chord Generation" (arXiv:2605.07489, May 2026).
//
// The child taps any of the 12 chromatic pitch classes. That pitch class is a
// HARD CONSTRAINT. We then:
//   (1) RETRIEVE a lush palette of candidate chords (diatonic + borrowed) that
//       could contain or warmly frame that note.
//   (2) EDIT/score each candidate by fit (chord-tone > 9th/13th extension,
//       minus a penalty for harsh b9 clashes against the chord's tones).
//   (3) RERANK by adding a greedy nearest-voice voice-leading cost vs. the
//       previously sounding chord, so the pad voices GLIDE minimally.
// We pick the winner and glide 3–4 sustained pad voices to it.
//
// This is the INVERSE of a pentatonic "no-wrong-notes" cage: all 12 notes are
// playable, and the harmony moves UNDER the note so any tap blooms a new,
// consonant color. Consonance is contextual.

export const PITCH_NAMES = [
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

// 12 chromatic petals, arranged so the ring goes round the chromatic circle.
// Each gets a distinct saturated hue and a base frequency (one comfortable
// octave, C4..B4) for the soft bell that plays the literal tapped note.
export interface Petal {
  pc: number; // pitch class 0..11
  name: string;
  hue: number; // distinct saturated color (degrees)
  bellHz: number;
}

const C4 = 261.63;
function pcToHz(pc: number): number {
  return C4 * Math.pow(2, pc / 12);
}

export const PETALS: Petal[] = PITCH_NAMES.map((name, pc) => ({
  pc,
  name,
  hue: Math.round((pc / 12) * 360),
  bellHz: pcToHz(pc),
}));

export const PETAL_COUNT = PETALS.length;

// ── Candidate chord palette (the RETRIEVAL set) ────────────────────────────
// A lush set of ~10 chords in C: diatonic I/ii/iii/IV/V/vi plus borrowed
// colors. Pitch classes are listed root-first; "voices" are the 3–4 pad
// pitches we actually sustain (kept in a comfortable mid register for pads).
export interface ChordCandidate {
  name: string; // display name, e.g. "Cmaj9"
  hue: number; // field hue this chord tints the aurora toward
  borrowed: boolean; // borrowed colors get extra shimmer
  // chord-tones as pitch classes (the "core" identity)
  tones: number[];
  // warm extensions (9th/13th) that still feel consonant if tapped
  extensions: number[];
  // the 3–4 sustained pad voices, as MIDI note numbers (mid register)
  voices: number[];
}

// MIDI helper: note number → Hz (A4 = 69 = 440Hz).
export function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// pitch class helpers
function pc(m: number): number {
  return ((m % 12) + 12) % 12;
}

// Pad voices live roughly in the C3..C5 band so they sit warm under the bell.
export const CHORD_PALETTE: ChordCandidate[] = [
  // I — Cmaj9 (C E G B D)
  {
    name: "Cmaj9",
    hue: 45,
    borrowed: false,
    tones: [0, 4, 7, 11],
    extensions: [2, 9],
    voices: [48, 55, 59, 62], // C3 G3 B3 D4
  },
  // ii — Dm9 (D F A C E)
  {
    name: "Dm9",
    hue: 150,
    borrowed: false,
    tones: [2, 5, 9, 0],
    extensions: [4, 7],
    voices: [50, 57, 60, 64], // D3 A3 C4 E4
  },
  // iii — Em7 (E G B D)
  {
    name: "Em7",
    hue: 175,
    borrowed: false,
    tones: [4, 7, 11, 2],
    extensions: [9],
    voices: [52, 59, 62, 64], // E3 B3 D4 E4
  },
  // IV — Fmaj7 (F A C E)
  {
    name: "Fmaj7",
    hue: 90,
    borrowed: false,
    tones: [5, 9, 0, 4],
    extensions: [7, 2],
    voices: [53, 60, 64, 65], // F3 C4 E4 F4
  },
  // V — G13 / G7sus flavor (G B D F + A/E color)
  {
    name: "G13",
    hue: 25,
    borrowed: false,
    tones: [7, 11, 2, 5],
    extensions: [9, 4],
    voices: [55, 59, 62, 65], // G3 B3 D4 F4
  },
  // vi — Am9 (A C E G B)
  {
    name: "Am9",
    hue: 270,
    borrowed: false,
    tones: [9, 0, 4, 7],
    extensions: [11, 2],
    voices: [57, 60, 64, 67], // A3 C4 E4 G4
  },
  // bVI — Abmaj7 (Ab C Eb G) — borrowed warm glow
  {
    name: "A♭maj7",
    hue: 320,
    borrowed: true,
    tones: [8, 0, 3, 7],
    extensions: [10, 5],
    voices: [56, 60, 63, 67], // Ab3 C4 Eb4 G4
  },
  // bVII — Bbmaj9 (Bb D F A C) — borrowed lift
  {
    name: "B♭maj9",
    hue: 200,
    borrowed: true,
    tones: [10, 2, 5, 9],
    extensions: [0, 7],
    voices: [58, 62, 65, 69], // Bb3 D4 F4 A4
  },
  // V/V — D7 (D F# A C) — secondary dominant, bright pull
  {
    name: "D7",
    hue: 15,
    borrowed: true,
    tones: [2, 6, 9, 0],
    extensions: [4, 11],
    voices: [50, 57, 60, 66], // D3 A3 C4 F#4
  },
  // chromatic mediant — Ebmaj7 (Eb G Bb D)
  {
    name: "E♭maj7",
    hue: 295,
    borrowed: true,
    tones: [3, 7, 10, 2],
    extensions: [5, 0],
    voices: [51, 58, 62, 67], // Eb3 Bb3 D4 G4
  },
];

// ── The reharmonizer result ────────────────────────────────────────────────
export interface Reharm {
  chord: ChordCandidate;
  // how the tapped pc relates to the chosen chord (for the readout/timbre):
  role: "chord-tone" | "extension" | "color";
  // glided pad voice frequencies (Hz)
  voiceHz: number[];
  // bell frequency for the literal tapped note
  bellHz: number;
}

// (1)+(2) RETRIEVE + EDIT/score: fit of a candidate to the constraint pc.
// Higher is better. Chord-tone beats extension beats a faint "color" landing,
// and we subtract a penalty when the tapped note sits a harsh b9 (1 semitone,
// i.e. minor-9th class) above any chord tone.
function scoreFit(cand: ChordCandidate, notePc: number): number {
  let role: Reharm["role"];
  let base: number;
  if (cand.tones.includes(notePc)) {
    base = 10; // chord-tone: best landing
    role = "chord-tone";
  } else if (cand.extensions.includes(notePc)) {
    base = 6; // warm 9th/13th extension
    role = "extension";
  } else {
    base = 1.5; // still framed as a gentle color tone
    role = "color";
  }

  // harsh b9 penalty: a tapped note one semitone above a chord tone clashes.
  // (we forgive the root's own b9 slightly less harshly than inner tones)
  let clash = 0;
  for (const t of cand.tones) {
    const d = ((notePc - t) % 12 + 12) % 12;
    if (d === 1) clash += 2.5; // m2 / b9 above a chord tone — avoid
  }

  const fit = base - clash;
  // stash role on a parallel return via closure isn't possible, so encode:
  return fit + roleBias(role);
}

// tiny disambiguator so role can be recovered from the chosen chord later
function roleBias(role: Reharm["role"]): number {
  return role === "chord-tone" ? 0.001 : role === "extension" ? 0.0005 : 0;
}

function roleFor(cand: ChordCandidate, notePc: number): Reharm["role"] {
  if (cand.tones.includes(notePc)) return "chord-tone";
  if (cand.extensions.includes(notePc)) return "extension";
  return "color";
}

// (3) RERANK: greedy nearest-voice voice-leading cost vs. previous voices.
// For each previous voice, find the minimal semitone move to ANY candidate
// voice; sum those minimal moves. Lower cost = smoother glide = preferred.
function voiceLeadingCost(
  cand: ChordCandidate,
  prevVoices: number[] | null,
): number {
  if (!prevVoices || prevVoices.length === 0) return 0;
  let total = 0;
  for (const p of prevVoices) {
    let best = Infinity;
    for (const v of cand.voices) {
      const d = Math.abs(v - p);
      if (d < best) best = d;
    }
    total += best;
  }
  return total / prevVoices.length;
}

// The full RETRIEVE → EDIT → RERANK pick. Given the tapped pitch class and the
// previously sounding chord (for voice-leading), return the winning reharm.
export function reharmonize(
  notePc: number,
  prevChord: ChordCandidate | null,
): Reharm {
  const prevVoices = prevChord ? prevChord.voices : null;

  let best: ChordCandidate | null = null;
  let bestScore = -Infinity;

  for (const cand of CHORD_PALETTE) {
    const fit = scoreFit(cand, notePc); // retrieve + edit
    const vl = voiceLeadingCost(cand, prevVoices); // rerank term
    // total objective: maximize fit, minimize voice-leading motion.
    // weight VL gently so a clearly-better landing still wins.
    const score = fit - vl * 0.6;
    // tiny preference to stay on the current chord if it already fits well,
    // so a child re-tapping the same color doesn't churn the harmony.
    const stay =
      prevChord && cand.name === prevChord.name && fit > 5 ? 0.4 : 0;
    const total = score + stay;
    if (total > bestScore) {
      bestScore = total;
      best = cand;
    }
  }

  const chord = best ?? CHORD_PALETTE[0];
  const voiceHz = chord.voices.map(midiToHz);

  // bell: the literal tapped note, placed in the octave nearest the top voice
  const topVoice = chord.voices[chord.voices.length - 1];
  let bellMidi = 60 + notePc; // start at C4..B4
  // nudge bell to sit just above the pad voices for a clear "ping"
  while (bellMidi < topVoice + 2) bellMidi += 12;
  while (bellMidi > topVoice + 14) bellMidi -= 12;

  return {
    chord,
    role: roleFor(chord, notePc),
    voiceHz,
    bellHz: midiToHz(bellMidi),
  };
}

// Shortest-path hue interpolation, used by the visual field to glide its tint.
export function lerpHue(a: number, b: number, t: number): number {
  let dh = b - a;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return (a + dh * t + 360) % 360;
}

// expose pc helper for callers that want it
export { pc as pitchClassOf };
