// ─────────────────────────────────────────────────────────────────────────────
// mic.ts — the REAL sensor. Opens the microphone on the shared AudioContext and
// exposes per-frame loudness (RMS → magnetic field strength), spectral centroid
// (brightness → spike sharpness / lattice spacing) and onsets (→ ripples).
// Not connected to the destination — analysis only, no feedback.
// ─────────────────────────────────────────────────────────────────────────────

export interface MicReading {
  /** RMS loudness 0..1 (perceptual, lightly compressed). */
  rms: number;
  /** Spectral centroid in Hz. */
  centroid: number;
  /** True on a transient onset this frame. */
  onset: boolean;
}

export interface MicHandle {
  read(): MicReading;
  stop(): void;
}

/** Attach mic analysis to an existing AudioContext. Throws if getUserMedia fails. */
export async function attachMic(ctx: AudioContext): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  source.connect(analyser); // NOT to destination

  const timeBuf = new Float32Array(analyser.fftSize);
  const freqBuf = new Float32Array(
    new ArrayBuffer(analyser.frequencyBinCount * 4),
  );
  const fluxHist: number[] = [];
  let lastMag: number[] = [];
  let lastOnsetAt = 0;
  let smoothRms = 0;

  const read = (): MicReading => {
    analyser.getFloatTimeDomainData(
      timeBuf as unknown as Float32Array<ArrayBuffer>,
    );
    analyser.getFloatFrequencyData(
      freqBuf as unknown as Float32Array<ArrayBuffer>,
    );

    // RMS loudness
    let sum = 0;
    for (let i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
    const rmsRaw = Math.sqrt(sum / timeBuf.length);
    // perceptual-ish compression + smoothing
    const rms = Math.min(1, Math.pow(rmsRaw * 6.0, 0.6));
    smoothRms = smoothRms * 0.7 + rms * 0.3;

    // Spectral centroid + flux
    const binHz = ctx.sampleRate / analyser.fftSize;
    let wSum = 0;
    let mSum = 0;
    let flux = 0;
    const mag: number[] = new Array(freqBuf.length);
    for (let b = 1; b < freqBuf.length; b++) {
      const lin = Math.pow(10, freqBuf[b] / 20);
      mag[b] = lin;
      wSum += b * binHz * lin;
      mSum += lin;
      if (lastMag.length) flux += Math.max(0, lin - lastMag[b]);
    }
    lastMag = mag;
    const centroid = mSum > 1e-6 ? wSum / mSum : 0;

    const hist = fluxHist;
    hist.push(flux);
    if (hist.length > 43) hist.shift();
    const avg = hist.reduce((x, y) => x + y, 0) / Math.max(1, hist.length);
    const nowMs = performance.now();
    let onset = false;
    if (flux > avg * 1.7 && flux > 1e-4 && nowMs - lastOnsetAt > 130) {
      onset = true;
      lastOnsetAt = nowMs;
    }

    return { rms: smoothRms, centroid, onset };
  };

  const stop = () => {
    stream.getTracks().forEach((t) => t.stop());
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {
      /* gone */
    }
  };

  return { read, stop };
}
