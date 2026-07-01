// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — parameter sonification of the live solar-wind drivers.
//
// The same 0..1 params that drive the aurora particles drive the sound, in the
// lineage of "Listening to the magnetosphere: how best to make ULF waves
// audible" (arXiv:2206.04279):
//
//   energy   (speed)      → shepard-ish rising drive on the shared drone bed +
//                           master brightness/loudness.
//   coupling (Bz south)   → the storm OPENS: a swelling harmonic pad fades in,
//                           reverb wet rises, filter opens. This is the drama.
//   thickness(density)    → density of a shimmer partial layer.
//   turbulence(|B|)       → amount of noisy air/"crackle" on the pad.
//   intensity(Kp)         → global loudness + brightness ceiling.
//   substorm onset        → a discrete low sub-boom + shimmer when Bz crosses
//                           strongly southward.
//
// Routed: sources → DynamicsCompressor → master gain → destination.
// Started only after a user gesture (Start button).
// ─────────────────────────────────────────────────────────────────────────────

import { startDroneBank, type DroneBank } from "@/app/dream/_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "@/app/dream/_shared/psych/convolutionVoid";
import type { Params } from "./data";

export interface AuroraAudio {
  /** Push a fresh normalised parameter snapshot into the sound engine. */
  update(p: Params): void;
  /** Fire the discrete substorm-onset gesture (sub-boom + shimmer). */
  onset(strength: number): void;
  stop(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function startAuroraAudio(ctx: AudioContext): AuroraAudio {
  const now = ctx.currentTime;

  // ── Master bus ─────────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.9, now + 2);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.28;
  comp.connect(master);
  master.connect(ctx.destination);

  // A gentle master lowpass that opens with intensity/energy → "brightness".
  const bright = ctx.createBiquadFilter();
  bright.type = "lowpass";
  bright.frequency.value = 900;
  bright.Q.value = 0.6;
  bright.connect(comp);

  // ── Space reverb ────────────────────────────────────────────────────────────
  const verb: VoidReverb = createVoidReverb(ctx, { seconds: 5, decay: 2.6, wet: 0.35 });
  verb.output.connect(bright);

  // ── Shared drone bed (the wind's low body) ─────────────────────────────────
  const drone: DroneBank = startDroneBank(ctx, bright, {
    root: 48,
    cutoffLow: 180,
    cutoffHigh: 3200,
    peakGain: 0.3,
  });
  drone.output.connect(verb.input);

  // ── Storm pad — a swelling stack that fades in with southward-Bz coupling ───
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0001;
  padGain.connect(bright);
  padGain.connect(verb.input);

  const padVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  // A bright, slightly dissonant stack (perfect-fifth + minor-third color) so
  // the storm reads as tense/awe, not cozy.
  const padRatios = [1, 1.5, 1.8, 3, 4.5];
  for (let i = 0; i < padRatios.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? "sawtooth" : "triangle";
    osc.frequency.value = 110 * padRatios[i];
    osc.detune.value = (i - 2) * 5;
    const g = ctx.createGain();
    g.gain.value = 0.14 / padRatios[i];
    osc.connect(g);
    g.connect(padGain);
    osc.start();
    padVoices.push({ osc, gain: g });
  }

  // ── Shimmer layer — high partials whose level tracks density ────────────────
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.0001;
  shimmerGain.connect(verb.input);
  const shimVoices: OscillatorNode[] = [];
  for (const f of [1760, 2640, 3520]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.03;
    // slow tremolo
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.2 + Math.random() * 0.4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
    osc.connect(g);
    g.connect(shimmerGain);
    osc.start();
    shimVoices.push(osc, lfo);
  }

  // ── Turbulence air — filtered noise whose level tracks |B| ──────────────────
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  const noiseBp = ctx.createBiquadFilter();
  noiseBp.type = "bandpass";
  noiseBp.frequency.value = 1400;
  noiseBp.Q.value = 0.8;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.0001;
  noise.connect(noiseBp);
  noiseBp.connect(noiseGain);
  noiseGain.connect(verb.input);
  noise.start();

  let stopped = false;

  function update(p: Params) {
    if (stopped) return;
    const t = ctx.currentTime;
    // Drone drive rides energy + a little intensity.
    drone.setDrive(clamp(0.25 + 0.55 * p.energy + 0.3 * p.intensity, 0, 1));

    // Master brightness opens with energy + intensity.
    const cutoff = 700 + 5200 * clamp(0.4 * p.energy + 0.6 * p.intensity, 0, 1);
    bright.frequency.setTargetAtTime(cutoff, t, 0.3);

    // The storm pad swells with southward-Bz coupling — the dramatic variable.
    padGain.gain.setTargetAtTime(0.0001 + 0.5 * p.coupling * p.coupling, t, 0.5);
    // Pad detune widens with turbulence for an uneasy, roiling storm.
    for (let i = 0; i < padVoices.length; i++) {
      padVoices[i].osc.detune.setTargetAtTime(
        (i - 2) * (5 + 22 * p.turbulence),
        t,
        0.6,
      );
    }

    // Shimmer density tracks curtain thickness.
    shimmerGain.gain.setTargetAtTime(0.0001 + 0.35 * p.thickness, t, 0.4);

    // Turbulence air.
    noiseGain.gain.setTargetAtTime(0.0001 + 0.18 * p.turbulence, t, 0.4);
    noiseBp.frequency.setTargetAtTime(900 + 2600 * p.turbulence, t, 0.4);

    // Reverb wet swells as the storm couples — the space "opens up".
    verb.setWet(clamp(0.28 + 0.4 * p.coupling, 0, 0.85));

    // Overall level rides Kp intensity.
    master.gain.setTargetAtTime(0.55 + 0.4 * p.intensity, t, 0.5);
  }

  function onset(strength: number) {
    if (stopped) return;
    const t = ctx.currentTime;
    const s = clamp(strength, 0, 1);

    // Low sub-boom.
    const boom = ctx.createOscillator();
    boom.type = "sine";
    const bg = ctx.createGain();
    boom.frequency.setValueAtTime(70, t);
    boom.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.5 * (0.4 + s), t + 0.03);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    boom.connect(bg);
    bg.connect(comp);
    boom.start(t);
    boom.stop(t + 1.5);

    // Shimmer burst.
    const sh = ctx.createOscillator();
    sh.type = "triangle";
    const shg = ctx.createGain();
    sh.frequency.setValueAtTime(1200, t);
    sh.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
    shg.gain.setValueAtTime(0.0001, t);
    shg.gain.exponentialRampToValueAtTime(0.14 * (0.5 + s), t + 0.05);
    shg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    sh.connect(shg);
    shg.connect(verb.input);
    sh.start(t);
    sh.stop(t + 1.2);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    } catch {
      /* ctx closing */
    }
    drone.stop();
    const killAt = t + 0.6;
    for (const v of padVoices) {
      try {
        v.osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    for (const o of shimVoices) {
      try {
        o.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      noise.stop(killAt);
    } catch {
      /* already stopped */
    }
  }

  return { update, onset, stop };
}
