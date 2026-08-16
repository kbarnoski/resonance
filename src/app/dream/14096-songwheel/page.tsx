"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14096 · Song Wheel
//
//   ONE QUESTION
//   What if your own recording's FORM became a wheel you can play — the song laid
//   out as a radial clock where its auto-detected SECTIONS are colored arcs around
//   the rim, glowing chords cross the interior to connect the bars that RHYME, a
//   playhead orbits the current moment, and every leap is snapped to the downbeat
//   so it always lands in time?
//
//   This is the radial, section-aware, BEAT-LOCKED sibling of 14048 "Rhyme Loom".
//   Rhyme Loom laid the same idea on a flat square self-similarity matrix but its
//   leaps landed mid-phrase (frames weren't beat-aligned) and it had no sense of
//   the song's sections. Song Wheel fixes both: it tracks beats + downbeats, groups
//   them into bars, segments the piece into lettered sections (Foote's checkerboard
//   novelty), and only ever leaps AT a downbeat, TO a downbeat.
//
//   PIPELINE (classic MIR, hand-rolled — no synth; every sound is Karel's audio):
//     · decode → decimate to mono ~11 kHz for analysis (full-rate kept for play).
//     · onset novelty from spectral flux over a hand-rolled 1024-pt FFT (512 hop).
//     · tempo by autocorrelation of the novelty curve (55–165 BPM); weak peak ⇒
//       median inter-onset fallback, and the lock is honestly labelled "loose".
//     · a phase-aligned beat grid (metronomic, snapped to nearby onsets so it
//       tracks rubato); grouped into bars of 4 (or 3); downbeats = every Nth beat.
//     · beat-synchronous chroma (Goertzel bank on a 0.25 s grid, averaged per bar).
//     · self-similarity S[i][j] = cosine(chroma_i, chroma_j) over bars.
//     · section boundaries via Foote's Gaussian-tapered checkerboard-kernel novelty
//       along S's diagonal; sections clustered by mean chroma so a returning theme
//       reuses its letter (A/B/C…). These become the rim ARCS, sized by duration.
//     · rhyme edges: per-bar top-K most-similar OTHER bars → the strongest drawn as
//       glowing chords bowed through the wheel's centre.
//     · a ~100 ms look-ahead scheduler plays the real buffer bar-by-bar with tiny
//       equal-power crossfades (never source.loop); leaps take effect at the next
//       downbeat and land on a matched downbeat — always in time.
//
//   REFS  Jonathan Foote, "Automatic Audio Segmentation Using a Measure of Audio
//   Novelty" (IEEE ICME 2000); Paul Lamere, "The Infinite Jukebox" (2012); direct
//   lineage from 14048 Rhyme Loom. See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { COLLECTIONS, REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ── Tuning constants ─────────────────────────────────────────────────────────
const DEC_RATE_TARGET = 11025; // Hz — decimate before analysis
const FFT_SIZE = 1024; // onset STFT window
const FFT_HOP = 512; // onset STFT hop
const CHROMA_HOP = 0.25; // s — chroma frame spacing
const CHROMA_WIN = 0.5; // s — chroma frame window
const MIDI_LOW = 36; // C2
const MIDI_HIGH = 95; // B6 → 60 Goertzel bins
const BPM_MIN = 55;
const BPM_MAX = 165;
const MAX_BARS = 380; // cap on bar count for the SSM
const TOP_K = 10; // rhyme candidates per bar
const ADJ_EXCLUDE = 2; // skip |i-j| < this as trivial rhymes
const MAX_CHORDS = 26; // strongest rhyme chords drawn on the wheel
const CROSSFADE = 0.02; // s — equal-power fade at every bar join
const ANTIREPEAT = 4; // short anti-repeat memory for auto-wander

// ── Geometry ─────────────────────────────────────────────────────────────────
const VIEW = 1000;
const CX = 500;
const CY = 500;
const RIM_R = 424; // radius of the section arcs
const LABEL_R = 474; // section letters
const INNER_R = 352; // where rhyme chords attach

// ── Small DSP helpers ─────────────────────────────────────────────────────────

function mixMonoDecimate(buffer: AudioBuffer, factor: number): Float32Array {
  const ch = buffer.numberOfChannels;
  const srcLen = buffer.length;
  const outLen = Math.floor(srcLen / factor);
  const out = new Float32Array(outLen);
  const chans: Float32Array[] = [];
  for (let c = 0; c < ch; c++) chans.push(buffer.getChannelData(c));
  for (let i = 0; i < outLen; i++) {
    const base = i * factor;
    let acc = 0;
    for (let j = 0; j < factor; j++) {
      const idx = base + j;
      for (let c = 0; c < ch; c++) acc += chans[c][idx];
    }
    out[i] = acc / (factor * ch);
  }
  return out;
}

// Iterative radix-2 FFT (in place). Returns a runner over pre-sized buffers.
function buildFFT(n: number): (re: Float32Array, im: Float32Array) => void {
  const levels = Math.round(Math.log2(n));
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i;
    let r = 0;
    for (let j = 0; j < levels; j++) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    rev[i] = r;
  }
  const cos = new Float32Array(n >> 1);
  const sin = new Float32Array(n >> 1);
  for (let i = 0; i < n >> 1; i++) {
    cos[i] = Math.cos((-2 * Math.PI * i) / n);
    sin[i] = Math.sin((-2 * Math.PI * i) / n);
  }
  return (re: Float32Array, im: Float32Array) => {
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
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const c = cos[t];
          const s = sin[t];
          const a = i + k;
          const b = a + half;
          const tr = re[b] * c - im[b] * s;
          const ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  };
}

