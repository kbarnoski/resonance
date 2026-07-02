/**
 * 1109 · Inner Ear — pure data + signal builders (no Web Audio nodes here).
 *
 * Everything in this file is deterministic and side-effect free so the audio
 * engine (audio.ts) and the diagram renderer (renderer.ts) can share one
 * source of truth for note data, Shepard-tone spectra, and Zwicker noise.
 */

export type ModeId = "octave" | "scale" | "tritone" | "zwicker" | "calibration";

export interface ModeMeta {
  id: ModeId;
  title: string;
  year: string;
  dichotic: boolean;
  blurb: string;
}

export const MODES: ModeMeta[] = [
  {
    id: "octave",
    title: "Octave illusion",
    year: "Deutsch 1974",
    dichotic: true,
    blurb:
      "400 & 800 Hz alternate 4×/sec, swapping ears every step. Both ears always get a tone — yet you tend to hear one tone bouncing ear-to-ear and jumping an octave.",
  },
  {
    id: "scale",
    title: "Scale illusion",
    year: "Deutsch 1975",
    dichotic: true,
    blurb:
      "A C-major scale climbs while another descends, the tones split between your ears. Each ear physically gets a jagged zig-zag; your brain re-sorts them into a smooth high line and a smooth low line.",
  },
  {
    id: "tritone",
    title: "Tritone paradox",
    year: "Deutsch 1986",
    dichotic: false,
    blurb:
      "Two octave-ambiguous Shepard tones, a tritone apart, played to both ears. Whether the pair rises or falls depends on the listener — so we refuse to label it.",
  },
  {
    id: "zwicker",
    title: "Zwicker tone",
    year: "Zwicker 1964 · 2025 study",
    dichotic: false,
    blurb:
      "Pink noise with a band cut out of its middle, then abrupt silence. In that silence many listeners hear a faint phantom tone at the pitch of the missing band — a sound with no source.",
  },
  {
    id: "calibration",
    title: "Your tritone template",
    year: "measure yourself",
    dichotic: false,
    blurb:
      "The paradox turned into a personal measurement: judge 12 tritone pairs as higher or lower, and we plot the perceptual template unique to you on a pitch-class circle.",
  },
];

export const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];

/** Equal-tempered MIDI note → frequency (A4 = 69 = 440 Hz). */
export function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// --- Scale illusion: two continuous up/down contours (period 14) ------------
// C major from C4 (MIDI 60) up to C5 (72), then back down — so it loops
// seamlessly. The descending line is the mirror image.
const SCALE_UP_MIDI = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62];
const SCALE_DOWN_MIDI = [72, 71, 69, 67, 65, 64, 62, 60, 62, 64, 65, 67, 69, 71];

export const SCALE_PERIOD = SCALE_UP_MIDI.length;
export const SCALE_ASC = SCALE_UP_MIDI.map(midiToFreq);
export const SCALE_DESC = SCALE_DOWN_MIDI.map(midiToFreq);

// --- Octave illusion --------------------------------------------------------
export const OCTAVE_LOW = 400;
export const OCTAVE_HIGH = 800;

// --- Shepard tone (octave-complex) ------------------------------------------
export interface Partial {
  freq: number;
  amp: number;
}

/**
 * Octave-complex tone for a pitch class (0 = C .. 11 = B). Six-to-eight
 * octave-spaced sine partials under a fixed Gaussian envelope in log-frequency
 * centered near C4, so the absolute octave is deliberately ambiguous.
 */
export function shepardPartials(pc: number): Partial[] {
  const center = Math.log2(261.63); // C4
  const sigma = 1.35; // width in octaves
  const out: Partial[] = [];
  // C1 (32.70 Hz) up through ~C8.
  for (let oct = 0; oct < 8; oct++) {
    const freq = 32.703 * Math.pow(2, oct + pc / 12);
    const l = Math.log2(freq);
    const amp = Math.exp(-((l - center) * (l - center)) / (2 * sigma * sigma));
    if (amp > 0.02) out.push({ freq, amp });
  }
  return out;
}

// --- Zwicker noise ----------------------------------------------------------
// Small deterministic PRNG so the noise buffer is reproducible (no reliance on
// Math.random anywhere in the audio path).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic pink-ish noise (Paul Kellet filter) for the Zwicker mode. */
export function buildPinkNoise(sampleRate: number, seconds: number): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(n);
  const rand = mulberry32(0x9e3779b9);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < n; i++) {
    const white = rand() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    out[i] = pink * 0.11;
  }
  return out;
}

/** The spectral gap carved out of the Zwicker noise (Hz). */
export const ZWICKER_NOTCH_LOW = 600;
export const ZWICKER_NOTCH_HIGH = 1200;
export const ZWICKER_CENTER = Math.sqrt(ZWICKER_NOTCH_LOW * ZWICKER_NOTCH_HIGH);
