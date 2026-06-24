// 909-resonant-field-volume — features.ts
// Timbre / texture extractor. DELIBERATELY pitch-free: no autocorrelation, no
// note/scale/chord logic. We only measure HOW a sound is shaped, never WHICH
// pitch it is. Everything here is texture: loudness, brightness, noisiness,
// change, and a coarse spectral silhouette.

export interface Features {
  /** Loudness, 0..1 (raised-floor RMS of the time-domain frame). */
  rms: number;
  /** Spectral centroid normalised 0..1 — "brightness". */
  centroid: number;
  /** Spectral flatness 0..1 — 0 = tonal/peaky, 1 = noisy/diffuse. */
  flatness: number;
  /** Positive spectral flux 0..1 — onset / change energy. */
  flux: number;
  /** 8-band log-spaced energy vector, each 0..1. Coarse silhouette only. */
  bands: number[];
  /** True while real sound (above the silence floor) is present. */
  active: boolean;
}

/**
 * FeatureExtractor pulls frames from an AnalyserNode and produces smoothed,
 * pitch-free timbre features. Reusable for both the live-mic path and the
 * synthetic auto-demo path — they share the SAME analyser contract.
 */
export class FeatureExtractor {
  private analyser: AnalyserNode;
  private freq: Float32Array; // dB magnitude per bin
  private mag: Float32Array; // linear magnitude per bin
  private prevMag: Float32Array; // for flux
  private time: Float32Array; // time-domain for RMS
  private binHz: number;
  private bandEdges: number[]; // 9 edges -> 8 bands

  // Smoothed state (exponential moving averages).
  private sRms = 0;
  private sCentroid = 0.3;
  private sFlatness = 0.5;
  private sFlux = 0;
  private sBands = new Array(8).fill(0);

  // Silence detection.
  private silentFrames = 0;

  constructor(analyser: AnalyserNode, sampleRate: number) {
    this.analyser = analyser;
    const bins = analyser.frequencyBinCount;
    this.freq = new Float32Array(bins);
    this.mag = new Float32Array(bins);
    this.prevMag = new Float32Array(bins);
    this.time = new Float32Array(analyser.fftSize);
    this.binHz = sampleRate / analyser.fftSize;

    // Log-spaced band edges from ~60 Hz to ~ Nyquist-ish (8 kHz cap keeps it
    // mic-friendly). 8 bands.
    const lo = 60;
    const hi = Math.min(8000, sampleRate / 2);
    this.bandEdges = [];
    for (let i = 0; i <= 8; i++) {
      this.bandEdges.push(lo * Math.pow(hi / lo, i / 8));
    }
  }

  /** Pull one frame and update smoothed features. Returns current snapshot. */
  read(): Features {
    const a = this.analyser;
    a.getFloatFrequencyData(this.freq as unknown as Float32Array<ArrayBuffer>);
    a.getFloatTimeDomainData(this.time as unknown as Float32Array<ArrayBuffer>);

    // --- RMS (time domain) ---
    let sumSq = 0;
    for (let i = 0; i < this.time.length; i++) {
      const v = this.time[i];
      sumSq += v * v;
    }
    const rawRms = Math.sqrt(sumSq / this.time.length);
    // Perceptual-ish compression; floor lifted so quiet voices still register.
    const rms = Math.min(1, Math.pow(rawRms * 6, 0.6));

    // --- linear magnitude from dB ---
    const bins = this.mag.length;
    let magSum = 0;
    for (let i = 0; i < bins; i++) {
      // dB -> linear; clamp very low values.
      const lin = Math.pow(10, this.freq[i] / 20);
      const m = isFinite(lin) ? lin : 0;
      this.mag[i] = m;
      magSum += m;
    }

    // --- spectral centroid ---
    let centroidNum = 0;
    if (magSum > 1e-9) {
      for (let i = 0; i < bins; i++) {
        centroidNum += i * this.binHz * this.mag[i];
      }
    }
    const centroidHz = magSum > 1e-9 ? centroidNum / magSum : 0;
    // Normalise against a 4 kHz reference, log-ish curve for perceptual feel.
    const centroid = Math.min(1, Math.max(0, Math.log2(1 + centroidHz / 80) / Math.log2(1 + 4000 / 80)));

    // --- spectral flatness (geometric / arithmetic mean over usable band) ---
    // Restrict to bins above DC up to ~Nyquist; add epsilon for log stability.
    let logSum = 0;
    let arithSum = 0;
    let count = 0;
    const startBin = Math.max(1, Math.floor(60 / this.binHz));
    for (let i = startBin; i < bins; i++) {
      const m = this.mag[i] + 1e-7;
      logSum += Math.log(m);
      arithSum += m;
      count++;
    }
    let flatness = 0.5;
    if (count > 0 && arithSum > 1e-9) {
      const geo = Math.exp(logSum / count);
      const arith = arithSum / count;
      flatness = Math.min(1, Math.max(0, geo / arith));
    }

    // --- spectral flux (positive change vs previous frame) ---
    let flux = 0;
    let fluxNorm = 0;
    for (let i = 0; i < bins; i++) {
      const d = this.mag[i] - this.prevMag[i];
      if (d > 0) flux += d;
      fluxNorm += this.mag[i];
      this.prevMag[i] = this.mag[i];
    }
    flux = fluxNorm > 1e-9 ? Math.min(1, (flux / fluxNorm) * 4) : 0;

    // --- 8-band log-spaced energy ---
    const bands = new Array(8).fill(0);
    for (let b = 0; b < 8; b++) {
      const i0 = Math.max(1, Math.floor(this.bandEdges[b] / this.binHz));
      const i1 = Math.min(bins - 1, Math.ceil(this.bandEdges[b + 1] / this.binHz));
      let s = 0;
      let n = 0;
      for (let i = i0; i <= i1; i++) {
        s += this.mag[i];
        n++;
      }
      const avg = n > 0 ? s / n : 0;
      bands[b] = Math.min(1, Math.pow(avg * 40, 0.5));
    }

    // --- smoothing (EMA) ---
    const aFast = 0.35; // responsive params
    const aSlow = 0.12; // stable params
    this.sRms += (rms - this.sRms) * aFast;
    this.sCentroid += (centroid - this.sCentroid) * aSlow;
    this.sFlatness += (flatness - this.sFlatness) * aSlow;
    this.sFlux += (flux - this.sFlux) * aFast;
    for (let b = 0; b < 8; b++) {
      this.sBands[b] += (bands[b] - this.sBands[b]) * aSlow;
    }

    // --- activity / silence ---
    const SILENCE = 0.02;
    if (this.sRms < SILENCE) this.silentFrames++;
    else this.silentFrames = 0;
    const active = this.sRms >= SILENCE;

    return {
      rms: this.sRms,
      centroid: this.sCentroid,
      flatness: this.sFlatness,
      flux: this.sFlux,
      bands: this.sBands.slice(),
      active,
    };
  }

  /** Seconds of continuous near-silence (for auto-demo arbitration). */
  silenceSeconds(frameDt: number): number {
    return this.silentFrames * frameDt;
  }
}
