/*
 * pv.ts — a real overlap-add phase-vocoder SPECTRAL FREEZE engine.
 *
 * The microphone (or the fallback vowel synth) is the sound source. We run a
 * continuous STFT on the incoming signal inside a ScriptProcessorNode. When the
 * player taps FREEZE we snapshot the current magnitude spectrum together with a
 * per-bin phase-advance measured across two successive analysis frames, and
 * resynthesise that frame FOREVER by overlap-add IFFT — advancing each bin's
 * phase by its own frozen per-hop increment so the tone rings smoothly instead
 * of buzzing. Spectral peaks are found and their neighbouring bins are locked to
 * the peak's running phase every hop (identity phase-locking, Laroche & Dolson),
 * keeping each partial vertically coherent.
 *
 * Frozen frames stack (up to MAX_LAYERS) into a self-choir. The live mic is
 * ONLY analysed, never monitored, so there is no feedback and no live drone —
 * silence until you freeze something.
 */

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

export const FFT_SIZE = 2048;
export const HOP = 512; // 75% overlap
export const HALF = FFT_SIZE / 2; // usable single-sided bins (0..HALF)
export const MAX_LAYERS = 6;

// Hann analysis/synthesis window. With Hann on both sides at 75% overlap the
// overlap-add of wa*ws is the constant 1.5, so we divide the output by it.
const OLA_NORM = 1.5;

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/** Iterative in-place radix-2 complex FFT (hand-rolled, ~40 lines). */
export class FFT {
  private n: number;
  private cosT: Float32Array;
  private sinT: Float32Array;
  private rev: Uint32Array;

  constructor(n: number) {
    this.n = n;
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let x = i;
      let r = 0;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | (x & 1);
        x >>= 1;
      }
      this.rev[i] = r >>> 0;
    }
    this.cosT = new Float32Array(n >> 1);
    this.sinT = new Float32Array(n >> 1);
    for (let i = 0; i < n >> 1; i++) {
      this.cosT[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sinT[i] = Math.sin((-2 * Math.PI * i) / n);
    }
  }

  /** In-place transform. inverse=true does the conjugate (no 1/N scaling). */
  transform(re: Float32Array, im: Float32Array, inverse = false): void {
    const n = this.n;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const c = this.cosT[k];
          const s = inverse ? -this.sinT[k] : this.sinT[k];
          const tr = c * re[j + half] - s * im[j + half];
          const ti = c * im[j + half] + s * re[j + half];
          re[j + half] = re[j] - tr;
          im[j + half] = im[j] - ti;
          re[j] += tr;
          im[j] += ti;
        }
      }
    }
  }
}

export interface LayerView {
  id: number;
  gain: number;
  peaks: { freq: number; mag: number }[];
}

interface FrozenLayer {
  id: number;
  mag: Float32Array; // frozen magnitudes, bins 0..HALF
  phaseAcc: Float32Array; // running phase per bin (only peaks advance)
  phaseInc: Float32Array; // per-hop phase advance per bin (measured)
  phaseOffset: Float32Array; // frozenPhase[bin] - frozenPhase[nearestPeak]
  nearestPeak: Int32Array; // bin -> its governing peak bin
  peakBins: number[];
  gain: number; // smoothed
  targetGain: number; // fade target (0 while releasing)
  releasing: boolean;
  viewPeaks: { freq: number; mag: number }[];
}

/**
 * The freeze engine. Owns one ScriptProcessorNode; connect a source into
 * `input` and route `output` onward to the destination.
 */
export class FreezeEngine {
  readonly ctx: AudioContext;
  readonly input: GainNode; // connect the mic / synth source here
  readonly output: GainNode; // master out
  readonly node: ScriptProcessorNode;
  private safeMaster: SafeMaster;

  private fft: FFT;
  private wa: Float32Array; // analysis window
  private ws: Float32Array; // synthesis window

  // analysis ring (last FFT_SIZE input samples)
  private anaRing: Float32Array;
  private prevPhase: Float32Array;
  private curMag: Float32Array; // latest magnitude frame (for viz + freeze)
  private curPhase: Float32Array;
  private measuredInc: Float32Array; // latest per-bin phase advance
  private liveMag: Float32Array; // smoothed magnitude for display
  private inputLevel = 0;

  // synthesis overlap-add accumulator
  private ola: Float32Array;
  private layers: FrozenLayer[] = [];
  private nextId = 1;

  // scratch
  private sRe: Float32Array;
  private sIm: Float32Array;

  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.fft = new FFT(FFT_SIZE);
    this.wa = hann(FFT_SIZE);
    this.ws = hann(FFT_SIZE);

    this.anaRing = new Float32Array(FFT_SIZE);
    this.prevPhase = new Float32Array(HALF + 1);
    this.curMag = new Float32Array(HALF + 1);
    this.curPhase = new Float32Array(HALF + 1);
    this.measuredInc = new Float32Array(HALF + 1);
    this.liveMag = new Float32Array(HALF + 1);