// Goertzel chroma bank.
interface BinBank {
  coeff: Float32Array;
  cw: Float32Array;
  sw: Float32Array;
  pc: Uint8Array;
  n: number;
}
function buildBinBank(decRate: number): BinBank {
  const n = MIDI_HIGH - MIDI_LOW + 1;
  const coeff = new Float32Array(n);
  const cw = new Float32Array(n);
  const sw = new Float32Array(n);
  const pc = new Uint8Array(n);
  for (let b = 0; b < n; b++) {
    const midi = MIDI_LOW + b;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const w = (2 * Math.PI * freq) / decRate;
    coeff[b] = 2 * Math.cos(w);
    cw[b] = Math.cos(w);
    sw[b] = Math.sin(w);
    pc[b] = midi % 12;
  }
  return { coeff, cw, sw, pc, n };
}
function computeChroma(
  sig: Float32Array,
  start: number,
  len: number,
  win: Float32Array,
  bank: BinBank,
): Float32Array {
  const chroma = new Float32Array(12);
  const { coeff, cw, sw, pc, n } = bank;
  for (let b = 0; b < n; b++) {
    const cf = coeff[b];
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < len; i++) {
      const x = sig[start + i] * win[i];
      const s0 = cf * s1 - s2 + x;
      s2 = s1;
      s1 = s0;
    }
    const real = s1 - s2 * cw[b];
    const imag = s2 * sw[b];
    chroma[pc[b]] += Math.sqrt(real * real + imag * imag);
  }
  let norm = 0;
  for (let k = 0; k < 12; k++) {
    chroma[k] = Math.log1p(chroma[k]);
    norm += chroma[k] * chroma[k];
  }
  norm = Math.sqrt(norm);
  if (norm > 1e-9) for (let k = 0; k < 12; k++) chroma[k] /= norm;
  return chroma;
}

// ── Base analysis (computed once per track load) ──────────────────────────────
interface BaseAnalysis {
  decRate: number;
  dur: number;
  frameRate: number; // novelty frames per second
  novelty: Float32Array; // onset strength
  onsetFrames: number[]; // peak-picked onset frame indices
  chromaFrames: Float32Array[]; // 12-D per chroma frame
  chromaTimes: Float32Array; // centre time (s) per chroma frame
  defaultBpm: number;
  lock: "tight" | "loose";
}

