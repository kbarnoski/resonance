// ─────────────────────────────────────────────────────────────────────────────
// analysis.ts — Real-time musical analysis for "454 Piano Caption Loom"
//
// Computes from a Web Audio AnalyserNode (FFT 2048), without ML libs:
//   • Smoothed RMS dynamics (ppp…fff)
//   • 12-bin chromagram → dominant pitch-class
//   • Major/minor/consonance via dot-product vs triad templates
//   • Spectral-flux onset detector (rectified positive bin diff,
//     adaptive median threshold, ~80ms debounce) → onsetNow + onsets/min
//   • Phrase-boundary (energy dip <30% recent peak ~18 frames)
//   • Smoothed valence (modality+consonance) ∈[-1,1]
//   • Smoothed arousal (dynamics+onset density) ∈[-1,1]
//
// References:
//   Spectral flux onset detection: Bello et al. (2005) "A Tutorial on Onset
//   Detection in Music Signals", IEEE Trans. Speech Audio Processing 13(5).
//   Russell (1980) circumplex model of affect (valence × arousal).
//   arXiv 2512.23320 — music-derived captions + valence-arousal alignment.
// ─────────────────────────────────────────────────────────────────────────────

export type Modality = "major" | "minor" | "chromatic";

export interface MusicalFrame {
  /** Smoothed RMS energy 0-1 */
  rms: number;
  /** Raw RMS for onset detector */
  rawRms: number;
  /** 12-bin chromagram, each bin 0-1 (C=0, C#=1, …, B=11) */
  chroma: Float32Array;
  /** Dominant pitch-class 0-11 */
  dominantPc: number;
  /** Major / minor / chromatic modality estimate */
  modality: Modality;
  /** Consonance score 0-1 (1 = strong triad match) */
  consonance: number;
  /** Has an onset been detected THIS frame? */
  onsetNow: boolean;
  /** Has a phrase boundary been detected THIS frame? */
  phraseBoundaryNow: boolean;
  /** Current spectral flux (for HUD) */
  flux: number;
  /** Estimated onsets per minute (smoothed) */
  onsetsPerMin: number;
  /** Short phrase label for HUD, e.g. "Cm — pp" */
  phraseLabel: string;
  /** Dynamics label: ppp / pp / p / mp / mf / f / ff / fff */
  dynamicsLabel: string;
  /**
   * Valence ∈[-1,1]: -1 = dark/dissonant, +1 = bright/consonant major.
   * Derived from modality + consonance (Russell circumplex).
   */
  valence: number;
  /**
   * Arousal ∈[-1,1]: -1 = calm/sparse, +1 = intense/energetic.
   * Derived from dynamics (RMS) + onset density.
   */
  arousal: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SMOOTH_FAST = 0.15;
const SMOOTH_SLOW = 0.03;
const SMOOTH_RMS  = 0.06;

const FLUX_THRESHOLD_MULT = 1.35;
const FLUX_MEDIAN_WIN = 20;
const ONSET_DEBOUNCE_MS = 80;

const PHRASE_DIP_RATIO = 0.30;
const PHRASE_DIP_FRAMES = 18;

// Major chord template: semitone offsets 0, 4, 7
const MAJOR_TPL = new Float32Array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]);
// Minor chord template: semitone offsets 0, 3, 7
const MINOR_TPL = new Float32Array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]);

export const PC_NAMES_C: readonly string[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

// Pitch-class → hue (C=0…B=11) for canvas
export const PC_HUE_DEG: readonly number[] = [
  150, 185, 200, 260, 280, 340, 20, 40, 80, 220, 300, 240,
];

function dynamicsLabel(rms: number): string {
  if (rms < 0.04) return "ppp";
  if (rms < 0.09) return "pp";
  if (rms < 0.16) return "p";
  if (rms < 0.25) return "mp";
  if (rms < 0.38) return "mf";
  if (rms < 0.55) return "f";
  if (rms < 0.73) return "ff";
  return "fff";
}

function dotChroma(chroma: Float32Array, tpl: Float32Array, rootPc: number): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += chroma[(i + rootPc) % 12] * tpl[i];
  }
  return sum;
}

export interface Analyser {
  tick: (nowSec: number) => MusicalFrame;
  binCount: number;
}

