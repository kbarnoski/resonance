/**
 * Music profile — the measured facts underneath Resonance's deep analysis.
 *
 * Pure TypeScript (no DOM, no Node APIs) so the SAME code runs in the
 * browser (batch-analyze / analyze button, on the decoded AudioBuffer)
 * and in Node (server-side backfill, decoded with ffmpeg). Everything the
 * LLM later interprets — tempo, pulse, sections, dynamics, register, mode
 * balance — is measured here first, so "how fast or slow", "major or
 * minor" and "where the climax is" come from the audio, not the title.
 *
 * Tempo method (2026-10-05, replaces the old IOI histogram that returned
 * 120 BPM for 100 of 102 tracks):
 *   1. Onset-strength envelope from the AUDIO: log-mel spectral flux
 *      (64 mel bands, 2048/512 STFT @ 22.05 kHz ≈ 43 frames/s), half-wave
 *      rectified — the same family of estimator as librosa.onset_strength.
 *   2. Windowed autocorrelation tempogram (~8.9 s windows), energy-weighted
 *      mean, scored with METRICAL SUPPORT (a candidate beat is reinforced by
 *      its 2×/3×/4× multiples and its half) times a log-normal prior over
 *      BPM (centre 70, σ = 1 octave — a contemplative-piano tactus prior).
 *      Tuned 2026-10-05 on 14 tracks + 1.25× time-stretched copies: the
 *      estimate scales correctly with the stretch on 13/14 (octave-
 *      consistent 14/14) vs 5/14 for librosa.feature.tempo on the same audio.
 *   3. Pulse clarity = normalised autocorrelation peak; steadiness = how
 *      little the per-window tempo wanders (octave-folded to the global).
 *   4. Rubato-aware "feel": when the pulse is weak, the felt speed is
 *      carried by the onset RATE (attacks/s), so feel blends BPM with it.
 * Notes-only fallback: a synthetic onset envelope built from the
 * transcribed note onsets (velocity-weighted) goes through the same path.
 */
import { Chord } from "tonal";
import type { ChordEvent, NoteEvent } from "./types";

export const PROFILE_VERSION = 2;
const PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ───────────────────────────── audio features ─────────────────────────────

export interface AudioFeatures {
  sampleRate: number;
  /** Onset-strength frames per second (sr / hop). */
  frameRate: number;
  onsetEnv: number[];
  /** Per-1s blocks. */
  rmsDb: number[];
  /** Per-1s blocks, spectral centroid in Hz (brightness). */
  centroidHz: number[];
  duration: number;
}

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * cr - ai * ci, ti = ar * ci + ai * cr;
        re[i + k + len / 2] = re[i + k] - tr;
        im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr;
        im[i + k] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function melFilterbank(nBands: number, nFft: number, sr: number, fmin: number, fmax: number) {
  const hz2mel = (f: number) => 2595 * Math.log10(1 + f / 700);
  const mel2hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
  const mMin = hz2mel(fmin), mMax = hz2mel(fmax);
  const pts = Array.from({ length: nBands + 2 }, (_, i) => mel2hz(mMin + ((mMax - mMin) * i) / (nBands + 1)));
  const bins = pts.map((f) => Math.floor(((nFft + 1) * f) / sr));
  const bands: Array<{ start: number; weights: number[] }> = [];
  for (let b = 0; b < nBands; b++) {
    const l = bins[b], c = Math.max(bins[b + 1], l + 1), r = Math.max(bins[b + 2], c + 1);
    const w: number[] = [];
    for (let k = l; k < r; k++) w.push(k < c ? (k - l) / (c - l) : (r - k) / (r - c));
    bands.push({ start: l, weights: w });
  }
  return bands;
}

