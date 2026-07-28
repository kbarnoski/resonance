// ════════════════════════════════════════════════════════════════════════════
// Mirror Hall — dry source + impulse-response builder (3328)
//
// Two DSP jobs, both hand-rolled (no Tone.js):
//   1. renderImpulseResponse(): turn the validated image-source taps into a
//      short mono AudioBuffer that drives a Web Audio ConvolverNode.
//   2. renderPhrase(): a DRY piano-ish phrase synthesised with Karplus-Strong
//      plucked strings, so the room can always be auditioned with no mic.
// ════════════════════════════════════════════════════════════════════════════

import type { Tap } from "./acoustics";

/**
 * Assemble the impulse response from the acoustic taps. Each valid image source
 * deposits one tap (fractional delay via linear interpolation across two
 * samples). The buffer is peak-normalised so the convolver never clips.
 */
export function renderImpulseResponse(
  ctx: BaseAudioContext,
  taps: Tap[],
  durationSec = 0.6,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sr * durationSec));
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  let peak = 0;
  for (const tap of taps) {
    const s = tap.delay * sr;
    const i0 = Math.floor(s);
    const frac = s - i0;
    if (i0 < 0 || i0 >= length) continue;
    // Reflected taps carry a slight per-order softening so the tail is not
    // brighter than the direct sound.
    const g = tap.gain;
    data[i0] += g * (1 - frac);
    if (i0 + 1 < length) data[i0 + 1] += g * frac;
  }
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) {
    const norm = 0.9 / peak;
    for (let i = 0; i < length; i++) data[i] *= norm;
  }
  return buffer;
}

// ── Karplus-Strong plucked string ───────────────────────────────────────────
function pluck(
  out: Float32Array,
  startSample: number,
  sr: number,
  freq: number,
  durSec: number,
  amp: number,
  decay: number,
): void {
  const N = Math.max(2, Math.round(sr / freq));
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;
  const total = Math.floor(sr * durSec);
  let idx = 0;
  for (let n = 0; n < total; n++) {
    const cur = line[idx];
    const nxt = line[(idx + 1) % N];
    const y = decay * 0.5 * (cur + nxt); // one-zero lowpass = string damping
    line[idx] = y;
    // Amplitude envelope: soft attack, exponential-ish release.
    const env = Math.min(1, n / (sr * 0.004)) * Math.exp((-3 * n) / total);
    const o = startSample + n;
    if (o >= 0 && o < out.length) out[o] += cur * amp * env;
    idx = (idx + 1) % N;
  }
}

const A4 = 440;
function midiToFreq(m: number): number {
  return A4 * Math.pow(2, (m - 69) / 12);
}

export interface Phrase {
  buffer: AudioBuffer;
  /** Note onset times in seconds, for scheduling the visual reflection pips. */
  onsets: number[];
}

/**
 * A dry, gentle arpeggio (an A-minor 9 spread) rendered with Karplus-Strong.
 * Returns the mono buffer plus per-note onset times.
 */
export function renderPhrase(ctx: BaseAudioContext): Phrase {
  const sr = ctx.sampleRate;
  const notes: { m: number; t: number; dur: number; amp: number }[] = [
    { m: 57, t: 0.0, dur: 2.2, amp: 0.9 }, // A3
    { m: 64, t: 0.28, dur: 2.0, amp: 0.8 }, // E4
    { m: 69, t: 0.56, dur: 1.9, amp: 0.8 }, // A4
    { m: 72, t: 0.84, dur: 1.8, amp: 0.75 }, // C5
    { m: 76, t: 1.12, dur: 1.7, amp: 0.75 }, // E5
    { m: 79, t: 1.5, dur: 1.7, amp: 0.7 }, // G5
  ];
  const tail = 2.4;
  const totalSec = Math.max(...notes.map((n) => n.t + n.dur)) + 0.3;
  const length = Math.floor(sr * (totalSec + tail));
  const out = new Float32Array(length);
  for (const nt of notes) {
    pluck(out, Math.floor(nt.t * sr), sr, midiToFreq(nt.m), nt.dur, nt.amp, 0.996);
  }
  // Gentle overall normalise.
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = 0.85 / peak;
    for (let i = 0; i < length; i++) out[i] *= g;
  }
  const buffer = ctx.createBuffer(1, length, sr);
  buffer.getChannelData(0).set(out);
  return { buffer, onsets: notes.map((n) => n.t) };
}