export function buildAnalyser(analyserNode: AnalyserNode, sampleRate: number): Analyser {
  const binCount = analyserNode.frequencyBinCount;
  const freqBuf = new Uint8Array(binCount);
  const prevFreqBuf = new Uint8Array(binCount);
  const binHz = (sampleRate / 2) / binCount;

  const fluxHistory: number[] = [];
  let lastOnsetMs = 0;
  let dipFrameCount = 0;

  let smoothRms = 0;
  let recentPeakRms = 0;
  let smoothFlux = 0;
  let onsetWindowCount = 0;
  let onsetWindowT = 0;
  let smoothOpm = 0;
  let smoothValence = 0;
  let smoothArousal = 0;

  const smoothChroma = new Float32Array(12);

  return {
    binCount,
    tick(nowSec: number): MusicalFrame {
      prevFreqBuf.set(freqBuf);
      analyserNode.getByteFrequencyData(freqBuf);

      // ── RMS ───────────────────────────────────────────────────────────────
      let rmsSum = 0;
      for (let i = 0; i < binCount; i++) {
        const v = freqBuf[i] / 255;
        rmsSum += v * v;
      }
      const rawRms = Math.sqrt(rmsSum / binCount);
      smoothRms = smoothRms * (1 - SMOOTH_RMS) + rawRms * SMOOTH_RMS;

      if (smoothRms > recentPeakRms) {
        recentPeakRms = smoothRms;
      } else {
        recentPeakRms = recentPeakRms * (1 - SMOOTH_SLOW) + smoothRms * SMOOTH_SLOW;
      }

      // ── Spectral flux ─────────────────────────────────────────────────────
      let flux = 0;
      for (let i = 0; i < binCount; i++) {
        const diff = (freqBuf[i] - prevFreqBuf[i]) / 255;
        if (diff > 0) flux += diff;
      }
      flux /= binCount;
      smoothFlux = smoothFlux * (1 - SMOOTH_FAST) + flux * SMOOTH_FAST;

      fluxHistory.push(flux);
      if (fluxHistory.length > FLUX_MEDIAN_WIN) fluxHistory.shift();
      const sorted = [...fluxHistory].sort((a, b) => a - b);
      const adaptiveMed = sorted[Math.floor(sorted.length / 2)];
      const threshold = adaptiveMed * FLUX_THRESHOLD_MULT;

      const nowMs = nowSec * 1000;
      const debounceOk = nowMs - lastOnsetMs > ONSET_DEBOUNCE_MS;
      const onsetNow = debounceOk && flux > threshold && flux > 0.002;
      if (onsetNow) {
        lastOnsetMs = nowMs;
        onsetWindowCount++;
      }

      if (nowSec - onsetWindowT > 10) {
        smoothOpm = smoothOpm * 0.7 + (onsetWindowCount * 6) * 0.3;
        onsetWindowCount = 0;
        onsetWindowT = nowSec;
      }

      // ── Phrase boundary ───────────────────────────────────────────────────
      const dipThresh = recentPeakRms * PHRASE_DIP_RATIO;
      if (smoothRms < dipThresh && recentPeakRms > 0.06) {
        dipFrameCount++;
      } else {
        dipFrameCount = 0;
      }
      const phraseBoundaryNow = dipFrameCount === PHRASE_DIP_FRAMES;
      if (phraseBoundaryNow) {
        dipFrameCount = 0;
        recentPeakRms = smoothRms;
      }

      // ── Chromagram ────────────────────────────────────────────────────────
      const rawChroma = new Float32Array(12);
      for (let i = 1; i < binCount; i++) {
        const hz = i * binHz;
        if (hz < 27.5 || hz > 4200) continue;
        const midi = 12 * Math.log2(hz / 440) + 69;
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        rawChroma[pc] += freqBuf[i] / 255;
      }
      let chromaMax = 0;
      for (let i = 0; i < 12; i++) if (rawChroma[i] > chromaMax) chromaMax = rawChroma[i];
      if (chromaMax > 0) for (let i = 0; i < 12; i++) rawChroma[i] /= chromaMax;

      for (let i = 0; i < 12; i++) {
        smoothChroma[i] = smoothChroma[i] * 0.85 + rawChroma[i] * 0.15;
      }

      let dominantPc = 0;
      let maxC = -1;
      for (let i = 0; i < 12; i++) {
        if (smoothChroma[i] > maxC) { maxC = smoothChroma[i]; dominantPc = i; }
      }

      let bestMajScore = -1, bestMajPc = 0;
      let bestMinScore = -1, bestMinPc = 0;
      for (let pc = 0; pc < 12; pc++) {
        const maj = dotChroma(smoothChroma, MAJOR_TPL, pc);
        const min = dotChroma(smoothChroma, MINOR_TPL, pc);
        if (maj > bestMajScore) { bestMajScore = maj; bestMajPc = pc; }
        if (min > bestMinScore) { bestMinScore = min; bestMinPc = pc; }
      }
      const consonance = Math.max(bestMajScore, bestMinScore);
      let modality: Modality;
      let keyPc: number;
      if (consonance < 0.35) {
        modality = "chromatic"; keyPc = dominantPc;
      } else if (bestMajScore >= bestMinScore) {
        modality = "major"; keyPc = bestMajPc;
      } else {
        modality = "minor"; keyPc = bestMinPc;
      }

      // ── Valence + Arousal (Russell circumplex) ────────────────────────────
      // Valence: major consonant → +1, minor dissonant → -1
      const rawValence =
        modality === "major" ? consonance :
        modality === "minor" ? -consonance * 0.8 :
        0;
      smoothValence = smoothValence * 0.92 + rawValence * 0.08;

      // Arousal: loud + dense onsets → +1, sparse quiet → -1
      const opmNorm = Math.min(1, smoothOpm / 240);  // 240 opm ~ fff
      const rawArousal = (smoothRms * 1.4 + opmNorm * 0.6) - 1;
      smoothArousal = smoothArousal * 0.88 + rawArousal * 0.12;

      const dynLabel = dynamicsLabel(smoothRms);
      const keyName = PC_NAMES_C[keyPc];
      const modalSuffix = modality === "major" ? "" : modality === "minor" ? "m" : " chr";
      const phraseLabel = `${keyName}${modalSuffix} — ${dynLabel}`;

      return {
        rms: smoothRms,
        rawRms,
        chroma: new Float32Array(smoothChroma),
        dominantPc,
        modality,
        consonance,
        onsetNow,
        phraseBoundaryNow,
        flux: smoothFlux,
        onsetsPerMin: smoothOpm,
        phraseLabel,
        dynamicsLabel: dynLabel,
        valence: Math.max(-1, Math.min(1, smoothValence)),
        arousal: Math.max(-1, Math.min(1, smoothArousal)),
      };
    },
  };
}