/** Decode-agnostic feature extraction from mono samples. */
export function computeAudioFeatures(samples: Float32Array, sampleRate: number): AudioFeatures {
  const nFft = 2048, hop = 512;
  const nFrames = Math.max(0, Math.floor((samples.length - nFft) / hop) + 1);
  const win = new Float64Array(nFft);
  for (let i = 0; i < nFft; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft);
  const bands = melFilterbank(64, nFft, sampleRate, 30, Math.min(8000, sampleRate / 2));
  const re = new Float64Array(nFft), im = new Float64Array(nFft);
  const melDb: Float64Array[] = [];
  const frameRms: number[] = [];
  const frameCentroid: number[] = [];
  let globalMax = -Infinity;
  for (let f = 0; f < nFrames; f++) {
    const off = f * hop;
    let sq = 0;
    for (let i = 0; i < nFft; i++) {
      const s = samples[off + i];
      sq += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    frameRms.push(Math.sqrt(sq / nFft));
    fftInPlace(re, im);
    const half = nFft / 2 + 1;
    const pow = new Float64Array(half);
    let num = 0, den = 0;
    for (let k = 0; k < half; k++) {
      pow[k] = re[k] * re[k] + im[k] * im[k];
      const mag = Math.sqrt(pow[k]);
      num += mag * ((k * sampleRate) / nFft);
      den += mag;
    }
    frameCentroid.push(den > 0 ? num / den : 0);
    const m = new Float64Array(bands.length);
    for (let b = 0; b < bands.length; b++) {
      let e = 0;
      const { start, weights } = bands[b];
      for (let j = 0; j < weights.length; j++) e += pow[start + j] * weights[j];
      m[b] = 10 * Math.log10(Math.max(e, 1e-10));
      if (m[b] > globalMax) globalMax = m[b];
    }
    melDb.push(m);
  }
  // top_db 80 clamp, then rectified flux averaged over bands (lag 1).
  const floor = globalMax - 80;
  const onsetEnv: number[] = [0];
  for (let f = 1; f < melDb.length; f++) {
    let s = 0;
    for (let b = 0; b < bands.length; b++) {
      const d = Math.max(melDb[f][b], floor) - Math.max(melDb[f - 1][b], floor);
      if (d > 0) s += d;
    }
    onsetEnv.push(s / bands.length);
  }
  const frameRate = sampleRate / hop;
  const perBlock = Math.round(frameRate);
  const rmsDb: number[] = [];
  const centroidHz: number[] = [];
  for (let i = 0; i < frameRms.length; i += perBlock) {
    const r = frameRms.slice(i, i + perBlock);
    const c = frameCentroid.slice(i, i + perBlock);
    const rms = Math.sqrt(r.reduce((a, v) => a + v * v, 0) / r.length);
    rmsDb.push(20 * Math.log10(Math.max(rms, 1e-6)));
    // loudness-weighted centroid so silent frames don't skew brightness
    let cw = 0, cs = 0;
    for (let j = 0; j < c.length; j++) { cw += r[j]; cs += c[j] * r[j]; }
    centroidHz.push(cw > 0 ? cs / cw : 0);
  }
  return { sampleRate, frameRate, onsetEnv, rmsDb, centroidHz, duration: samples.length / sampleRate };
}

/** Synthetic onset envelope from transcribed notes (fallback when no audio). */
export function onsetEnvelopeFromNotes(notes: NoteEvent[], frameRate = 22050 / 512): number[] {
  if (notes.length === 0) return [];
  const end = Math.max(...notes.map((n) => n.time)) + 1;
  const env = new Array(Math.ceil(end * frameRate) + 4).fill(0);
  for (const n of notes) {
    const i = Math.round(n.time * frameRate);
    const w = Math.max(0.15, n.velocity / 127);
    env[i] += w;
    env[i + 1] += w * 0.5;
  }
  return env;
}

// ─────────────────────────────── tempo ───────────────────────────────

export type TempoFeel = "very slow" | "slow" | "moderate" | "flowing" | "fast";
const FEELS: TempoFeel[] = ["very slow", "slow", "moderate", "flowing", "fast"];

export interface TempoEstimate {
  bpm: number;
  /** 0–1: how pronounced the periodic pulse is (normalised ACF peak). */
  pulseClarity: number;
  /** 0–1: 1 = metronomic, 0 = tempo wanders freely. */
  steadiness: number;
  /** 0–1 overall confidence in the BPM number. */
  confidence: number;
  /** Alternative metrical level (half or double) the ear might also tap. */
  altBpm: number;
  /** Attack events per second (rubato-proof speed measure). */
  onsetRate: number;
  feel: TempoFeel;
  pulse: "steady pulse" | "elastic rubato" | "free time";
  method: "audio-flux-acf" | "note-onset-acf";
  /** Local tempo every ~4 s (octave-folded to the global level). */
  curve: Array<{ t: number; bpm: number }>;
}

const MIN_BPM = 30, MAX_BPM = 240;
const PRIOR_CENTER = 70, PRIOR_SIGMA_OCT = 1.0;

function acfWindow(env: number[], start: number, len: number, maxLag: number): Float64Array {
  const seg = env.slice(start, start + len);
  const mean = seg.reduce((a, v) => a + v, 0) / Math.max(1, seg.length);
  const x = seg.map((v) => v - mean);
  // Hann taper reduces edge bias of the short-window ACF
  for (let i = 0; i < x.length; i++) x[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, x.length - 1));
  const out = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    out[lag] = s;
  }
  const z = out[0] || 1;
  for (let lag = 0; lag <= maxLag; lag++) out[lag] /= z;
  return out;
}

function lagToBpm(lag: number, frameRate: number) { return (60 * frameRate) / lag; }

function prior(bpm: number, center = PRIOR_CENTER, sigmaOct = PRIOR_SIGMA_OCT) {
  const o = Math.log2(bpm / center) / sigmaOct;
  return Math.exp(-0.5 * o * o);
}

/** Parabolic peak refinement around an integer lag. */
function refine(acf: Float64Array, lag: number): number {
  if (lag <= 0 || lag >= acf.length - 1) return lag;
  const a = acf[lag - 1], b = acf[lag], c = acf[lag + 1];
  const d = a - 2 * b + c;
  return d === 0 ? lag : lag + (0.5 * (a - c)) / d;
}

export const TEMPO_TUNING = { comb: 2, center: PRIOR_CENTER, sigma: PRIOR_SIGMA_OCT };

