// ════════════════════════════════════════════════════════════════════════════
// MOSAIC (3808) — TARGET analysis. The target is the sound whose melody/phrase
// the corpus will resynthesize. It arrives one of three ways:
//   • AUTO   — a seeded synthetic melody, pre-analyzed into frames (headless).
//   • FILE   — a dropped second recording, pre-analyzed into frames.
//   • MIC    — your live voice, analyzed frame-by-frame from an AnalyserNode.
//
// Every frame is turned into the SAME normalized feature vector as the corpus
// grains (using the corpus's own normalization), so the matcher compares like
// with like. Each frame also carries an atlas position (where the observation
// sits) and an energy (its loudness, for gating + gain).
// ════════════════════════════════════════════════════════════════════════════

import {
  analyzeFrame,
  FDIM,
  FRAME,
  type FeatureNorm,
  normalizeFeature,
  projectPos,
  rawFeature,
} from "./mosaic-corpus";

export interface TargetFrame {
  /** Normalized feature vector, FDIM long. */
  feat: Float32Array;
  /** Atlas position of the observation [x, y]. */
  pos: [number, number];
  /** Loudness 0..~1 (gates playback + scales gain). */
  energy: number;
}

/** A pre-analyzed target (AUTO or FILE): frames sampled at `hopSec`. */
export interface TargetClip {
  frames: TargetFrame[];
  hopSec: number;
  label: string;
}

/**
 * Pre-analyze a mono target signal into frames aligned to the corpus hop, using
 * the corpus's normalization so target + corpus share one feature space.
 */
export function analyzeTargetClip(
  mono: Float32Array,
  sampleRate: number,
  norm: FeatureNorm,
  hopSec: number,
  label: string,
): TargetClip {
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const usable = Math.max(0, mono.length - FRAME);
  const count = Math.max(1, Math.floor(usable / hop) + 1);
  const frames: TargetFrame[] = [];
  const raw = new Float32Array(FDIM);
  const nrow = new Float32Array(FDIM);

  // Peak-normalize the energy read-out so quiet-but-clear targets still drive.
  let maxRms = 1e-4;
  const rmsList = new Float32Array(count);
  const rawRows: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const d = analyzeFrame(mono, i * hop, sampleRate);
    rmsList[i] = d.rms;
    if (d.rms > maxRms) maxRms = d.rms;
    const r = new Float32Array(FDIM);
    rawFeature(d, r);
    rawRows.push(r);
  }

  for (let i = 0; i < count; i++) {
    raw.set(rawRows[i]);
    normalizeFeature(raw, norm, nrow);
    frames.push({
      feat: nrow.slice(),
      pos: projectPos(nrow[0], nrow[1]),
      energy: Math.max(0, Math.min(1, rmsList[i] / maxRms)),
    });
  }

  return { frames, hopSec, label };
}

/**
 * Live mic target: reads an AnalyserNode each call and produces one frame in the
 * corpus feature space. Uses time-domain data for RMS + autocorrelation pitch
 * and frequency-domain data for centroid / flatness / spread — the same
 * descriptors the corpus grains were built from.
 */
export class MicTarget {
  private analyser: AnalyserNode;
  private time: Float32Array<ArrayBuffer>;
  private freqDb: Float32Array<ArrayBuffer>;
  private raw = new Float32Array(FDIM);
  private nrow = new Float32Array(FDIM);
  private sampleRate: number;

  constructor(analyser: AnalyserNode, sampleRate: number) {
    this.analyser = analyser;
    this.sampleRate = sampleRate;
    this.time = new Float32Array(analyser.fftSize);
    this.freqDb = new Float32Array(analyser.frequencyBinCount);
  }

  frame(norm: FeatureNorm): TargetFrame {
    const a = this.analyser;
    a.getFloatTimeDomainData(this.time);
    a.getFloatFrequencyData(this.freqDb);

    const N = this.time.length;
    let rms = 0;
    for (let i = 0; i < N; i++) rms += this.time[i] * this.time[i];
    rms = Math.sqrt(rms / N);

    // Frequency-domain descriptors from linear magnitudes (dB → linear).
    const bins = this.freqDb.length;
    const binHz = this.sampleRate / (bins * 2);
    let magSum = 0;
    let weighted = 0;
    let logSum = 0;
    const mags = new Float32Array(bins);
    for (let k = 1; k < bins; k++) {
      const m = Math.pow(10, this.freqDb[k] / 20);
      mags[k] = m;
      magSum += m;
      weighted += m * (k * binHz);
      logSum += Math.log(m + 1e-9);
    }
    const centroidHz = magSum > 1e-9 ? weighted / magSum : 0;
    let spreadAcc = 0;
    for (let k = 1; k < bins; k++) {
      const f = k * binHz;
      spreadAcc += mags[k] * (f - centroidHz) * (f - centroidHz);
    }
    const spreadHz = magSum > 1e-9 ? Math.sqrt(spreadAcc / magSum) : 0;
    const geoMean = Math.exp(logSum / (bins - 1));
    const ariMean = magSum / (bins - 1);
    const flatness = ariMean > 1e-9 ? Math.min(1, geoMean / ariMean) : 0;

    // Time-domain autocorrelation pitch.
    const pitchHz = micPitch(this.time, this.sampleRate);

    this.raw[0] = Math.log2(Math.max(40, Math.min(16000, centroidHz || 40)));
    this.raw[1] = Math.log2(Math.max(50, Math.min(4000, pitchHz > 0 ? pitchHz : centroidHz || 50)));
    this.raw[2] = flatness;
    this.raw[3] = Math.log2(Math.max(20, Math.min(12000, spreadHz || 20)));
    this.raw[4] = Math.log(rms + 1e-4);
    normalizeFeature(this.raw, norm, this.nrow);

    // Mic energy is scaled up — speech RMS is modest but should clearly drive.
    return {
      feat: this.nrow.slice(),
      pos: projectPos(this.nrow[0], this.nrow[1]),
      energy: Math.max(0, Math.min(1, rms * 6)),
    };
  }
}

function micPitch(time: Float32Array, sampleRate: number): number {
  const n = time.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += time[i];
  mean /= n;
  let c0 = 0;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = time[i] - mean;
    c0 += x[i] * x[i];
  }
  if (c0 < 1e-6) return -1;
  const minLag = Math.floor(sampleRate / 2000);
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 50));
  let d = minLag;
  // Skip the descent off the zero-lag peak.
  let prevC = Infinity;
  for (let lag = 1; lag < minLag; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += x[i] * x[i + lag];
    if (s > prevC) {
      d = lag;
      break;
    }
    prevC = s;
  }
  let bestLag = -1;
  let bestVal = 0;
  for (let lag = Math.max(minLag, d); lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += x[i] * x[i + lag];
    if (s > bestVal) {
      bestVal = s;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestVal / c0 < 0.3) return -1;
  return sampleRate / bestLag;
}
