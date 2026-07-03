/**
 * breath.ts — a breath-vs-voice discriminator + exhale-event detector.
 *
 * The instrument must respond to a broadband *exhale* but heavily attenuate a
 * sustained hum, whistle, or sung note at equal loudness. We do that with a
 * spectral-flatness gate:
 *
 *   flatness = geometric-mean(power) / arithmetic-mean(power)   over ~200Hz-8kHz
 *
 *   - broadband breath  → flatness near 1 (energy spread across all bins)
 *   - tonal hum/whistle → flatness near 0 (energy piled into a few bins)
 *
 *   drive = energyNorm * smoothstep(FLATNESS_FLOOR_LOW, FLATNESS_FLOOR_HIGH, flatness)
 *
 * Mic audio is analysed only — never recorded, never routed to the speakers.
 *
 * When there is no mic, or no real breath for ~IDLE_SECONDS, a deterministic
 * seeded "breeze" synthesises periodic pseudo-exhales so the piece is never
 * blank and grows on its own. The breeze feeds the SAME edge detector as the
 * mic, so growth events fire through one code path either way.
 */

// ---- tunables (exposed as named consts; need a live-mic tuning pass) ----

/** Below this spectral flatness the gate is fully closed (tonal → silence). */
export const FLATNESS_FLOOR_LOW = 0.28;
/** Above this spectral flatness the gate is fully open (broadband → full). */
export const FLATNESS_FLOOR_HIGH = 0.52;

/** Band energy (dB) that maps to drive 0. */
export const ENERGY_DB_MIN = -72;
/** Band energy (dB) that maps to drive 1. */
export const ENERGY_DB_MAX = -30;

/** Analysis band for both flatness and energy. */
const BAND_LOW_HZ = 200;
const BAND_HIGH_HZ = 8000;

/** EMA smoothing for the continuous drive (per-frame alpha). */
const DRIVE_ALPHA = 0.16;

/** Rising edge above this (smoothed) drive opens an exhale. */
const DRIVE_ON = 0.34;
/** Falling below this closes the exhale and may fire an event. */
const DRIVE_OFF = 0.2;
/** Minimum exhale duration (s) to count as a real breath. */
const MIN_EXHALE_S = 0.55;
/** Lockout after firing so one long exhale is one event. */
const DEBOUNCE_S = 0.5;

/** Real drive under this counts as "quiet" for breeze arbitration. */
const QUIET_FLOOR = 0.06;
/** Seconds of quiet before the ambient breeze takes over. */
export const IDLE_SECONDS = 2;

// ---- small maths ----

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Deterministic PRNG — same seed, same stream, forever. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---- spectral analysis over a dB spectrum (getFloatFrequencyData) ----

/** Convert a bin's dB magnitude to linear power (10^(dB/10)), floored. */
function dbToPower(db: number): number {
  const d = db < -140 ? -140 : db;
  return Math.pow(10, d / 10);
}

interface BandStats {
  flatness: number; // 0..1
  energyDb: number; // dB of mean magnitude in band
}

/**
 * Spectral flatness + band energy over BAND_LOW_HZ..BAND_HIGH_HZ.
 * `dbMags` is the output of AnalyserNode.getFloatFrequencyData (dB per bin).
 */
export function analyseSpectrum(
  dbMags: Float32Array,
  sampleRate: number,
  fftSize: number,
): BandStats {
  const binHz = sampleRate / fftSize;
  const loBin = Math.max(1, Math.ceil(BAND_LOW_HZ / binHz));
  const hiBin = Math.min(dbMags.length - 1, Math.floor(BAND_HIGH_HZ / binHz));
  if (hiBin <= loBin) return { flatness: 0, energyDb: ENERGY_DB_MIN };

  let logPowerSum = 0;
  let powerSum = 0;
  let magSum = 0;
  let n = 0;
  for (let i = loBin; i <= hiBin; i++) {
    const p = dbToPower(dbMags[i]) + 1e-12;
    logPowerSum += Math.log(p);
    powerSum += p;
    magSum += Math.sqrt(p);
    n++;
  }
  const geoMean = Math.exp(logPowerSum / n);
  const arithMean = powerSum / n;
  const flatness = clamp01(arithMean > 0 ? geoMean / arithMean : 0);
  const meanMag = magSum / n;
  const energyDb = 20 * Math.log10(meanMag + 1e-9);
  return { flatness, energyDb };
}

// ---- seeded ambient breeze (pseudo-exhale generator) ----

class Breeze {
  private rng: () => number;
  private active = false;
  private startedAt = 0;
  private nextAt: number;
  private dur = 3;
  private peak = 0.6;

  constructor(seed: number) {
    this.rng = mulberry32(seed);
    this.nextAt = 1.2; // first ambient breath comes fairly soon
  }