    this.ola = new Float32Array(FFT_SIZE);
    this.sRe = new Float32Array(FFT_SIZE);
    this.sIm = new Float32Array(FFT_SIZE);

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.output.gain.value = 0.9;

    // Buffer size == HOP so each callback is exactly one analysis+synthesis hop.
    this.node = ctx.createScriptProcessor(HOP, 1, 1);
    this.node.onaudioprocess = (e) => this.process(e);

    // Source -> input -> node (analysed, not passed through).
    this.input.connect(this.node);
    // node output (the frozen resynthesis) -> master -> speakers. The path to
    // the destination is also what keeps the ScriptProcessor's callback firing.
    this.node.connect(this.output);
    // Route through the shared ear-safety bus (shelf + lowpass + limiter)
    // instead of hitting ctx.destination raw. gain 0.9 preserves the proto's
    // original hot-master level while the limiter still caps peaks.
    this.safeMaster = createSafeMaster(ctx, { gain: 0.9 });
    this.output.connect(this.safeMaster.input);
  }

  private process(e: AudioProcessingEvent): void {
    if (this.disposed) return;
    const inBuf = e.inputBuffer.getChannelData(0);
    const outBuf = e.outputBuffer.getChannelData(0);
    const N = FFT_SIZE;

    // --- shift analysis ring left by HOP, append new HOP samples ---
    this.anaRing.copyWithin(0, HOP, N);
    let level = 0;
    for (let i = 0; i < HOP; i++) {
      const s = inBuf[i] || 0;
      this.anaRing[N - HOP + i] = s;
      level += s * s;
    }
    this.inputLevel = Math.sqrt(level / HOP);

    this.analyse();
    this.synthHop(outBuf);
  }

  /** One STFT analysis frame over the current ring. */
  private analyse(): void {
    const re = this.sRe;
    const im = this.sIm;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = this.anaRing[i] * this.wa[i];
      im[i] = 0;
    }
    this.fft.transform(re, im, false);
    const cur = this.curMag;
    const ph = this.curPhase;
    const inc = this.measuredInc;
    const prev = this.prevPhase;
    const live = this.liveMag;
    for (let k = 0; k <= HALF; k++) {
      const rr = re[k];
      const ii = im[k];
      const mag = Math.sqrt(rr * rr + ii * ii);
      const phase = Math.atan2(ii, rr);
      cur[k] = mag;
      ph[k] = phase;
      // raw per-hop phase advance measured between successive frames
      inc[k] = phase - prev[k];
      prev[k] = phase;
      // smoothed live magnitude for the display
      live[k] += (mag - live[k]) * 0.4;
    }
  }

  /** Render one HOP of overlap-added output from all frozen layers. */
  private synthHop(outBuf: Float32Array): void {
    const N = FFT_SIZE;
    // advance the OLA accumulator by one hop
    this.ola.copyWithin(0, HOP, N);
    for (let i = N - HOP; i < N; i++) this.ola[i] = 0;

    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li];
      // per-layer gain smoothing (click-free fade in / out)
      L.gain += (L.targetGain - L.gain) * 0.08;
      if (L.releasing && L.gain < 0.0008) {
        this.layers.splice(li, 1);
        li--;
        continue;
      }
      if (L.gain < 0.0002) continue;
      this.renderLayer(L);
    }

    // divide by the wa*ws overlap-add constant and soft-clip for headroom
    for (let i = 0; i < HOP; i++) {
      const v = this.ola[i] / OLA_NORM;
      outBuf[i] = Math.tanh(v);
    }
  }

  /** Build one layer's frame from frozen magnitudes + locked phases, IFFT, OLA. */
  private renderLayer(L: FrozenLayer): void {
    const re = this.sRe;
    const im = this.sIm;
    const g = L.gain;

    // advance only the peak bins by their own frozen increment
    for (let p = 0; p < L.peakBins.length; p++) {
      const b = L.peakBins[p];
      L.phaseAcc[b] += L.phaseInc[b];
    }

    // build the single-sided spectrum with identity phase-locking
    re[0] = 0;
    im[0] = 0;
    re[HALF] = 0;
    im[HALF] = 0;
    for (let k = 1; k < HALF; k++) {
      const mag = L.mag[k] * g;
      if (mag <= 1e-7) {
        re[k] = 0;
        im[k] = 0;
        re[N_MINUS(k)] = 0;
        im[N_MINUS(k)] = 0;
        continue;
      }
      const peak = L.nearestPeak[k];
      const phase = L.phaseAcc[peak] + L.phaseOffset[k];
      const rr = mag * Math.cos(phase);
      const ii = mag * Math.sin(phase);
      re[k] = rr;
      im[k] = ii;
      // Hermitian mirror for the negative frequencies
      re[N_MINUS(k)] = rr;
      im[N_MINUS(k)] = -ii;
    }

    // inverse FFT (transform with inverse flag, then /N)
    this.fft.transform(re, im, true);
    const invN = 1 / FFT_SIZE;
    const ws = this.ws;
    const ola = this.ola;
    for (let i = 0; i < FFT_SIZE; i++) {
      ola[i] += re[i] * invN * ws[i];
    }
  }

  /** Freeze the current spectrum into a new sustained layer. Returns count. */
  freeze(): number {
    if (this.layers.length >= MAX_LAYERS) return this.layers.length;

    const mag = new Float32Array(HALF + 1);
    const frozenPhase = new Float32Array(HALF + 1);
    const phaseInc = new Float32Array(HALF + 1);
    let maxMag = 1e-9;
    for (let k = 0; k <= HALF; k++) {
      mag[k] = this.curMag[k];
      frozenPhase[k] = this.curPhase[k];
      phaseInc[k] = this.measuredInc[k];
      if (mag[k] > maxMag) maxMag = mag[k];
    }

    // --- peak picking (local maxima above a relative floor) ---
    const floor = maxMag * 0.06;
    const peakBins: number[] = [];
    for (let k = 2; k < HALF - 1; k++) {
      const m = mag[k];
      if (
        m > floor &&
        m > mag[k - 1] &&
        m > mag[k - 2] &&
        m >= mag[k + 1] &&
        m >= mag[k + 2]
      ) {
        peakBins.push(k);
      }
    }
    if (peakBins.length === 0) {
      // fall back to the global maximum so a layer is never silent
      let best = 1;
      for (let k = 1; k <= HALF; k++) if (mag[k] > mag[best]) best = k;
      peakBins.push(best);
    }

    // --- assign every bin to its governing peak (region of influence) ---
    const nearestPeak = new Int32Array(HALF + 1);
    const phaseOffset = new Float32Array(HALF + 1);
    let pi = 0;
    for (let k = 0; k <= HALF; k++) {
      while (
        pi < peakBins.length - 1 &&
        Math.abs(k - peakBins[pi + 1]) < Math.abs(k - peakBins[pi])
      ) {
        pi++;
      }
      const peak = peakBins[pi];
      nearestPeak[k] = peak;
      // vertical phase coherence: keep each bin's offset from its peak
      phaseOffset[k] = frozenPhase[k] - frozenPhase[peak];
    }

    const phaseAcc = new Float32Array(HALF + 1);
    for (let k = 0; k <= HALF; k++) phaseAcc[k] = frozenPhase[k];

    // view data (top peaks by magnitude) for the canvas shelves
    const sr = this.ctx.sampleRate;
    const viewPeaks = peakBins
      .map((b) => ({ freq: (b * sr) / FFT_SIZE, mag: mag[b] / maxMag }))
      .sort((a, b) => b.mag - a.mag)
      .slice(0, 48);

    const layer: FrozenLayer = {
      id: this.nextId++,
      mag,
      phaseAcc,
      phaseInc,
      phaseOffset,
      nearestPeak,
      peakBins,
      gain: 0,
      targetGain: 0.85,
      releasing: false,
      viewPeaks,
    };
    this.layers.push(layer);
    return this.layers.length;
  }

  releaseLast(): number {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (!this.layers[i].releasing) {
        this.layers[i].releasing = true;
        this.layers[i].targetGain = 0;
        break;
      }
    }
    return this.activeCount();
  }

  clear(): void {
    for (const L of this.layers) {
      L.releasing = true;
      L.targetGain = 0;
    }
  }

  activeCount(): number {
    let n = 0;
    for (const L of this.layers) if (!L.releasing) n++;
    return n;
  }

  setMaster(v: number): void {
    this.output.gain.value = v;
  }

  /** Normalised (0..1) live spectrum for display. */
  getLiveSpectrum(out: Float32Array): number {
    let mx = 1e-6;
    for (let k = 0; k <= HALF; k++) if (this.liveMag[k] > mx) mx = this.liveMag[k];
    for (let k = 0; k <= HALF; k++) out[k] = this.liveMag[k] / mx;
    return this.inputLevel;
  }

  getLayerViews(): LayerView[] {
    return this.layers
      .filter((L) => !L.releasing || L.gain > 0.01)
      .map((L) => ({ id: L.id, gain: L.gain, peaks: L.viewPeaks }));
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.node.onaudioprocess = null;
      this.input.disconnect();
      this.node.disconnect();
      this.output.disconnect();
      this.safeMaster.disconnect();
    } catch {
      /* already torn down */
    }
  }
}

// helper kept out of the hot path's readability
function N_MINUS(k: number): number {
  return FFT_SIZE - k;
}
