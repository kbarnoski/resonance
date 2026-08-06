// dsp.ts — hand-rolled DSP substrate for 7368-vocodrift.
//
// Everything here is dependency-free and deterministic. It contains:
//   • mulberry32 — the one sanctioned PRNG (seeded from 0x7368)
//   • fft        — in-place radix-2 Cooley–Tukey (forward + inverse)
//   • analyzeStft — windowed STFT keeping magnitude AND phase per frame
//   • buildTerrain — log-frequency, dB-scaled height field for the 3D mesh
//   • makeDefaultRecording — a seeded additive "piano" phrase (alive on load)
//   • buildReconstruction — the phase vocoder: inverse-FFT overlap-add with
//     phase accumulation and a seeded drifting time-stretch.
//
// References (see README.md): Flanagan & Golden 1966; Dolson 1986;
// Laroche & Dolson 1999. The resynthesis follows the classic
// analysis/modify/synthesis loop with per-bin phase accumulation.

/** Deterministic PRNG. NO Math.random anywhere in this project. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** In-place radix-2 FFT. `inverse` scales by 1/n. Lengths must be powers of two. */
export function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] = re[a] + xr;
        im[a] = im[a] + xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** Periodic Hann window of length n. */
function makeHann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

export interface StftData {
  frames: number;
  bins: number; // n/2 + 1
  fftSize: number;
  hop: number;
  sampleRate: number;
  seconds: number;
  /** magnitude per frame, length = frames * bins (row-major) */
  mag: Float32Array;
  /** phase per frame (radians), length = frames * bins */
  phase: Float32Array;
}

/**
 * Windowed short-time Fourier transform of a mono signal.
 * Hann window, `fftSize` points, `hop` sample advance. Keeps both the
 * magnitude and the wrapped phase of every bin — the phase is what the
 * vocoder needs to run and is what makes this more than a spectrogram.
 */
export function analyzeStft(
  signal: Float32Array,
  sampleRate: number,
  fftSize = 2048,
  hop = 512,
): StftData {
  const bins = fftSize / 2 + 1;
  const win = makeHann(fftSize);
  const frames = Math.max(1, Math.floor((signal.length - fftSize) / hop) + 1);
  const mag = new Float32Array(frames * bins);
  const phase = new Float32Array(frames * bins);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let f = 0; f < frames; f++) {
    const start = f * hop;
    for (let i = 0; i < fftSize; i++) {
      const s = start + i;
      re[i] = s < signal.length ? signal[s] * win[i] : 0;
      im[i] = 0;
    }
    fft(re, im, false);
    const base = f * bins;
    for (let k = 0; k < bins; k++) {
      const r = re[k];
      const j = im[k];
      mag[base + k] = Math.hypot(r, j);
      phase[base + k] = Math.atan2(j, r);
    }
  }
  return {
    frames,
    bins,
    fftSize,
    hop,
    sampleRate,
    seconds: signal.length / sampleRate,
    mag,
  phase,
  };
}

export interface TerrainField {
  frames: number;
  cols: number;
  /** normalized 0..1 height, length = frames * cols (row-major by frame) */
  data: Float32Array;
}

/**
 * Collapse the linear-frequency STFT magnitude into a log-frequency,
 * dB-scaled height field for the terrain mesh. Log frequency spreads the
 * musical low end out; dB scaling keeps quiet detail visible.
 */
export function buildTerrain(stft: StftData, cols = 96): TerrainField {
  const { frames, bins, mag } = stft;
  const data = new Float32Array(frames * cols);
  // log-spaced band edges over bins 1..bins-1
  const loBin = 1;
  const hiBin = bins - 1;
  const logLo = Math.log(loBin);
  const logHi = Math.log(hiBin);
  const edges = new Int32Array(cols + 1);
  for (let c = 0; c <= cols; c++) {
    const t = c / cols;
    edges[c] = Math.round(Math.exp(logLo + (logHi - logLo) * t));
  }
  let maxDb = -Infinity;
  let minDb = Infinity;
  const eps = 1e-6;
  // first pass: band magnitude → dB
  for (let f = 0; f < frames; f++) {
    const base = f * bins;
    for (let c = 0; c < cols; c++) {
      const bandLo = edges[c];
      const bandHi = Math.max(edges[c + 1], bandLo + 1);
      let acc = 0;
      let cnt = 0;
      for (let k = bandLo; k < bandHi; k++) {
        acc += mag[base + k];
        cnt++;
      }
      const m = cnt > 0 ? acc / cnt : eps;
      const db = 20 * Math.log10(m + eps);
      data[f * cols + c] = db;
      if (db > maxDb) maxDb = db;
      if (db < minDb) minDb = db;
    }
  }
  // normalize with a floor so the terrain has a stable ground plane
  const floorDb = maxDb - 60; // 60 dB dynamic range
  const lo = Math.max(minDb, floorDb);
  const span = Math.max(1e-3, maxDb - lo);
  for (let i = 0; i < data.length; i++) {
    let v = (data[i] - lo) / span;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    // gentle curve so ridges read as ridges
    data[i] = v * v * (3 - 2 * v);
  }
  return { frames, cols, data };
}