async function runBaseAnalysis(
  buffer: AudioBuffer,
  onProgress: (frac: number) => void,
): Promise<BaseAnalysis> {
  const sr = buffer.sampleRate;
  const factor = Math.max(1, Math.round(sr / DEC_RATE_TARGET));
  const decRate = sr / factor;
  const sig = mixMonoDecimate(buffer, factor);
  const dur = buffer.duration;

  // 1. Spectral-flux novelty over a hand-rolled FFT.
  const fft = buildFFT(FFT_SIZE);
  const win = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  }
  const nFrames = Math.max(1, Math.floor((sig.length - FFT_SIZE) / FFT_HOP));
  const frameRate = decRate / FFT_HOP;
  const novelty = new Float32Array(nFrames);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const half = FFT_SIZE >> 1;
  const prevMag = new Float32Array(half);
  const mag = new Float32Array(half);
  for (let f = 0; f < nFrames; f++) {
    const base = f * FFT_HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = sig[base + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    let flux = 0;
    for (let k = 0; k < half; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      mag[k] = m;
      const d = m - prevMag[k];
      if (d > 0) flux += d;
      prevMag[k] = m;
    }
    novelty[f] = flux;
    if ((f & 63) === 0) {
      onProgress((f / nFrames) * 0.45);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  // Normalise novelty to unit peak for stable thresholds.
  let nvMax = 1e-9;
  for (let f = 0; f < nFrames; f++) if (novelty[f] > nvMax) nvMax = novelty[f];
  for (let f = 0; f < nFrames; f++) novelty[f] /= nvMax;

  // 2. Onset peak-pick (adaptive local threshold + min spacing).
  const onsetFrames: number[] = [];
  const winLen = Math.max(3, Math.round(frameRate * 0.1));
  const minGap = Math.max(2, Math.round(frameRate * 0.12));
  let lastOnset = -minGap;
  for (let f = 1; f < nFrames - 1; f++) {
    if (novelty[f] < novelty[f - 1] || novelty[f] <= novelty[f + 1]) continue;
    let sum = 0;
    let cnt = 0;
    for (let j = f - winLen; j <= f + winLen; j++) {
      if (j < 0 || j >= nFrames) continue;
      sum += novelty[j];
      cnt++;
    }
    const thresh = sum / cnt + 0.06;
    if (novelty[f] >= thresh && f - lastOnset >= minGap) {
      onsetFrames.push(f);
      lastOnset = f;
    }
  }

  // 3. Tempo by autocorrelation of the novelty curve.
  let mean = 0;
  for (let f = 0; f < nFrames; f++) mean += novelty[f];
  mean /= nFrames;
  const minLag = Math.max(2, Math.floor((frameRate * 60) / BPM_MAX));
  const maxLag = Math.min(nFrames - 1, Math.ceil((frameRate * 60) / BPM_MIN));
  let ac0 = 0;
  for (let f = 0; f < nFrames; f++) {
    const d = novelty[f] - mean;
    ac0 += d * d;
  }
  let bestLag = minLag;
  let bestAc = -Infinity;
  let acSum = 0;
  let acCnt = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let ac = 0;
    for (let f = 0; f + lag < nFrames; f++) {
      ac += (novelty[f] - mean) * (novelty[f + lag] - mean);
    }
    acSum += ac;
    acCnt++;
    if (ac > bestAc) {
      bestAc = ac;
      bestLag = lag;
    }
  }
  const acMean = acSum / Math.max(1, acCnt);
  const strength = ac0 > 1e-9 ? (bestAc - acMean) / ac0 : 0;
  let defaultBpm = (60 * frameRate) / bestLag;
  const lock: "tight" | "loose" = strength > 0.06 ? "tight" : "loose";

  // Weak autocorrelation ⇒ fall back to the median inter-onset spacing.
  if (lock === "loose" && onsetFrames.length > 4) {
    const diffs: number[] = [];
    for (let i = 1; i < onsetFrames.length; i++) {
      diffs.push(onsetFrames[i] - onsetFrames[i - 1]);
    }
    diffs.sort((a, b) => a - b);
    const med = diffs[Math.floor(diffs.length / 2)];
    if (med > 0) {
      let bpm = (60 * frameRate) / med;
      while (bpm < BPM_MIN) bpm *= 2;
      while (bpm > BPM_MAX) bpm /= 2;
      defaultBpm = bpm;
    }
  }
  if (defaultBpm < BPM_MIN) defaultBpm *= 2;
  if (defaultBpm > BPM_MAX) defaultBpm /= 2;
  onProgress(0.55);
  await new Promise((r) => setTimeout(r, 0));

  // 4. Chroma on a fixed 0.25 s grid (later averaged per bar — cheap to re-bin).
  const bank = buildBinBank(decRate);
  const cwinLen = Math.max(1, Math.round(CHROMA_WIN * decRate));
  const cwin = new Float32Array(cwinLen);
  for (let i = 0; i < cwinLen; i++) {
    cwin[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, cwinLen - 1));
  }
  const m = Math.max(1, Math.floor(dur / CHROMA_HOP));
  const chromaFrames: Float32Array[] = new Array(m);
  const chromaTimes = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const centre = i * CHROMA_HOP + CHROMA_HOP * 0.5;
    chromaTimes[i] = centre;
    let start = Math.round(centre * decRate - cwinLen / 2);
    if (start < 0) start = 0;
    if (start + cwinLen > sig.length) start = Math.max(0, sig.length - cwinLen);
    const len = Math.min(cwinLen, sig.length - start);
    chromaFrames[i] = computeChroma(sig, start, len, cwin, bank);
    if ((i & 31) === 0) {
      onProgress(0.55 + (i / m) * 0.4);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress(1);

  return {
    decRate,
    dur,
    frameRate,
    novelty,
    onsetFrames,
    chromaFrames,
    chromaTimes,
    defaultBpm,
    lock,
  };
}

// ── Derived structure (recomputed on BPM / meter changes — cheap) ─────────────
interface Bar {
  startSec: number;
  dur: number;
}
interface Section {
  startBar: number;
  endBar: number; // inclusive
  startSec: number;
  dur: number;
  cluster: number;
  letter: string;
}
interface Chord {
  a: number;
  b: number;
  sim: number;
}
interface Derived {
  bars: Bar[];
  n: number;
  ssm: Float32Array;
  sections: Section[];
  barSection: Int32Array;
  candidates: number[][];
  chords: Chord[];
  clusterCount: number;
}

function deriveStructure(base: BaseAnalysis, bpm: number, meter: number): Derived {
  const { frameRate, novelty, onsetFrames, chromaFrames, chromaTimes, dur } = base;
  const nFrames = novelty.length;
  const P = (frameRate * 60) / bpm; // beat period in novelty frames
  const snapWin = P * 0.3;

  // Phase-align the beat grid to the novelty energy.
  let bestOff = 0;
  let bestScore = -Infinity;
  const offSteps = Math.max(1, Math.round(P));
  for (let off = 0; off < offSteps; off++) {
    let score = 0;
    for (let fr = off; fr < nFrames; fr += P) {
      const idx = Math.round(fr);
      if (idx >= 0 && idx < nFrames) score += novelty[idx];
    }
    if (score > bestScore) {
      bestScore = score;
      bestOff = off;
    }
  }

  // Metronomic beats, each snapped to the nearest onset within tolerance.
  const beatTimes: number[] = [];
  let oi = 0;
  for (let fr = bestOff; fr < nFrames; fr += P) {
    const target = Math.round(fr);
    // advance onset pointer
    while (oi < onsetFrames.length && onsetFrames[oi] < target - snapWin) oi++;
    let bf = target;
    let best = Infinity;
    for (let k = oi; k < onsetFrames.length; k++) {
      const o = onsetFrames[k];
      if (o > target + snapWin) break;
      const d = Math.abs(o - target);
      if (d < best) {
        best = d;
        bf = o;
      }
    }
    const t = bf / frameRate;
    if (beatTimes.length === 0 || t > beatTimes[beatTimes.length - 1] + 1e-3) {
      beatTimes.push(t);
    }
  }
  if (beatTimes.length < meter * 2) {
    // Degenerate: fabricate an even grid so the wheel still forms.
    beatTimes.length = 0;
    const step = 60 / bpm;
    for (let t = 0; t < dur; t += step) beatTimes.push(t);
  }

  // Choose the downbeat phase (0..meter-1) that lands on the strongest beats.
  let bestPhase = 0;
  let bestPhaseScore = -Infinity;
  for (let ph = 0; ph < meter; ph++) {
    let s = 0;
    for (let i = ph; i < beatTimes.length; i += meter) {
      const idx = Math.round(beatTimes[i] * frameRate);
      if (idx >= 0 && idx < nFrames) s += novelty[idx];
    }
    if (s > bestPhaseScore) {
      bestPhaseScore = s;
      bestPhase = ph;
    }
  }

  // Bars span consecutive downbeats.
  const downbeats: number[] = [];
  for (let i = bestPhase; i < beatTimes.length; i += meter) downbeats.push(beatTimes[i]);
  if (downbeats.length === 0 || downbeats[0] > 0.05) downbeats.unshift(0);
  const bars: Bar[] = [];
  for (let i = 0; i < downbeats.length; i++) {
    const start = downbeats[i];
    const end = i + 1 < downbeats.length ? downbeats[i + 1] : dur;
    const d = end - start;
    if (d > 0.08) bars.push({ startSec: start, dur: d });
  }
  // Cap bar count (merge from the end if a track is huge).
  let n = bars.length;
  if (n > MAX_BARS) {
    bars.length = MAX_BARS;
    n = MAX_BARS;
  }
  if (n < 2) {
    // Guarantee a minimal wheel.
    bars.length = 0;
    const step = dur / 8;
    for (let i = 0; i < 8; i++) bars.push({ startSec: i * step, dur: step });
    n = 8;
  }

  // Bar chroma = average of the fixed chroma frames whose centre falls inside.
  const barChroma: Float32Array[] = new Array(n);
  let cf = 0;
  for (let i = 0; i < n; i++) {
    const bs = bars[i].startSec;
    const be = bs + bars[i].dur;
    const acc = new Float32Array(12);
    let cnt = 0;
    while (cf < chromaTimes.length && chromaTimes[cf] < bs) cf++;
    let k = cf;
    while (k < chromaTimes.length && chromaTimes[k] < be) {
      const c = chromaFrames[k];
      for (let d = 0; d < 12; d++) acc[d] += c[d];
      cnt++;
      k++;
    }
    if (cnt === 0) {
      // nearest frame
      const nk = Math.min(
        chromaTimes.length - 1,
        Math.max(0, Math.round(((bs + be) / 2) / CHROMA_HOP)),
      );
      const c = chromaFrames[nk];
      for (let d = 0; d < 12; d++) acc[d] = c[d];
    }
    let norm = 0;
    for (let d = 0; d < 12; d++) norm += acc[d] * acc[d];
    norm = Math.sqrt(norm);
    if (norm > 1e-9) for (let d = 0; d < 12; d++) acc[d] /= norm;
    barChroma[i] = acc;
  }

  // Self-similarity (cosine of unit vectors = dot).
  const ssm = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    const ci = barChroma[i];
    for (let j = i; j < n; j++) {
      const cj = barChroma[j];
      let dot = 0;
      for (let d = 0; d < 12; d++) dot += ci[d] * cj[d];
      const v = Math.max(0, Math.min(1, dot));
      ssm[i * n + j] = v;
      ssm[j * n + i] = v;
    }
  }

  // Foote checkerboard novelty → section boundaries.
  const H = Math.max(2, Math.min(10, Math.floor(n / 5)));
  const kSize = 2 * H;
  const kernel = new Float32Array(kSize * kSize);
  for (let u = 0; u < kSize; u++) {
    for (let v = 0; v < kSize; v++) {
      const du = u - H + 0.5;
      const dv = v - H + 0.5;
      const g = Math.exp(-(du * du + dv * dv) / (2 * (H * 0.5) * (H * 0.5)));
      const sign = (du < 0 ? -1 : 1) * (dv < 0 ? -1 : 1);
      kernel[u * kSize + v] = sign * g;
    }
  }
  const fnov = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < H || i >= n - H) {
      fnov[i] = 0;
      continue;
    }
    let acc = 0;
    for (let u = 0; u < kSize; u++) {
      const row = (i - H + u) * n;
      for (let v = 0; v < kSize; v++) {
        acc += kernel[u * kSize + v] * ssm[row + (i - H + v)];
      }
    }
    fnov[i] = acc;
  }
  let fMax = 1e-9;
  for (let i = 0; i < n; i++) if (fnov[i] > fMax) fMax = fnov[i];
  for (let i = 0; i < n; i++) fnov[i] = Math.max(0, fnov[i]) / fMax;

  // Peak-pick boundaries (adaptive threshold + min spacing in bars).
  const boundaries: number[] = [0];
  const minSpacing = Math.max(2, Math.round(n / 24));
  let lastB = -minSpacing;
  for (let i = 1; i < n - 1; i++) {
    if (fnov[i] <= fnov[i - 1] || fnov[i] < fnov[i + 1]) continue;
    if (fnov[i] < 0.18) continue;
    if (i - lastB < minSpacing) continue;
    boundaries.push(i);
    lastB = i;
  }
  if (boundaries[boundaries.length - 1] !== n) boundaries.push(n);

  // Sections + mean chroma, then cluster to reuse letters for returning themes.
  const rawSections: Array<{ startBar: number; endBar: number; mean: Float32Array }> = [];
  for (let s = 0; s < boundaries.length - 1; s++) {
    const a = boundaries[s];
    const b = boundaries[s + 1] - 1;
    const mean = new Float32Array(12);
    for (let i = a; i <= b; i++) {
      const c = barChroma[i];
      for (let d = 0; d < 12; d++) mean[d] += c[d];
    }
    let norm = 0;
    for (let d = 0; d < 12; d++) norm += mean[d] * mean[d];
    norm = Math.sqrt(norm);
    if (norm > 1e-9) for (let d = 0; d < 12; d++) mean[d] /= norm;
    rawSections.push({ startBar: a, endBar: b, mean });
  }
  const clusterReps: Float32Array[] = [];
  const CLUSTER_THRESH = 0.82;
  const sections: Section[] = [];
  const barSection = new Int32Array(n);
  for (let s = 0; s < rawSections.length; s++) {
    const rs = rawSections[s];
    let cluster = -1;
    let bestSim = CLUSTER_THRESH;
    for (let c = 0; c < clusterReps.length; c++) {
      let dot = 0;
      for (let d = 0; d < 12; d++) dot += rs.mean[d] * clusterReps[c][d];
      if (dot > bestSim) {
        bestSim = dot;
        cluster = c;
      }
    }
    if (cluster === -1) {
      cluster = clusterReps.length;
      clusterReps.push(rs.mean);
    }
    const startSec = bars[rs.startBar].startSec;
    const endSec = bars[rs.endBar].startSec + bars[rs.endBar].dur;
    const sec: Section = {
      startBar: rs.startBar,
      endBar: rs.endBar,
      startSec,
      dur: endSec - startSec,
      cluster,
      letter: String.fromCharCode(65 + (cluster % 26)),
    };
    sections.push(sec);
    for (let i = rs.startBar; i <= rs.endBar; i++) barSection[i] = s;
  }

  // Rhyme candidates per bar + strongest global chords.
  const candidates: number[][] = new Array(n);
  const edgePool: Chord[] = [];
  for (let i = 0; i < n; i++) {
    const row: Array<{ j: number; s: number }> = [];
    for (let j = 0; j < n; j++) {
      if (Math.abs(i - j) < ADJ_EXCLUDE) continue;
      row.push({ j, s: ssm[i * n + j] });
    }
    row.sort((a, b) => b.s - a.s);
    const top = row.slice(0, TOP_K);
    candidates[i] = top.map((r) => r.j);
    for (const r of top) {
      if (i < r.j && r.s > 0.72) edgePool.push({ a: i, b: r.j, sim: r.s });
    }
  }
  edgePool.sort((a, b) => b.sim - a.sim);
  const chords = edgePool.slice(0, MAX_CHORDS);

  return {
    bars,
    n,
    ssm,
    sections,
    barSection,
    candidates,
    chords,
    clusterCount: clusterReps.length,
  };
}

