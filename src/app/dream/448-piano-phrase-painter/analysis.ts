// ─────────────────────────────────────────────────────────────────────────────
// analysis.ts — Musically-aware analysis layer for "Piano Phrase Painter"
//
// Computes, from a Web Audio AnalyserNode (FFT 2048), without any ML libs:
//   • 12-bin chromagram → dominant pitch-class + major/minor/consonance estimate
//   • Spectral-flux onset detector with adaptive threshold + debounce
//   • Phrase-boundary detection (onset grouping via energy dip heuristic)
//   • Smoothed RMS dynamics envelope (ppp→fff)
//
// References:
//   Spectral flux onset detection: Bello et al. (2005) "A Tutorial on Onset
//   Detection in Music Signals", IEEE Trans. Speech Audio Processing.
//
// All weights and thresholds are empirically tuned for solo-piano material.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export type Modality = "major" | "minor" | "chromatic";

export interface MusicalFrame {
  /** Smoothed RMS energy 0-1 */
  rms: number;
  /** Raw RMS for onset detector */
  rawRms: number;
  /** 12-bin chromagram, each bin 0-1 (C=0, C#=1, …, B=11) */
  chroma: Float32Array;
  /** Dominant pitch-class 0-11 (C=0…B=11) */
  dominantPc: number;
  /** Major / minor / chromatic modality estimate */
  modality: Modality;
  /** Consonance score 0-1 (1 = strong major/minor triad match) */
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
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SMOOTH_FAST = 0.15;   // for fast-attack env
const SMOOTH_SLOW = 0.03;   // for slow-decay env (phrase energy)
const SMOOTH_RMS = 0.06;    // RMS smoothing

// Spectral flux onset: adaptive threshold
const FLUX_THRESHOLD_MULT = 1.35; // multiplier over adaptive mean
const FLUX_MEDIAN_WIN = 20;       // frames for adaptive median
const ONSET_DEBOUNCE_MS = 80;     // ignore onsets within this window

// Phrase boundary: if energy dips below X% of recent peak for Y consecutive frames
const PHRASE_DIP_RATIO = 0.30;
const PHRASE_DIP_FRAMES = 18;

// Major chord template (semitone offsets from root: 0, 4, 7)
const MAJOR_TPL = new Float32Array([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]);
// Minor chord template (semitone offsets: 0, 3, 7)
const MINOR_TPL = new Float32Array([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]);

// Pitch-class names C-based
export const PC_NAMES_C: readonly string[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

// Dynamics labels from RMS
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

// ── Dot-product for consonance matching ──────────────────────────────────────
function dotChroma(chroma: Float32Array, tpl: Float32Array, rootPc: number): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += chroma[(i + rootPc) % 12] * tpl[i];
  }
  return sum;
}

// ── Analyser state ────────────────────────────────────────────────────────────

export interface Analyser {
  /** Call once per rAF with the current AudioContext time in seconds. */
  tick: (nowSec: number) => MusicalFrame;
  /** Underlying FFT buffer length (frequencyBinCount). */
  binCount: number;
}