  /** Advance the breeze clock and return its current drive (0..1). */
  advance(now: number): number {
    if (!this.active && now >= this.nextAt) {
      this.active = true;
      this.startedAt = now;
      this.dur = lerp(2.2, 5.0, this.rng());
      this.peak = lerp(0.42, 0.9, this.rng());
    }
    if (this.active) {
      const p = (now - this.startedAt) / this.dur;
      if (p >= 1) {
        this.active = false;
        this.nextAt = now + lerp(3.0, 8.0, this.rng());
        return 0;
      }
      // raised-cosine bump: 0 → 1 → 0
      return this.peak * Math.sin(Math.PI * p);
    }
    return 0;
  }
}

// ---- public state + tracker ----

export type BreathSource = "mic" | "breeze";

export interface BreathState {
  /** Smoothed continuous breath drive, 0..1 (for sway / brightness). */
  drive: number;
  /** Instantaneous unsmoothed drive, 0..1. */
  rawDrive: number;
  /** Spectral flatness of the dominant input, 0..1. */
  flatness: number;
  /** Band energy in dB. */
  energyDb: number;
  /** Which input is currently driving the piece. */
  source: BreathSource;
}

export interface ExhaleEvent {
  /** Peak drive reached during the exhale, 0..1. */
  strength: number;
  /** Exhale duration in seconds. */
  duration: number;
}

export interface BreathTick {
  state: BreathState;
  /** Non-null on the frame a completed exhale is detected. */
  event: ExhaleEvent | null;
}

export class BreathTracker {
  private t = 0;
  private driveEMA = 0;
  private inExhale = false;
  private exhalePeak = 0;
  private exhaleStart = 0;
  private lastFireAt = -10;
  private lastRealBreathAt = -10;
  private breeze: Breeze;
  private forceBreeze: boolean;

  private state: BreathState = {
    drive: 0,
    rawDrive: 0,
    flatness: 0,
    energyDb: ENERGY_DB_MIN,
    source: "breeze",
  };

  constructor(seed: number, forceBreeze = false) {
    this.breeze = new Breeze(seed);
    this.forceBreeze = forceBreeze;
  }

  setForceBreeze(v: boolean): void {
    this.forceBreeze = v;
  }

  /**
   * Advance one frame.
   * @param dt      elapsed seconds since last tick
   * @param spectrum optional dB spectrum from a live mic AnalyserNode
   * @param sampleRate audio context sample rate
   * @param fftSize  analyser fftSize
   */
  update(
    dt: number,
    spectrum: Float32Array | null,
    sampleRate: number,
    fftSize: number,
  ): BreathTick {
    this.t += dt;
    const now = this.t;

    // --- real (mic) drive ---
    let realDrive = 0;
    let flatness = 0;
    let energyDb = ENERGY_DB_MIN;
    if (spectrum) {
      const stats = analyseSpectrum(spectrum, sampleRate, fftSize);
      flatness = stats.flatness;
      energyDb = stats.energyDb;
      const energyNorm = clamp01(
        (energyDb - ENERGY_DB_MIN) / (ENERGY_DB_MAX - ENERGY_DB_MIN),
      );
      const gate = smoothstep(FLATNESS_FLOOR_LOW, FLATNESS_FLOOR_HIGH, flatness);
      realDrive = energyNorm * gate;
    }
    if (realDrive > QUIET_FLOOR) this.lastRealBreathAt = now;

    // --- ambient breeze (always advances so it stays deterministic in time) ---
    const breezeDrive = this.breeze.advance(now);
    const quietFor = now - this.lastRealBreathAt;
    const breezeAllowed = this.forceBreeze || quietFor > IDLE_SECONDS;

    // --- arbitrate ---
    let rawDrive = realDrive;
    let source: BreathSource = "mic";
    if (breezeAllowed && breezeDrive > realDrive) {
      rawDrive = breezeDrive;
      source = "breeze";
      flatness = 0.9; // synthesised breath is broadband by construction
      // present a plausible energy readout from the breeze envelope
      energyDb = lerp(ENERGY_DB_MIN, ENERGY_DB_MAX, breezeDrive);
    }

    // --- smooth + edge-detect ---
    this.driveEMA += DRIVE_ALPHA * (rawDrive - this.driveEMA);
    const d = this.driveEMA;

    let event: ExhaleEvent | null = null;
    if (!this.inExhale && d > DRIVE_ON && now - this.lastFireAt > DEBOUNCE_S) {
      this.inExhale = true;
      this.exhalePeak = d;
      this.exhaleStart = now;
    }
    if (this.inExhale) {
      if (d > this.exhalePeak) this.exhalePeak = d;
      if (d < DRIVE_OFF) {
        const duration = now - this.exhaleStart;
        if (duration >= MIN_EXHALE_S) {
          event = { strength: clamp01(this.exhalePeak), duration };
          this.lastFireAt = now;
        }
        this.inExhale = false;
      }
    }

    this.state = {
      drive: d,
      rawDrive,
      flatness,
      energyDb,
      source,
    };
    return { state: this.state, event };
  }

  getState(): BreathState {
    return this.state;
  }
}
