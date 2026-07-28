// Deterministic deep-time engine for "The Long Now".
//
// Every audible and visible value is a pure function of one number:
// `elapsed`, the wall-clock milliseconds since a fixed epoch. Open the URL
// anywhere on Earth at the same instant and `elapsed` is the same, so the
// "now" of the piece is the same. Nothing is stored, nothing is random.
//
// The motion is built from several INDEPENDENT slow cyclic layers whose
// periods (in seconds) are distinct primes — hence pairwise coprime. A sum of
// coprime-period sinusoids only returns to its exact starting configuration
// after the LEAST COMMON MULTIPLE of the periods, which for these primes is
// their product: on the order of 10^30 seconds, vastly longer than a human
// life — or the age of the universe. This is the mechanism behind Jem Finer's
// Longplayer (1999–2999): a handful of loops of mutually-prime lengths sounding
// together, never repeating within the span.

/** Fixed epoch — 2000-01-01T00:00:00Z, the era of Longplayer's first year. */
export const EPOCH_MS = Date.UTC(2000, 0, 1, 0, 0, 0);

/**
 * Layer periods in SECONDS. Distinct primes ≈ 3 min, 25 min, 2.7 h, 24 h,
 * 7 days, 1 year. Being pairwise coprime, their combined phase pattern does not
 * recur until ~their product (~10^30 s). The fastest layer (181 s) is what you
 * can actually HEAR migrating over 30–90 s; the slowest (a year) barely turns.
 */
export const LAYER_PERIODS_S = [181, 1511, 9721, 86413, 604801, 31557601] as const;

export const LAYER_LABELS = [
  "3 min",
  "25 min",
  "2.7 hr",
  "1 day",
  "1 week",
  "1 year",
] as const;

export const VOICE_COUNT = 6;

/** Base pitches (MIDI) of the drone chord, spread across five octaves.
 *  An open, rootless voicing (D–A–E–B–F♯–C♯ stacked in fifths) so the slow
 *  continuous glides never collide into an obvious triad. */
const BASE_MIDI = [26, 38, 45, 52, 59, 66];

/** How strongly each layer bends each voice, in semitones. Rows = voices,
 *  cols = layers. Small numbers → gentle glides. The fastest layer (col 0)
 *  carries the audible minute-scale drift; slower layers reshape the chord
 *  across hours, days, a year. Deterministic constants — no randomness. */
const BEND: number[][] = [
  //  3m     25m    2.7h   1d    1w    1y
  [0.55, 1.20, 2.10, 1.40, 2.60, 3.20],
  [0.70, 0.90, 1.60, 2.30, 1.80, 2.40],
  [0.45, 1.40, 1.10, 1.90, 2.90, 1.70],
  [0.85, 1.05, 2.40, 1.20, 1.50, 3.60],
  [0.60, 1.60, 0.95, 2.60, 2.20, 1.30],
  [0.75, 1.25, 1.85, 1.05, 3.10, 2.80],
];

/** Fixed phase offsets (radians) per voice/layer so the sinusoids don't all
 *  cross zero together. Deterministic — derived once from the golden angle. */
const GOLDEN = 2.399963229728653;
function phaseOffset(voice: number, layer: number): number {
  return ((voice * VOICE_COUNT + layer + 1) * GOLDEN) % (2 * Math.PI);
}

export interface VoiceState {
  /** Continuous frequency in Hz (never quantised to a scale). */
  freq: number;
  /** 0..1 amplitude for this voice. */
  gain: number;
  /** Continuous MIDI value, for reference / display. */
  midi: number;
}

export interface LayerState {
  /** Fraction 0..1 around the cycle — drives the dial marker angle. */
  phase01: number;
  periodS: number;
  label: string;
}

export interface DeepTimeCalendar {
  year: number; // 1-based year of the composition
  day: number; // 0..364 day-of-year
  hour: number;
  minute: number;
  second: number;
  /** Preformatted "Year 27 · day 114 · 06:31" readout. */
  readout: string;
}

export interface DeepTimeState {
  voices: VoiceState[];
  layers: LayerState[];
  calendar: DeepTimeCalendar;
  /** Slowly-migrating master brightness 0..1 (filter cutoff driver). */
  brightness: number;
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Continuous phase of a layer in radians at a given elapsed time. */
function layerPhase(elapsedS: number, layer: number): number {
  return (2 * Math.PI * elapsedS) / LAYER_PERIODS_S[layer];
}

const DAY_S = 86400;

function makeCalendar(elapsedMs: number): DeepTimeCalendar {
  const totalS = Math.max(0, elapsedMs / 1000);
  const totalDays = Math.floor(totalS / DAY_S);
  const year = Math.floor(totalDays / 365) + 1;
  const day = totalDays % 365;
  const inDay = totalS % DAY_S;
  const hour = Math.floor(inDay / 3600);
  const minute = Math.floor((inDay % 3600) / 60);
  const second = Math.floor(inDay % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  const readout = `Year ${year} · day ${pad(day)} · ${pad(hour)}:${pad(minute)}`;
  return { year, day, hour, minute, second, readout };
}

/**
 * The whole piece as a pure function of elapsed milliseconds. Same input →
 * same output, on every machine, forever. This is what makes two strangers
 * drop into the identical instant.
 */
export function computeState(elapsedMs: number): DeepTimeState {
  const elapsedS = elapsedMs / 1000;

  const phases: number[] = LAYER_PERIODS_S.map((_, l) => layerPhase(elapsedS, l));

  const voices: VoiceState[] = [];
  for (let v = 0; v < VOICE_COUNT; v++) {
    let midi = BASE_MIDI[v];
    for (let l = 0; l < phases.length; l++) {
      midi += BEND[v][l] * Math.sin(phases[l] + phaseOffset(v, l));
    }
    // Each voice swells in and out on its own slow schedule (two layers mixed),
    // so the texture is never a static chord. Kept well above zero so the bed
    // is always present for a headless witness.
    const g0 = 0.5 + 0.5 * Math.sin(phases[1] + phaseOffset(v, 1) * 1.7);
    const g1 = 0.5 + 0.5 * Math.sin(phases[3] + phaseOffset(v, 3) * 0.6);
    const gain = 0.35 + 0.65 * (0.5 * g0 + 0.5 * g1);
    voices.push({ midi, freq: midiToFreq(midi), gain });
  }

  const layers: LayerState[] = LAYER_PERIODS_S.map((p, l) => ({
    phase01: (((phases[l] / (2 * Math.PI)) % 1) + 1) % 1,
    periodS: p,
    label: LAYER_LABELS[l],
  }));

  // Master brightness drifts on the day + week layers.
  const brightness =
    0.5 + 0.5 * (0.6 * Math.sin(phases[3]) + 0.4 * Math.sin(phases[4] + 1.1));

  return {
    voices,
    layers,
    calendar: makeCalendar(elapsedMs),
    brightness: Math.min(1, Math.max(0, brightness)),
  };
}
