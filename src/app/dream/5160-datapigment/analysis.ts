// analysis.ts — five-band spectral reader + onset detection for 5160-datapigment.
//
// One AnalyserNode (fftSize 2048) feeds the whole piece. Each animation frame
// we pull a fresh magnitude spectrum and reduce it to the features that PAINT
// the dye field:
//
//   • bands[5]  — normalized energy in five perceptual registers
//     (sub · low · mid · high · air). Each band injects pigment of its own
//     colour into the fluid, so the spectral SHAPE of Karel's chord becomes the
//     spatial shape of the pigment cloud.
//   • rms       — broadband loudness → overall injection strength + how hard the
//     music stirs the velocity field.
//   • bass      — sub+low energy → the amplitude/rotation of the flow (oceanic
//     swell): heavy left-hand chords make the whole ocean heave.
//   • flux/onset — positive spectral flux (Bello et al. 2005). A rising
//     broadband attack crosses an adaptive threshold and fires a radial BLOOM.
//   • dominant  — index of the loudest band, used to bias the pigment hue.
//
// The identical feature contract is produced whether the source is Karel's real
// piano or the seeded synth pad — the renderer never knows which.

export const BAND_COUNT = 5;

export interface SpectralFrame {
  /** Per-band normalized energy 0..1: [sub, low, mid, high, air]. */
  bands: number[];
  /** Smoothed per-band energy (for stable pigment injection). */
  bandsSmooth: number[];
  /** Broadband RMS loudness, normalized 0..1. */
  rms: number;
  /** Bass energy (sub+low), normalized 0..1 — drives the flow amplitude. */
  bass: number;
  /** Positive spectral flux (onset energy), normalized ~0..1. */
  flux: number;
  /** Onset strength this frame after adaptive thresholding (0 when no attack). */
  onset: number;
  /** Index of the loudest band 0..4. */
  dominant: number;
}

export interface SpectralReader {
  read(): SpectralFrame;
  readonly binCount: number;
}

// Band edges as fractions of Nyquist. Piano energy is weighted low, so the
// lower registers get finer resolution than a linear split would give.
const BAND_EDGES = [0.0, 0.012, 0.045, 0.13, 0.35, 1.0];

/** Build a reader bound to an AnalyserNode. Allocates its scratch buffers once. */
export function buildSpectralReader(analyser: AnalyserNode): SpectralReader {
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.72; // slow, oceanic
  const binCount = analyser.frequencyBinCount;
  const mag = new Uint8Array(binCount);
  const prev = new Float32Array(binCount);

  const bandsSmooth = new Array<number>(BAND_COUNT).fill(0);
  let fluxAvg = 0;

  // Precompute band bin ranges.
  const ranges: Array<[number, number]> = [];
  for (let b = 0; b < BAND_COUNT; b++) {
    const lo = Math.floor(BAND_EDGES[b] * binCount);
    const hi = Math.max(lo + 1, Math.floor(BAND_EDGES[b + 1] * binCount));
    ranges.push([lo, hi]);
  }

  function read(): SpectralFrame {
    analyser.getByteFrequencyData(mag);

    const bands = new Array<number>(BAND_COUNT).fill(0);
    let sumSq = 0;
    let flux = 0;

    for (let i = 0; i < binCount; i++) {
      const m = mag[i] / 255; // 0..1
      sumSq += m * m;
      const d = m - prev[i];
      if (d > 0) flux += d; // half-wave rectified: onsets only
      prev[i] = m;
    }

    // Per-band mean energy, gently expanded so quiet piano still paints.
    let dominant = 0;
    let dominantVal = -1;
    for (let b = 0; b < BAND_COUNT; b++) {
      const [lo, hi] = ranges[b];
      let s = 0;
      for (let i = lo; i < hi; i++) s += mag[i] / 255;
      const e = Math.min(1, (s / (hi - lo)) * 1.7);
      bands[b] = e;
      bandsSmooth[b] += (e - bandsSmooth[b]) * 0.14;
      if (bandsSmooth[b] > dominantVal) {
        dominantVal = bandsSmooth[b];
        dominant = b;
      }
    }

    const rms = Math.min(1, Math.sqrt(sumSq / binCount) * 3.4);
    const bass = Math.min(1, (bandsSmooth[0] + bandsSmooth[1]) * 0.7);
    const fluxN = Math.min(1, (flux / binCount) * 22);

    // Adaptive onset: flux above its slow-moving baseline is an attack.
    fluxAvg += (fluxN - fluxAvg) * 0.06;
    const onset = Math.max(0, fluxN - fluxAvg * 1.4 - 0.01);

    return {
      bands,
      bandsSmooth: bandsSmooth.slice(),
      rms,
      bass,
      flux: fluxN,
      onset,
      dominant,
    };
  }

  return { read, binCount };
}
