// ─────────────────────────────────────────────────────────────────────────────
// scanner.ts — Image-as-spectrogram additive resynthesis for "457 Piano Image
// Duet". This is the core "Art2Mus" layer that closes the loop: the dreamed
// image RE-COMPOSES the piano rather than merely filtering it.
//
// HOW IT WORKS
// A glowing vertical scan-line sweeps the image left→right. Each column's
// brightness profile is sampled at PARTIAL_COUNT Y positions (log-spaced in
// the frequency domain). Each Y position maps to a frequency in the detected
// key (log-musical mapping quantised to consonant scale degrees), and the
// pixel brightness at that position sets the partial's amplitude. The result
// is a shimmer/choir voice that "sings along" with Karel's real piano.
//
// MUSICAL QUANTISATION
// The frequency grid uses the detected key's diatonic + octave-extended pitches
// so every partial is IN KEY — never atonal. The mapping spans ~3 octaves from
// the key's low root to its high extension, via the diatonic scale degrees
// (1, 2, 3, 4, 5, 6, 7 across octaves). This is warm and resolves on purpose.
//
// References:
//   Xenakis UPIC (1977), Iannis Xenakis — image-drawn waveforms, first image-as-score
//   MetaSynth (Wenger & Spiegel 1997) — spectral painting / image→sound
//   Art2Mus (arXiv 2602.17599, Feb 2026) — direct visual→music conditioning
// ─────────────────────────────────────────────────────────────────────────────

export const PARTIAL_COUNT = 24; // number of additive partials per scan column

// ── Musical frequency grid (quantised to key) ─────────────────────────────────
//
// Major scale diatonic degrees (in semitones from root): 0,2,4,5,7,9,11
// Minor scale diatonic degrees: 0,2,3,5,7,8,10
// Chromatic: all 12 (still consonant — mapped as pentatonic fallback)
// We build 3 octaves of scale degrees spanning roughly C3–C6, then
// log-space map Y positions to those frequencies.

const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEGREES = [0, 2, 3, 5, 7, 8, 10];
// pentatonic for chromatic mode (warm)
const CHROM_DEGREES = [0, 2, 4, 7, 9];

type Modality = "major" | "minor" | "chromatic";

export function buildFrequencyGrid(keyPc: number, modality: Modality): Float32Array {
  const rootMidi = 48 + keyPc; // start at ~C3 (MIDI 48) + key offset
  const degrees = modality === "major" ? MAJOR_DEGREES
                : modality === "minor" ? MINOR_DEGREES
                : CHROM_DEGREES;

  // Build frequencies: span 3 octaves × scale degrees, log-sorted
  const freqs: number[] = [];
  for (let oct = 0; oct < 4; oct++) {
    for (const d of degrees) {
      const midi = rootMidi + oct * 12 + d;
      if (midi > 84) continue; // stay below ~C6
      freqs.push(440 * Math.pow(2, (midi - 69) / 12));
    }
  }
  // Sort ascending, deduplicate close-frequency pitches
  freqs.sort((a, b) => a - b);

  // Downsample/interpolate to exactly PARTIAL_COUNT entries
  const grid = new Float32Array(PARTIAL_COUNT);
  for (let i = 0; i < PARTIAL_COUNT; i++) {
    const t = i / (PARTIAL_COUNT - 1);
    const fi = t * (freqs.length - 1);
    const lo = Math.floor(fi);
    const hi = Math.min(lo + 1, freqs.length - 1);
    grid[i] = freqs[lo] * (1 - (fi - lo)) + freqs[hi] * (fi - lo);
  }
  return grid;
}

// ── Additive voice (bank of sine oscillators) ──────────────────────────────────

export interface AdditiveVoice {
  /** Update partial amplitudes from an image column brightness array (PARTIAL_COUNT values 0-1) */
  setAmplitudes: (amps: Float32Array, smoothing: number) => void;
  /** Set overall gain of the voice */
  setMasterGain: (gain: number, timeSec: number) => void;
  /** Retune partials to a new key */
  retune: (grid: Float32Array, timeSec: number) => void;
  /** Disconnect everything */
  destroy: () => void;
}

