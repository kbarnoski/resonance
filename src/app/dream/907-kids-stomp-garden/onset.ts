// Spectral-flux onset detection on the live mic stream.
// We detect RHYTHM (transients: claps / stomps / taps / "buh-tss"), NOT pitch.
// Pitch is never estimated. We only read a spectral *centroid* to pick a
// percussion timbre (low = thump, high = shaker). The mic is never recorded.
//
// Reference: spectral-flux onset detection (Bello et al., "A Tutorial on Onset
// Detection in Music Signals", IEEE TASLP 2005).

export interface Onset {
  velocity: number; // 0..1, normalized & clamped
  centroid: number; // 0..1 brightness, only used to pick timbre
}

export interface OnsetDetector {
  poll: () => Onset | null;
}

export function createOnsetDetector(
  ctx: AudioContext,
  source: AudioNode,
): OnsetDetector {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  const bins = analyser.frequencyBinCount;
  const spec = new Float32Array(bins);
  const prev = new Float32Array(bins);

  // Moving threshold state.
  let avgFlux = 0;
  let lastOnsetMs = 0;
  const REFRACTORY_MS = 120; // min gap between beats
  const nyquist = ctx.sampleRate / 2;

  return {
    poll(): Onset | null {
      analyser.getFloatFrequencyData(spec); // dB values

      // Spectral flux: sum of positive changes across bins (half-wave rect).
      let flux = 0;
      let energy = 0;
      let centroidNum = 0;
      let centroidDen = 0;
      for (let i = 1; i < bins; i++) {
        // Convert dB to a bounded linear-ish magnitude.
        const mag = Math.max(0, spec[i] + 100) / 100; // ~0..1
        const diff = mag - prev[i];
        if (diff > 0) flux += diff;
        prev[i] = mag;

        energy += mag;
        centroidNum += i * mag;
        centroidDen += mag;
      }

      const now = performance.now();
      const threshold = avgFlux * 1.7 + 0.6; // adaptive
      // Slow-moving average of flux.
      avgFlux = avgFlux * 0.92 + flux * 0.08;

      const isOnset =
        flux > threshold &&
        energy > 2 &&
        now - lastOnsetMs > REFRACTORY_MS;

      if (!isOnset) return null;
      lastOnsetMs = now;

      const velocity = Math.min(1, flux / (threshold * 2.4));
      const centroidBin = centroidDen > 0 ? centroidNum / centroidDen : 0;
      const centroidHz = (centroidBin / bins) * nyquist;
      const centroid = Math.min(1, centroidHz / 4000);

      return { velocity, centroid };
    },
  };
}
