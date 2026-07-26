// Local Karplus–Strong synth engine. This is the load-bearing half of the
// "synchronized local engine" model: NOTHING streams audio over the network —
// every client rebuilds the sound locally from compact control events, so a
// pluck from a peer (or the ghost) is synthesised right here, in this file.

import { GHOST_SEED, mulberry32 } from "./strings";

export interface SynthEngine {
  readonly ctx: AudioContext;
  pluck(stringIndex: number, velocity: number, pan: number): void;
  resume(): Promise<void>;
  close(): Promise<void>;
}

// Offline Karplus–Strong: fill a ring with seeded noise, run the low-pass
// feedback loop into a fixed buffer once per string. Cheap to replay per pluck.
function buildKarplus(
  ctx: AudioContext,
  freq: number,
  rng: () => number,
): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = Math.min(2.6, Math.max(0.9, 2.4 - freq / 520));
  const bufLen = Math.round(sr * dur);
  const ringLen = Math.max(4, Math.round(sr / freq));

  const ring = new Float32Array(ringLen);
  for (let i = 0; i < ringLen; i++) ring[i] = (rng() * 2 - 1) * 0.7;

  const data = new Float32Array(bufLen);
  for (let n = 0; n < bufLen; n++) {
    const i = n % ringLen;
    data[n] = ring[i];
    // decaying low-passed feedback → periodic, string-like tone
    ring[i] = 0.9965 * 0.5 * (ring[i] + ring[(n + 1) % ringLen]);
  }

  const buf = ctx.createBuffer(1, bufLen, sr);
  buf.getChannelData(0).set(data);
  return buf;
}

export function makeSynth(freqs: number[]): SynthEngine {
  const ctx = new AudioContext();

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  // Light shared reverb/delay tail — a short feedback delay gives the field a
  // communal, roomy resonance without a convolver dependency.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.22;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.3;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(tone);
  tone.connect(wet);
  wet.connect(master);

  const rng = mulberry32(GHOST_SEED ^ 0x51ed);
  const buffers = freqs.map((f) => buildKarplus(ctx, f, rng));

  function pluck(stringIndex: number, velocity: number, pan: number): void {
    if (stringIndex < 0 || stringIndex >= buffers.length) return;
    const v = velocity < 0 ? 0 : velocity > 1 ? 1 : velocity;

    const src = ctx.createBufferSource();
    src.buffer = buffers[stringIndex];

    // Harder plucks are brighter (velocity → cutoff).
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 650 + v * 4400;

    const g = ctx.createGain();
    g.gain.value = 0.12 + v * 0.5;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    src.connect(lp);
    lp.connect(g);
    g.connect(panner);
    panner.connect(master); // dry
    panner.connect(delay); // into shared tail
    src.start();
    src.onended = () => {
      src.disconnect();
      lp.disconnect();
      g.disconnect();
      panner.disconnect();
    };
  }

  async function resume(): Promise<void> {
    if (ctx.state === "suspended") await ctx.resume();
  }

  async function close(): Promise<void> {
    try {
      await ctx.close();
    } catch {
      // already closed
    }
  }

  return { ctx, pluck, resume, close };
}
