// ─────────────────────────────────────────────────────────────────────────────
// breath.ts — mic acquisition + breath-envelope extraction.
//
//   The user's breath is the CONTROL SIGNAL, not ambient sound. We pull the
//   mic into a Web-Audio AnalyserNode, compute a per-frame RMS of the time-
//   domain waveform, then smooth it hard with asymmetric attack/release so it
//   reads as the slow swell-and-fall of breathing rather than transients.
//
//   Inhale → rising RMS swell → b climbs toward 1.
//   Exhale → falling RMS → b sinks toward 0.
//
//   If the mic is denied/absent we fall back to a ~5.5 breaths/min sine LFO so
//   the instrument always lives and sounds. getBreath() is cheap; call it once
//   per animation frame.
// ─────────────────────────────────────────────────────────────────────────────

export type BreathMode = "mic" | "auto";

export interface BreathRig {
  /** Current breath value, smoothed, in [0,1]. */
  getBreath(): number;
  /** Whether we are reading a real mic or the auto LFO fallback. */
  mode: BreathMode;
  /** Tear down: disconnect nodes, stop mic tracks. Does not close the ctx. */
  stop(): void;
}

/** Breaths per minute for the auto fallback (calm coherent-breathing pace). */
const AUTO_BPM = 5.5;

interface StartOptions {
  /** Shared AudioContext to attach the analyser to (keeps one clock). */
  ctx: AudioContext;
}

/**
 * Acquire the mic and start extracting a breath envelope. Always resolves —
 * on any mic failure it resolves with an auto-LFO rig so the caller never has
 * to branch on permission state for liveness.
 */
export async function startBreath({ ctx }: StartOptions): Promise<BreathRig> {
  // Auto fallback rig — a slow sine that swings the full [0,1] range.
  const makeAuto = (): BreathRig => {
    const start = ctx.currentTime;
    return {
      mode: "auto",
      getBreath() {
        const t = ctx.currentTime - start;
        const phase = (t * AUTO_BPM) / 60; // cycles
        // 0.5*(1 - cos) gives a smooth inhale-up / exhale-down swell in [0,1].
        return 0.5 * (1 - Math.cos(2 * Math.PI * phase));
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
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.85;
  source.connect(analyser);
  // We deliberately do NOT connect the analyser onward — the mic must never be
  // routed to the speakers (feedback). It is a pure measurement tap.

  const buf = new Float32Array(analyser.fftSize);

  // Smoothing + auto-ranging state. Breathing energy varies wildly between
  // users/mics, so we track a slow running floor/ceiling and normalise into it.
  let env = 0; // smoothed RMS
  let lo = 0.0008; // running quiet floor
  let hi = 0.01; // running loud ceiling
  let last = ctx.currentTime;

  const getBreath = (): number => {
    const now = ctx.currentTime;
    const dt = Math.min(0.1, Math.max(0, now - last));
    last = now;

    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);

    // Asymmetric smoothing: slowish rise (inhale swell), slower fall (exhale
    // tail). Time-constant based so it is frame-rate independent.
    const attackTc = 0.45;
    const releaseTc = 0.9;
    const tc = rms > env ? attackTc : releaseTc;
    const a = 1 - Math.exp(-dt / tc);
    env += (rms - env) * a;

    // Track range slowly. Floor decays up toward env when env is small;
    // ceiling decays down toward env when env is large. Keeps a sane spread.
    lo += (Math.min(lo, env) - lo) * (1 - Math.exp(-dt / 6));
    hi += (Math.max(hi, env) - hi) * (1 - Math.exp(-dt / 6));
    // Gentle relaxation so a one-off loud breath doesn't permanently widen.
    lo += (env - lo) * (1 - Math.exp(-dt / 25)) * 0.15;
    hi += (env - hi) * (1 - Math.exp(-dt / 25)) * 0.15;
    const span = Math.max(hi - lo, 0.002);

    let b = (env - lo) / span;
    if (!Number.isFinite(b)) b = 0;
    return Math.min(1, Math.max(0, b));
  };

  let stopped = false;
  return {
    mode: "mic",
    getBreath,
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
