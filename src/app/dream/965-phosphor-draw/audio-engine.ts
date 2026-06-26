// Audio engine for the phosphor oscilloscope.
//
// The core idea: the shape the user draws is the audio signal. We fill a stereo
// AudioBuffer where channel 0 (left) = X coordinates and channel 1 (right) = Y
// coordinates of the resampled, normalised loop. Looping that buffer at an
// audible rate makes the loop's traversal frequency the fundamental pitch, and
// the loop's geometry its timbre. Plotting L vs R on an XY scope reproduces the
// exact shape — sound and image are one signal.
//
// Pitch is set by playbackRate so we never have to rebuild the buffer just to
// retune. Rotation/spin IS rebuilt (cheap) because it changes the signal.

import type { Pt } from "./path-geometry";

export type AudioState = {
  ctx: AudioContext;
  source: AudioBufferSourceNode;
  gain: GainNode;
  highpass: BiquadFilterNode;
  bufferLen: number; // samples in one loop of the buffer
};

const PEAK = 0.28; // master gain — keep modest, stereo XY can get loud

/**
 * Build a stereo AudioBuffer from a shape. The shape array length defines the
 * loop length in samples; playbackRate later maps that to a chosen frequency.
 */
export function buildShapeBuffer(ctx: AudioContext, shape: Pt[]): AudioBuffer {
  const n = shape.length;
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    L[i] = shape[i].x;
    R[i] = shape[i].y;
  }
  return buf;
}

/** playbackRate that makes a buffer of `bufferLen` samples loop at `freq` Hz. */
export function rateForFreq(freq: number, bufferLen: number, sampleRate: number): number {
  return (freq * bufferLen) / sampleRate;
}

/**
 * Start (or restart) playback with a given shape & frequency. Tears down any
 * previous source. Returns the live AudioState.
 */
export function startEngine(
  ctx: AudioContext,
  shape: Pt[],
  freq: number,
  prev?: AudioState | null,
): AudioState {
  // Stop previous source if present.
  if (prev) {
    try {
      prev.source.stop();
    } catch {
      /* already stopped */
    }
    prev.source.disconnect();
  }

  const buffer = buildShapeBuffer(ctx, shape);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = rateForFreq(freq, buffer.length, ctx.sampleRate);

  // Reuse gain/highpass across rebuilds if available for click-free morphs.
  const gain = prev?.gain ?? ctx.createGain();
  const highpass = prev?.highpass ?? ctx.createBiquadFilter();

  if (!prev) {
    highpass.type = "highpass";
    highpass.frequency.value = 18; // gentle DC blocker
    gain.gain.value = PEAK;
    highpass.connect(gain);
    gain.connect(ctx.destination);
  }

  source.connect(highpass);
  source.start();

  return { ctx, source, gain, highpass, bufferLen: buffer.length };
}

/** Swap to a new shape buffer without retriggering envelopes audibly. */
export function updateShape(state: AudioState, shape: Pt[], freq: number): AudioState {
  return startEngine(state.ctx, shape, freq, state);
}

/** Retune without rebuilding the buffer. */
export function setFreq(state: AudioState, freq: number): void {
  state.source.playbackRate.setTargetAtTime(
    rateForFreq(freq, state.bufferLen, state.ctx.sampleRate),
    state.ctx.currentTime,
    0.01,
  );
}

/** Smoothly set the master level (0..1 of PEAK). */
export function setLevel(state: AudioState, level: number): void {
  state.gain.gain.setTargetAtTime(level * PEAK, state.ctx.currentTime, 0.02);
}

/** Fully tear down audio. Safe to call multiple times. */
export function stopEngine(state: AudioState | null): void {
  if (!state) return;
  try {
    state.source.stop();
  } catch {
    /* noop */
  }
  state.source.disconnect();
  state.highpass.disconnect();
  state.gain.disconnect();
}
