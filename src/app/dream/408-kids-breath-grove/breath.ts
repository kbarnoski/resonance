/**
 * breath.ts — breath-cycle detection via AudioContext + AnalyserNode.
 * Fires ONE event per exhale with duration + strength.
 * Auto-calibrates to a child's quiet breath via running noise-floor EMA.
 * Analysis only — audio never recorded or uploaded.
 */

export interface BreathEvent {
  duration: number;  // seconds
  strength: number;  // 0..1 average RMS during exhale
}

export interface BreathDetectorOptions {
  onBreath: (evt: BreathEvent) => void;
  onRms?: (rms: number) => void;
}

const FFT_SIZE = 1024;
const FLOOR_ALPHA = 0.002;     // EMA speed for noise-floor tracking (slow)
const MARGIN = 0.012;          // how much above noise floor = breath
const MIN_EXHALE_S = 0.6;      // minimum exhale duration in seconds
const DEBOUNCE_S = 0.8;        // lockout after exhale detected
const SMOOTHING = 0.15;        // RMS smoothing alpha (IIR)
const MAX_GAIN = 12;           // max noise-floor amplification

export interface BreathDetector {
  getRms: () => number;
  destroy: () => void;
}

export function createBreathDetector(
  actx: AudioContext,
  stream: MediaStream,
  opts: BreathDetectorOptions,
): BreathDetector {
  const analyser = actx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;

  const src = actx.createMediaStreamSource(stream);
  src.connect(analyser);

  const buf = new Float32Array(FFT_SIZE);

  let smoothRms = 0;
  let noiseFloor = 0.012;
  let inExhale = false;
  let exhaleStart = 0;
  let exhaleSum = 0;
  let exhaleFrames = 0;
  let debounceUntil = 0;
  let rafId = 0;
  let currentRms = 0;

  const poll = () => {
    const now = actx.currentTime;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const raw = Math.sqrt(sum / buf.length);

    // IIR smoothing
    smoothRms = smoothRms + SMOOTHING * (raw - smoothRms);

    // Update noise floor (slow EMA of the quiet minimum)
    if (smoothRms < noiseFloor || noiseFloor === 0) {
      noiseFloor = noiseFloor + FLOOR_ALPHA * (smoothRms - noiseFloor);
    } else {
      // Drift floor up very slowly so long silences recalibrate
      noiseFloor = noiseFloor + FLOOR_ALPHA * 0.1 * (smoothRms - noiseFloor);
    }

    // Adaptive threshold = floor + margin, amplified for quiet children
    const gain = Math.min(MAX_GAIN, 0.018 / Math.max(noiseFloor, 0.001));
    const threshold = noiseFloor + MARGIN / gain;

    currentRms = smoothRms;
    opts.onRms?.(smoothRms);

    if (now < debounceUntil) {
      rafId = requestAnimationFrame(poll);
      return;
    }

    if (!inExhale && smoothRms > threshold) {
      inExhale = true;
      exhaleStart = now;
      exhaleSum = 0;
      exhaleFrames = 0;
    }

    if (inExhale) {
      exhaleSum += smoothRms;
      exhaleFrames++;

      if (smoothRms <= threshold * 0.7) {
        // Exhale ended
        const duration = now - exhaleStart;
        if (duration >= MIN_EXHALE_S) {
          const strength = Math.min(1, (exhaleSum / exhaleFrames) / 0.08);
          opts.onBreath({ duration, strength });
          debounceUntil = now + DEBOUNCE_S;
        }
        inExhale = false;
      }
    }

    rafId = requestAnimationFrame(poll);
  };

  rafId = requestAnimationFrame(poll);

  return {
    getRms: () => currentRms,
    destroy: () => {
      cancelAnimationFrame(rafId);
      src.disconnect();
      // Stop mic tracks
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
