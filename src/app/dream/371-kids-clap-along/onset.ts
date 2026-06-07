// Real-time acoustic ONSET detector for the clap-along.
// ────────────────────────────────────────────────────────────────────────────
// The lab-first technique: detect a hand-clap from the live microphone by
// watching for a sudden broadband energy spike in the FFT. A clap is a sharp
// transient — almost all frequencies jump at once for a few milliseconds. We
// quantify that with HIGH-FREQUENCY CONTENT (HFC) and SPECTRAL FLUX:
//
//   per analysis frame (one AnalyserNode FFT read):
//     1. read the magnitude spectrum (frequencyBinCount bins, dB → linear)
//     2. SPECTRAL FLUX  = sum of POSITIVE bin-to-bin increases vs the previous
//        frame. Rising energy only (half-wave rectified) so a decaying tail
//        does not re-trigger. This is the classic onset novelty function.
//     3. HFC weighting   = weight each bin by its index k, so high-frequency
//        energy (the bright "snap" of a clap) counts more than low rumble.
//        Combining flux × HFC makes a sharp broadband transient pop while
//        steady tones / voice / pad drone stay low.
//     4. ADAPTIVE THRESHOLD = a slow running mean of the novelty plus a margin
//        and a slack multiplier. A clap must exceed (mean * mult + floor) to
//        count, so the detector self-tunes to room noise instead of a fixed
//        level that fails in a loud or quiet room.
//     5. REFRACTORY WINDOW (~140 ms) — after a detected onset we ignore further
//        onsets so a single clap's body / a double-bounce counts ONCE. Tuned
//        forgiving: a wobbly 4-year-old clap still registers.
//
// The SAME pushSample()-style entry point is reused by the pointer-tap and
// auto-demo fallbacks via `inject()`, which feeds a synthetic transient through
// the IDENTICAL threshold + refractory machine — so every input path produces
// onsets the exact same way.

export interface Onset {
  /** time of the onset in ms (performance.now() clock). */
  timeMs: number;
  /** detector confidence / strength, ~0..1+. */
  strength: number;
}

export interface OnsetConfig {
  /** AnalyserNode FFT size (power of two). 1024 → 512 bins ≈ good time/freq. */
  fftSize: number;
  /** smoothing applied inside the AnalyserNode (we want it LOW for transients). */
  analyserSmoothing: number;
  /** running-mean follow factor for the adaptive threshold (per frame). */
  meanFollow: number;
  /** novelty must exceed mean*thresholdMult + thresholdFloor to fire. */
  thresholdMult: number;
  thresholdFloor: number;
  /** ms to ignore further onsets after one fires (debounce a single clap). */
  refractoryMs: number;
  /** fraction of bins (from the top) treated as "high frequency" for the snap. */
  hfcBand: number;
}

export const DEFAULT_ONSET: OnsetConfig = {
  fftSize: 1024,
  analyserSmoothing: 0.0, // we do our own smoothing; raw frames catch transients
  meanFollow: 0.06,
  thresholdMult: 1.7,
  thresholdFloor: 0.06,
  refractoryMs: 140,
  hfcBand: 0.55,
};

export interface OnsetDetector {
  /** Bind the SHARED analyser that every input path feeds into (the mic source
   *  AND the synthetic tap-bus both connect to it in clap-audio.ts), so one
   *  detector judges acoustic claps, pointer-taps and auto-demo identically.
   *  Call once after the audio engine + (optional) mic source are wired. */
  connect: (analyser: AnalyserNode) => void;
  /** Pull one FFT frame from the mic and test for an onset. Returns it or null.
   *  Call every animation frame. No-op (returns null) until connect()ed. */
  sampleMic: (nowMs: number) => Onset | null;
  /** Feed a SYNTHETIC transient (pointer-tap / auto-demo) into the identical
   *  threshold + refractory machine. strength ~0..1. Returns the onset or null
   *  if still inside the refractory window. */
  inject: (nowMs: number, strength: number) => Onset | null;
  /** Current normalised novelty 0..~1 (for a live "listening" meter). */
  level: () => number;
  /** Current adaptive threshold 0..~1 (for the meter). */
  threshold: () => number;
  reset: () => void;
  dispose: () => void;
}