export function buildAdditiveVoice(
  ctx: AudioContext,
  freqGrid: Float32Array
): AdditiveVoice {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0, ctx.currentTime);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-12, ctx.currentTime);
  limiter.knee.setValueAtTime(3, ctx.currentTime);
  limiter.ratio.setValueAtTime(8, ctx.currentTime);
  limiter.attack.setValueAtTime(0.001, ctx.currentTime);
  limiter.release.setValueAtTime(0.12, ctx.currentTime);

  // Soft chorus: slight detune for shimmer
  const chorus = ctx.createBiquadFilter();
  chorus.type = "highpass";
  chorus.frequency.setValueAtTime(120, ctx.currentTime); // remove sub-bass mud

  master.connect(chorus);
  chorus.connect(limiter);
  limiter.connect(ctx.destination);

  // Create PARTIAL_COUNT oscillators + gain nodes
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  const targetAmps = new Float32Array(PARTIAL_COUNT);
  const currentAmps = new Float32Array(PARTIAL_COUNT);

  for (let i = 0; i < PARTIAL_COUNT; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freqGrid[i], ctx.currentTime);
    // Slight detune for shimmer texture: alternating ±3 cents
    osc.detune.setValueAtTime((i % 2 === 0 ? 1 : -1) * 3 + (Math.random() - 0.5) * 2, ctx.currentTime);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);

    osc.connect(g);
    g.connect(master);
    osc.start();

    oscs.push(osc);
    gains.push(g);
  }

  function setAmplitudes(amps: Float32Array, smoothing: number): void {
    const t = ctx.currentTime;
    for (let i = 0; i < PARTIAL_COUNT; i++) {
      targetAmps[i] = amps[i];
      currentAmps[i] = currentAmps[i] * smoothing + targetAmps[i] * (1 - smoothing);
      // Scale down so the voice is a "shimmer" layer, not overwhelming
      const scaledAmp = currentAmps[i] * 0.04;
      gains[i].gain.setTargetAtTime(scaledAmp, t, 0.04);
    }
  }

  function setMasterGain(gain: number, timeSec: number): void {
    master.gain.setTargetAtTime(gain, timeSec, 0.15);
  }

  function retune(grid: Float32Array, timeSec: number): void {
    for (let i = 0; i < PARTIAL_COUNT; i++) {
      oscs[i].frequency.setTargetAtTime(grid[i], timeSec, 0.5);
    }
  }

  function destroy(): void {
    for (let i = 0; i < PARTIAL_COUNT; i++) {
      try {
        gains[i].gain.setValueAtTime(0, ctx.currentTime);
        oscs[i].stop(ctx.currentTime + 0.1);
      } catch { /* ok */ }
    }
    try { master.disconnect(); chorus.disconnect(); limiter.disconnect(); } catch { /* ok */ }
  }

  return { setAmplitudes, setMasterGain, retune, destroy };
}

// ── Column brightness sampler ──────────────────────────────────────────────────
//
// Given an ImageData (or an offscreen canvas), sample one vertical column at
// normalised x ∈[0,1] → return PARTIAL_COUNT brightness values in [0,1].
// Y positions are log-mapped so low partials (low frequencies) sample from
// the bottom of the image and high partials sample from the top — matching
// the Xenakis UPIC convention.

export function sampleColumn(
  imageData: ImageData,
  normX: number
): Float32Array {
  const { width, height, data } = imageData;
  const px = Math.max(0, Math.min(width - 1, Math.round(normX * (width - 1))));
  const result = new Float32Array(PARTIAL_COUNT);

  for (let i = 0; i < PARTIAL_COUNT; i++) {
    // Log mapping: high index → low Y (high frequency at top of image)
    const logT = Math.pow(i / (PARTIAL_COUNT - 1), 0.7); // slight log warp
    // i=0 → bottom of image (low freq), i=PARTIAL_COUNT-1 → top (high freq)
    const normY = 1.0 - logT;
    const py = Math.max(0, Math.min(height - 1, Math.round(normY * (height - 1))));
    const idx = (py * width + px) * 4;
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;
    // Perceptual brightness
    result[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return result;
}

// ── Scan state ─────────────────────────────────────────────────────────────────

export interface ScanState {
  /** Normalised scan position 0→1 */
  x: number;
  /** Current speed: sweeps full width in ~sweepDurationSec */
  sweepDurationSec: number;
  /** Last sampled partial amplitudes */
  lastAmps: Float32Array;
}

export function makeScanState(sweepDurationSec = 8): ScanState {
  return { x: 0, sweepDurationSec, lastAmps: new Float32Array(PARTIAL_COUNT) };
}
