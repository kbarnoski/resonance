/**
 * mic.ts — microphone loudness (RMS) envelope, NOT pitch detection.
 *
 * We only care HOW LOUD a child blows or hums, never WHAT note. We read
 * the time-domain waveform from an AnalyserNode, compute RMS, and smooth it
 * with a one-pole follower (fast attack so the tower responds instantly,
 * slow release so it shimmers and "breathes" as input fades).
 *
 * Web Audio API only.
 */

export interface MicRig {
  stream: MediaStream;
  analyser: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
}

/**
 * Request the mic and wire an analyser into the given AudioContext.
 * Throws on denial / unavailability — the caller shows the error and falls
 * back to the synthetic auto-demo. We never silently hide failures.
 */
export async function makeMic(ctx: AudioContext): Promise<MicRig> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone not available in this browser.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const src = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.2;
  src.connect(analyser);
  // NOTE: analyser is NOT connected to destination — no mic monitoring/feedback.
  const buf = new Float32Array(analyser.fftSize);
  return { stream, analyser, buf };
}

/** Raw RMS of the current mic frame, 0..~1. */
export function readRms(mic: MicRig): number {
  mic.analyser.getFloatTimeDomainData(mic.buf);
  let sum = 0;
  for (let i = 0; i < mic.buf.length; i++) {
    const v = mic.buf[i];
    sum += v * v;
  }
  return Math.sqrt(sum / mic.buf.length);
}

/** One-pole smoothing follower with fast attack, slow release. */
export function applyFollow(prev: number, target: number): number {
  const a = target > prev ? 0.45 : 0.06; // attack vs release coefficients
  return prev + (target - prev) * a;
}

/** Stop the mic stream cleanly. */
export function stopMic(mic: MicRig): void {
  mic.stream.getTracks().forEach((t) => t.stop());
}