/** Peak height at a fractional lag, searching ±tol frames for the local max. */
function acfNear(acf: Float64Array, lag: number, tol = 2): number {
  const c = Math.round(lag);
  let m = -1;
  for (let l = Math.max(1, c - tol); l <= Math.min(acf.length - 1, c + tol); l++) m = Math.max(m, acf[l]);
  return Math.max(0, m);
}

function pickTempo(acf: Float64Array, frameRate: number, center = TEMPO_TUNING.center, sigma = TEMPO_TUNING.sigma, comb = TEMPO_TUNING.comb) {
  const minLag = Math.max(1, Math.floor((60 * frameRate) / MAX_BPM));
  const maxLag = Math.min(acf.length - 2, Math.ceil((60 * frameRate) / MIN_BPM));
  let best = -1, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    // local maxima only — a slope is never a pulse
    if (!(acf[lag] >= acf[lag - 1] && acf[lag] >= acf[lag + 1])) continue;
    // Metrical support: a real beat level is reinforced by its multiples
    // (bars) and its half (subdivision) — comb>0 weighs that evidence.
    let support = Math.max(0, acf[lag]);
    if (comb > 0) {
      support += comb * (0.5 * acfNear(acf, lag * 2) + 0.33 * acfNear(acf, lag * 3) + 0.25 * acfNear(acf, lag * 4) + 0.5 * acfNear(acf, lag / 2, 1));
    }
    const score = support * prior(lagToBpm(lag, frameRate), center, sigma);
    if (score > bestScore) { bestScore = score; best = lag; }
  }
  if (best < 0) return null;
  const lag = refine(acf, best);
  return { lag, bpm: lagToBpm(lag, frameRate), height: Math.max(0, acf[best]) };
}

function feelFromBpm(bpm: number): number {
  return bpm < 56 ? 0 : bpm < 72 ? 1 : bpm < 96 ? 2 : bpm < 120 ? 3 : 4;
}
function feelFromOnsetRate(r: number): number {
  return r < 1.6 ? 0 : r < 2.8 ? 1 : r < 4.2 ? 2 : r < 6.0 ? 3 : 4;
}

/** Count attack events: peaks in the onset envelope above an adaptive threshold. */
function countOnsets(env: number[], frameRate: number): number {
  if (env.length < 3) return 0;
  const w = Math.round(frameRate * 1.5);
  let count = 0, last = -1e9;
  const minGap = Math.round(frameRate * 0.06);
  for (let i = 1; i < env.length - 1; i++) {
    if (!(env[i] > env[i - 1] && env[i] >= env[i + 1])) continue;
    const a = Math.max(0, i - w), b = Math.min(env.length, i + w);
    let m = 0;
    for (let j = a; j < b; j++) m += env[j];
    m /= b - a;
    if (env[i] > m * 1.6 + 1e-6 && i - last >= minGap) { count++; last = i; }
  }
  return count;
}

export function estimateTempoFromEnvelope(
  env: number[],
  frameRate: number,
  method: TempoEstimate["method"] = "audio-flux-acf",
): TempoEstimate | null {
  const duration = env.length / frameRate;
  if (duration < 6) return null;
  const winLen = Math.min(env.length, Math.round(8.9 * frameRate));
  const hopLen = Math.round(4 * frameRate);
  const maxLag = Math.min(winLen - 2, Math.ceil((60 * frameRate) / MIN_BPM) + 2);
  const windows: Array<{ t: number; acf: Float64Array; energy: number }> = [];
  for (let s = 0; s + winLen <= env.length; s += hopLen) {
    const seg = env.slice(s, s + winLen);
    const energy = seg.reduce((a, v) => a + v, 0) / seg.length;
    windows.push({ t: (s + winLen / 2) / frameRate, acf: acfWindow(env, s, winLen, maxLag), energy });
  }
  if (windows.length === 0) return null;
  // Silence-weighted mean tempogram (quiet windows carry no pulse evidence)
  const meanAcf = new Float64Array(maxLag + 1);
  const eSum = windows.reduce((a, w) => a + w.energy, 0) || 1;
  for (const w of windows) for (let l = 0; l <= maxLag; l++) meanAcf[l] += (w.acf[l] * w.energy) / eSum;
  const g = pickTempo(meanAcf, frameRate);
  if (!g) return null;

  // Local tempo curve: narrow prior around the global level, then fold
  // octave errors back onto it so steadiness measures drift, not ambiguity.
  const curve: Array<{ t: number; bpm: number }> = [];
  for (const w of windows) {
    if (w.energy < (eSum / windows.length) * 0.25) continue;
    const p = pickTempo(w.acf, frameRate, g.bpm, 0.35, 0);
    if (!p) continue;
    let b = p.bpm;
    while (b > g.bpm * 1.45) b /= 2;
    while (b < g.bpm / 1.45) b *= 2;
    curve.push({ t: Math.round(w.t), bpm: Math.round(b * 10) / 10 });
  }
  const bpms = curve.map((c) => c.bpm).sort((a, b) => a - b);
  const med = bpms.length ? bpms[Math.floor(bpms.length / 2)] : g.bpm;
  const mad = bpms.length ? bpms.map((b) => Math.abs(b - med)).sort((a, b) => a - b)[Math.floor(bpms.length / 2)] : 0;
  const steadiness = Math.max(0, Math.min(1, 1 - (mad / Math.max(1, med)) * 6));
  const pulseClarity = Math.max(0, Math.min(1, g.height / 0.6));
  const confidence = Math.max(0, Math.min(1, 0.6 * pulseClarity + 0.4 * steadiness));

  // Alternate metrical level: whichever of half/double has more ACF support.
  const halfLag = Math.round(g.lag * 2), dblLag = Math.round(g.lag / 2);
  const halfH = halfLag <= maxLag ? meanAcf[halfLag] : -1;
  const dblH = dblLag >= 1 ? meanAcf[dblLag] : -1;
  const altBpm = halfH >= dblH ? g.bpm / 2 : g.bpm * 2;

  const onsetRate = countOnsets(env, frameRate) / duration;
  const fb = feelFromBpm(g.bpm), fo = feelFromOnsetRate(onsetRate);
  // Clear pulse → BPM speaks; free time → attack rate speaks.
  const wPulse = Math.max(0, Math.min(1, confidence * 1.4));
  const feel = FEELS[Math.round(fb * wPulse + fo * (1 - wPulse))];
  const pulse: TempoEstimate["pulse"] =
    pulseClarity >= 0.45 && steadiness >= 0.6 ? "steady pulse" : pulseClarity >= 0.2 ? "elastic rubato" : "free time";

  return {
    bpm: Math.round(g.bpm * 10) / 10,
    pulseClarity: round2(pulseClarity),
    steadiness: round2(steadiness),
    confidence: round2(confidence),
    altBpm: Math.round(altBpm * 10) / 10,
    onsetRate: round2(onsetRate),
    feel,
    pulse,
    method,
    curve,
  };
}

