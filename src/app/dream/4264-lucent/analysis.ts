// analysis.ts — live spectral feature extraction for 4264-lucent.
//
// One AnalyserNode feeds the whole piece. Each animation frame we pull a fresh
// magnitude spectrum and reduce it to three perceptual features that drive the
// lightscape:
//
//   • spectralCentroid  — the spectrum's "center of mass" in [0,1]. Grey &
//     Gordon (1978) established centroid as the primary correlate of perceived
//     timbral BRIGHTNESS, so we map it to HUE along the violet ramp and to the
//     vertical position of new light.
//   • rms                — broadband loudness in [0,1] → deposit brightness+size.
//   • flux               — positive spectral flux (Bello et al. 2005), i.e. the
//     rectified frame-to-frame magnitude increase. A loud attack spikes flux,
//     which we turn into a BURST of new plumes.
//
// The exact same feature contract is produced whether the source is Karel's
// real piano or the synth fallback — the visuals never know which.

export interface SpectralFrame {
  /** Spectral centroid, normalized 0..1 (0 = dark/low, 1 = bright/high). */
  centroid: number;
  /** Broadband RMS loudness, normalized 0..1. */
  rms: number;
  /** Positive spectral flux (onset energy), normalized ~0..1. */
  flux: number;
  /** Smoothed centroid — used for stable hue drift. */
  centroidSmooth: number;
}

export interface SpectralReader {
  read(): SpectralFrame;
  readonly binCount: number;
}

/** Build a reader bound to an AnalyserNode. Allocates its scratch buffers once. */
export function buildSpectralReader(analyser: AnalyserNode): SpectralReader {
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;
  const binCount = analyser.frequencyBinCount;
  const mag = new Uint8Array(binCount);
  const prev = new Float32Array(binCount);
  let centroidSmooth = 0.5;

  // Nyquist-relative bin frequencies (0..1) for the centroid weighting.
  const binFreq = new Float32Array(binCount);
  for (let i = 0; i < binCount; i++) binFreq[i] = i / (binCount - 1);

  function read(): SpectralFrame {
    analyser.getByteFrequencyData(mag);

    let weighted = 0;
    let total = 0;
    let sumSq = 0;
    let flux = 0;

    for (let i = 0; i < binCount; i++) {
      const m = mag[i] / 255; // 0..1
      weighted += m * binFreq[i];
      total += m;
      sumSq += m * m;
      const d = m - prev[i];
      if (d > 0) flux += d; // half-wave rectified: onsets only
      prev[i] = m;
    }

    const centroid = total > 1e-4 ? weighted / total : 0.5;
    // RMS across the (normalized) spectrum, gently expanded so quiet piano
    // still paints without the field going dark.
    const rms = Math.min(1, Math.sqrt(sumSq / binCount) * 3.2);
    // Flux normalized by bin count; scaled into a usable 0..~1 range.
    const fluxN = Math.min(1, (flux / binCount) * 22);

    centroidSmooth += (centroid - centroidSmooth) * 0.08;

    return { centroid, rms, flux: fluxN, centroidSmooth };
  }

  return { read, binCount };
}
