// ─────────────────────────────────────────────────────────────────────────────
// mic.ts — the VOICE as controller. Acquire the mic and extract two slow
// control signals from the singer: loudness (RMS, auto-ranged into [0,1]) and
// pitch (fundamental in Hz, by autocorrelation). The choir answers these.
//
//   The mic is a pure measurement tap — it is NEVER routed to the speakers, so
//   there is no feedback and nothing is recorded or sent anywhere. What you hear
//   is the darkness singing back: an octave-stacked Shepard choir lifting off
//   your note (see audio.ts), not your own voice played through the room.
//
//   If the mic is denied or absent we return a SYNTHETIC voice — a slow hum that
//   swells and drifts across a pentatonic set — so the choir is never silent and
//   always has a note to climb from. Both modes share one interface, so the
//   caller never has to branch on permission state for liveness.
// ─────────────────────────────────────────────────────────────────────────────

export type VoiceMode = "mic" | "auto";

export interface VoiceFrame {
  /** Smoothed loudness in [0,1] (auto-ranged to the room). */
  loudness: number;
  /** Detected fundamental in Hz, or null when too quiet / unvoiced. */
  pitch: number | null;
}

export interface VoiceRig {
  /** Read the current control frame. Cheap; call once per animation frame. */
  read(): VoiceFrame;
  /** Real mic, or the synthetic self-play fallback. */
  mode: VoiceMode;
  /** Disconnect nodes and stop mic tracks. Does not close the ctx. */
  stop(): void;
}

interface StartOptions {
  /** Shared AudioContext (one clock for measurement + synthesis). */
  ctx: AudioContext;
}

// A calm pentatonic set (A minor pentatonic, one octave) for the auto voice to
// drift across, so the self-play choir wanders musically instead of gliding.
const AUTO_SCALE_HZ = [220.0, 261.63, 293.66, 329.63, 392.0];

/**
 * Autocorrelation pitch detector with parabolic interpolation. Returns the
 * fundamental in Hz, or null if the frame is too quiet or has no clear period.
 */
function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.008) return null; // essentially silence / breath

  // Only search lags in the vocal range (~70 Hz to ~700 Hz).
  const minLag = Math.floor(sampleRate / 700);
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / 70));

  let bestLag = -1;
  let bestCorr = 0;
  let foundDip = false;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < size - lag; i++) corr += buf[i] * buf[i + lag];
    corr /= size - lag;
    // Wait until correlation first dips before hunting the peak — avoids
    // locking onto lag 0's trivial self-similarity.
    if (!foundDip && corr < 0) foundDip = true;
    if (foundDip && corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestCorr < 0.01) return null;

  // Parabolic interpolation around the peak for sub-sample accuracy.
  let refined = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const dEval = (lag: number): number => {
      let c = 0;
      for (let i = 0; i < size - lag; i++) c += buf[i] * buf[i + lag];
      return c / (size - lag);
    };
    const y0 = dEval(bestLag - 1);
    const y1 = bestCorr;
    const y2 = dEval(bestLag + 1);
    const denom = y0 - 2 * y1 + y2;
    if (denom !== 0) refined = bestLag + (0.5 * (y0 - y2)) / denom;
  }
  const freq = sampleRate / refined;
  return Number.isFinite(freq) && freq > 60 && freq < 800 ? freq : null;
}

export async function startVoice({ ctx }: StartOptions): Promise<VoiceRig> {
  // ── Synthetic fallback: a slow hum that swells and drifts pitch ────────────
  const makeAuto = (): VoiceRig => {
    const start = ctx.currentTime;
    return {
      mode: "auto",
      read(): VoiceFrame {
        const t = ctx.currentTime - start;
        // Loudness: a slow ~7/min swell crossed with a gentler ripple.
        const swell = 0.5 * (1 - Math.cos((2 * Math.PI * t * 7) / 60));
        const ripple = 0.5 * (1 - Math.cos(2 * Math.PI * t * 0.11));
        const loudness = Math.min(1, 0.15 + 0.7 * swell * (0.7 + 0.3 * ripple));
        // Pitch drifts across the scale, changing note every ~9 s, and only
        // "voices" while the swell is up (so voices spawn on the swells).
        const idx = Math.floor(t / 9) % AUTO_SCALE_HZ.length;
        const pitch = loudness > 0.32 ? AUTO_SCALE_HZ[idx] : null;
        return { loudness, pitch };
      },
      stop() {
        /* nothing to release */
      },
    };
  };

  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return makeAuto();
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch {
    return makeAuto();
  }

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.4;
  source.connect(analyser);
  // Deliberately NOT connected onward — a measurement tap only, never to output.

  const buf = new Float32Array(analyser.fftSize);

  // Loudness smoothing + auto-ranging: singers/mics vary hugely, so we track a
  // slow floor/ceiling and normalise the RMS into it.
  let env = 0;
  let lo = 0.001;
  let hi = 0.02;
  let last = ctx.currentTime;
  // Hold the last confident pitch briefly so short unvoiced gaps don't drop it.
  let heldPitch: number | null = null;
  let heldUntil = 0;

  const read = (): VoiceFrame => {
    const now = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;

    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);

    // Asymmetric smoothing: quick to bloom on a held note, slow to release.
    const tc = rms > env ? 0.12 : 0.5;
    const a = 1 - Math.exp(-dt / tc);
    env += (rms - env) * a;

    // Track range slowly; relax gently so one loud note doesn't widen forever.
    lo += (Math.min(lo, env) - lo) * (1 - Math.exp(-dt / 5));
    hi += (Math.max(hi, env) - hi) * (1 - Math.exp(-dt / 5));
    lo += (env - lo) * (1 - Math.exp(-dt / 22)) * 0.15;
    hi += (env - hi) * (1 - Math.exp(-dt / 22)) * 0.15;
    const span = Math.max(hi - lo, 0.003);
    let loudness = (env - lo) / span;
    if (!Number.isFinite(loudness)) loudness = 0;
    loudness = Math.min(1, Math.max(0, loudness));

    const nowMs = performance.now();
    const p = detectPitch(buf, ctx.sampleRate);
    if (p !== null) {
      heldPitch = p;
      heldUntil = nowMs + 250; // hold ~250 ms across unvoiced dips
    } else if (nowMs > heldUntil) {
      heldPitch = null;
    }

    return { loudness, pitch: heldPitch };
  };

  let stopped = false;
  return {
    mode: "mic",
    read,
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        source.disconnect();
      } catch {
        /* already gone */
      }
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
