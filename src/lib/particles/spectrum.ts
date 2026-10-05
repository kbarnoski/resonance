// ─────────────────────────────────────────────────────────────────────────────
// spectrum.ts — the audio half of the particle engine.
//
// Turns an AnalyserNode's FFT into what EACH particle listens to:
//   • `levels[i]`  — 0..1 loudness of log band i (per-band AGC, so a quiet
//                    piano passage still moves the field), attack/release
//                    smoothed.
//   • `drive[i]`   — the kinetic-EQ drive: deviation of the band from its own
//                    ~400 ms EMA (zero-mean, unpinnable), gained and SLEWED
//                    so motion swells instead of jittering. -1..1.
//   • `bands`      — bass / mid / treble aggregates of `drive` (+ `bandLevels`)
//   • `swell`      — onset envelope: spectral-flux transient detection with an
//                    adaptive threshold; rises over ~250 ms, decays over ~2.5 s.
//   • `clocks`     — per-band time-dilation clocks (bass surges the world,
//                    mids flow, treble shimmers) using the SAME rate ranges as
//                    the journey shaders (kinetic.ts BAND_PROFILES).
//
// WCAG 2.3.1: nothing here is a brightness channel. The engine maps these to
// motion / structure only (see particle-engine.ts).
//
// The core (`SpectrumProcessor`) is pure: feed it a dB spectrum + dt and it
// updates. `createSpectrumAnalyzer` wraps a live AnalyserNode.
// ─────────────────────────────────────────────────────────────────────────────

import { BAND_PROFILES, type BandFocus } from "@/lib/journeys/kinetic";

export interface SpectrumOptions {
  /** Number of log-spaced bands. Default 128. */
  bins?: number;
  /** Lowest band edge (Hz). Default 30. */
  minHz?: number;
  /** Highest band edge (Hz). Default 12000. */
  maxHz?: number;
  /** dB floor mapped to 0. Default -95. */
  minDb?: number;
  /** dB ceiling mapped to 1. Default -25. */
  maxDb?: number;
  /**
   * "log" (default): log-spaced bands from a high-resolution float FFT.
   * "kinetic": read the journeys' shared 256-pt analyser BYTE spectrum with
   * the kinetic EQ's own band split (bins 0-5 bass · 6-30 mid · 31-63
   * treble, visualizer.tsx) — the same analyser and the same numbers the
   * shader EQ hears. Each band gets a third of the virtual bins, so a third
   * of the particles belong to each voice.
   */
  source?: "log" | "kinetic";
}

/** Kinetic EQ FFT-bin ranges (visualizer.tsx band split), inclusive. */
export const KINETIC_BINS = [[0, 5], [6, 30], [31, 63]] as const;

export interface SpectrumFrame {
  bins: number;
  levels: Float32Array;
  drive: Float32Array;
  bands: { bass: number; mid: number; treble: number };
  bandLevels: { bass: number; mid: number; treble: number };
  /** Onset swell envelope 0..1. */
  swell: number;
  /** Count of onsets detected since creation (for probes). */
  onsets: number;
  /** Per-band time-dilation clocks (seconds of "music time"). */
  clocks: { bass: number; mid: number; treble: number };
  /** Current time-dilation rates. */
  rates: { bass: number; mid: number; treble: number };
}

/** Bass / mid / treble split points (Hz). */
export const BAND_SPLIT_HZ = { bassMax: 200, midMax: 2200 } as const;

/** Map a kinetic drive (-1..1) to a time-dilation rate inside the band's
 *  BAND_PROFILES [rateLo, rateHi] range, with 0 -> 1.0x (rest tempo). */
export function driveToRate(band: BandFocus, drive: number): number {
  const p = BAND_PROFILES[band];
  const d = Math.max(-1, Math.min(1, drive));
  return d >= 0 ? 1 + d * (p.rateHi - 1) : 1 + d * (1 - p.rateLo);
}

/** Exponential smoothing coefficient for a time constant tau at step dt. */
export function smoothK(dt: number, tau: number): number {
  if (tau <= 0) return 1;
  return 1 - Math.exp(-dt / tau);
}

/** Log-spaced band edges in Hz (bins+1 values). */
export function logBandEdges(bins: number, minHz: number, maxHz: number): Float32Array {
  const e = new Float32Array(bins + 1);
  const r = Math.log(maxHz / minHz);
  for (let i = 0; i <= bins; i++) e[i] = minHz * Math.exp((r * i) / bins);
  return e;
}

/** Per-band (bass/mid/treble) AGC floor and drive scale. Bass keeps the
 *  original 0.25 scale; mid and treble get more so all three bands visibly
 *  move their particles (still slewed, still zero-mean). */
