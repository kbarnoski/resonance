// transcribe.ts — offline analysis of a decoded AudioBuffer into a note list,
// then a grouping of consecutive notes into medieval neume figures by contour.
//
// Pipeline (all deterministic, run once after decode):
//   1. mix-to-mono
//   2. onset detection    — spectral flux (hand-rolled radix-2 FFT) peak-picked
//                           with an adaptive threshold + minimum inter-onset gap
//   3. pitch detection    — YIN (de Cheveigné & Kawahara, JASA 2002) on a few
//                           frames after each onset; median → MIDI → diatonic step
//   4. figure grouping    — sign of successive pitch steps → punctum / pes /
//                           clivis / torculus / porrectus / climacus
//
// Neumes encode CONTOUR, not exact rhythm, so this is forgiving of the small
// pitch/onset errors any browser detector makes — historically apt, too.

export type NeumeKind =
  | "punctum"
  | "pes" // 2 ascending
  | "clivis" // 2 descending
  | "torculus" // 3: up then down
  | "porrectus" // 3: down then up
  | "climacus"; // 3+ descending run of diamonds

export interface Note {
  onset: number; // seconds into the buffer
  midi: number; // detected pitch, rounded to nearest semitone
  degree: number; // diatonic staff step (white-key index), higher = higher pitch
}

export interface Figure {
  kind: NeumeKind;
  notes: Note[];
}

export interface Transcription {
  notes: Note[]; // flat, onset-ordered
  figures: Figure[];
  duration: number; // seconds of the analysed span
}

// Keep analysis bounded so a multi-minute recording stays fast + legible.
const MAX_ANALYSIS_SECONDS = 120;
const MAX_NOTES = 600;

// ── mix to mono ──────────────────────────────────────────────────────────────
function toMono(buffer: AudioBuffer, maxSamples: number): Float32Array {
  const ch = buffer.numberOfChannels;
  const n = Math.min(buffer.length, maxSamples);
  const out = new Float32Array(n);
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += data[i] / ch;
  }
  return out;
}

// ── iterative radix-2 FFT (in-place) ─────────────────────────────────────────
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
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
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const b = i + k + half;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[i + k] = ar + vr;
        im[i + k] = ai + vi;
        re[b] = ar - vr;
        im[b] = ai - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ── onset detection via spectral flux ────────────────────────────────────────
function detectOnsets(mono: Float32Array, sr: number): number[] {
  const N = 1024;
  const hop = 512;
  const half = N >> 1;
  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));

  const frames = Math.max(0, Math.floor((mono.length - N) / hop));
  const flux = new Float32Array(frames);
  const prevMag = new Float32Array(half);
  const re = new Float32Array(N);
  const im = new Float32Array(N);

  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < N; i++) {
      re[i] = mono[off + i] * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    let sum = 0;
    for (let k = 0; k < half; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const d = mag - prevMag[k];
      if (d > 0) sum += d;
      prevMag[k] = mag;
    }
    flux[f] = sum;
  }

  // Normalise flux to ~0..1 for a stable threshold.
  let maxFlux = 1e-9;
  for (let f = 0; f < frames; f++) if (flux[f] > maxFlux) maxFlux = flux[f];
  for (let f = 0; f < frames; f++) flux[f] /= maxFlux;

  // Peak-pick: local maximum, above an adaptive (local-mean) threshold, and at
  // least MIN_IOI seconds after the previous onset.
  const MIN_IOI = 0.14;
  const minIoiFrames = Math.round((MIN_IOI * sr) / hop);
  const win = 6;
  const onsets: number[] = [];
  let lastFrame = -minIoiFrames;
  for (let f = 1; f < frames - 1; f++) {
    let localSum = 0;
    let count = 0;
    for (let j = f - win; j <= f + win; j++) {
      if (j >= 0 && j < frames) {
        localSum += flux[j];
        count++;
      }
    }
    const thresh = (localSum / count) * 1.4 + 0.06;
    const isPeak = flux[f] >= flux[f - 1] && flux[f] > flux[f + 1] && flux[f] > thresh;
    if (isPeak && f - lastFrame >= minIoiFrames) {
      onsets.push((f * hop) / sr);
      lastFrame = f;
    }
  }
  return onsets;
}

