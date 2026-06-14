// ─────────────────────────────────────────────────────────────────────────────
// detect.ts — BREATH-ENERGY blow detection (NOT pitch / NOT voice).
//
// A 4-year-old blowing into the mic produces a BROADBAND, NOISE-LIKE signal:
// lots of energy spread across the whole spectrum with NO strong tonal peak.
// A yell or sung note (which we want to REJECT) is TONAL: energy concentrates
// at a fundamental + harmonics, so the spectrum is "peaky" and not flat.
//
// We score each frame on three things, then gate:
//   1. energy        — is there enough signal at all? (broadband loudness)
//   2. flatness      — spectral flatness (geo mean / arith mean). High = noise.
//   3. peakiness     — ratio of the strongest bin to the average. Low = no tone.
//
// blowStrength (0..1) = energy mapped above the floor, gated by flatness/peak,
// with asymmetric smoothing (fast attack so the kid sees instant response,
// slow release so it doesn't flicker). A short sustain memory keeps it alive
// between breath puffs.
// ─────────────────────────────────────────────────────────────────────────────

export interface BlowFrame {
  /** Smoothed 0..1 blow strength to drive visuals + inflation. */
  strength: number;
  /** True the moment a sustained blow is happening (above gate). */
  blowing: boolean;
  /** Raw broadband energy this frame (debug / gauge). */
  energy: number;
  /** Spectral flatness 0..1 (1 = pure noise, 0 = pure tone). */
  flatness: number;
  /** Peakiness — high means a tonal voice/yell (we reject those). */
  peakiness: number;
}

export interface BlowDetectorOptions {
  /** Minimum broadband energy before we consider it a blow. */
  energyFloor?: number;
  /** Flatness above this counts as noise-like (breath). 0..1. */
  flatnessMin?: number;
  /** Peakiness above this is treated as a tonal yell/voice → rejected. */
  peakinessMax?: number;
  /** Attack smoothing (per-frame lerp toward target when rising). */
  attack?: number;
  /** Release smoothing (per-frame lerp toward target when falling). */
  release?: number;
}

const DEFAULTS: Required<BlowDetectorOptions> = {
  energyFloor: 0.06,
  flatnessMin: 0.3,
  peakinessMax: 9.0,
  attack: 0.55,
  release: 0.085,
};

/**
 * makeBlowDetector — pure analysis state machine. Feed it an AnalyserNode's
 * float frequency data (dB) each frame; it returns a BlowFrame. NOT a hook.
 */
export function makeBlowDetector(opts: BlowDetectorOptions = {}) {
  const o = { ...DEFAULTS, ...opts };
  let strength = 0;
  // Sustain memory: timestamp of last real blow (ms).
  let lastBlowAt = -1e9;

  /**
   * @param freqDb      Float32Array of dB values from getFloatFrequencyData.
   * @param sampleRate  ctx.sampleRate
   * @param fftSize     analyser.fftSize
   * @param now         performance.now()
   */
  function update(
    freqDb: Float32Array,
    sampleRate: number,
    fftSize: number,
    now: number
  ): BlowFrame {
    const binHz = sampleRate / fftSize;
    // Focus the breath analysis on the band where blow energy lives and where
    // a voice fundamental + low harmonics would show up: ~120Hz..6kHz.
    // (Below ~120Hz is rumble/handling; above 6kHz adds little for breath.)
    const loBin = Math.max(1, Math.floor(120 / binHz));
    const hiBin = Math.min(freqDb.length - 1, Math.ceil(6000 / binHz));

    let sumLin = 0; // arithmetic mean of magnitudes
    let sumLogLin = 0; // for geometric mean (spectral flatness)
    let peak = 0;
    let count = 0;

    for (let b = loBin; b < hiBin; b++) {
      // dB → linear magnitude. Floor very quiet bins so log() stays sane.
      const db = freqDb[b];
      const lin = Math.pow(10, db / 20) + 1e-7;
      sumLin += lin;
      sumLogLin += Math.log(lin);
      if (lin > peak) peak = lin;
      count++;
    }

    const arithMean = sumLin / count;
    const geoMean = Math.exp(sumLogLin / count);
    // Spectral flatness ∈ (0,1]. Noise → near 1; pure tone → near 0.
    const flatness = Math.max(0, Math.min(1, geoMean / (arithMean + 1e-9)));
    // Peakiness: how much the strongest bin dominates the average. A tonal
    // yell spikes this; broadband breath keeps it low.
    const peakiness = peak / (arithMean + 1e-9);

    // Energy: map mean magnitude to a friendly 0..1. Breath is loud & broad,
    // so the arithmetic mean across the band is a decent loudness proxy.
    // Magnitudes are tiny; scale + soft-knee compress via log.
    const energy = Math.max(
      0,
      Math.min(1, Math.log10(arithMean / 1e-4 + 1) * 0.45)
    );

    // ── The gate ──────────────────────────────────────────────────────────
    // A real blow: enough energy AND noise-like (flat) AND NOT peaky/tonal.
    const isNoiseLike = flatness >= o.flatnessMin;
    const isNotTonal = peakiness <= o.peakinessMax;
    const loudEnough = energy >= o.energyFloor;
    const rawBlow = loudEnough && isNoiseLike && isNotTonal;

    if (rawBlow) lastBlowAt = now;
    // Sustain: stay "blowing" for a short grace window so visuals don't flicker
    // between breath puffs.
    const blowing = now - lastBlowAt < 140;

    // Target strength scales with energy but only while gate passes. Map energy
    // above the floor → 0..1 so the gauge fills nicely.
    const target = rawBlow
      ? Math.max(
          0,
          Math.min(1, (energy - o.energyFloor) / (0.9 - o.energyFloor))
        )
      : 0;

    // Asymmetric smoothing.
    const k = target > strength ? o.attack : o.release;
    strength += (target - strength) * k;
    if (strength < 0.001) strength = 0;

    return { strength, blowing, energy, flatness, peakiness };
  }

  function reset() {
    strength = 0;
    lastBlowAt = -1e9;
  }

  return { update, reset };
}

export type BlowDetector = ReturnType<typeof makeBlowDetector>;