export function buildAnalyser(
  analyserNode: AnalyserNode,
  sampleRate: number,
): Analyser {
  const binCount = analyserNode.frequencyBinCount;
  const freqBuf = new Uint8Array(binCount);
  const prevFreqBuf = new Uint8Array(binCount);
  const binHz = (sampleRate / 2) / binCount;

  // Spectral flux adaptive window
  const fluxHistory: number[] = [];

  // Onset timing
  let lastOnsetMs = 0;

  // Phrase dip counter
  let dipFrameCount = 0;

  // Smoothed state
  let smoothRms = 0;
  let recentPeakRms = 0;
  let smoothFlux = 0;
  let onsetWindowCount = 0;   // onsets in rolling 10s window
  let onsetWindowT = 0;       // start of window (sec)
  let smoothOpm = 0;

  // Chroma smoothing
  const smoothChroma = new Float32Array(12);

  return {
    binCount,
    tick(nowSec: number): MusicalFrame {
      // Preserve previous buffer
      prevFreqBuf.set(freqBuf);
      analyserNode.getByteFrequencyData(freqBuf);

      // ── RMS ──────────────────────────────────────────────────────────────
      let rmsSum = 0;
      for (let i = 0; i < binCount; i++) {
        const v = freqBuf[i] / 255;
        rmsSum += v * v;
      }
      const rawRms = Math.sqrt(rmsSum / binCount);
      smoothRms = smoothRms * (1 - SMOOTH_RMS) + rawRms * SMOOTH_RMS;

      // Track recent peak (slow decay)
      if (smoothRms > recentPeakRms) {
        recentPeakRms = smoothRms;
      } else {
        recentPeakRms = recentPeakRms * (1 - SMOOTH_SLOW) + smoothRms * SMOOTH_SLOW;
      }

      // ── Spectral flux (positive-only half-wave rectified) ────────────────
      let flux = 0;
      for (let i = 0; i < binCount; i++) {
        const diff = (freqBuf[i] - prevFreqBuf[i]) / 255;
        if (diff > 0) flux += diff;
      }
      flux /= binCount;
      smoothFlux = smoothFlux * (1 - SMOOTH_FAST) + flux * SMOOTH_FAST;

      // Adaptive threshold
      fluxHistory.push(flux);
      if (fluxHistory.length > FLUX_MEDIAN_WIN) fluxHistory.shift();
      const sorted = [...fluxHistory].sort((a, b) => a - b);
      const adaptiveMean = sorted[Math.floor(sorted.length / 2)]; // median
      const threshold = adaptiveMean * FLUX_THRESHOLD_MULT;

      // Onset detection
      const nowMs = nowSec * 1000;
      const debounceOk = nowMs - lastOnsetMs > ONSET_DEBOUNCE_MS;
      const onsetNow = debounceOk && flux > threshold && flux > 0.002;
      if (onsetNow) {
        lastOnsetMs = nowMs;
        onsetWindowCount++;
      }

      // OPM rolling window (10s)
      if (nowSec - onsetWindowT > 10) {
        smoothOpm = smoothOpm * 0.7 + (onsetWindowCount * 6) * 0.3; // scale to per-min
        onsetWindowCount = 0;
        onsetWindowT = nowSec;
      }

      // ── Phrase boundary detection ─────────────────────────────────────────
      const dipThresh = recentPeakRms * PHRASE_DIP_RATIO;
      if (smoothRms < dipThresh && recentPeakRms > 0.06) {
        dipFrameCount++;
      } else {
        dipFrameCount = 0;
      }
      const phraseBoundaryNow = dipFrameCount === PHRASE_DIP_FRAMES;
      if (phraseBoundaryNow) {
        // Reset so it fires again only after next activity+dip
        dipFrameCount = 0;
        recentPeakRms = smoothRms;
      }

      // ── Chromagram (C=0…B=11) ────────────────────────────────────────────
      const rawChroma = new Float32Array(12);
      for (let i = 1; i < binCount; i++) {
        const hz = i * binHz;
        if (hz < 27.5 || hz > 4200) continue;
        const midi = 12 * Math.log2(hz / 440) + 69;
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        rawChroma[pc] += freqBuf[i] / 255;
      }
      // Normalize
      let chromaMax = 0;
      for (let i = 0; i < 12; i++) if (rawChroma[i] > chromaMax) chromaMax = rawChroma[i];
      if (chromaMax > 0) for (let i = 0; i < 12; i++) rawChroma[i] /= chromaMax;

      // Smooth
      for (let i = 0; i < 12; i++) {
        smoothChroma[i] = smoothChroma[i] * 0.85 + rawChroma[i] * 0.15;
      }

      // Dominant pitch-class
      let dominantPc = 0;
      let maxChroma = -1;
      for (let i = 0; i < 12; i++) {
        if (smoothChroma[i] > maxChroma) { maxChroma = smoothChroma[i]; dominantPc = i; }
      }

      // Major/minor match
      let bestMajorScore = -1, bestMajorPc = 0;
      let bestMinorScore = -1, bestMinorPc = 0;
      for (let pc = 0; pc < 12; pc++) {
        const maj = dotChroma(smoothChroma, MAJOR_TPL, pc);
        const min = dotChroma(smoothChroma, MINOR_TPL, pc);
        if (maj > bestMajorScore) { bestMajorScore = maj; bestMajorPc = pc; }
        if (min > bestMinorScore) { bestMinorScore = min; bestMinorPc = pc; }
      }
      const consonance = Math.max(bestMajorScore, bestMinorScore);
      let modality: Modality;
      let keyPc: number;
      if (consonance < 0.35) {
        modality = "chromatic";
        keyPc = dominantPc;
      } else if (bestMajorScore >= bestMinorScore) {
        modality = "major";
        keyPc = bestMajorPc;
      } else {
        modality = "minor";
        keyPc = bestMinorPc;
      }

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
      };
    },
  };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

// Pitch-class → hue accent word (C-based)
const PC_HUE_WORDS: readonly string[] = [
  "verdant-green",    // C
  "deep-cerulean",    // C#
  "turquoise",        // D
  "indigo-violet",    // D#
  "rose-crimson",     // E
  "amber",            // F
  "burnt-sienna",     // F#
  "warm-gold",        // G
  "forest-green",     // G#
  "cobalt-blue",      // A
  "magenta",          // A#
  "silver-violet",    // B
];

export function buildMusicalPrompt(frame: MusicalFrame): string {
  const { rms, modality, dominantPc, consonance } = frame;

  // Harmony → palette
  let palette: string;
  if (modality === "major" && consonance > 0.55) {
    palette = "warm luminous gold and soft amber radiance, sun-kissed aureate";
  } else if (modality === "major" && consonance > 0.38) {
    palette = "warm honey and pale gold, gentle interior glow";
  } else if (modality === "minor" && consonance > 0.55) {
    palette = "deep indigo and midnight violet, cool cerulean shadow, melancholic";
  } else if (modality === "minor") {
    palette = "slate-blue and dusky rose, dim diffused luminescence";
  } else {
    palette = "shifting iridescent hues, chromatic prismatic tension";
  }

  // Dynamics → density
  let density: string;
  if (rms < 0.06) {
    density = "ethereal sparse vapour mist, barely-there breath";
  } else if (rms < 0.14) {
    density = "drifting translucent haze, slow diffuse cloud tendrils";
  } else if (rms < 0.28) {
    density = "layered volumetric fog, swelling light mass";
  } else if (rms < 0.50) {
    density = "turbulent swirling volume, dense luminous storm";
  } else {
    density = "roiling chromatic tempest, explosive radiant cascade";
  }

  // Pitch-class → hue accent
  const hueAccent = PC_HUE_WORDS[dominantPc] ?? "violet";

  const style =
    "abstract volumetric light responding to a solo grand piano performance, latent dreamscape, " +
    "soft caustics, Refik-Anadol-like data-pigment, cinematic, no text";

  return `${palette}, ${density}, dominant accent ${hueAccent}, ${style}`;
}
