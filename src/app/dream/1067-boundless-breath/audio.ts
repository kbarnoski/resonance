// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — assembles the full audio graph for Boundless Breath.
//
//     Shepard–Risset engine ─┐
//     JI drone bed ──────────┼─→ reverb (code-synthesised IR) ─┐
//                            └─────────── dry ─────────────────┼─→ limiter ─→ out
//
//   The drone is a low just-intonation bed (root + fifth, lightly detuned) that
//   grounds the endless ascent so it reads as boundless space, not a siren. The
//   reverb impulse is GENERATED here (exponential-decay noise burst rendered to
//   an AudioBuffer) — no file is ever fetched. Breath opens the reverb send and
//   the drone a touch on inhale so the space "blooms" as you gather inward.
// ─────────────────────────────────────────────────────────────────────────────

import { startShepard, type ShepardEngine } from "./shepard";

export interface BreathAudio {
  setBreath(b: number): void;
  /** Advance time-based elements (the Shepard glide). dt in seconds. */
  step(dt: number): void;
  stop(): void;
}

const ROOT_HZ = 55; // A1 — deep ground

/** Synthesize a smooth exponential-decay stereo impulse response. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(seconds * rate));
  const ir = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Gaussian-ish onset then exponential tail; random phase for diffusion.
      const env = Math.pow(1 - t, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return ir;
}

export function startAudio(ctx: AudioContext): BreathAudio {
  // ── Master limiter → destination ──────────────────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.gain.exponentialRampToValueAtTime(0.85, ctx.currentTime + 2.5);

  limiter.connect(master);
  master.connect(ctx.destination);

  // ── Reverb (synthesised IR) ────────────────────────────────────────────────
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, 4.5, 3.2);

  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.35;
  reverbSend.connect(convolver);
  convolver.connect(limiter);

  // ── Shepard engine: dry to limiter + a send into the reverb ────────────────
  const shepard: ShepardEngine = startShepard(ctx, limiter);
  shepard.output.connect(reverbSend);

  // ── Just-intonation drone bed (root + fifth, detuned pairs) ────────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.18;
  droneGain.connect(limiter);
  droneGain.connect(reverbSend);

  const droneVoices: OscillatorNode[] = [];
  const droneFreqs = [
    ROOT_HZ, // root
    ROOT_HZ * 1.003, // detuned root
    ROOT_HZ * 1.5, // perfect fifth (3:2)
    ROOT_HZ * 1.5 * 1.004, // detuned fifth
  ];
  for (const f of droneFreqs) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    osc.connect(g);
    g.connect(droneGain);
    osc.start();
    droneVoices.push(osc);
  }

  let breath = 0;
  const setBreath = (b: number) => {
    breath = Math.min(1, Math.max(0, b));
    shepard.setBreath(breath);
    const now = ctx.currentTime;
    // Inhale blooms the space and lifts the drone slightly.
    reverbSend.gain.setTargetAtTime(0.28 + 0.32 * breath, now, 0.4);
    droneGain.gain.setTargetAtTime(0.14 + 0.1 * breath, now, 0.6);
  };

  const step = (dt: number) => {
    shepard.step(dt);
  };

  let stopped = false;
  return {
    setBreath,
    step,
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      try {
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      } catch {
        /* closing */
      }
      shepard.stop();
      const killAt = now + 0.7;
      for (const osc of droneVoices) {
        try {
          osc.stop(killAt);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}
