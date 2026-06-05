// pitch.ts — analysis-only live mic pitch detection (a YIN-style autocorrelation
// estimator). The mic is NEVER recorded, stored, uploaded, or routed to any
// audio destination — the MediaStreamSource feeds ONLY an AnalyserNode whose
// time-domain buffer we read each frame. Nothing leaves the device.

export interface MicPitch {
  /** Read the current fundamental in Hz, or null if no clear pitch. */
  read: () => number | null;
  /** Stop the mic tracks and detach the graph. */
  dispose: () => void;
}

/** Attach the mic to an existing AudioContext for analysis only.
 *  Must be called from inside the Start-tap handler (iOS getUserMedia rule). */
export async function startMic(ctx: AudioContext): Promise<MicPitch> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  // IMPORTANT: source → analyser ONLY. We never connect analyser to the
  // destination, so the mic is purely analysed, never heard or recorded.
  source.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  const sampleRate = ctx.sampleRate;

  function read(): number | null {
    analyser.getFloatTimeDomainData(buf);
    return detectPitch(buf, sampleRate);
  }

  function dispose() {
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((tr) => tr.stop());
  }

  return { read, dispose };
}

// ── autocorrelation pitch detector ───────────────────────────────────────────
// Classic normalized autocorrelation with a parabolic-ish peak pick. Tuned for
// a child's hum (≈180–900 Hz) and biased toward stability over precision.
const MIN_HZ = 120;
const MAX_HZ = 1000;

function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const n = buf.length;

  // RMS gate: ignore silence / room noise.
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return null;

  const maxLag = Math.floor(sampleRate / MIN_HZ);
  const minLag = Math.floor(sampleRate / MAX_HZ);

  let bestLag = -1;
  let bestCorr = 0;
  let lastCorr = 1;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) {
      corr += buf[i] * buf[i + lag];
    }
    corr /= n - lag;

    // pick the first strong local-max after correlation starts falling — this
    // favours the true fundamental over higher-octave aliases.
    if (corr > 0.9 * bestCorr && corr > lastCorr) {
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    lastCorr = corr;
  }

  if (bestLag <= 0 || bestCorr < 0.01) return null;

  // parabolic interpolation around the peak for sub-sample accuracy
  const y0 = correlationAt(buf, bestLag - 1, n);
  const y1 = bestCorr;
  const y2 = correlationAt(buf, bestLag + 1, n);
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const refinedLag = bestLag + Math.max(-1, Math.min(1, shift));

  const hz = sampleRate / refinedLag;
  if (hz < MIN_HZ || hz > MAX_HZ) return null;
  return hz;
}

function correlationAt(buf: Float32Array, lag: number, n: number): number {
  if (lag <= 0 || lag >= n) return 0;
  let corr = 0;
  for (let i = 0; i < n - lag; i++) corr += buf[i] * buf[i + lag];
  return corr / (n - lag);
}