// ── YIN pitch on a single frame ──────────────────────────────────────────────
function yinPitch(mono: Float32Array, start: number, sr: number): number {
  const W = 2048;
  if (start + 2 * W > mono.length) return 0;
  // Plausible piano-ish range → bound the lag search (keeps cost low + robust).
  const tauMin = Math.max(2, Math.floor(sr / 1200)); // up to ~1200 Hz
  const tauMax = Math.min(W - 1, Math.floor(sr / 70)); // down to ~70 Hz
  const diff = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const d = mono[start + j] - mono[start + j + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }
  // Cumulative mean normalised difference.
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[tauMin] = 1;
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = running > 0 ? (diff[tau] * (tau - tauMin + 1)) / running : 1;
  }
  const THRESH = 0.15;
  let bestTau = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (cmnd[tau] < THRESH) {
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      bestTau = tau;
      break;
    }
  }
  if (bestTau < 0) {
    // No dip below threshold — take the global minimum of the CMND.
    let min = Infinity;
    for (let tau = tauMin + 1; tau < tauMax; tau++) {
      if (cmnd[tau] < min) {
        min = cmnd[tau];
        bestTau = tau;
      }
    }
    if (bestTau < 0) return 0;
    if (min > 0.4) return 0; // too unvoiced to trust
  }
  // Parabolic interpolation around the chosen lag.
  let tauEst = bestTau;
  if (bestTau > tauMin && bestTau < tauMax) {
    const a = cmnd[bestTau - 1];
    const b = cmnd[bestTau];
    const c = cmnd[bestTau + 1];
    const denom = a + c - 2 * b;
    if (Math.abs(denom) > 1e-9) tauEst = bestTau + (a - c) / (2 * denom);
  }
  return sr / tauEst;
}

// Median-of-frames pitch shortly after an onset (skip the noisy attack).
function pitchAtOnset(mono: Float32Array, onsetSec: number, sr: number): number {
  const base = Math.floor(onsetSec * sr) + Math.floor(0.03 * sr);
  const hz: number[] = [];
  for (let k = 0; k < 3; k++) {
    const p = yinPitch(mono, base + k * 1024, sr);
    if (p > 0) hz.push(p);
  }
  if (hz.length === 0) return 0;
  hz.sort((a, b) => a - b);
  return hz[hz.length >> 1];
}

// ── pitch → staff geometry ───────────────────────────────────────────────────
// White-key (diatonic) index of a MIDI note: higher index = higher on the stave.
const PC_TO_DIATONIC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
function midiToDegree(midi: number): number {
  const octave = Math.floor(midi / 12);
  const pc = ((midi % 12) + 12) % 12;
  return octave * 7 + PC_TO_DIATONIC[pc];
}

// ── figure grouping by contour ───────────────────────────────────────────────
function groupFigures(notes: Note[]): Figure[] {
  const figures: Figure[] = [];
  let i = 0;
  const n = notes.length;
  const deg = (k: number) => notes[k].degree;
  while (i < n) {
    // Descending run of 3+ → climacus (first square + falling diamonds).
    if (i + 2 < n && deg(i + 1) < deg(i) && deg(i + 2) < deg(i + 1)) {
      let j = i + 2;
      while (j + 1 < n && deg(j + 1) < deg(j) && j - i < 4) j++;
      figures.push({ kind: "climacus", notes: notes.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (i + 2 < n) {
      const s1 = Math.sign(deg(i + 1) - deg(i));
      const s2 = Math.sign(deg(i + 2) - deg(i + 1));
      if (s1 > 0 && s2 < 0) {
        figures.push({ kind: "torculus", notes: notes.slice(i, i + 3) });
        i += 3;
        continue;
      }
      if (s1 < 0 && s2 > 0) {
        figures.push({ kind: "porrectus", notes: notes.slice(i, i + 3) });
        i += 3;
        continue;
      }
    }
    if (i + 1 < n) {
      if (deg(i + 1) > deg(i)) {
        figures.push({ kind: "pes", notes: notes.slice(i, i + 2) });
        i += 2;
        continue;
      }
      if (deg(i + 1) < deg(i)) {
        figures.push({ kind: "clivis", notes: notes.slice(i, i + 2) });
        i += 2;
        continue;
      }
    }
    figures.push({ kind: "punctum", notes: [notes[i]] });
    i += 1;
  }
  return figures;
}

// ── public entry ─────────────────────────────────────────────────────────────
export function transcribe(buffer: AudioBuffer): Transcription {
  const sr = buffer.sampleRate;
  const maxSamples = Math.floor(MAX_ANALYSIS_SECONDS * sr);
  const mono = toMono(buffer, maxSamples);
  const duration = mono.length / sr;

  const onsets = detectOnsets(mono, sr);
  const notes: Note[] = [];
  let lastMidi = 60;
  for (const onset of onsets) {
    if (notes.length >= MAX_NOTES) break;
    const hz = pitchAtOnset(mono, onset, sr);
    let midi: number;
    if (hz > 0) {
      midi = Math.round(69 + 12 * Math.log2(hz / 440));
      // Fold gross octave errors toward the running pitch (YIN can halve/double).
      while (midi - lastMidi > 13) midi -= 12;
      while (lastMidi - midi > 13) midi += 12;
      lastMidi = midi;
    } else {
      midi = lastMidi; // unvoiced frame → repeat (renders as a punctum)
    }
    notes.push({ onset, midi, degree: midiToDegree(midi) });
  }

  return { notes, figures: groupFigures(notes), duration };
}