const AGC_FLOOR = [0.08, 0.05, 0.025] as const;
const DRIVE_SCALE = [0.25, 0.42, 0.5] as const;

export class SpectrumProcessor {
  readonly bins: number;
  readonly edges: Float32Array;
  readonly levels: Float32Array;
  readonly drive: Float32Array;
  private readonly raw: Float32Array;
  private readonly peak: Float32Array;
  private readonly ema: Float32Array;
  private readonly prev: Float32Array;
  private readonly bandOf: Uint8Array; // 0 bass, 1 mid, 2 treble
  private readonly fftBinOf: Uint8Array; // kinetic mode: virtual bin -> FFT bin
  readonly source: "log" | "kinetic";
  private readonly minDb: number;
  private readonly maxDb: number;
  private fluxMean = 0;
  private fluxVar = 0;
  private refractory = 0;
  private swellTarget = 0;
  swell = 0;
  onsets = 0;
  bands = { bass: 0, mid: 0, treble: 0 };
  bandLevels = { bass: 0, mid: 0, treble: 0 };
  clocks = { bass: 0, mid: 0, treble: 0 };
  rates = { bass: 1, mid: 1, treble: 1 };

  constructor(opts: SpectrumOptions = {}) {
    this.bins = opts.bins ?? 128;
    this.minDb = opts.minDb ?? -95;
    this.maxDb = opts.maxDb ?? -25;
    this.edges = logBandEdges(this.bins, opts.minHz ?? 30, opts.maxHz ?? 12000);
    this.levels = new Float32Array(this.bins);
    this.drive = new Float32Array(this.bins);
    this.raw = new Float32Array(this.bins);
    this.peak = new Float32Array(this.bins).fill(0.25);
    this.ema = new Float32Array(this.bins);
    this.prev = new Float32Array(this.bins);
    this.bandOf = new Uint8Array(this.bins);
    this.fftBinOf = new Uint8Array(this.bins);
    this.source = opts.source ?? "log";
    for (let i = 0; i < this.bins; i++) {
      if (this.source === "kinetic") {
        const seg = Math.min(2, Math.floor((i * 3) / this.bins));
        const lo = (seg * this.bins) / 3;
        const t = (i - lo) / (this.bins / 3);
        const [a, b] = KINETIC_BINS[seg];
        this.bandOf[i] = seg;
        this.fftBinOf[i] = Math.min(b, a + Math.floor(t * (b - a + 1)));
      } else {
        const c = Math.sqrt(this.edges[i] * this.edges[i + 1]);
        this.bandOf[i] = c < BAND_SPLIT_HZ.bassMax ? 0 : c < BAND_SPLIT_HZ.midMax ? 1 : 2;
      }
    }
  }

  /** Kinetic mode: fold a byte spectrum (getByteFrequencyData of the shared
   *  256-pt analyser) into the virtual bins. Pass null for silence. */
  ingestBytes(bytes: Uint8Array | null): void {
    for (let i = 0; i < this.bins; i++) {
      const k = this.fftBinOf[i];
      this.raw[i] = bytes && k < bytes.length ? bytes[k] / 255 : 0;
    }
  }

  /**
   * Fold an FFT magnitude spectrum (dB, as from getFloatFrequencyData) into
   * the log bands. `binHz` = sampleRate / fftSize. Pass `null` for silence.
   */
  ingest(db: Float32Array | null, binHz: number): void {
    const span = this.maxDb - this.minDb;
    for (let i = 0; i < this.bins; i++) {
      if (!db) {
        this.raw[i] = 0;
        continue;
      }
      const lo = this.edges[i] / binHz;
      const hi = this.edges[i + 1] / binHz;
      let a = Math.floor(lo);
      let b = Math.ceil(hi);
      if (b <= a) b = a + 1;
      a = Math.max(0, Math.min(db.length - 1, a));
      b = Math.max(a + 1, Math.min(db.length, b));
      // power-average in linear domain, back to dB
      let acc = 0;
      for (let k = a; k < b; k++) acc += Math.pow(10, db[k] / 10);
      const d = 10 * Math.log10(acc / (b - a) + 1e-20);
      this.raw[i] = Math.max(0, Math.min(1, (d - this.minDb) / span));
    }
  }