/** Tempo from notes only (no audio available). */
export function estimateTempoFromNotes(notes: NoteEvent[]): TempoEstimate | null {
  const fr = 22050 / 512;
  return estimateTempoFromEnvelope(onsetEnvelopeFromNotes(notes, fr), fr, "note-onset-acf");
}

// ─────────────────────────── harmony helpers ───────────────────────────

export type ChordFamily = "major" | "minor" | "dominant" | "diminished" | "augmented" | "suspended" | "other";

export function chordFamily(name: string): ChordFamily {
  const base = name.split("/")[0];
  let c: ReturnType<typeof Chord.get> | null = null;
  try { c = Chord.get(base); } catch { c = null; }
  const type = (c?.type ?? "").toLowerCase();
  if (c && !c.empty) {
    if (type.includes("sus")) return "suspended";
    if (c.quality === "Diminished") return "diminished";
    if (c.quality === "Augmented") return "augmented";
    if (c.quality === "Minor") return "minor";
    if (type.includes("dominant") || /^[A-G][#b]?(7|9|11|13)(?!.*maj)/.test(base)) return "dominant";
    if (c.quality === "Major") return "major";
  }
  // tonal can't parse some detected names (e.g. "C5", "Bmb6b9") — regex fallback
  if (/sus/.test(base)) return "suspended";
  if (/dim|°|m7b5/.test(base)) return "diminished";
  if (/aug|\+/.test(base)) return "augmented";
  if (/^[A-G][#b]?m(?!aj)/.test(base)) return "minor";
  if (/^[A-G][#b]?(M|maj|6|add|$)/.test(base)) return "major";
  return "other";
}

function keyCorrelations(hist: number[]) {
  const maj = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const min = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const corr = (p: number[], r: number) => {
    const rp = [...p.slice(12 - r), ...p.slice(0, 12 - r)]; // profile rotated so index r is tonic
    const mp = rp.reduce((a, b) => a + b) / 12, mh = hist.reduce((a, b) => a + b) / 12;
    let n = 0, dp = 0, dh = 0;
    for (let i = 0; i < 12; i++) { n += (rp[i] - mp) * (hist[i] - mh); dp += (rp[i] - mp) ** 2; dh += (hist[i] - mh) ** 2; }
    return dp * dh > 0 ? n / Math.sqrt(dp * dh) : 0;
  };
  const out: Array<{ key: string; tonic: number; mode: "Major" | "Minor"; r: number }> = [];
  for (let t = 0; t < 12; t++) {
    out.push({ key: `${PC[t]} Major`, tonic: t, mode: "Major", r: corr(maj, t) });
    out.push({ key: `${PC[t]} Minor`, tonic: t, mode: "Minor", r: corr(min, t) });
  }
  return out.sort((a, b) => b.r - a.r);
}

function pcHistogram(notes: NoteEvent[]): number[] {
  const h = new Array(12).fill(0);
  for (const n of notes) h[((n.midi % 12) + 12) % 12] += Math.min(n.duration, 2);
  const s = h.reduce((a, b) => a + b, 0) || 1;
  return h.map((v) => v / s);
}

// ─────────────────────────────── profile ───────────────────────────────

export interface SectionProfile {
  index: number;
  start: number;
  end: number;
  /** 0–1 relative to this track (loudness+density+brightness). */
  intensity: number;
  loudnessDb: number | null;
  /** 0–1 position of the section's loudness in the track's range. */
  loudnessRel: number | null;
  trend: "building" | "receding" | "steady";
  noteDensity: number;
  onsetRate: number;
  register: { low: string; median: string; high: string; centerMidi: number };
  velocityMean: number;
  brightnessHz: number | null;
  localBpm: number | null;
  localKey: string | null;
  chordShare: Record<ChordFamily, number>;
  topChords: string[];
  /** Condensed chord timeline for the LLM: "0:12 Cmaj7 · 0:14 Am9 …" */
  chordTimeline: string;
}

export interface MusicProfile {
  version: number;
  duration: number;
  tempo: TempoEstimate | null;
  key: { detected: string | null; runnerUp: string | null; clarity: number; stored: string | null };
  modeBalance: {
    major: number; minor: number; dominant: number; suspended: number; diminished: number; other: number;
    /** 0 = unambiguously major … 1 = unambiguously minor (key evidence 60%, chord qualities 40%). */
    minorWeight: number;
    verdict: string;
    modalColors: string[];
  };
  dynamics: {
    curve: Array<{ t: number; intensity: number }>;
    climaxTime: number;
    quietestTime: number;
    shape: "rising" | "falling" | "arch" | "valley" | "wave" | "plateau";
    rangeDb: number | null;
  };
  register: { low: string; high: string; median: string };
  /** label from the audio attack rate when available (Basic Pitch over-counts
   *  sustained/overtone notes, so raw notes/s reads "dense" for everything). */
  density: { notesPerSec: number; onsetRate: number | null; label: "sparse" | "spacious" | "moderate" | "dense" | "very dense" };
  sections: SectionProfile[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const nn = (m: number) => `${PC[((Math.round(m) % 12) + 12) % 12]}${Math.floor(Math.round(m) / 12) - 1}`;
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

function smooth(x: number[], half: number): number[] {
  return x.map((_, i) => {
    let s = 0, c = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(x.length - 1, i + half); j++) { s += x[j]; c++; }
    return s / c;
  });
}

/**
 * Data-driven section boundaries: Foote novelty on a per-second feature
 * matrix (loudness, attack rate, note density, register, brightness,
 * pitch-class chroma) — boundaries sit where the music actually changes.
 */
function segment(
  dur: number,
  perSec: number[][],
): number[] {
  const n = perSec.length;
  if (n < 30) return [0, dur];
  const dims = perSec[0].length;
  // z-score each dim, then smooth 3 s
  const Z: number[][] = Array.from({ length: n }, () => new Array(dims).fill(0));
  for (let d = 0; d < dims; d++) {
    const col = smooth(perSec.map((r) => r[d]), 1);
    const m = col.reduce((a, v) => a + v, 0) / n;
    const sd = Math.sqrt(col.reduce((a, v) => a + (v - m) ** 2, 0) / n) || 1;
    for (let i = 0; i < n; i++) Z[i][d] = (col[i] - m) / sd;
  }
  const L = 8; // kernel half-width (s)
  const sim = (a: number[], b: number[]) => {
    let s = 0;
    for (let d = 0; d < dims; d++) s += (a[d] - b[d]) ** 2;
    return Math.exp(-s / (2 * dims));
  };
  const nov = new Array(n).fill(0);
  for (let i = L; i < n - L; i++) {
    let s = 0;
    for (let a = -L; a < L; a++) {
      for (let b = -L; b < L; b++) {
        const sign = (a < 0) === (b < 0) ? 1 : -1;
        const g = Math.exp(-((a + 0.5) ** 2 + (b + 0.5) ** 2) / (2 * (L / 2) ** 2));
        s += sign * g * sim(Z[i + a], Z[i + b]);
      }
    }
    nov[i] = Math.max(0, s);
  }
  const target = Math.max(2, Math.min(9, Math.round(dur / 30)));
  const minLen = Math.max(12, Math.min(25, dur / (target + 3)));
  const peaks = nov
    .map((v, i) => ({ v, i }))
    .filter(({ i }) => i > 0 && i < n - 1 && nov[i] >= nov[i - 1] && nov[i] >= nov[i + 1] && nov[i] > 0)
    .sort((a, b) => b.v - a.v);
  const chosen: number[] = [];
  for (const p of peaks) {
    if (chosen.length >= target) break;
    if (p.i < minLen || dur - p.i < minLen) continue;
    if (chosen.every((c) => Math.abs(c - p.i) >= minLen)) chosen.push(p.i);
  }
  return [0, ...chosen.sort((a, b) => a - b), dur];
}

function densityLabel(onsetRate: number): MusicProfile["density"]["label"] {
  return onsetRate < 1.8 ? "sparse" : onsetRate < 2.6 ? "spacious" : onsetRate < 3.4 ? "moderate" : onsetRate < 4.2 ? "dense" : "very dense";
}

function condenseChords(chords: ChordEvent[], start: number, end: number, maxItems = 60): string {
  const inSec = chords.filter((c) => c.time >= start && c.time < end);
  const merged: ChordEvent[] = [];
  for (const c of inSec) {
    const last = merged[merged.length - 1];
    if (last && last.chord === c.chord) last.duration += c.duration;
    else merged.push({ ...c });
  }
  // keep the harmonically weightiest moments if the section is busy
  let keep = merged;
  if (merged.length > maxItems) {
    const thresh = [...merged].map((c) => c.duration).sort((a, b) => b - a)[maxItems - 1];
    keep = merged.filter((c) => c.duration >= thresh).slice(0, maxItems);
  }
  return keep.map((c) => `${fmtTime(c.time)} ${c.chord}${c.duration >= 1.5 ? ` (${c.duration.toFixed(1)}s)` : ""}`).join(" · ");
}

export function buildMusicProfile(input: {
  notes: NoteEvent[];
  chords: ChordEvent[];
  duration?: number | null;
  keySignature?: string | null;
  audio?: AudioFeatures | null;
}): MusicProfile {
  const notes = [...(input.notes ?? [])].sort((a, b) => a.time - b.time);
  const chords = input.chords ?? [];
  const audio = input.audio ?? null;
  const dur = Math.max(
    1,
    input.duration ?? 0,
    audio?.duration ?? 0,
    notes.length ? notes[notes.length - 1].time + notes[notes.length - 1].duration : 0,
  );

  const tempo = audio
    ? estimateTempoFromEnvelope(audio.onsetEnv, audio.frameRate, "audio-flux-acf")
    : estimateTempoFromNotes(notes);

  // ── per-second feature rows ──
  const secs = Math.max(1, Math.floor(dur));
  const noteCount = new Array(secs).fill(0);
  const pitchSum = new Array(secs).fill(0);
  const chroma: number[][] = Array.from({ length: secs }, () => new Array(12).fill(0));
  for (const nt of notes) {
    const i = Math.min(secs - 1, Math.max(0, Math.floor(nt.time)));
    noteCount[i]++;
    pitchSum[i] += nt.midi;
    chroma[i][((nt.midi % 12) + 12) % 12] += Math.min(nt.duration, 2);
  }
  const onsetPerSec = new Array(secs).fill(0);
  if (audio) {
    const fr = audio.frameRate;
    for (let i = 0; i < secs; i++) {
      const seg = audio.onsetEnv.slice(Math.floor(i * fr), Math.floor((i + 1) * fr));
      onsetPerSec[i] = seg.length ? seg.reduce((a, v) => a + v, 0) / seg.length : 0;
    }
  }
  const rmsAt = (i: number) => (audio?.rmsDb[i] ?? null);
  const centAt = (i: number) => (audio?.centroidHz[i] ?? null);
  let lastReg = 60;
  const rows: number[][] = [];
  for (let i = 0; i < secs; i++) {
    const reg = noteCount[i] ? pitchSum[i] / noteCount[i] : lastReg;
    lastReg = reg;
    const cs = chroma[i].reduce((a, v) => a + v, 0) || 1;
    rows.push([
      rmsAt(i) ?? Math.log1p(noteCount[i]) * 6,
      onsetPerSec[i],
      Math.log1p(noteCount[i]),
      reg / 12,
      (centAt(i) ?? 0) / 1000,
      ...chroma[i].map((v) => (v / cs) * 1.2),
    ]);
  }
  const bounds = segment(dur, rows);

  // ── intensity curve (track-relative) ──
  const rawI: number[] = [];
  const rmsVals = audio ? audio.rmsDb.slice(0, secs) : [];
  const rmsSorted = [...rmsVals].sort((a, b) => a - b);
  const rLo = percentile(rmsSorted, 0.05), rHi = percentile(rmsSorted, 0.97);
  const densSm = smooth(noteCount, 2);
  const dSorted = [...densSm].sort((a, b) => a - b);
  const dHi = percentile(dSorted, 0.95) || 1;
  const centVals = audio ? audio.centroidHz.slice(0, secs) : [];
  const cSorted = [...centVals].sort((a, b) => a - b);
  const cLo = percentile(cSorted, 0.05), cHi = percentile(cSorted, 0.95);
  for (let i = 0; i < secs; i++) {
    const d = Math.min(1, densSm[i] / dHi);
    if (audio) {
      const l = rHi > rLo ? Math.min(1, Math.max(0, (audio.rmsDb[i] - rLo) / (rHi - rLo))) : 0.5;
      const c = cHi > cLo ? Math.min(1, Math.max(0, ((audio.centroidHz[i] ?? cLo) - cLo) / (cHi - cLo))) : 0.5;
      rawI.push(0.55 * l + 0.3 * d + 0.15 * c);
    } else {
      rawI.push(d);
    }
  }
  const intens = smooth(rawI, 4);
  const curve: Array<{ t: number; intensity: number }> = [];
  for (let t = 0; t < secs; t += 5) curve.push({ t, intensity: round2(intens[Math.min(secs - 1, t)]) });
  let climax = 0, quiet = 0;
  // ignore the first/last 4 s (fade in/out) for the quietest point
  for (let i = 0; i < secs; i++) {
    if (intens[i] > intens[climax]) climax = i;
    if (i > 4 && i < secs - 4 && intens[i] < intens[quiet || 5]) quiet = i;
  }
  const third = (a: number, b: number) => {
    const s = intens.slice(Math.floor(a * secs), Math.max(Math.floor(a * secs) + 1, Math.floor(b * secs)));
    return s.reduce((x, v) => x + v, 0) / s.length;
  };
  const t1 = third(0, 1 / 3), t2 = third(1 / 3, 2 / 3), t3 = third(2 / 3, 1);
  const iSorted = [...intens].sort((a, b) => a - b);
  const spread = percentile(iSorted, 0.9) - percentile(iSorted, 0.1);
  let shape: MusicProfile["dynamics"]["shape"];
  if (spread < 0.18) shape = "plateau";
  else if (t2 > t1 + 0.08 && t2 > t3 + 0.08) shape = "arch";
  else if (t2 < t1 - 0.08 && t2 < t3 - 0.08) shape = "valley";
  else if (t3 > t1 + 0.12) shape = "rising";
  else if (t1 > t3 + 0.12) shape = "falling";
  else shape = "wave";

  // ── sections ──
  const sections: SectionProfile[] = [];
  for (let s = 0; s < bounds.length - 1; s++) {
    const a = bounds[s], b = bounds[s + 1];
    const sn = notes.filter((nt) => nt.time >= a && nt.time < b);
    const len = Math.max(1, b - a);
    const mids = sn.map((x) => x.midi).sort((x, y) => x - y);
    const ia = Math.floor(a), ib = Math.max(ia + 1, Math.min(secs, Math.floor(b)));
    const secI = intens.slice(ia, ib);
    const iMean = secI.reduce((x, v) => x + v, 0) / secI.length;
    const head = secI.slice(0, Math.max(1, Math.floor(secI.length / 3)));
    const tail = secI.slice(-Math.max(1, Math.floor(secI.length / 3)));
    const delta = tail.reduce((x, v) => x + v, 0) / tail.length - head.reduce((x, v) => x + v, 0) / head.length;
    const ldb = audio ? audio.rmsDb.slice(ia, ib) : [];
    const lMean = ldb.length ? ldb.reduce((x, v) => x + v, 0) / ldb.length : null;
    const cent = audio ? audio.centroidHz.slice(ia, ib) : [];
    const share: Record<ChordFamily, number> = { major: 0, minor: 0, dominant: 0, diminished: 0, augmented: 0, suspended: 0, other: 0 };
    const chordDur = new Map<string, number>();
    let tot = 0;
    for (const c of chords) {
      if (c.time < a || c.time >= b) continue;
      share[chordFamily(c.chord)] += c.duration;
      chordDur.set(c.chord, (chordDur.get(c.chord) ?? 0) + c.duration);
      tot += c.duration;
    }
    for (const k of Object.keys(share) as ChordFamily[]) share[k] = tot ? round2(share[k] / tot) : 0;
    let localBpm: number | null = null;
    if (tempo?.curve.length) {
      const pts = tempo.curve.filter((p) => p.t >= a && p.t < b).map((p) => p.bpm).sort((x, y) => x - y);
      localBpm = pts.length ? pts[Math.floor(pts.length / 2)] : null;
    }
    const lk = sn.length >= 20 ? keyCorrelations(pcHistogram(sn))[0] : null;
    let onsetRate = 0;
    if (audio) {
      const fr = audio.frameRate;
      onsetRate = countOnsets(audio.onsetEnv.slice(Math.floor(a * fr), Math.floor(b * fr)), fr) / len;
    } else {
      const ons = new Set(sn.map((x) => Math.round(x.time * 25)));
      onsetRate = ons.size / len;
    }
    sections.push({
      index: s,
      start: Math.round(a),
      end: Math.round(b),
      intensity: round2(iMean),
      loudnessDb: lMean !== null ? Math.round(lMean * 10) / 10 : null,
      loudnessRel: lMean !== null && rHi > rLo ? round2(Math.min(1, Math.max(0, (lMean - rLo) / (rHi - rLo)))) : null,
      trend: delta > 0.08 ? "building" : delta < -0.08 ? "receding" : "steady",
      noteDensity: round2(sn.length / len),
      onsetRate: round2(onsetRate),
      register: mids.length
        ? { low: nn(percentile(mids, 0.03)), median: nn(percentile(mids, 0.5)), high: nn(percentile(mids, 0.97)), centerMidi: percentile(mids, 0.5) }
        : { low: "-", median: "-", high: "-", centerMidi: 0 },
      velocityMean: sn.length ? Math.round(sn.reduce((x, v) => x + v.velocity, 0) / sn.length) : 0,
      brightnessHz: cent.length ? Math.round(cent.reduce((x, v) => x + v, 0) / cent.length) : null,
      localBpm,
      localKey: lk ? lk.key : null,
      chordShare: share,
      topChords: [...chordDur.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k]) => k),
      chordTimeline: condenseChords(chords, a, b),
    });
  }
  // re-normalise section intensity to 0–1 across the track so the arc reads clearly
  const sMin = Math.min(...sections.map((s) => s.intensity)), sMax = Math.max(...sections.map((s) => s.intensity));
  if (sMax > sMin) for (const s of sections) s.intensity = round2(0.1 + (0.9 * (s.intensity - sMin)) / (sMax - sMin));

  // ── mode balance ──
  const fam: Record<ChordFamily, number> = { major: 0, minor: 0, dominant: 0, diminished: 0, augmented: 0, suspended: 0, other: 0 };
  let ft = 0;
  for (const c of chords) { fam[chordFamily(c.chord)] += c.duration; ft += c.duration; }
  const sh = (k: ChordFamily) => (ft ? round2(fam[k] / ft) : 0);
  const hist = pcHistogram(notes);
  const corrs = keyCorrelations(hist);
  const top = corrs[0];
  const keyClarity = round2(Math.max(0, top.r - corrs[1].r) * 5);
  // Always our own (correctly rotated) Krumhansl key — stored key_signature
  // values written before 2026-10-05 came from a mis-rotated profile.
  const tonic = top.tonic;
  const isMinorKey = top.mode === "Minor";
  const rel = (iv: number) => hist[(tonic + iv) % 12];
  const modalColors: string[] = [];
  if (tonic >= 0) {
    if (!isMinorKey) {
      if (rel(10) > rel(11) * 1.3 && rel(10) > 0.04) modalColors.push("Mixolydian ♭7");
      if (rel(6) > rel(5) * 0.9 && rel(6) > 0.04) modalColors.push("Lydian ♯4");
      if (rel(3) > 0.05 || rel(8) > 0.05) modalColors.push("borrowed minor-mode color (♭3/♭6)");
    } else {
      if (rel(9) > rel(8) * 1.2 && rel(9) > 0.04) modalColors.push("Dorian ♮6");
      if (rel(1) > rel(2) * 0.9 && rel(1) > 0.035) modalColors.push("Phrygian ♭2");
      if (rel(11) > rel(10) * 1.2 && rel(11) > 0.04) modalColors.push("harmonic-minor leading tone");
      if (rel(4) > 0.05) modalColors.push("Picardy / major-third brightening");
    }
  }
  const majS = sh("major"), minS = sh("minor"), domS = sh("dominant"), susS = sh("suspended");
  // Mode = the KEY's mode (pitch-class evidence) shaded by chord qualities.
  // Chord shares alone mislead: a minor key is full of major chords
  // (♭III, ♭VI, ♭VII), so neither signal is used on its own.
  const bestMaj = corrs.find((c) => c.mode === "Major")!.r;
  const bestMin = corrs.find((c) => c.mode === "Minor")!.r;
  const keyMinor = Math.max(0, Math.min(1, 0.5 + (bestMin - bestMaj) * 4)); // 0 = clearly major, 1 = clearly minor
  const bright = majS + domS * 0.6, dark = minS + sh("diminished");
  const chordMinor = bright + dark > 0 ? dark / (bright + dark) : 0.5;
  const minorWeight = round2(0.6 * keyMinor + 0.4 * chordMinor);
  let verdict: string;
  if (susS + sh("other") > 0.45) verdict = `modal / ambiguous — suspended and open sonorities dominate (${isMinorKey ? "minor" : "major"} centre)`;
  else if (minorWeight >= 0.68) verdict = "minor-dominant";
  else if (minorWeight >= 0.55) verdict = isMinorKey ? "minor key, warmed by major-chord colour (bittersweet)" : "minor-leaning";
  else if (minorWeight >= 0.42) verdict = isMinorKey ? "bittersweet — minor key with strong major light" : "bittersweet — major key with strong minor shading";
  else if (minorWeight >= 0.3) verdict = "major-leaning, with minor shading";
  else verdict = "major-dominant";

  const allM = notes.map((x) => x.midi).sort((a, b) => a - b);
  const nps = notes.length / dur;
  return {
    version: PROFILE_VERSION,
    duration: Math.round(dur * 10) / 10,
    tempo,
    key: { detected: notes.length ? top.key : null, runnerUp: notes.length ? corrs[1].key : null, clarity: Math.min(1, keyClarity), stored: input.keySignature ?? null },
    modeBalance: { major: majS, minor: minS, dominant: domS, suspended: susS, diminished: round2(sh("diminished") + sh("augmented")), other: sh("other"), minorWeight, verdict, modalColors },
    dynamics: {
      curve,
      climaxTime: climax,
      quietestTime: quiet,
      shape,
      rangeDb: audio ? Math.round((rHi - rLo) * 10) / 10 : null,
    },
    register: allM.length ? { low: nn(percentile(allM, 0.02)), high: nn(percentile(allM, 0.98)), median: nn(percentile(allM, 0.5)) } : { low: "-", high: "-", median: "-" },
    density: {
      notesPerSec: round2(nps),
      onsetRate: tempo?.method === "audio-flux-acf" ? tempo.onsetRate : null,
      // notes-only fallback: Basic Pitch yields ~5–7 notes per real attack
      label: densityLabel(tempo?.method === "audio-flux-acf" ? tempo.onsetRate : nps / 6),
    },
    sections,
  };
}
