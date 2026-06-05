// Microphone voice analysis — ANALYSIS ONLY.
//
// The mic is never recorded, stored, played back, or transmitted. We open a
// stream, run it through an AnalyserNode (which is NOT connected to the
// destination), read frames inside requestAnimationFrame, and stop all tracks
// on teardown. Nothing leaves the page.
//
// We extract two things from a sung/hummed voice:
//   * RMS loudness 0..1  -> growth speed / how much light
//   * Pitch in Hz        -> WHERE light appears (higher pitch = higher sky)
// Pitch uses normalized autocorrelation on the time-domain signal, which tracks
// a sustained sung note far more reliably than a spectral centroid.

export interface VoiceFrame {
  /** Smoothed RMS loudness, 0..1. */
  loudness: number;
  /** Detected fundamental in Hz, or 0 if no confident pitch (silence/noise). */
  pitchHz: number;
  /** True while voicing (loud enough + confident pitch). */
  voiced: boolean;
}

export interface VoiceHandle {
  /** Pass the SHARED AudioContext so mic + synth share one clock. */
  start: (ctx: AudioContext) => Promise<void>;
  stop: () => void;
  getFrame: () => VoiceFrame;
  isLive: () => boolean;
}

const MIN_HZ = 80; // below a child's hum
const MAX_HZ = 1200; // above a child's sing
const LOUD_GATE = 0.012; // RMS below this = treat as silence

export function createVoice(): VoiceHandle {
  let stream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let ctxRef: AudioContext | null = null;
  let buf: Float32Array | null = null;

  let smoothLoud = 0;
  let smoothPitch = 0;
  let live = false;

  async function start(ctx: AudioContext) {
    if (live) return;
    const s = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true, // a touch of EC is fine — we only analyse
        noiseSuppression: true,
        autoGainControl: false,
      },
    });
    stream = s;
    ctxRef = ctx;
    const source = ctx.createMediaStreamSource(s);
    const an = ctx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0;
    analyser = an;
    buf = new Float32Array(new ArrayBuffer(an.fftSize * 4));
    source.connect(an);
    // NOTE: analyser is intentionally NOT connected to ctx.destination — no
    // feedback, no playback of the mic. Analysis only.
    live = true;
  }

  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    ctxRef = null;
    buf = null;
    live = false;
    smoothLoud = 0;
    smoothPitch = 0;
  }

  function getFrame(): VoiceFrame {
    if (!analyser || !buf || !ctxRef) {
      return { loudness: 0, pitchHz: 0, voiced: false };
    }
    analyser.getFloatTimeDomainData(
      buf as unknown as Float32Array<ArrayBuffer>,
    );
    const n = buf.length;

    // RMS loudness.
    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / n);
    // Map RMS to a friendly 0..1 (sung voice rarely exceeds ~0.3 rms).
    const loudRaw = Math.min(1, rms / 0.18);
    smoothLoud = smoothLoud * 0.7 + loudRaw * 0.3;

    let pitchHz = 0;
    if (rms > LOUD_GATE) {
      pitchHz = detectPitch(buf, ctxRef.sampleRate);
    }
    if (pitchHz > 0) {
      // Glide toward the detected pitch (octave-jump tolerant smoothing).
      if (smoothPitch === 0) smoothPitch = pitchHz;
      else {
        const ratio = pitchHz / smoothPitch;
        // Reject single-frame octave errors.
        if (ratio > 0.49 && ratio < 2.02) {
          smoothPitch = smoothPitch * 0.8 + pitchHz * 0.2;
        }
      }
    } else {
      // Decay pitch toward 0 when unvoiced so light stops appearing.
      smoothPitch *= 0.9;
      if (smoothPitch < MIN_HZ) smoothPitch = 0;
    }

    const voiced = smoothLoud > 0.06 && smoothPitch >= MIN_HZ;
    return {
      loudness: smoothLoud,
      pitchHz: voiced ? smoothPitch : 0,
      voiced,
    };
  }

  return { start, stop, getFrame, isLive: () => live };
}

/** Normalized autocorrelation pitch detection (ACF / "MPM-lite"). */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / MIN_HZ));
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_HZ));

  // Energy normaliser.
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (energy < 1e-6) return 0;

  let bestLag = -1;
  let bestCorr = 0;
  let prev = 0;
  let rising = false;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) corr += buf[i] * buf[i + lag];
    corr /= energy;

    // Pick the FIRST strong peak after the correlation starts rising — this
    // avoids latching onto a higher harmonic / sub-octave.
    if (corr > prev) rising = true;
    if (rising && corr < prev && prev > 0.6) {
      bestLag = lag - 1;
      bestCorr = prev;
      break;
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
    prev = corr;
  }

  if (bestLag <= 0 || bestCorr < 0.6) return 0;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  const lag = bestLag;
  const c0 = acfAt(buf, lag - 1, n);
  const c1 = acfAt(buf, lag, n);
  const c2 = acfAt(buf, lag + 1, n);
  const denom = c0 - 2 * c1 + c2;
  const shift = denom !== 0 ? (0.5 * (c0 - c2)) / denom : 0;
  const refined = lag + shift;
  const hz = sampleRate / refined;
  if (hz < MIN_HZ || hz > MAX_HZ) return 0;
  return hz;
}

function acfAt(buf: Float32Array, lag: number, n: number): number {
  if (lag < 1) return 0;
  let corr = 0;
  for (let i = 0; i < n - lag; i++) corr += buf[i] * buf[i + lag];
  return corr;
}