export function createOnsetDetector(cfg: OnsetConfig = DEFAULT_ONSET): OnsetDetector {
  let analyser: AnalyserNode | null = null;
  let bins = 0;
  // backed by explicit ArrayBuffers so the (newer) AnalyserNode read signature
  // (Float32Array<ArrayBuffer>) is satisfied.
  let spec = new Float32Array(new ArrayBuffer(0)); // current linear magnitudes
  let prev = new Float32Array(new ArrayBuffer(0)); // previous frame
  let dbBuf = new Float32Array(new ArrayBuffer(0)); // raw dB read buffer

  let mean = 0; // slow running mean of the novelty (adaptive baseline)
  let lastNovelty = 0; // last normalised novelty (for the meter)
  let lastThresh = 0; // last threshold (for the meter)
  let lastOnsetMs = -1e9;

  // novelty is normalised by a slow running PEAK so the meter and threshold
  // logic live in a comparable ~0..1 range across very different mic gains.
  let peak = 1e-4;

  function connect(a: AnalyserNode): void {
    // We do NOT create the analyser here — clap-audio.ts owns the SHARED one so
    // that synthetic taps routed into it are detected too. We just read from it.
    analyser = a;
    bins = a.frequencyBinCount;
    spec = new Float32Array(new ArrayBuffer(bins * 4));
    prev = new Float32Array(new ArrayBuffer(bins * 4));
    dbBuf = new Float32Array(new ArrayBuffer(bins * 4));
  }

  // Shared core: given a raw novelty value, run the adaptive-threshold +
  // refractory machine. Returns an onset or null. Used by BOTH the mic path
  // and the inject() fallback so every input is judged identically.
  function judge(novelty: number, nowMs: number): Onset | null {
    // normalise against a slow peak follower so values sit ~0..1
    if (novelty > peak) peak = novelty;
    else peak += (novelty - peak) * 0.0008; // very slow decay of the peak
    const n = peak > 1e-6 ? novelty / peak : 0;
    lastNovelty = n;

    const thresh = mean * cfg.thresholdMult + cfg.thresholdFloor;
    lastThresh = thresh;

    let onset: Onset | null = null;
    if (n > thresh && nowMs - lastOnsetMs >= cfg.refractoryMs) {
      lastOnsetMs = nowMs;
      // strength: how far above threshold, softly compressed
      const over = (n - thresh) / Math.max(0.08, 1 - thresh);
      onset = { timeMs: nowMs, strength: Math.max(0.15, Math.min(1.4, 0.4 + over)) };
    }

    // update the adaptive baseline. Don't let a big clap yank the mean up (it
    // would deafen us to the next clap) — adapt faster downward than upward.
    const follow = n > mean ? cfg.meanFollow * 0.5 : cfg.meanFollow;
    mean += (n - mean) * follow;

    return onset;
  }

  function sampleMic(nowMs: number): Onset | null {
    if (!analyser) return null;
    analyser.getFloatFrequencyData(dbBuf);

    // dB → linear magnitude. getFloatFrequencyData returns dB (~ -100..0).
    for (let i = 0; i < bins; i++) {
      // clamp the floor so silent bins don't explode the maths
      const db = dbBuf[i] < -100 ? -100 : dbBuf[i];
      spec[i] = Math.pow(10, db / 20);
    }

    // spectral flux × HFC weighting. Only positive changes (onsets, not decays).
    let flux = 0;
    const hfcStart = Math.floor(bins * (1 - cfg.hfcBand));
    for (let i = 1; i < bins; i++) {
      const d = spec[i] - prev[i];
      if (d > 0) {
        // HFC: weight by bin index (snap/brightness of a clap), extra weight in
        // the dedicated high band.
        const w = i + (i >= hfcStart ? i : 0);
        flux += d * w;
      }
      prev[i] = spec[i];
    }
    // bring flux into a tame range (the index weighting inflates it a lot)
    const novelty = flux / (bins * bins * 0.25);

    return judge(novelty, nowMs);
  }

  function inject(nowMs: number, strength: number): Onset | null {
    // A synthetic clap is a single big novelty spike. Push it through the SAME
    // judge() so the threshold + refractory behaviour is identical to real mic
    // onsets. We bias it comfortably above the current threshold so a deliberate
    // tap always lands, but still honours the refractory window.
    const s = Math.max(0.2, Math.min(1.4, strength));
    const spike = (mean * cfg.thresholdMult + cfg.thresholdFloor + 0.3) * (1 + s) + 0.2;
    // scale into the same normalised domain judge() expects
    const novelty = spike * peak;
    return judge(novelty, nowMs);
  }

  function reset(): void {
    mean = 0;
    lastNovelty = 0;
    lastThresh = 0;
    lastOnsetMs = -1e9;
    peak = 1e-4;
    if (prev.length) prev.fill(0);
  }

  function dispose(): void {
    try {
      analyser?.disconnect();
    } catch {
      /* ignore */
    }
    analyser = null;
  }

  return {
    connect,
    sampleMic,
    inject,
    level: () => lastNovelty,
    threshold: () => lastThresh,
    reset,
    dispose,
  };
}
