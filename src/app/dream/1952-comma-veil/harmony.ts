// harmony.ts — Just-intonation scale + consonance/tension engine.
//
// One source of truth for BOTH the sound and the geometry: given the set of
// MIDI notes currently sounding, we compute their JI frequencies (relative to
// a low tonic drone) and a live "tension" scalar derived from the sensory
// roughness of every sounding pair. Small-integer ratios (octave, fifth,
// fourth, thirds) beat slowly and read as consonant / low tension; the
// tritone and major seventh beat fast and read as dissonant / high tension.
//
// References: Klüver's form constants (the geometry this drives), and the
// Plomp–Levelt / Sethares model of sensory dissonance (the roughness curve).

/** Tonic drone, Hz. Low enough to feel like a floor (~58 Hz ≈ Bb1). */
export const TONIC_HZ = 58;

/** MIDI note number treated as the tonic (scale degree 0). */
export const TONIC_MIDI = 34; // ~Bb1, matches TONIC_HZ closely enough

/**
 * Just-intonation ratios for the 12 chromatic degrees within an octave.
 * Held intervals genuinely beat and resolve because these are exact ratios,
 * not equal-tempered approximations.
 */
export const JI_RATIOS: number[] = [
  1 / 1, // unison
  16 / 15, // minor second
  9 / 8, // major second
  6 / 5, // minor third
  5 / 4, // major third
  4 / 3, // perfect fourth
  45 / 32, // tritone
  3 / 2, // perfect fifth
  8 / 5, // minor sixth
  5 / 3, // major sixth
  9 / 5, // minor seventh
  15 / 8, // major seventh
];

/** Frequency (Hz) of a MIDI note under our JI mapping, relative to the tonic. */
export function midiToJiHz(midi: number): number {
  const rel = midi - TONIC_MIDI;
  const octave = Math.floor(rel / 12);
  const degree = ((rel % 12) + 12) % 12;
  return TONIC_HZ * JI_RATIOS[degree] * Math.pow(2, octave);
}

/**
 * Plomp–Levelt roughness between two partials at frequencies f1, f2 with
 * amplitudes a1, a2. Peak roughness sits near a quarter of the critical
 * bandwidth; unison and wide separations are smooth.
 */
function pairRoughness(f1: number, f2: number, a1: number, a2: number): number {
  const fmin = Math.min(f1, f2);
  const s = 0.24 / (0.0207 * fmin + 18.96);
  const df = Math.abs(f1 - f2);
  const x = s * df;
  // Classic two-exponential dissonance curve.
  const r = Math.exp(-3.5 * x) - Math.exp(-5.75 * x);
  return a1 * a2 * r;
}

/** A note that is currently sounding, with its JI frequency and 0..1 gain. */
export interface SoundingNote {
  midi: number;
  hz: number;
  gain: number;
}

export interface HarmonicState {
  /** 0 = perfectly consonant / at rest, 1 = maximally dissonant / sheared. */
  tension: number;
  /** Mean pitch height of sounding notes, normalized 0..1 over the keymap. */
  register: number;
  /** How lit up the field is: rises with note count + velocity, decays slow. */
  brightness: number;
  /** Count of sounding notes. */
  voices: number;
}

/**
 * Compute the harmonic state from the notes currently sounding. We treat each
 * voice as a small stack of harmonic partials so that, e.g., a fifth is smooth
 * but a tritone bristles. Result is normalized into a stable 0..1 tension.
 */
export function analyzeHarmony(notes: SoundingNote[]): {
  tension: number;
  register: number;
  voices: number;
} {
  const voices = notes.length;
  if (voices === 0) {
    return { tension: 0, register: 0.3, voices: 0 };
  }

  // Register: average height across the ~2-octave playable window.
  const LO = TONIC_MIDI;
  const HI = TONIC_MIDI + 26;
  let regSum = 0;
  for (const n of notes) regSum += (n.midi - LO) / (HI - LO);
  const register = Math.max(0, Math.min(1, regSum / voices));

  if (voices === 1) {
    // A single voice against the drone: mild tension from the interval it
    // forms with the tonic, so even monophonic play warps the geometry.
    const r = pairRoughness(TONIC_HZ, notes[0].hz, 1, notes[0].gain);
    return { tension: Math.min(1, r * 4.5), register, voices };
  }

  // Build a partial set: drone + each voice's first few harmonics.
  const partials: { f: number; a: number }[] = [];
  const HARMONICS = [1, 2, 3, 4];
  const HARM_AMP = [1, 0.5, 0.33, 0.25];
  partials.push({ f: TONIC_HZ, a: 0.6 });
  partials.push({ f: TONIC_HZ * 2, a: 0.3 });
  for (const n of notes) {
    for (let h = 0; h < HARMONICS.length; h++) {
      partials.push({ f: n.hz * HARMONICS[h], a: n.gain * HARM_AMP[h] });
    }
  }

  let rough = 0;
  let norm = 0;
  for (let i = 0; i < partials.length; i++) {
    for (let j = i + 1; j < partials.length; j++) {
      rough += pairRoughness(
        partials[i].f,
        partials[j].f,
        partials[i].a,
        partials[j].a
      );
      norm += partials[i].a * partials[j].a;
    }
  }
  // Normalize by total amplitude product so louder chords aren't "more tense"
  // just for being louder, then map through a soft curve.
  const raw = norm > 0 ? rough / norm : 0;
  const tension = Math.max(0, Math.min(1, Math.pow(raw * 3.4, 0.85)));
  return { tension, register, voices };
}

/** mulberry32 — deterministic PRNG seeded with a fixed constant. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
