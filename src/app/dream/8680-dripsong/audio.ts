// audio.ts — physically-flavoured plink synthesis.
//
// The signature "plink" of a dripping tap is the ringdown of an entrapped air
// bubble at its Minnaert frequency, with the characteristic rising-pitch
// CHIRP (the bubble shrinks as it rings, so pitch glides up). We synthesize:
//   1. a fast-decaying sine at the Minnaert frequency, ramped ~+18% up,
//   2. a very short band-passed noise "tick" — the impact click,
//   3. a tiny sub thump for body.
// A soft filtered-noise "still pond" ambience bed sits underneath. NO drone.

import { mulberry32, FREQ_MIN, FREQ_MAX } from "./engine";

export type DripAudio = {
  plink(freq: number, when: number, gain: number): void;
  ambience(on: boolean): void;
  stop(): void;
};

/** Fill a 1-second mono noise buffer using a seeded PRNG (no Math.random). */
function makeNoiseBuffer(ctx: AudioContext, seed: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 1);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rand = mulberry32(seed);
  for (let i = 0; i < len; i++) data[i] = rand() * 2 - 1;
  return buf;
}

export function makeDripAudio(ctx: AudioContext, peak: number): DripAudio {
  const master = ctx.createGain();
  master.gain.value = peak;
  master.connect(ctx.destination);

  const noiseBuf = makeNoiseBuffer(ctx, 0x8680);

  // ── still-pond ambience: very soft, low-passed noise wash ──
  const ambGain = ctx.createGain();
  ambGain.gain.value = 0;
  const ambSrc = ctx.createBufferSource();
  ambSrc.buffer = noiseBuf;
  ambSrc.loop = true;
  const ambLp = ctx.createBiquadFilter();
  ambLp.type = "lowpass";
  ambLp.frequency.value = 420;
  ambLp.Q.value = 0.4;
  ambSrc.connect(ambLp).connect(ambGain).connect(master);
  ambSrc.start();

  function ambience(on: boolean): void {
    const now = ctx.currentTime;
    ambGain.gain.cancelScheduledValues(now);
    ambGain.gain.setValueAtTime(ambGain.gain.value, now);
    ambGain.gain.linearRampToValueAtTime(on ? 0.06 : 0, now + 1.2);
  }

  function plink(freq: number, when: number, gain: number): void {
    const f = Math.max(FREQ_MIN, Math.min(FREQ_MAX, freq));
    // Lower plinks (bigger bubbles) ring a touch longer.
    const t = (f - FREQ_MIN) / (FREQ_MAX - FREQ_MIN);
    const decay = 0.07 - t * 0.035; // 70 ms low → 35 ms high
    const g = Math.max(0.05, gain);

    // (1) the Minnaert sine with a rising chirp (+18% over the ringdown)
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, when);
    osc.frequency.exponentialRampToValueAtTime(f * 1.18, when + decay);
    const oscG = ctx.createGain();
    oscG.gain.setValueAtTime(0.0001, when);
    oscG.gain.exponentialRampToValueAtTime(0.9 * g, when + 0.002);
    oscG.gain.exponentialRampToValueAtTime(0.0008, when + decay);
    osc.connect(oscG).connect(master);
    osc.start(when);
    osc.stop(when + decay + 0.03);

    // (2) impact "tick": a few ms of band-passed noise
    const tick = ctx.createBufferSource();
    tick.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = Math.min(FREQ_MAX * 1.6, f * 2.2);
    bp.Q.value = 0.9;
    const tickG = ctx.createGain();
    tickG.gain.setValueAtTime(0.5 * g, when);
    tickG.gain.exponentialRampToValueAtTime(0.0005, when + 0.012);
    tick.connect(bp).connect(tickG).connect(master);
    tick.start(when);
    tick.stop(when + 0.05);

    // (3) tiny sub thump for body
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(f * 0.5, when);
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0.0001, when);
    subG.gain.exponentialRampToValueAtTime(0.22 * g, when + 0.004);
    subG.gain.exponentialRampToValueAtTime(0.0006, when + 0.05);
    sub.connect(subG).connect(master);
    sub.start(when);
    sub.stop(when + 0.08);
  }

  function stop(): void {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.15);
    try {
      ambSrc.stop(now + 0.2);
    } catch {
      /* already stopped */
    }
  }

  return { plink, ambience, stop };
}