/**
 * A deterministic internal "recording": a seeded additive-synth phrase of a
 * few piano-ish tones (odd/even partials with per-note decay + a soft hammer
 * attack), arpeggiated over a pentatonic set. Rendered straight into a
 * Float32Array so it needs no user gesture and no OfflineAudioContext.
 */
export function makeDefaultRecording(sampleRate: number, seconds = 8): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  const rng = mulberry32(0x7368);
  // D minor pentatonic across two octaves (MIDI)
  const scale = [50, 53, 55, 57, 60, 62, 65, 67, 69, 72, 74];
  const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  const stepDur = 0.28; // seconds per arpeggio step
  const steps = Math.floor(seconds / stepDur);
  for (let s = 0; s < steps; s++) {
    // pick a note (occasionally a two-note chord)
    const idx = Math.floor(rng() * scale.length);
    const notes = [scale[idx]];
    if (rng() < 0.35) notes.push(scale[Math.min(scale.length - 1, idx + 2)]);
    const t0 = s * stepDur;
    const start = Math.floor(t0 * sampleRate);
    const dur = stepDur * (rng() < 0.5 ? 2.4 : 1.6);
    const len = Math.floor(dur * sampleRate);
    const vel = 0.5 + 0.5 * rng();
    for (const mnote of notes) {
      const f0 = midiToHz(mnote);
      // partial amplitudes — slightly inharmonic, piano-ish
      const partials = 6;
      const decays = new Float32Array(partials);
      const amps = new Float32Array(partials);
      for (let p = 0; p < partials; p++) {
        amps[p] = (1 / (p + 1)) * (0.7 + 0.6 * rng());
        decays[p] = 2.2 + p * 0.6 + rng(); // higher partials fade faster
      }
      for (let i = 0; i < len; i++) {
        const idx2 = start + i;
        if (idx2 >= n) break;
        const t = i / sampleRate;
        // soft hammer attack (a few ms) + exponential body decay
        const attack = 1 - Math.exp(-t * 260);
        let sample = 0;
        for (let p = 0; p < partials; p++) {
          const fp = f0 * (p + 1) * (1 + 0.0006 * p * p); // slight inharmonicity
          const env = Math.exp(-t * (decays[p] / dur) * 1.4);
          sample += amps[p] * env * Math.sin(2 * Math.PI * fp * t);
        }
        out[idx2] += sample * attack * vel * 0.09;
      }
    }
  }
  // soft-limit
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * 1.2);
  return out;
}

export interface DriftConfig {
  /** seeded slow-varying stretch coefficients */
  amps: Float32Array;
  freqs: Float32Array;
  phases: Float32Array;
}

/** Build seeded slow LFO coefficients for the auto-drift. */
export function makeDrift(seed: number, count = 3): DriftConfig {
  const rng = mulberry32(seed >>> 0);
  const amps = new Float32Array(count);
  const freqs = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    amps[i] = (0.5 / count) * (0.6 + 0.8 * rng());
    freqs[i] = (2 * Math.PI) / (9 + 16 * rng()); // periods ~9..25 s
    phases[i] = rng() * Math.PI * 2;
  }
  return { amps, freqs, phases };
}

/** Evaluate a drift LFO (sum of seeded sines) at time t seconds, in [-~0.5, ~0.5]. */
export function driftAt(cfg: DriftConfig, t: number): number {
  let v = 0;
  for (let i = 0; i < cfg.amps.length; i++) {
    v += cfg.amps[i] * Math.sin(cfg.freqs[i] * t + cfg.phases[i]);
  }
  return v;
}