  /** Advance the envelopes by dt seconds (after `ingest`). */
  step(dt: number): void {
    dt = Math.max(1 / 240, Math.min(0.1, dt));
    const kAtk = smoothK(dt, 0.05);
    const kRel = smoothK(dt, 0.3);
    const kEma = smoothK(dt, 0.4); // the kinetic ~400 ms baseline
    const kSlew = smoothK(dt, 0.18); // drive slew (motion swells, no jitter)
    const peakDecay = Math.exp(-dt / 8); // AGC memory ~8 s

    let flux = 0;
    const acc = [0, 0, 0];
    const lv = [0, 0, 0];
    const cnt = [0, 0, 0];

    for (let i = 0; i < this.bins; i++) {
      const x = this.raw[i];
      const band = this.bandOf[i];
      // per-band AGC floor: piano treble sits ~30 dB under the mids, so a
      // single floor left the high band starved (verify 2026-10-05: treble
      // drive sd 0.08 vs 0.2 for bass/mid).
      this.peak[i] = Math.max(x, this.peak[i] * peakDecay, AGC_FLOOR[band]);
      const norm = Math.min(1, x / this.peak[i]);
      const L = this.levels[i];
      this.levels[i] = L + (norm - L) * (norm > L ? kAtk : kRel);

      flux += Math.max(0, this.levels[i] - this.prev[i]);
      this.prev[i] = this.levels[i];

      this.ema[i] += (this.levels[i] - this.ema[i]) * kEma;
      const gain = BAND_PROFILES[band === 0 ? "bass" : band === 1 ? "mid" : "treble"].gain;
      // gain/4: BAND_PROFILES gains are tuned for the shader band envelope
      // (0..1 RMS-ish); per-bin deviations are larger, so scale them down.
      const target = Math.tanh((this.levels[i] - this.ema[i]) * gain * DRIVE_SCALE[band]);
      this.drive[i] += (target - this.drive[i]) * kSlew;

      acc[band] += this.drive[i];
      lv[band] += this.levels[i];
      cnt[band] += 1;
    }

    const avg = (k: number, arr: number[]) => (cnt[k] ? arr[k] / cnt[k] : 0);
    this.bands = { bass: avg(0, acc), mid: avg(1, acc), treble: avg(2, acc) };
    this.bandLevels = { bass: avg(0, lv), mid: avg(1, lv), treble: avg(2, lv) };

    // ── onset: spectral flux vs adaptive threshold ─────────────────────────
    flux /= this.bins;
    const kF = smoothK(dt, 1.0);
    const dev = flux - this.fluxMean;
    this.fluxMean += dev * kF;
    this.fluxVar += (dev * dev - this.fluxVar) * kF;
    this.refractory = Math.max(0, this.refractory - dt);
    const thresh = this.fluxMean + 1.8 * Math.sqrt(this.fluxVar) + 0.004;
    if (flux > thresh && this.refractory === 0) {
      this.onsets++;
      this.refractory = 0.28;
      const strength = Math.min(1, (flux - thresh) / (thresh + 1e-4) + 0.45);
      this.swellTarget = Math.max(this.swellTarget, strength);
    }
    // swell rises toward target (~250 ms), target decays (~2.5 s)
    this.swell += (this.swellTarget - this.swell) * smoothK(dt, 0.25);
    this.swellTarget *= Math.exp(-dt / 2.5);

    // ── per-band time dilation (kinetic law) ───────────────────────────────
    const kRate = smoothK(dt, 0.4);
    const r = this.rates;
    r.bass += (driveToRate("bass", this.bands.bass * 2.2) - r.bass) * kRate;
    r.mid += (driveToRate("mid", this.bands.mid * 2.6) - r.mid) * kRate;
    r.treble += (driveToRate("treble", this.bands.treble * 3.0) - r.treble) * kRate;
    this.clocks.bass += dt * r.bass;
    this.clocks.mid += dt * r.mid;
    this.clocks.treble += dt * r.treble;
  }

  frame(): SpectrumFrame {
    return {
      bins: this.bins,
      levels: this.levels,
      drive: this.drive,
      bands: this.bands,
      bandLevels: this.bandLevels,
      swell: this.swell,
      onsets: this.onsets,
      clocks: this.clocks,
      rates: this.rates,
    };
  }
}

export interface SpectrumAnalyzer {
  readonly analyser: AnalyserNode;
  readonly processor: SpectrumProcessor;
  /** Pull the analyser's FFT and advance by dt. Pass silent=true to decay. */
  update(dt: number, silent?: boolean): SpectrumFrame;
}

/**
 * Wrap a live AnalyserNode. The node's fftSize should be large (4096) so the
 * low log bands have real resolution; smoothing low (0.5) — we do our own.
 */
export function createSpectrumAnalyzer(
  analyser: AnalyserNode,
  opts: SpectrumOptions = {},
): SpectrumAnalyzer {
  const processor = new SpectrumProcessor(opts);
  const db = new Float32Array(analyser.frequencyBinCount);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  return {
    analyser,
    processor,
    update(dt, silent = false) {
      if (silent) processor.ingest(null, binHz);
      else {
        analyser.getFloatFrequencyData(db);
        processor.ingest(db, binHz);
      }
      processor.step(dt);
      return processor.frame();
    },
  };
}