// ── Colour: cool-violet cluster shades ────────────────────────────────────────
function clusterColor(idx: number): string {
  const hues = [266, 252, 284, 246, 276, 258, 292, 240];
  const h = hues[idx % hues.length];
  const l = 54 + (idx % 3) * 7;
  return `hsl(${h} 62% ${l}%)`;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function polar(r: number, angDeg: number): [number, number] {
  const a = ((angDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}
function arcPath(r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// ── Playback bookkeeping ───────────────────────────────────────────────────────
interface ActiveVoice {
  src: AudioBufferSourceNode;
  g: GainNode;
}
interface QueueItem {
  barIndex: number;
  audioStart: number;
  audioEnd: number;
  offsetSec: number;
}
type Phase = "idle" | "loading" | "analyzing" | "ready" | "error";

// ─────────────────────────────────────────────────────────────────────────────

export default function SongWheelPage() {
  // UI state
  const [selectedId, setSelectedId] = useState(REAL_TRACKS[0].id);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoWander, setAutoWander] = useState(false);
  const [loopSection, setLoopSection] = useState(false);
  const [coherence, setCoherence] = useState(0.62);
  const [bpm, setBpm] = useState(96);
  const [meter, setMeter] = useState<3 | 4>(4);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [wheel, setWheel] = useState<Derived | null>(null);
  const [meta, setMeta] = useState<{ title: string; lock: "tight" | "loose" } | null>(null);
  const [curBar, setCurBar] = useState(0);
  const [curSection, setCurSection] = useState(0);
  const [hoverChord, setHoverChord] = useState<number | null>(null);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const baseRef = useRef<BaseAnalysis | null>(null);
  const derivedRef = useRef<Derived | null>(null);
  const fadeInRef = useRef<Float32Array | null>(null);
  const fadeOutRef = useRef<Float32Array | null>(null);

  // Scheduler refs
  const timerRef = useRef<number | null>(null);
  const nextBarRef = useRef(0);
  const nextTimeRef = useRef(0);
  const pendingJumpRef = useRef<number | null>(null);
  const activeRef = useRef<ActiveVoice[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const currentBarRef = useRef(0);
  const historyRef = useRef<number[]>([]);
  const loopSectionIdxRef = useRef(0);

  // Live control mirrors (read inside scheduler without re-subscribing)
  const autoWanderRef = useRef(autoWander);
  const loopSectionRef = useRef(loopSection);
  const coherenceRef = useRef(coherence);
  const playingRef = useRef(playing);
  useEffect(() => void (autoWanderRef.current = autoWander), [autoWander]);
  useEffect(() => void (loopSectionRef.current = loopSection), [loopSection]);
  useEffect(() => void (coherenceRef.current = coherence), [coherence]);
  useEffect(() => void (playingRef.current = playing), [playing]);

  // Visual refs
  const rafRef = useRef<number | null>(null);
  const playheadRef = useRef<SVGGElement | null>(null);
  const glowRef = useRef<SVGCircleElement | null>(null);
  const levelRef = useRef(0);
  const freqBufRef = useRef<Uint8Array | null>(null);

  // ── Rhyme picking, coherence-biased with a short anti-repeat memory ─────────
  const pickRhyme = useCallback((from: number): number => {
    const d = derivedRef.current;
    if (!d) return from;
    const cand = d.candidates[from];
    if (!cand || cand.length === 0) return (from + 1) % d.n;
    const c = coherenceRef.current;
    const span = Math.max(1, Math.round(1 + (1 - c) * (cand.length - 1)));
    const hist = historyRef.current;
    for (let tries = 0; tries < 6; tries++) {
      const pick = cand[Math.floor(Math.random() * span)];
      if (!hist.includes(pick)) return pick;
    }
    return cand[0];
  }, []);

  // ── Choose the bar that follows `from` ─────────────────────────────────────
  const chooseNextBar = useCallback(
    (from: number): number => {
      const d = derivedRef.current;
      if (!d) return 0;
      if (pendingJumpRef.current !== null) {
        const t = pendingJumpRef.current;
        pendingJumpRef.current = null;
        return Math.max(0, Math.min(d.n - 1, t));
      }
      if (loopSectionRef.current) {
        const sec = d.sections[loopSectionIdxRef.current];
        if (sec) {
          const next = from + 1;
          return next > sec.endBar || next < sec.startBar ? sec.startBar : next;
        }
      }
      const linear = from + 1;
      const atEnd = linear >= d.n;
      if (autoWanderRef.current) {
        if (atEnd || Math.random() < 0.4) return pickRhyme(from);
        return linear;
      }
      return atEnd ? 0 : linear;
    },
    [pickRhyme],
  );

  // ── Schedule one bar's audio at time `when` ────────────────────────────────
  const scheduleBar = useCallback((idx: number, when: number) => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    const buffer = bufferRef.current;
    const d = derivedRef.current;
    const fin = fadeInRef.current;
    const fout = fadeOutRef.current;
    if (!ctx || !safe || !buffer || !d || !fin || !fout) return;
    const bar = d.bars[idx];
    const cf = Math.min(CROSSFADE, bar.dur * 0.4);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    src.connect(g).connect(safe.input);
    g.gain.setValueCurveAtTime(fin, when, cf);
    g.gain.setValueCurveAtTime(fout, when + bar.dur - cf, cf);
    try {
      src.start(when, bar.startSec, bar.dur);
    } catch {
      return;
    }
    const voice: ActiveVoice = { src, g };
    activeRef.current.push(voice);
    src.onended = () => {
      try {
        g.disconnect();
        src.disconnect();
      } catch {
        /* gone */
      }
      activeRef.current = activeRef.current.filter((v) => v !== voice);
    };
    queueRef.current.push({
      barIndex: idx,
      audioStart: when,
      audioEnd: when + bar.dur,
      offsetSec: bar.startSec,
    });
    const hist = historyRef.current;
    hist.push(idx);
    if (hist.length > ANTIREPEAT) hist.shift();
  }, []);

  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current;
    const d = derivedRef.current;
    if (!ctx || !d || !playingRef.current) return;
    const lookahead = 0.25;
    let guard = 0;
    while (nextTimeRef.current < ctx.currentTime + lookahead && guard < 32) {
      const idx = nextBarRef.current;
      const bar = d.bars[idx];
      scheduleBar(idx, nextTimeRef.current);
      nextTimeRef.current += bar.dur - Math.min(CROSSFADE, bar.dur * 0.4);
      nextBarRef.current = chooseNextBar(idx);
      guard++;
    }
  }, [chooseNextBar, scheduleBar]);

  const stopPlayback = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    for (const v of activeRef.current) {
      try {
        v.src.stop();
        v.src.disconnect();
        v.g.disconnect();
      } catch {
        /* stopped */
      }
    }
    activeRef.current = [];
    queueRef.current = [];
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const startPlayback = useCallback(async () => {
    const ctx = ctxRef.current;
    const d = derivedRef.current;
    if (!ctx || !d) return;
    await ctx.resume();
    nextBarRef.current = currentBarRef.current;
    nextTimeRef.current = ctx.currentTime + 0.08;
    playingRef.current = true;
    setPlaying(true);
    if (timerRef.current === null) {
      timerRef.current = window.setInterval(runScheduler, 30);
    }
    runScheduler();
  }, [runScheduler]);

  // ── Load + analyze a track ─────────────────────────────────────────────────
  const buildWheel = useCallback(async () => {
    stopPlayback();
    setError(null);
    setPhase("loading");
    setProgress(0);
    derivedRef.current = null;
    baseRef.current = null;
    currentBarRef.current = 0;
    setCurBar(0);
    setCurSection(0);
    try {
      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = new AudioContext();
        ctxRef.current = ctx;
        safeRef.current = createSafeMaster(ctx);
        const cn = 48;
        const fin = new Float32Array(cn);
        const fout = new Float32Array(cn);
        for (let i = 0; i < cn; i++) {
          const t = i / (cn - 1);
          fin[i] = Math.sin(0.5 * Math.PI * t);
          fout[i] = Math.cos(0.5 * Math.PI * t);
        }
        fadeInRef.current = fin;
        fadeOutRef.current = fout;
      }
      await ctx.resume();

      const { buffer, title } = await loadRealTrackBuffer(ctx, selectedId);
      bufferRef.current = buffer;

      setPhase("analyzing");
      const base = await runBaseAnalysis(buffer, (f) => setProgress(f));
      baseRef.current = base;

      const startBpm = Math.round(base.defaultBpm);
      setBpm(startBpm);
      const d = deriveStructure(base, startBpm, meter);
      derivedRef.current = d;
      setWheel(d);
      setMeta({ title, lock: base.lock });
      setPhase("ready");
      await startPlayback();
    } catch (e) {
      console.error(e);
      setError("Could not load or analyze this recording. Please try another track.");
      setPhase("error");
    }
    // meter intentionally read once at build; changing it later re-derives via effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, startPlayback, stopPlayback]);

  // ── Re-derive when BPM or meter changes (cheap; keeps audio going) ──────────
  useEffect(() => {
    if (phase !== "ready") return;
    const base = baseRef.current;
    if (!base) return;
    const d = deriveStructure(base, bpm, meter);
    derivedRef.current = d;
    setWheel(d);
    // keep the playhead + scheduler in range after the bar grid changes
    if (currentBarRef.current >= d.n) currentBarRef.current = 0;
    if (nextBarRef.current >= d.n) nextBarRef.current = 0;
    if (loopSectionIdxRef.current >= d.sections.length) loopSectionIdxRef.current = 0;
  }, [bpm, meter, phase]);

  // ── Jump to a section (and mark it as the loop target) ─────────────────────
  const jumpToSection = useCallback(
    (sectionIdx: number) => {
      const d = derivedRef.current;
      if (!d) return;
      const sec = d.sections[sectionIdx];
      if (!sec) return;
      loopSectionIdxRef.current = sectionIdx;
      pendingJumpRef.current = sec.startBar;
      if (!playingRef.current) void startPlayback();
    },
    [startPlayback],
  );

  // ── Leap along a rhyme chord ───────────────────────────────────────────────
  const leapChord = useCallback(
    (chord: Chord) => {
      const cur = currentBarRef.current;
      // leap to whichever endpoint we're NOT currently near
      const target = Math.abs(cur - chord.a) <= Math.abs(cur - chord.b) ? chord.b : chord.a;
      pendingJumpRef.current = target;
      if (!playingRef.current) void startPlayback();
    },
    [startPlayback],
  );

  const leapToRhyme = useCallback(() => {
    if (!derivedRef.current) return;
    pendingJumpRef.current = pickRhyme(currentBarRef.current);
  }, [pickRhyme]);

  // ── Render loop: orbit the playhead, follow the sounding bar ────────────────
  const drawFrame = useCallback(() => {
    const ctx = ctxRef.current;
    const d = derivedRef.current;
    const base = baseRef.current;
    if (ctx && d && base) {
      const now = ctx.currentTime;
      let offsetSec = -1;
      for (let i = queueRef.current.length - 1; i >= 0; i--) {
        const q = queueRef.current[i];
        if (q.audioStart <= now && now < q.audioEnd) {
          currentBarRef.current = q.barIndex;
          offsetSec = q.offsetSec + (now - q.audioStart);
          break;
        }
      }
      queueRef.current = queueRef.current.filter((it) => it.audioEnd > now - 1);
      if (offsetSec < 0) {
        const bar = d.bars[currentBarRef.current];
        offsetSec = bar ? bar.startSec : 0;
      }
      const ang = (offsetSec / base.dur) * 360;
      if (playheadRef.current) {
        playheadRef.current.setAttribute("transform", `rotate(${ang.toFixed(2)} ${CX} ${CY})`);
      }
    }
    // Analyser bloom on the centre glow.
    const safe = safeRef.current;
    if (safe && freqBufRef.current) {
      const buf = freqBufRef.current;
      safe.analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      const lvl = sum / (buf.length * 255);
      levelRef.current += (lvl - levelRef.current) * 0.12;
      if (glowRef.current) {
        glowRef.current.setAttribute("opacity", (0.08 + levelRef.current * 0.5).toFixed(3));
        glowRef.current.setAttribute("r", (120 + levelRef.current * 90).toFixed(1));
      }
    }
    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  // Throttled React mirror of the current bar/section for chrome + highlights.
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = derivedRef.current;
      if (!d) return;
      const b = currentBarRef.current;
      setCurBar(b);
      setCurSection(d.barSection[b] ?? 0);
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  // Keyboard: space play/pause, J leap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (phase !== "ready") return;
        if (playingRef.current) stopPlayback();
        else void startPlayback();
      } else if (e.key === "j" || e.key === "J") {
        leapToRhyme();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startPlayback, stopPlayback, leapToRhyme]);

  useEffect(() => {
    if (phase === "ready" && safeRef.current && !freqBufRef.current) {
      freqBufRef.current = new Uint8Array(safeRef.current.analyser.frequencyBinCount);
    }
  }, [phase]);

  // Full teardown.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      for (const v of activeRef.current) {
        try {
          v.src.stop();
        } catch {
          /* stopped */
        }
      }
      safeRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const btnPrimary =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50";
  const btnSecondary =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50";
  const label = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  const busy = phase === "loading" || phase === "analyzing";
  const buildLabel =
    phase === "loading"
      ? "Loading…"
      : phase === "analyzing"
        ? `Analyzing… ${Math.round(progress * 100)}%`
        : phase === "ready"
          ? "Rebuild wheel"
          : "Build the wheel";

  // Precompute wheel primitives for render.
  const total = baseRef.current?.dur ?? 1;
  const barAngle = (sec: number) => (sec / total) * 360;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 pb-24">
      <PrototypeNav slugs={["14096-songwheel"]} />

      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <p className={label}>14096 · song wheel</p>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the design notes
          </button>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Song Wheel — play your recording&apos;s own form
        </h1>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          One of Karel&apos;s recordings, laid out as a radial clock: its
          auto-detected <span className="text-foreground">sections</span> are the
          colored arcs on the rim, glowing chords cross the interior to link the bars
          that <span className="text-foreground">rhyme</span>, and a playhead orbits
          the current moment. Click an arc to loop a section, follow a chord to a
          distant echo, or let it wander — every leap is snapped to the downbeat, so
          it always lands in time.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* ── The wheel ── */}
        <div className="relative mx-auto aspect-square w-full max-w-[620px] overflow-hidden rounded-md border border-border bg-[#07060c]">
          <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="h-full w-full">
            {/* centre glow (analyser-driven) */}
            <circle ref={glowRef} cx={CX} cy={CY} r={130} fill="#7c5cff" opacity={0.1} />
            {/* faint guide rings */}
            <circle cx={CX} cy={CY} r={RIM_R} fill="none" stroke="#221a3a" strokeWidth={1} />
            <circle cx={CX} cy={CY} r={INNER_R} fill="none" stroke="#171227" strokeWidth={1} />

            {wheel && (
              <>
                {/* rhyme chords across the interior */}
                <g>
                  {wheel.chords.map((ch, i) => {
                    const [ax, ay] = polar(INNER_R, barAngle(wheel.bars[ch.a].startSec));
                    const [bx, by] = polar(INNER_R, barAngle(wheel.bars[ch.b].startSec));
                    const mx = (ax + bx) / 2;
                    const my = (ay + by) / 2;
                    const ctrlx = mx + (CX - mx) * 0.82;
                    const ctrly = my + (CY - my) * 0.82;
                    const hot = hoverChord === i;
                    const op = 0.12 + (ch.sim - 0.7) * 1.4;
                    return (
                      <path
                        key={i}
                        d={`M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${ctrlx.toFixed(1)} ${ctrly.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`}
                        fill="none"
                        stroke={hot ? "#d9c8ff" : "#9a7bff"}
                        strokeWidth={hot ? 3.2 : 1.1 + (ch.sim - 0.7) * 5}
                        strokeLinecap="round"
                        opacity={hot ? 0.95 : Math.min(0.8, Math.max(0.1, op))}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHoverChord(i)}
                        onMouseLeave={() => setHoverChord((h) => (h === i ? null : h))}
                        onClick={() => leapChord(ch)}
                      />
                    );
                  })}
                </g>

                {/* downbeat ticks */}
                <g stroke="#2c2348" strokeWidth={1}>
                  {wheel.bars.map((b, i) => {
                    const [x0, y0] = polar(RIM_R - 8, barAngle(b.startSec));
                    const [x1, y1] = polar(RIM_R + 6, barAngle(b.startSec));
                    return (
                      <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} />
                    );
                  })}
                </g>

                {/* section arcs (rim) */}
                <g fill="none" strokeLinecap="butt">
                  {wheel.sections.map((s, i) => {
                    const a0 = barAngle(s.startSec);
                    const a1 = barAngle(s.startSec + s.dur);
                    const span = a1 - a0;
                    const active = i === curSection;
                    const col = clusterColor(s.cluster);
                    if (span >= 359.5) {
                      return (
                        <circle
                          key={i}
                          cx={CX}
                          cy={CY}
                          r={RIM_R}
                          stroke={col}
                          strokeWidth={active ? 30 : 22}
                          style={{ cursor: "pointer" }}
                          onClick={() => jumpToSection(i)}
                        />
                      );
                    }
                    // small gap between sections for legibility
                    const gap = Math.min(1.2, span * 0.08);
                    return (
                      <path
                        key={i}
                        d={arcPath(RIM_R, a0 + gap, a1 - gap)}
                        stroke={col}
                        strokeWidth={active ? 30 : 22}
                        opacity={active ? 1 : 0.82}
                        style={{ cursor: "pointer" }}
                        onClick={() => jumpToSection(i)}
                      >
                        <title>
                          Section {s.letter} · {s.dur.toFixed(1)}s — click to loop
                        </title>
                      </path>
                    );
                  })}
                </g>

                {/* section letters */}
                <g>
                  {wheel.sections.map((s, i) => {
                    const mid = barAngle(s.startSec + s.dur / 2);
                    const [lx, ly] = polar(LABEL_R, mid);
                    return (
                      <text
                        key={i}
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={i === curSection ? 30 : 24}
                        fontWeight={600}
                        fill={i === curSection ? "#e7ddff" : "#8f83b8"}
                      >
                        {s.letter}
                      </text>
                    );
                  })}
                </g>

                {/* orbiting playhead (rotated each frame) */}
                <g ref={playheadRef}>
                  <line x1={CX} y1={CY} x2={CX} y2={CY - (RIM_R - 4)} stroke="#c9b8ff" strokeWidth={2} opacity={0.5} />
                  <circle cx={CX} cy={CY - RIM_R} r={9} fill="#f0eaff" />
                  <circle cx={CX} cy={CY - RIM_R} r={16} fill="none" stroke="#c9b8ff" strokeWidth={1.5} opacity={0.6} />
                </g>
              </>
            )}
          </svg>

          {phase === "idle" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Pick a track and build the wheel to see its form.
              </p>
            </div>
          )}
          {busy && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="font-mono text-sm text-primary">
                {phase === "loading" ? "loading audio…" : `analyzing… ${Math.round(progress * 100)}%`}
              </p>
            </div>
          )}
          {phase === "ready" && meta && wheel && (
            <div className="pointer-events-none absolute bottom-2 left-3 right-3 flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span>
                bar {curBar + 1}/{wheel.n} · {wheel.sections[curSection]?.letter ?? "–"}
              </span>
              <span>
                {bpm} BPM · lock {meta.lock} · {playing ? "PLAYING" : "PAUSED"}
              </span>
            </div>
          )}
        </div>

        {/* ── Controls ── */}
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={buildWheel} disabled={busy}>
              {buildLabel}
            </button>
          </div>

          {phase === "ready" && (
            <>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => (playing ? stopPlayback() : void startPlayback())}
                >
                  {playing ? "Pause" : "Play"}
                </button>
                <button type="button" className={btnSecondary} onClick={leapToRhyme}>
                  Leap (J)
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={autoWander ? btnPrimary : btnSecondary}
                  onClick={() => setAutoWander((w) => !w)}
                  aria-pressed={autoWander}
                >
                  Auto-wander {autoWander ? "on" : "off"}
                </button>
                <button
                  type="button"
                  className={loopSection ? btnPrimary : btnSecondary}
                  onClick={() =>
                    setLoopSection((w) => {
                      if (!w) {
                        const d = derivedRef.current;
                        if (d) loopSectionIdxRef.current = d.barSection[currentBarRef.current] ?? 0;
                      }
                      return !w;
                    })
                  }
                  aria-pressed={loopSection}
                >
                  Loop section {loopSection ? "on" : "off"}
                </button>
              </div>

              <div>
                <label htmlFor="coherence" className={label}>
                  Coherence · {Math.round(coherence * 100)}%
                </label>
                <input
                  id="coherence"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={coherence}
                  onChange={(e) => setCoherence(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-primary"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  High — leap only to the closest match (smooth). Low — allow more
                  distant rhymes (surprising).
                </p>
              </div>

              <div>
                <p className={label}>Beat lock</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => setBpm((b) => Math.max(BPM_MIN, b - 1))}
                  >
                    − BPM
                  </button>
                  <span className="min-w-[3.5rem] text-center font-mono text-sm text-foreground">
                    {bpm}
                  </span>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => setBpm((b) => Math.min(BPM_MAX, b + 1))}
                  >
                    + BPM
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => setBpm((b) => Math.max(BPM_MIN, Math.round(b / 2)))}
                  >
                    ÷2
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => setBpm((b) => Math.min(BPM_MAX, b * 2))}
                  >
                    ×2
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => setMeter((m) => (m === 4 ? 3 : 4))}
                  >
                    {meter}/4
                  </button>
                </div>
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div>
            <p className={label}>Recording</p>
            <div className="mt-2 space-y-3">
              {COLLECTIONS.map((col) => (
                <div key={col.name}>
                  <p className="mb-1 text-sm text-muted-foreground">{col.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {col.tracks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={
                          t.id === selectedId
                            ? "min-h-[44px] rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
                            : "min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        }
                        disabled={busy}
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="mt-8 space-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <p className={label}>How it works</p>
        <p>
          The recording is decimated to mono and run through a hand-rolled FFT to
          measure onset strength (spectral flux). Autocorrelating that curve estimates
          the tempo; a phase-aligned beat grid — snapped to nearby onsets so it tracks
          rubato — is grouped into bars, and every fourth (or third) beat is a
          downbeat. Each bar becomes a 12-D chroma vector, and the cosine similarity of
          every pair of bars is the self-similarity matrix. Foote&apos;s
          checkerboard-kernel novelty along that matrix&apos;s diagonal finds the
          section boundaries you see as rim arcs; sections are clustered by mean chroma
          so a returning theme reuses its letter. The strongest cross-bar matches are
          the glowing chords. Playback advances bar by bar with equal-power crossfades,
          and every leap — a section click, a chord, a wander, or{" "}
          <span className="font-mono">J</span> — takes effect at the next downbeat and
          lands on a matched downbeat.
        </p>
        <p className="text-muted-foreground/70">
          Refs: Jonathan Foote, &ldquo;Automatic Audio Segmentation Using a Measure of
          Audio Novelty&rdquo; (IEEE ICME 2000); Paul Lamere, &ldquo;The Infinite
          Jukebox&rdquo; (2012). Lineage: 14048 Rhyme Loom.
        </p>
      </section>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Song Wheel is the radial, beat-locked sibling of Rhyme Loom (14048).
                Rhyme Loom laid the self-similarity idea on a flat square matrix, but
                its leaps landed mid-phrase and it had no notion of the song&apos;s
                sections. Here the whole take is a clock: sections are arcs on the rim,
                rhymes are chords through the middle, and leaps are quantized to the
                bar so they always land in time.
              </p>
              <p>
                Foote&apos;s 1999/2000 self-similarity work gave us the checkerboard
                novelty that finds section boundaries; Paul Lamere&apos;s Infinite
                Jukebox (2012) gave us the idea of playing a fixed recording forever by
                jumping between beats that sound alike. Song Wheel joins the two on a
                map you can actually read and play.
              </p>
              <p>
                Everything you hear is a slice of Karel&apos;s own take — no synths, no
                generated tones. Chroma comes from a hand-rolled Goertzel bank; onsets
                from a hand-rolled FFT; joins use tiny equal-power crossfades so leaps
                never click.
              </p>
              <p className="text-muted-foreground/70">
                Karel plays deeply rubato solo piano, so the tempo can be soft. When the
                autocorrelation peak is weak the lock is labelled &ldquo;loose&rdquo; and
                the grid falls back to the median onset spacing — nudge the BPM or flip
                ×2 / ÷2 / meter to re-seat the bars if a section looks off.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
