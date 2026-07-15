// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — an inharmonic partial bank coupled to the 4D rotation angle.
//
//   A bank of nine sine partials on a low root. Their frequency ratios are
//   deliberately STRETCHED and jittered (n^1.045 plus a seeded per-partial
//   offset) so the bank never lands on a clean consonant chord — it beats and
//   shimmers, an "inharmonic bell/void" rather than a just-intonation drone.
//   As the tesseract turns through the 4th dimension the caller feeds us the
//   current w-rotation phase; we shift every partial's detune and gain by that
//   phase, so rotating through W audibly re-tunes the timbre. The chain ends in
//   a DynamicsCompressor → master gain (~0.12) → shared void reverb.
//
//   Determinism: partial ratios come from a hardcoded-seed mulberry32 (never
//   Math.random). Every scheduled change uses ctx.currentTime only.
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

export interface MeltAudio {
  /** wPhase: current 4D w-rotation angle (radians). tiltMag: 0..1 interaction. */
  update(wPhase: number, tiltMag: number): void;
  stop(): void;
}

const N_PARTIALS = 9;
const ROOT_HZ = 61.74; // ~B1 — low, cavernous

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeMeltAudio(ctx: AudioContext, masterLevel = 0.12): MeltAudio {
  const rng = mulberry32(0x7e55e7ac);

  const mixBus = ctx.createGain();
  mixBus.gain.value = 1;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;
  tone.Q.value = 0.6;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.28;

  const master = ctx.createGain();
  master.gain.value = 0;

  const reverb: VoidReverb = createVoidReverb(ctx, {
    seconds: 5,
    decay: 2.6,
    wet: 0.55,
  });

  mixBus.connect(tone);
  tone.connect(comp);
  comp.connect(master);
  master.connect(reverb.input);
  reverb.output.connect(ctx.destination);

  interface Partial {
    osc: OscillatorNode;
    gain: GainNode;
    ratio: number;
    baseGain: number;
    detuneCenter: number;
  }

  const partials: Partial[] = [];
  for (let i = 0; i < N_PARTIALS; i++) {
    const n = i + 1;
    // Stretched, jittered ratio → inharmonic, beating bank.
    const ratio = Math.pow(n, 1.045) * (1 + (rng() - 0.5) * 0.012);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = ROOT_HZ * ratio;
    const detuneCenter = (rng() - 0.5) * 9; // cents
    osc.detune.value = detuneCenter;

    const gain = ctx.createGain();
    // Higher partials quieter (1/n roll-off) so it stays warm, not harsh.
    const baseGain = (0.14 / n) * (0.7 + rng() * 0.5);
    gain.gain.value = 0;

    osc.connect(gain);
    gain.connect(mixBus);
    osc.start();

    partials.push({ osc, gain, ratio, baseGain, detuneCenter });
  }

  // Fade master in smoothly.
  const t0 = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, masterLevel), t0 + 2.2);

  const update = (wPhase: number, tiltMag: number) => {
    const now = ctx.currentTime;
    const spread = 10 + tiltMag * 26; // cents of detune swing, grows with tilt
    for (let i = 0; i < partials.length; i++) {
      const p = partials[i];
      // Detune tracks the w-rotation phase → rotating through W re-tunes timbre.
      const det = p.detuneCenter + Math.sin(wPhase + i * 0.7) * spread;
      p.osc.detune.setTargetAtTime(det, now, 0.09);
      // Slow amplitude shimmer per partial (beating between partials).
      const amp = p.baseGain * (0.55 + 0.45 * Math.sin(wPhase * 0.5 + i * 1.3));
      p.gain.gain.setTargetAtTime(Math.max(0, amp), now, 0.12);
    }
  };

  const stop = () => {
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(0, now, 0.25);
    for (const p of partials) {
      try {
        p.osc.stop(now + 1.2);
      } catch {
        /* already stopped */
      }
    }
  };

  return { update, stop };
}