export interface Reconstruction {
  /** reconstructed mono signal */
  signal: Float32Array;
  sampleRate: number;
  hop: number; // synthesis hop
  /** per synthesis frame → fractional analysis-frame position (for the playhead) */
  frameMap: Float32Array;
  synthFrames: number;
}

/**
 * The phase vocoder. Resynthesizes `stft` with a drifting time-stretch:
 *   • synthesis hop == analysis hop, so per-column phase advance preserves
 *     frequency regardless of the stretch;
 *   • the analysis read-head `t` advances by a drifting rate each synthesis
 *     column, which is where the time-stretch (and the flowing terrain) comes
 *     from;
 *   • phase is accumulated per bin from the measured instantaneous frequency
 *     (Dolson 1986 / Laroche–Dolson 1999), then the frame is rebuilt with a
 *     Hermitian-symmetric inverse FFT and Hann-windowed overlap-add.
 *
 * `outSeconds` sets the reconstruction length; the base read rate is chosen so
 * the whole recording is traversed once across that length, with the seeded
 * drift layered on top.
 */
export function buildReconstruction(
  stft: StftData,
  drift: DriftConfig,
  outSeconds: number,
): Reconstruction {
  const { frames, bins, fftSize: N, hop, sampleRate, mag, phase } = stft;
  const synthFrames = Math.max(4, Math.floor((outSeconds * sampleRate) / hop));
  const outLen = synthFrames * hop + N;
  const signal = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const frameMap = new Float32Array(synthFrames);
  const win = makeHann(N);

  // expected per-analysis-hop phase advance for each bin
  const omega = new Float32Array(bins);
  for (let k = 0; k < bins; k++) omega[k] = (2 * Math.PI * hop * k) / N;

  // running synthesis phase per bin, seeded from the first analysis frame
  const synPhase = new Float32Array(bins);
  for (let k = 0; k < bins; k++) synPhase[k] = phase[k];

  const re = new Float32Array(N);
  const im = new Float32Array(N);

  // base read rate: cover the whole file across the output length
  const baseRate = (frames - 2) / synthFrames;
  let t = 0; // fractional analysis-frame read position
  const TWO_PI = 2 * Math.PI;

  for (let s = 0; s < synthFrames; s++) {
    frameMap[s] = t;
    const f0 = Math.min(frames - 2, Math.max(0, Math.floor(t)));
    const frac = t - f0;
    const b0 = f0 * bins;
    const b1 = (f0 + 1) * bins;

    // build the (Hermitian-symmetric) spectrum for this synthesis column
    for (let k = 0; k < bins; k++) {
      const m = (1 - frac) * mag[b0 + k] + frac * mag[b1 + k];
      // measured phase advance between the two straddling analysis frames
      let dp = phase[b1 + k] - phase[b0 + k] - omega[k];
      dp -= TWO_PI * Math.round(dp / TWO_PI); // principal value
      // advance the synthesis phase by one nominal analysis hop of true freq
      synPhase[k] += omega[k] + dp;
      const ph = synPhase[k];
      re[k] = m * Math.cos(ph);
      im[k] = m * Math.sin(ph);
    }
    // enforce real output: bins 0 and N/2 imaginary = 0, mirror the rest
    im[0] = 0;
    im[bins - 1] = 0;
    for (let k = 1; k < bins - 1; k++) {
      re[N - k] = re[k];
      im[N - k] = -im[k];
    }

    fft(re, im, true); // inverse → time domain (real part is the signal)

    const off = s * hop;
    for (let i = 0; i < N; i++) {
      const w = win[i];
      signal[off + i] += re[i] * w;
      norm[off + i] += w * w;
    }

    // advance the read-head by the drifting rate
    const tSec = (s * hop) / sampleRate;
    const rate = baseRate * (1 + driftAt(drift, tSec));
    t += Math.max(baseRate * 0.25, rate);
    if (t > frames - 2) t = frames - 2;
  }

  // normalize the overlap-add (undo the Hann^2 window sum)
  for (let i = 0; i < outLen; i++) {
    if (norm[i] > 1e-6) signal[i] /= norm[i];
  }
  // trim trailing silence/edge and soft-limit
  for (let i = 0; i < outLen; i++) signal[i] = Math.tanh(signal[i] * 1.1);

  return { signal, sampleRate, hop, frameMap, synthFrames };
}
